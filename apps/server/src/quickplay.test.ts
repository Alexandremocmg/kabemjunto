import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickPlayDirector } from './quickplay.js';
import { RoomStore, type RoomSession } from './room-store.js';
import type { GameServer } from './socket-types.js';

const ESPERA = 5000;
const PAUSA = 100;
const TOLERANCIA = 30_000;

interface Registro {
  sala: string;
  evento: string;
  payload: unknown;
}

/** `io` mínimo: registra o que seria transmitido e entrega as mãos aos sockets falsos. */
function criarIoFalso() {
  const transmitido: Registro[] = [];
  const maos: Array<{ socketId: string; mao: unknown }> = [];
  const saiu: string[] = [];
  const sockets = new Map<string, { emit: (evento: string, payload: unknown) => void }>();
  const io = {
    to: (sala: string) => ({
      emit: (evento: string, payload: unknown) => {
        transmitido.push({ sala, evento, payload });
      },
    }),
    in: (sala: string) => ({
      socketsLeave: (alvo: string) => {
        saiu.push(`${sala}:${alvo}`);
      },
    }),
    sockets: { sockets },
  };
  return {
    io: io as unknown as GameServer,
    transmitido,
    maos,
    saiu,
    conectar(socketId: string) {
      sockets.set(socketId, {
        emit: (evento, payload) => {
          if (evento === 'server:mao:atualizada') maos.push({ socketId, mao: payload });
        },
      });
    },
    quantos: (evento: string) => transmitido.filter((r) => r.evento === evento).length,
  };
}

function montar(opcoes: { graceMs?: number } = {}) {
  const falso = criarIoFalso();
  const store = new RoomStore(undefined, { quickPlayWaitMs: ESPERA });
  const diretor = new QuickPlayDirector(falso.io, store, {
    botDelayMs: { min: PAUSA, max: PAUSA },
    graceMs: opcoes.graceMs ?? TOLERANCIA,
  });
  diretor.start();
  return { ...falso, store, diretor };
}

function entrar(store: RoomStore, nome: string, tamanho: number) {
  return store.quickJoin({
    jogadorId: `id-${nome}`,
    nome,
    socketId: `sock-${nome}`,
    tamanho,
  });
}

/** Grava um estado alterado como se uma ação do servidor o tivesse produzido. */
function gravar(store: RoomStore, session: RoomSession): void {
  (store as unknown as { commit(sessao: RoomSession): void }).commit(session);
}

let diretorAtivo: QuickPlayDirector | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  diretorAtivo?.stop();
  diretorAtivo = undefined;
  vi.useRealTimers();
});

describe('QuickPlayDirector — espera e início', () => {
  it('só começa quando a espera acaba, e então completa a mesa com bots', () => {
    const t = montar();
    diretorAtivo = t.diretor;
    t.conectar('sock-Ana');
    const id = entrar(t.store, 'Ana', 3).session.sala.id;

    vi.advanceTimersByTime(ESPERA - 1);
    expect(t.store.get(id)!.sala.status).toBe('AGUARDANDO');

    vi.advanceTimersByTime(1);
    const iniciada = t.store.get(id)!;
    expect(iniciada.sala.status).toBe('EM_PARTIDA');
    expect(iniciada.sala.jogadores.map((j) => j.isBot)).toEqual([false, true, true]);

    // A sala é avisada, o estado público é transmitido e a mão vai só para a pessoa.
    const atualizada = t.transmitido.find((r) => r.evento === 'server:sala:atualizada');
    expect(atualizada?.payload).toMatchObject({ rapida: { tamanhoAlvo: 3 } });
    expect(t.quantos('server:estado:atualizado')).toBeGreaterThanOrEqual(1);
    expect(t.maos.map((m) => m.socketId)).toEqual(['sock-Ana']);
    expect((t.maos[0]!.mao as { mao: unknown[] }).mao).toHaveLength(7);
  });

  it('com a mesa cheia de pessoas começa na hora e sem bots', () => {
    const t = montar();
    diretorAtivo = t.diretor;
    const id = entrar(t.store, 'Ana', 2).session.sala.id;
    entrar(t.store, 'Bia', 2);
    vi.advanceTimersByTime(0);
    const sala = t.store.get(id)!;
    expect(sala.sala.status).toBe('EM_PARTIDA');
    expect(sala.sala.jogadores.every((j) => !j.isBot)).toBe(true);
  });

  it('uma sala que já existia antes de o diretor ligar também ganha prazo', () => {
    const falso = criarIoFalso();
    const store = new RoomStore(undefined, { quickPlayWaitMs: ESPERA });
    const id = entrar(store, 'Ana', 3).session.sala.id; // antes de ligar o diretor
    const diretor = new QuickPlayDirector(falso.io, store, { graceMs: TOLERANCIA });
    diretorAtivo = diretor;
    diretor.start();
    vi.advanceTimersByTime(ESPERA);
    expect(store.get(id)!.sala.status).toBe('EM_PARTIDA');
  });

  it('quem sai antes do fim da espera não deixa uma sala com bots sozinhos', () => {
    const t = montar();
    diretorAtivo = t.diretor;
    const id = entrar(t.store, 'Ana', 3).session.sala.id;
    t.store.leaveWaitingRoom(id, 'id-Ana');
    vi.advanceTimersByTime(ESPERA * 2);
    expect(t.store.get(id)).toBeUndefined();
  });
});

describe('QuickPlayDirector — vez dos bots', () => {
  function iniciar() {
    const t = montar();
    diretorAtivo = t.diretor;
    t.conectar('sock-Ana');
    const id = entrar(t.store, 'Ana', 3).session.sala.id;
    vi.advanceTimersByTime(ESPERA);
    const bot = t.store.get(id)!.estado!.jogadores.find((j) => j.isBot)!.id;
    return { ...t, id, bot };
  }

  /** Passa a vez a `quem` como se uma jogada anterior a tivesse entregado. */
  function entregarVez(t: ReturnType<typeof iniciar>, quem: string, extra = {}) {
    const sessao = t.store.get(t.id)!;
    gravar(t.store, {
      ...sessao,
      estado: { ...sessao.estado!, vezDe: quem, interceptacao: undefined, ...extra },
    });
  }

  it('o bot espera a pausa e então joga, transmitindo o estado e a mão da pessoa', () => {
    const t = iniciar();
    entregarVez(t, t.bot);
    const antes = t.store.get(t.id)!.estado!.historico.length;
    const transmissoesAntes = t.quantos('server:estado:atualizado');

    vi.advanceTimersByTime(PAUSA - 1);
    expect(t.store.get(t.id)!.estado!.historico.length).toBe(antes);

    vi.advanceTimersByTime(1);
    expect(t.store.get(t.id)!.estado!.historico.length).toBeGreaterThan(antes);
    expect(t.store.get(t.id)!.estado!.vezDe).not.toBe(t.bot);
    expect(t.quantos('server:estado:atualizado')).toBeGreaterThan(transmissoesAntes);
  });

  it('encadeia os bots seguidos e para quando a vez volta para a pessoa', () => {
    const t = iniciar();
    entregarVez(t, t.bot);
    for (let i = 0; i < 40; i += 1) {
      vi.advanceTimersByTime(PAUSA + 6000); // pausa + folga para janelas de Corta-Frente
      const estado = t.store.get(t.id)!.estado!;
      if (estado.finalizada || estado.vezDe === 'id-Ana') break;
    }
    const estado = t.store.get(t.id)!.estado!;
    expect(estado.finalizada || estado.vezDe === 'id-Ana').toBe(true);
  });

  it('com a janela de Corta-Frente aberta o bot espera, e joga depois que ela fecha', () => {
    const t = iniciar();
    const sessao = t.store.get(t.id)!;
    const janela = {
      janelaId: 'janela-teste',
      cartaAlvoId: sessao.estado!.monteDescarte[0]!.id,
      jogadorOrigemId: 'id-Ana',
      fechaEm: Date.now() + 5000,
      proximaVezId: t.bot,
      revisao: 1,
    };
    entregarVez(t, t.bot, { interceptacao: janela });
    const antes = t.store.get(t.id)!.estado!.historico.length;

    vi.advanceTimersByTime(PAUSA * 20);
    expect(t.store.get(t.id)!.estado!.historico.length).toBe(antes);

    // A janela some (como na expiração) e o bot, que é o próximo, joga.
    entregarVez(t, t.bot);
    vi.advanceTimersByTime(PAUSA);
    expect(t.store.get(t.id)!.estado!.historico.length).toBeGreaterThan(antes);
  });

  it('se a vez muda enquanto o bot "pensa", ele não joga fora de hora', () => {
    const t = iniciar();
    entregarVez(t, t.bot);
    vi.advanceTimersByTime(PAUSA - 10);
    entregarVez(t, 'id-Ana'); // a vez voltou para a pessoa
    const antes = t.store.get(t.id)!.estado!.historico.length;
    vi.advanceTimersByTime(PAUSA * 10);
    expect(t.store.get(t.id)!.estado!.historico.length).toBe(antes);
    expect(t.store.get(t.id)!.estado!.vezDe).toBe('id-Ana');
  });
});

describe('QuickPlayDirector — limpeza', () => {
  function iniciar() {
    const t = montar();
    diretorAtivo = t.diretor;
    t.conectar('sock-Ana');
    const entrada = entrar(t.store, 'Ana', 3);
    vi.advanceTimersByTime(ESPERA);
    return { ...t, id: entrada.session.sala.id, token: entrada.resumeToken };
  }

  it('sem ninguém conectado, a sala sai da memória depois da tolerância', () => {
    const t = iniciar();
    t.store.disconnect('sock-Ana');
    vi.advanceTimersByTime(TOLERANCIA - 1);
    expect(t.store.get(t.id)).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(t.store.get(t.id)).toBeUndefined();
    expect(t.saiu).toContain(`${t.id}:${t.id}`);
  });

  it('quem volta dentro da tolerância mantém a partida', () => {
    const t = iniciar();
    t.store.disconnect('sock-Ana');
    vi.advanceTimersByTime(TOLERANCIA / 2);
    t.store.join({
      jogadorId: 'id-Ana',
      salaId: t.id,
      nome: 'Ana',
      socketId: 'sock-novo',
      criar: false,
      resumeToken: t.token,
    });
    vi.advanceTimersByTime(TOLERANCIA * 2);
    expect(t.store.get(t.id)).toBeDefined();
  });

  it('partida terminada também sai da memória', () => {
    const t = iniciar();
    t.store.abandonGame(t.id, 'id-Ana');
    vi.advanceTimersByTime(TOLERANCIA);
    expect(t.store.get(t.id)).toBeUndefined();
  });

  it('as salas criadas à mão não são limpas nem recebem bots', () => {
    const t = montar();
    diretorAtivo = t.diretor;
    t.store.join({ jogadorId: 'x', salaId: 'COMUM1', nome: 'Xis', socketId: 's1', criar: true });
    t.store.disconnect('s1');
    vi.advanceTimersByTime(TOLERANCIA * 3);
    expect(t.store.get('COMUM1')).toBeDefined();
    expect(t.store.get('COMUM1')!.sala.status).toBe('AGUARDANDO');
  });
});
