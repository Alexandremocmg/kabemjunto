import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedRoomSession, RoomPersistence } from './persistence.js';
import { QuickPlayDirector } from './quickplay.js';
import { RevancheDirector } from './revanche.js';
import { partidaEncerrada, RoomStore, type RoomSession } from './room-store.js';
import type { GameServer } from './socket-types.js';

const ESPERA = 15_000;
const GRACE = 60_000;
const TETO = 300_000;
const parar: Array<() => void> = [];

function criarIo() {
  const eventos: string[] = [];
  const io = {
    to: () => ({ emit: (evento: string) => eventos.push(evento) }),
    in: () => ({ socketsLeave: () => undefined }),
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
  };
  return { io: io as unknown as GameServer, eventos };
}

function ligar(store: RoomStore) {
  const { io, eventos } = criarIo();
  const revanche = new RevancheDirector(io, store, { esperaMs: ESPERA });
  const quick = new QuickPlayDirector(io, store, {
    graceMs: GRACE,
    botDelayMs: { min: 1e8, max: 1e8 },
    revanchePendente: (id) => revanche.pendente(id),
  });
  revanche.start();
  quick.start();
  parar.push(
    () => revanche.stop(),
    () => quick.stop(),
  );
  const fins = () => eventos.filter((e) => e === 'server:partida:encerrada').length;
  return { revanche, fins };
}

function gravar(store: RoomStore, session: RoomSession): void {
  (store as unknown as { commit(s: RoomSession): void }).commit(session);
}

/** Sala rápida de 2 com as duas pessoas, já terminada com vitória da Ana. */
function terminada(persistence?: RoomPersistence) {
  const store = new RoomStore(persistence);
  const d = ligar(store);
  for (const id of ['ana', 'bia']) {
    store.quickJoin({ jogadorId: id, nome: id, socketId: `s-${id}`, tamanho: 2 });
  }
  vi.advanceTimersByTime(0);
  const id = store.sessions()[0]!.sala.id;
  const terminar = () => {
    const s = store.get(id)!;
    gravar(store, { ...s, estado: { ...s.estado!, finalizada: true, vencedor: 'ana' } });
  };
  terminar();
  return { store, id, terminar, partida: () => store.get(id)!.estado!.partidaId, ...d };
}

class Memoria implements RoomPersistence {
  salvo: PersistedRoomSession[] = [];
  falhar = false;
  load(): PersistedRoomSession[] {
    return this.salvo;
  }
  save(rooms: readonly PersistedRoomSession[]): void {
    if (this.falhar) throw new Error('disco cheio');
    this.salvo = structuredClone([...rooms]);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const f of parar.splice(0)) f();
  vi.useRealTimers();
});

describe('contagem', () => {
  it('conta do primeiro pedido e começa com quem aceitou', () => {
    const t = terminada();
    const antes = t.partida();
    t.revanche.pedir(t.id, 'bia');
    vi.advanceTimersByTime(10_000);
    t.revanche.pedir(t.id, 'bia');
    vi.advanceTimersByTime(4_999);
    expect(t.partida()).toBe(antes);
    vi.advanceTimersByTime(1);
    expect(t.partida()).not.toBe(antes);
    expect(t.store.get(t.id)!.sala.jogadores.map((j) => j.isBot)).toEqual([true, false]);
    expect(t.store.get(t.id)!.sala.hostId).toBe('bia');
  });

  it('revanches no mesmo milissegundo têm ids diferentes e contam uma vez cada', () => {
    const t = terminada();
    const ids = new Set([t.partida()]);
    for (let i = 0; i < 20; i += 1) {
      for (const id of ['ana', 'bia']) t.revanche.pedir(t.id, id);
      vi.advanceTimersByTime(0);
      ids.add(t.partida());
      t.terminar();
    }
    expect(ids.size).toBe(21);
    expect(partidaEncerrada(t.store.get(t.id)!)!.placar).toEqual({
      partidas: 21,
      vitorias: [
        { jogadorId: 'ana', vitorias: 21 },
        { jogadorId: 'bia', vitorias: 0 },
      ],
    });
    expect(t.fins()).toBe(21);
  });

  it('falha ao gravar não derruba nada: tenta de novo', () => {
    const disco = new Memoria();
    const t = terminada(disco);
    const antes = t.partida();
    disco.falhar = true;
    for (const id of ['ana', 'bia']) t.revanche.pedir(t.id, id);
    vi.advanceTimersByTime(0);
    expect(t.partida()).toBe(antes);
    disco.falhar = false;
    vi.advanceTimersByTime(5_000);
    expect(t.partida()).not.toBe(antes);
  });

  it('regravar a sala terminada não repete o evento nem o placar, nem depois de reiniciar', () => {
    const disco = new Memoria();
    const t = terminada(disco);
    t.terminar();
    t.store.disconnect('s-bia');
    expect(t.fins()).toBe(1);
    const outro = new RoomStore(disco);
    const d = ligar(outro);
    gravar(outro, outro.get(t.id)!);
    expect(d.fins()).toBe(0);
    expect(partidaEncerrada(outro.get(t.id)!)).toEqual(partidaEncerrada(t.store.get(t.id)!));
    expect(outro.get(t.id)!.placar!.partidas).toBe(1);
  });
});

describe('limpeza da sala rápida terminada', () => {
  it('com gente conectada espera até o teto de 5 min', () => {
    const t = terminada();
    vi.advanceTimersByTime(TETO - 1);
    expect(t.store.get(t.id)).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(t.store.get(t.id)).toBeUndefined();
  });

  it('sem ninguém conectado segue a tolerância normal', () => {
    const t = terminada();
    t.store.disconnect('s-ana');
    t.store.disconnect('s-bia');
    vi.advanceTimersByTime(GRACE - 1);
    expect(t.store.get(t.id)).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(t.store.get(t.id)).toBeUndefined();
  });

  it('não limpa no meio da contagem, e a partida nova cancela a limpeza', () => {
    const t = terminada();
    const antes = t.partida();
    vi.advanceTimersByTime(TETO - 1_000);
    t.revanche.pedir(t.id, 'ana');
    vi.advanceTimersByTime(ESPERA);
    expect(t.partida()).not.toBe(antes);
    vi.advanceTimersByTime(TETO * 2);
    expect(t.store.get(t.id)).toBeDefined();
  });
});
