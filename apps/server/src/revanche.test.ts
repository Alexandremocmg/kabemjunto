import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerRevancheAtualizadaEvent } from '@kabemjunto/shared';
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
  const revanches: ServerRevancheAtualizadaEvent[] = [];
  const io = {
    to: () => ({
      emit: (evento: string, payload: unknown) => {
        eventos.push(evento);
        if (evento === 'server:revanche:atualizada') {
          revanches.push(payload as ServerRevancheAtualizadaEvent);
        }
      },
    }),
    in: () => ({ socketsLeave: () => undefined }),
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
  };
  return { io: io as unknown as GameServer, eventos, revanches };
}

function ligar(store: RoomStore) {
  const { io, eventos, revanches } = criarIo();
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
  return { revanche, fins, andamento: () => revanches.at(-1)! };
}

function gravar(store: RoomStore, session: RoomSession): void {
  (store as unknown as { commit(s: RoomSession): void }).commit(session);
}

/** Sala rápida de 2 com as duas pessoas, já terminada com vitória da Ana. */
function terminada(persistence?: RoomPersistence, opcoes: { cairAntes?: number } = {}) {
  const store = new RoomStore(persistence);
  const d = ligar(store);
  const tokens = new Map<string, string>();
  for (const id of ['ana', 'bia']) {
    const entrada = store.quickJoin({ jogadorId: id, nome: id, socketId: `s-${id}`, tamanho: 2 });
    tokens.set(id, entrada.resumeToken);
  }
  vi.advanceTimersByTime(0);
  const id = store.sessions()[0]!.sala.id;
  const terminar = () => {
    const s = store.get(id)!;
    gravar(store, { ...s, estado: { ...s.estado!, finalizada: true, vencedor: 'ana' } });
  };
  const voltar = (quem: string) => {
    const volta = store.join({
      jogadorId: quem,
      salaId: id,
      nome: quem,
      socketId: `s-${quem}`,
      criar: false,
      resumeToken: tokens.get(quem)!,
    });
    tokens.set(quem, volta.resumeToken);
  };
  if (opcoes.cairAntes) {
    store.disconnect('s-bia');
    vi.advanceTimersByTime(opcoes.cairAntes);
  }
  terminar();
  const partida = () => store.get(id)!.estado!.partidaId;
  return { store, id, terminar, voltar, tokens, partida, ...d };
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

  it('quem recarrega a página com os demais prontos tem 5 s para voltar, e recupera o prazo', () => {
    const t = terminada();
    const antes = t.partida();
    t.revanche.pedir(t.id, 'ana');
    t.store.disconnect('s-bia');
    vi.advanceTimersByTime(4_999);
    expect(t.partida()).toBe(antes);
    // Voltou a tempo: a contagem retoma o prazo do primeiro pedido.
    const sessao = t.store.get(t.id)!;
    gravar(t.store, {
      ...sessao,
      sala: {
        ...sessao.sala,
        jogadores: sessao.sala.jogadores.map((j) => ({ ...j, conectado: true })),
      },
    });
    vi.advanceTimersByTime(ESPERA - 5_000);
    expect(t.partida()).toBe(antes);
    vi.advanceTimersByTime(1);
    expect(t.partida()).not.toBe(antes);
  });

  it('se não volta em 5 s, a revanche começa com quem aceitou', () => {
    const t = terminada();
    const antes = t.partida();
    t.revanche.pedir(t.id, 'ana');
    t.store.disconnect('s-bia');
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

describe('quedas durante a espera', () => {
  it('quem aceitou e cai volta pronto; enquanto fora não aparece como pronto', () => {
    const t = terminada();
    const antes = t.partida();
    t.revanche.pedir(t.id, 'ana');
    t.store.disconnect('s-ana');
    expect(t.andamento()).toMatchObject({ prontos: [], possiveis: ['bia'] });
    expect(t.andamento()).not.toHaveProperty('restanteMs');
    vi.advanceTimersByTime(8_000);
    t.voltar('ana');
    expect(t.andamento()).toMatchObject({ prontos: ['ana'], restanteMs: 7_000 });
    vi.advanceTimersByTime(7_000);
    expect(t.partida()).not.toBe(antes);
    expect(t.store.get(t.id)!.sala.jogadores.map((j) => j.isBot)).toEqual([false, true]);
  });

  it('se o outro aceita enquanto isso, a volta dentro da tolerância começa com os dois', () => {
    const t = terminada();
    const antes = t.partida();
    t.revanche.pedir(t.id, 'ana');
    t.store.disconnect('s-ana');
    t.revanche.pedir(t.id, 'bia');
    vi.advanceTimersByTime(3_000);
    expect(t.partida()).toBe(antes);
    t.voltar('ana');
    vi.advanceTimersByTime(0);
    expect(t.partida()).not.toBe(antes);
    expect(t.store.get(t.id)!.sala.jogadores.every((j) => !j.isBot)).toBe(true);
  });

  it('quem sai de vez perde o aceite', () => {
    const t = terminada();
    const antes = t.partida();
    t.revanche.pedir(t.id, 'ana');
    t.store.leaveWaitingRoom(t.id, 'ana');
    expect(t.andamento()).toEqual({ partidaId: antes, prontos: [], possiveis: ['bia'] });
    vi.advanceTimersByTime(ESPERA);
    expect(t.partida()).toBe(antes);
  });

  it('a tolerância é só para queda recente, contada do instante da queda', () => {
    const antiga = terminada(undefined, { cairAntes: 5_000 });
    const antes = antiga.partida();
    antiga.revanche.pedir(antiga.id, 'ana');
    vi.advanceTimersByTime(0);
    expect(antiga.partida()).not.toBe(antes);

    const recente = terminada(undefined, { cairAntes: 2_000 });
    const anterior = recente.partida();
    recente.revanche.pedir(recente.id, 'ana');
    vi.advanceTimersByTime(2_999);
    expect(recente.partida()).toBe(anterior);
    vi.advanceTimersByTime(1);
    expect(recente.partida()).not.toBe(anterior);
  });

  it('o limite que vence sem ninguém pronto presente não começa nem prende a sala', () => {
    const t = terminada();
    const antes = t.partida();
    t.revanche.pedir(t.id, 'ana');
    t.store.disconnect('s-ana');
    expect(t.revanche.pendente(t.id)).toBe(false);
    vi.advanceTimersByTime(ESPERA);
    expect(t.partida()).toBe(antes);
    // O aceite antigo venceu: voltar não deixa pronta, e um novo pedido conta do zero.
    t.voltar('ana');
    expect(t.andamento()).toEqual({ partidaId: antes, prontos: [], possiveis: ['ana', 'bia'] });
    t.revanche.pedir(t.id, 'bia');
    expect(t.andamento()).toMatchObject({ prontos: ['bia'], restanteMs: ESPERA });
    vi.advanceTimersByTime(ESPERA);
    expect(t.partida()).not.toBe(antes);
  });

  it('com todos fora, o aceite não segura a limpeza da sala', () => {
    const t = terminada();
    t.revanche.pedir(t.id, 'ana');
    t.store.disconnect('s-ana');
    t.store.disconnect('s-bia');
    vi.advanceTimersByTime(GRACE);
    expect(t.store.get(t.id)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('"Jogar agora" com assento em sala terminada', () => {
  it('exige o token mesmo de quem está desconectado, e a recusa não tira ninguém', () => {
    const t = terminada();
    t.store.disconnect('s-ana');
    for (const socketId of ['intruso', 's-ana']) {
      expect(() =>
        t.store.quickJoin({ jogadorId: 'ana', nome: 'x', socketId, tamanho: 2 }),
      ).toThrowError(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
    }
    expect(t.store.get(t.id)!.sala.jogadores[0]!.isBot).toBe(false);
    t.voltar('ana');
    const nova = t.store.quickJoin({
      jogadorId: 'ana',
      nome: 'Ana',
      socketId: 'outro',
      tamanho: 2,
      resumeToken: t.tokens.get('ana')!,
    });
    expect(nova.session.sala.id).not.toBe(t.id);
    expect(t.store.get(t.id)!.sala.jogadores[0]!.isBot).toBe(true);
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
