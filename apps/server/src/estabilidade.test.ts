import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Constants, type Carta } from '@kabemjunto/shared';
import type { PersistedRoomSession, RoomPersistence } from './persistence.js';
import { QuickPlayDirector } from './quickplay.js';
import { ResilienciaDirector } from './resiliencia.js';
import { RoomStore, toPublicState, type RoomSession } from './room-store.js';
import type { GameServer } from './socket-types.js';

const SALA = 'MESA01';
const LIMITE = 30_000;
const TOLERANCIA = 20_000;
const VAZIA = 30 * 60_000;
const PAUSA = 100;
const parar: Array<() => void> = [];

const numero = (cor: string, valor: number) =>
  Constants.BARALHO_COMPLETO_108.find(
    (c) => c.tipo === 'NUMERADA' && !c.acao && c.cor === cor && c.valor === valor,
  )!;
const MAO: Carta[] = [numero('AZUL', 1), numero('VERDE', 5), numero('VERDE', 6)];

class Disco implements RoomPersistence {
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

function criarIo(opcoes: { quebrado?: boolean } = {}) {
  const estado = { quebrado: opcoes.quebrado ?? false };
  const io = {
    to: () => ({
      emit: () => {
        if (estado.quebrado) throw new Error('transmissão falhou');
      },
    }),
    in: () => ({ socketsLeave: () => undefined }),
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
  };
  return { io: io as unknown as GameServer, estado };
}

function gravar(store: RoomStore, session: RoomSession): void {
  (store as unknown as { commit(s: RoomSession, nova: boolean): void }).commit(session, true);
}

function montar(
  nomes: readonly string[],
  opcoes: { tolerancia?: number; prazoParaDesconectado?: boolean; limite?: number } = {},
) {
  const disco = new Disco();
  const { io, estado: transmissao } = criarIo();
  const store = new RoomStore(disco, {
    turnLimitMs: opcoes.limite ?? LIMITE,
    prazoParaDesconectado: opcoes.prazoParaDesconectado ?? false,
  });
  const bots = new QuickPlayDirector(io, store, { botDelayMs: { min: PAUSA, max: PAUSA } });
  const diretor = new ResilienciaDirector(io, store, {
    disconnectGraceMs: opcoes.tolerancia ?? TOLERANCIA,
    salaVaziaMs: VAZIA,
  });
  bots.start();
  diretor.start();
  parar.push(
    () => bots.stop(),
    () => diretor.stop(),
  );
  const tokens = new Map<string, string>();
  for (const nome of nomes) {
    const { resumeToken } = store.join({
      jogadorId: nome,
      salaId: SALA,
      nome,
      socketId: `s-${nome}`,
    });
    tokens.set(nome, resumeToken);
  }
  store.start(SALA, `s-${nomes[0]}`);
  const estado = () => store.get(SALA)!.estado!;
  return {
    store,
    disco,
    diretor,
    transmissao,
    estado,
    jogador: (id: string) => estado().jogadores.find((j) => j.id === id)!,
    cair: (nome: string) => store.disconnect(`s-${nome}`),
    voltar(nome: string) {
      const volta = store.join({
        jogadorId: nome,
        salaId: SALA,
        nome,
        socketId: `s-${nome}`,
        resumeToken: tokens.get(nome)!,
      });
      tokens.set(nome, volta.resumeToken);
    },
    preparar(vezDe: string) {
      const s = store.get(SALA)!;
      gravar(store, {
        ...s,
        estado: {
          ...s.estado!,
          jogadores: s.estado!.jogadores.map((j) => ({ ...j, mao: MAO })),
          monteDescarte: [numero('AZUL', 3)],
          corAtiva: 'AZUL',
          sentido: 1,
          ataqueAcumulado: 0,
          ataqueStack: [],
          silencio: { ativo: false, jogadoresQuebraram: [] },
          interceptacao: undefined,
          vezDe,
        },
      });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const f of parar.splice(0)) f();
  vi.useRealTimers();
});

describe('1. cair e voltar em ciclo não segura a vez', () => {
  it('o mínimo ao voltar vale uma única vez por vez', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana');
    vi.advanceTimersByTime(LIMITE - 1_000);
    t.cair('ana');
    t.voltar('ana');
    expect(toPublicState(t.estado()).turno!.restanteMs).toBe(5_000);
    vi.advanceTimersByTime(4_000);
    t.cair('ana');
    t.voltar('ana');
    expect(toPublicState(t.estado()).turno!.restanteMs).toBe(1_000);
    vi.advanceTimersByTime(1_000);
    expect(t.estado().vezDe).not.toBe('ana');
  });

  it('o tempo fora se acumula na mesma vez, mas não passa para a vez seguinte', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana');
    for (let i = 0; i < 2; i += 1) {
      t.cair('ana');
      vi.advanceTimersByTime(8_000);
      t.voltar('ana');
    }
    t.cair('ana');
    vi.advanceTimersByTime(3_999);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(t.jogador('ana')).toMatchObject({ controladoPorBot: true, motivoBot: 'CAIU' });

    t.voltar('ana');
    t.preparar('ana');
    t.cair('ana');
    vi.advanceTimersByTime(TOLERANCIA - 1);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
  });

  it('reconectar não zera os estouros; agir zera', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana');
    vi.advanceTimersByTime(LIMITE);
    t.cair('ana');
    t.voltar('ana');
    t.preparar('ana');
    vi.advanceTimersByTime(LIMITE);
    expect(t.jogador('ana').motivoBot).toBe('INATIVO');

    t.store.registrarPresenca(SALA, 'ana');
    t.preparar('ana');
    vi.advanceTimersByTime(LIMITE);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
  });
});

describe('2. falhas em timers não derrubam o processo nem travam a vez', () => {
  it('transmissão que falha no estouro e na vez do bot', () => {
    const t = montar(['ana', 'bia', 'caio']);
    t.store.abandonGame(SALA, 'bia');
    t.preparar('ana');
    t.transmissao.quebrado = true;
    expect(() => vi.advanceTimersByTime(LIMITE)).not.toThrow();
    expect(t.estado().vezDe).not.toBe('ana');
    t.preparar('bia');
    expect(() => vi.advanceTimersByTime(PAUSA)).not.toThrow();
    expect(t.jogador('bia').mao).toHaveLength(2);
  });

  it('abrir o Corta-Frente sem conseguir gravar não derruba: a jogada vale e a vez anda', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana');
    const abrir = vi.spyOn(t.store, 'openInterceptionWindow').mockImplementation(() => {
      throw new Error('disco cheio');
    });
    expect(() => vi.advanceTimersByTime(LIMITE)).not.toThrow();
    expect(abrir).toHaveBeenCalled();
    expect(t.estado().vezDe).toBe('bia');
  });

  it('Corta-Frente que expira com o disco cheio é fechado depois', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana');
    t.store.play(SALA, 'ana', MAO[0]!.id);
    t.store.openInterceptionWindow(SALA, 'ana');
    t.disco.falhar = true;
    vi.advanceTimersByTime(6_000);
    expect(t.estado().interceptacao).toBeDefined();
    t.disco.falhar = false;
    vi.advanceTimersByTime(5_000);
    expect(t.estado().interceptacao).toBeUndefined();
    expect(t.estado().vezDe).toBe('bia');
  });

  it('sala rápida que não conseguiu gravar o início (ou a limpeza) tenta de novo', () => {
    const disco = new Disco();
    const store = new RoomStore(disco, { quickPlayWaitMs: 1_000 });
    const diretor = new QuickPlayDirector(criarIo().io, store, { graceMs: 1_000 });
    diretor.start();
    parar.push(() => diretor.stop());
    store.quickJoin({ jogadorId: 'ana', nome: 'Ana', socketId: 's-ana', tamanho: 2 });
    const id = store.sessions()[0]!.sala.id;
    disco.falhar = true;
    vi.advanceTimersByTime(1_000);
    expect(store.get(id)!.sala.status).toBe('AGUARDANDO');
    disco.falhar = false;
    vi.advanceTimersByTime(5_000);
    expect(store.get(id)!.sala.status).toBe('EM_PARTIDA');

    store.disconnect('s-ana');
    disco.falhar = true;
    expect(() => vi.advanceTimersByTime(1_000)).not.toThrow();
    expect(store.get(id)).toBeDefined();
    disco.falhar = false;
    vi.advanceTimersByTime(5_000);
    expect(store.get(id)).toBeUndefined();
  });
});

describe('3. sair depois do fim', () => {
  it('abandonGame não reescreve o resultado', () => {
    const t = montar(['ana', 'bia']);
    const s = t.store.get(SALA)!;
    gravar(t.store, { ...s, estado: { ...s.estado!, finalizada: true, vencedor: 'ana' } });
    const antes = t.estado().historico;
    t.store.abandonGame(SALA, 'bia');
    expect(t.estado().historico).toEqual(antes);
    expect(t.estado()).toMatchObject({ finalizada: true, vencedor: 'ana' });
    expect(t.store.get(SALA)!.placar!.partidas).toBe(1);
  });
});

describe('4. sala manual vazia em partida', () => {
  it('é encerrada após o prazo e some se continuar vazia', () => {
    const t = montar(['ana', 'bia']);
    t.cair('ana');
    vi.advanceTimersByTime(60_000);
    t.cair('bia');
    vi.advanceTimersByTime(VAZIA - 1);
    expect(t.estado().finalizada).toBe(false);
    vi.advanceTimersByTime(1);
    expect(t.estado().finalizada).toBe(true);
    expect(t.store.get(SALA)!.sala.status).toBe('FINALIZADA');
    expect(t.estado().historico.at(-1)).toMatchObject({ motivo: 'ABANDONO' });
    vi.advanceTimersByTime(VAZIA);
    expect(t.store.get(SALA)).toBeUndefined();
  });

  it('quem volta dentro do prazo retoma a partida e o prazo recomeça', () => {
    const t = montar(['ana', 'bia']);
    t.cair('ana');
    t.cair('bia');
    vi.advanceTimersByTime(VAZIA - 1);
    t.voltar('ana');
    vi.advanceTimersByTime(VAZIA);
    expect(t.jogador('ana').conectado).toBe(true);
    expect(t.store.get(SALA)).toBeDefined();
    if (!t.estado().finalizada) {
      t.cair('ana');
      vi.advanceTimersByTime(VAZIA - 1);
      expect(t.estado().finalizada).toBe(false);
    }
  });

  it('o prazo também vale para a sala restaurada ao reiniciar', () => {
    const t = montar(['ana', 'bia']);
    const store = new RoomStore(t.disco);
    const d = new ResilienciaDirector(criarIo().io, store, { salaVaziaMs: VAZIA });
    d.start();
    parar.push(() => d.stop());
    vi.advanceTimersByTime(VAZIA);
    expect(store.get(SALA)!.estado!.finalizada).toBe(true);
  });

  it('só com assentos SAIU e bots encerra na hora', () => {
    const t = montar(['ana', 'bia']);
    const s = t.store.get(SALA)!;
    const bot = { isBot: true, controladoPorBot: true, motivoBot: 'SAIU' as const };
    gravar(t.store, {
      ...s,
      sala: { ...s.sala, jogadores: s.sala.jogadores.map((j) => ({ ...j, ...bot })) },
      estado: { ...s.estado!, jogadores: s.estado!.jogadores.map((j) => ({ ...j, ...bot })) },
      socketByPlayer: new Map(),
      resumeTokenHashByPlayer: new Map(),
    });
    vi.advanceTimersByTime(0);
    expect(t.estado().finalizada).toBe(true);
  });

  it('falha ao gravar o encerramento é tentada de novo', () => {
    const t = montar(['ana', 'bia']);
    t.cair('ana');
    t.cair('bia');
    t.disco.falhar = true;
    vi.advanceTimersByTime(VAZIA);
    expect(t.estado().finalizada).toBe(false);
    t.disco.falhar = false;
    vi.advanceTimersByTime(5_000);
    expect(t.estado().finalizada).toBe(true);
  });
});

describe('6. tolerância 0', () => {
  it('o prazo da vez corre para quem caiu se há outra pessoa conectada', () => {
    const t = montar(['ana', 'bia'], { tolerancia: 0, prazoParaDesconectado: true });
    t.preparar('ana');
    vi.advanceTimersByTime(10_000);
    t.cair('ana');
    expect(toPublicState(t.estado()).turno!.restanteMs).toBe(20_000);
    vi.advanceTimersByTime(20_000);
    expect(t.estado().vezDe).not.toBe('ana');
  });

  it('sem ninguém conectado o relógio para', () => {
    const t = montar(['ana', 'bia'], { tolerancia: 0, prazoParaDesconectado: true });
    t.preparar('ana');
    t.cair('ana');
    t.cair('bia');
    expect(t.estado().turno).toBeUndefined();
  });
});

describe('8. apagar a sala', () => {
  it('cancela os timers de prazo, ausência e sala vazia', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana');
    t.cair('bia');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    t.store.removeRoom(SALA);
    expect(vi.getTimerCount()).toBe(0);
  });
});
