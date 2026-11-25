import { describe, expect, it, vi } from 'vitest';
import { Constants, criarPartidaInicial, type EstadoPartida } from '@kabemjunto/shared';
import {
  RoomError,
  RoomStore,
  humanPlayers,
  shouldOpenInterception,
  type RoomSession,
} from './room-store.js';

function entrar(store: RoomStore, nome: string, tamanho: number, jogadorId = `id-${nome}`) {
  return store.quickJoin({ jogadorId, nome, socketId: `sock-${nome}`, tamanho });
}

/** Partida com bots montada à mão: um humano e bots, topo AZUL 1. */
function estadoComBots(humanos: number, bots: number): EstadoPartida {
  const ids = [
    ...Array.from({ length: humanos }, (_, i) => `h${i + 1}`),
    ...Array.from({ length: bots }, (_, i) => `b${i + 1}`),
  ];
  const base = criarPartidaInicial({
    baralho: Constants.BARALHO_COMPLETO_108,
    modo: 'ONLINE_PUBLICA',
    totalJogadores: ids.length,
    idsCustomizados: ids,
    bots: ids.map((id) => id.startsWith('b')),
  });
  return { ...base, monteDescarte: [{ ...azul1, id: 'topo' }], corAtiva: 'AZUL' };
}

function comMao(
  estado: EstadoPartida,
  jogadorId: string,
  mao: EstadoPartida['jogadores'][number]['mao'],
) {
  return {
    ...estado,
    jogadores: estado.jogadores.map((j) => (j.id === jogadorId ? { ...j, mao } : j)),
  };
}

const azul1 = Constants.BARALHO_COMPLETO_108.find(
  (c) => c.tipo === 'NUMERADA' && c.acao === undefined && c.cor === 'AZUL' && c.valor === 1,
)!;
/** Outra carta de mesmo tipo, cor e número que a do topo (a "idêntica" do Corta-Frente). */
const identicaAoTopo = Constants.BARALHO_COMPLETO_108.find(
  (c) => c.tipo === 'NUMERADA' && c.cor === 'AZUL' && c.valor === 1 && c.id !== azul1.id,
)!;
const outraCarta = Constants.BARALHO_COMPLETO_108.find(
  (c) => c.tipo === 'NUMERADA' && c.acao === undefined && c.cor === 'VERDE' && c.valor === 5,
)!;

describe('RoomStore — sala "Jogar agora" (quickJoin)', () => {
  it('cria uma sala pública rápida com o tamanho da mesa e a hora de começar', () => {
    const store = new RoomStore(undefined, { quickPlayWaitMs: 8000 });
    const antes = Date.now();
    const { session, jogadorId, resumeToken } = entrar(store, 'Ana', 4);
    expect(jogadorId).toBe('id-Ana');
    expect(resumeToken).toBeTruthy();
    expect(session.sala.visibilidade).toBe('PUBLICA');
    expect(session.sala.status).toBe('AGUARDANDO');
    expect(session.sala.maxJogadores).toBe(4);
    expect(session.sala.rapida?.tamanhoAlvo).toBe(4);
    expect(session.sala.rapida!.iniciaEm).toBeGreaterThanOrEqual(antes + 8000);
    expect(session.sala.id).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('agrupa quem pede a mesma mesa e separa tamanhos diferentes', () => {
    const store = new RoomStore();
    const a = entrar(store, 'Ana', 4).session.sala.id;
    const b = entrar(store, 'Bia', 4).session.sala.id;
    const c = entrar(store, 'Caio', 3).session.sala.id;
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(store.get(a)!.sala.jogadores.map((j) => j.nome)).toEqual(['Ana', 'Bia']);
  });

  it('quando a mesa enche, a pessoa seguinte cai numa sala nova', () => {
    const store = new RoomStore();
    const primeira = entrar(store, 'Ana', 2).session.sala.id;
    entrar(store, 'Bia', 2);
    expect(entrar(store, 'Caio', 2).session.sala.id).not.toBe(primeira);
  });

  it('não coloca ninguém numa sala que começa em instantes', () => {
    const store = new RoomStore(undefined, { quickPlayWaitMs: 1000 });
    const primeira = entrar(store, 'Ana', 4).session.sala.id;
    expect(entrar(store, 'Bia', 4).session.sala.id).not.toBe(primeira);
  });

  it('recusa tamanho de mesa fora de 2 a 10', () => {
    const store = new RoomStore();
    for (const tamanho of [1, 11, Number.NaN]) {
      expect(() => entrar(store, 'Ana', tamanho)).toThrow(RoomError);
    }
  });

  it('as salas rápidas não aparecem na lista de salas públicas', () => {
    const store = new RoomStore();
    entrar(store, 'Ana', 4);
    expect(store.listAvailablePublicRooms()).toEqual([]);
  });

  it('quem já está numa sala rápida em espera volta para a mesma', () => {
    const store = new RoomStore();
    const primeira = entrar(store, 'Ana', 4);
    const volta = store.quickJoin({
      jogadorId: 'id-Ana',
      nome: 'Ana',
      socketId: 'sock-novo',
      tamanho: 4,
      resumeToken: primeira.resumeToken,
    });
    expect(volta.session.sala.id).toBe(primeira.session.sala.id);
    expect(volta.reconectado).toBe(true);
    expect(volta.session.sala.jogadores).toHaveLength(1);
  });

  it('descarta a sala rápida terminada de quem pede "Jogar agora" de novo', () => {
    const store = new RoomStore();
    entrar(store, 'Ana', 3);
    const id = store.sessions()[0]!.sala.id;
    const iniciada = store.startWithBots(id);
    store.abandonGame(id, iniciada.sala.jogadores[0]!.id);
    const nova = entrar(store, 'Ana', 3);
    expect(nova.session.sala.id).not.toBe(id);
    expect(store.get(id)).toBeUndefined();
  });
});

describe('RoomStore — completar a mesa com bots (startWithBots)', () => {
  it('completa até o tamanho escolhido, marca os bots e começa com um humano na frente', () => {
    const store = new RoomStore();
    entrar(store, 'Ana', 4);
    const id = store.sessions()[0]!.sala.id;
    const session = store.startWithBots(id);

    expect(session.sala.status).toBe('EM_PARTIDA');
    expect(session.sala.jogadores).toHaveLength(4);
    expect(session.sala.jogadores.map((j) => j.isBot)).toEqual([false, true, true, true]);
    expect(session.sala.jogadores.slice(1).map((j) => j.nome)).toEqual(['Bot 1', 'Bot 2', 'Bot 3']);
    expect(session.estado!.jogadores.map((j) => j.isBot)).toEqual([false, true, true, true]);
    expect(session.estado!.jogadores.every((j) => j.mao.length === 7)).toBe(true);
    // Quem começa depende da carta virada (um Pula passa a vez): é um dos jogadores.
    expect(session.estado!.jogadores.map((j) => j.id)).toContain(session.estado!.vezDe);
    // Os bots não têm socket nem token: só os humanos se reconectam.
    expect(humanPlayers(session).map((j) => j.id)).toEqual(['id-Ana']);
    expect(session.socketByPlayer.size).toBe(1);
  });

  it('mantém as pessoas que já estavam e só acrescenta o que falta', () => {
    const store = new RoomStore();
    entrar(store, 'Ana', 4);
    entrar(store, 'Bia', 4);
    const id = store.sessions()[0]!.sala.id;
    const session = store.startWithBots(id);
    expect(session.sala.jogadores.map((j) => j.isBot)).toEqual([false, false, true, true]);
  });

  it('com a mesa cheia de pessoas não acrescenta bots', () => {
    const store = new RoomStore();
    entrar(store, 'Ana', 2);
    entrar(store, 'Bia', 2);
    const session = store.startWithBots(store.sessions()[0]!.sala.id);
    expect(session.sala.jogadores.every((j) => !j.isBot)).toBe(true);
  });

  it('não vale para salas comuns, nem depois de começar, nem sem ninguém', () => {
    const store = new RoomStore();
    store.join({ jogadorId: 'x', salaId: 'COMUM1', nome: 'Xis', socketId: 's' });
    expect(() => store.startWithBots('COMUM1')).toThrow(RoomError);

    entrar(store, 'Ana', 3);
    const id = store.sessions().find((s) => s.sala.rapida)!.sala.id;
    store.startWithBots(id);
    expect(() => store.startWithBots(id)).toThrow(RoomError);
  });

  it('o anfitrião pode começar antes do tempo: start() completa com bots', () => {
    const store = new RoomStore();
    entrar(store, 'Ana', 3);
    const id = store.sessions()[0]!.sala.id;
    const session = store.start(id, 'sock-Ana');
    expect(session.sala.jogadores).toHaveLength(3);
    expect(session.sala.jogadores.filter((j) => j.isBot)).toHaveLength(2);
  });
});

describe('RoomStore — vez dos bots (playBotTurn)', () => {
  function salaIniciada(tamanho = 3): { store: RoomStore; id: string } {
    const store = new RoomStore();
    entrar(store, 'Ana', tamanho);
    const id = store.sessions()[0]!.sala.id;
    store.startWithBots(id);
    return { store, id };
  }

  it('joga a vez do bot pelo motor compartilhado e passa o turno', () => {
    const { store, id } = salaIniciada();
    // Entrega a vez a um bot.
    const sessao = store.get(id)!;
    sessao.estado = { ...sessao.estado!, vezDe: sessao.estado!.jogadores[1]!.id };
    const antes = sessao.estado!.historico.length;

    const resultado = store.playBotTurn(id);
    expect(resultado.botId).toBe(sessao.estado!.jogadores[1]!.id);
    expect(['JOGOU', 'COMPROU']).toContain(resultado.acao);
    const depois = store.get(id)!.estado!;
    expect(depois.historico.length).toBeGreaterThan(antes);
    expect(depois.vezDe).not.toBe(resultado.botId);
  });

  it('recusa quando a vez é de uma pessoa', () => {
    const { store, id } = salaIniciada();
    const sessao = store.get(id)!;
    sessao.estado = { ...sessao.estado!, vezDe: 'id-Ana' };
    expect(() => store.playBotTurn(id)).toThrow(/vez de um bot/);
  });

  it('recusa enquanto a janela de Corta-Frente está aberta', () => {
    const { store, id } = salaIniciada();
    const sessao = store.get(id)!;
    sessao.estado = {
      ...sessao.estado!,
      vezDe: sessao.estado!.jogadores[1]!.id,
      interceptacao: {
        janelaId: 'j1',
        cartaAlvoId: 'x',
        jogadorOrigemId: 'id-Ana',
        fechaEm: Date.now() + 5000,
        proximaVezId: sessao.estado!.jogadores[1]!.id,
        revisao: 1,
      },
    };
    expect(() => store.playBotTurn(id)).toThrow(/Corta-Frente/);
  });
});

describe('shouldOpenInterception — a janela de Corta-Frente em salas com bots', () => {
  it('salas só de pessoas: sempre abre (abrir só com carta idêntica revelaria a mão)', () => {
    const estado = criarPartidaInicial({
      baralho: Constants.BARALHO_COMPLETO_108,
      modo: 'ONLINE_PRIVADA',
      totalJogadores: 2,
    });
    expect(shouldOpenInterception(estado, estado.jogadores[0]!.id)).toBe(true);
  });

  it('um humano e bots: só abre se o humano tem a carta idêntica a quem jogou', () => {
    const base = estadoComBots(1, 2);
    const sem = comMao(base, 'h1', [outraCarta]);
    const com = comMao(base, 'h1', [outraCarta, identicaAoTopo]);
    expect(shouldOpenInterception(sem, 'b1')).toBe(false);
    expect(shouldOpenInterception(com, 'b1')).toBe(true);
  });

  it('um humano e bots: a jogada do próprio humano não abre janela', () => {
    const base = comMao(estadoComBots(1, 2), 'h1', [identicaAoTopo]);
    expect(shouldOpenInterception(base, 'h1')).toBe(false);
  });

  it('vários humanos e bots: sempre abre, para não revelar quem tem a carta', () => {
    const base = comMao(estadoComBots(2, 1), 'h1', [outraCarta]);
    const nenhumTem = comMao(base, 'h2', [outraCarta]);
    expect(shouldOpenInterception(nenhumTem, 'b1')).toBe(true);
    expect(shouldOpenInterception(nenhumTem, 'h1')).toBe(true);
  });

  it('openInterceptionWindow segue a regra: sem carta idêntica, a vez não fica presa', () => {
    const store = new RoomStore();
    entrar(store, 'Ana', 3);
    const id = store.sessions()[0]!.sala.id;
    store.startWithBots(id);
    const sessao = store.get(id)!;
    const topo = { ...identicaAoTopo, id: 'topo-a' };
    sessao.estado = {
      ...comMao(sessao.estado!, 'id-Ana', [outraCarta]),
      monteDescarte: [topo],
      vezDe: 'id-Ana',
    };
    const bot = sessao.estado!.jogadores[1]!.id;
    expect(store.openInterceptionWindow(id, bot)).toBeUndefined();
    expect(store.get(id)!.estado!.interceptacao).toBeUndefined();

    // Agora a pessoa tem a carta idêntica: a janela abre.
    store.get(id)!.estado = comMao(store.get(id)!.estado!, 'id-Ana', [outraCarta, identicaAoTopo]);
    expect(store.openInterceptionWindow(id, bot)?.estado?.interceptacao).toBeDefined();
  });
});

describe('RoomStore — observador e limpeza', () => {
  it('avisa o observador a cada gravação e ele nunca impede o jogo', () => {
    const store = new RoomStore();
    const vistas: RoomSession[] = [];
    store.setCommitHandler((session) => {
      vistas.push(session);
      throw new Error('falha do observador');
    });
    expect(() => entrar(store, 'Ana', 3)).not.toThrow();
    entrar(store, 'Bia', 3);
    expect(vistas.length).toBeGreaterThanOrEqual(2);
    expect(store.sessions()).toHaveLength(1);
  });

  it('removeRoom apaga a sala e limpa o prazo da janela de Corta-Frente', () => {
    vi.useFakeTimers();
    try {
      const store = new RoomStore();
      entrar(store, 'Ana', 3);
      const id = store.sessions()[0]!.sala.id;
      store.startWithBots(id);
      store.removeRoom(id);
      expect(store.get(id)).toBeUndefined();
      expect(store.sessions()).toHaveLength(0);
      store.removeRoom(id); // idempotente
    } finally {
      vi.useRealTimers();
    }
  });
});
