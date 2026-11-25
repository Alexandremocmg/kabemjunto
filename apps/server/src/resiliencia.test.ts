import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Constants, type Carta, type EstadoPartida, type JogadorId } from '@kabemjunto/shared';
import type { PersistedRoomSession, RoomPersistence } from './persistence.js';
import { QuickPlayDirector } from './quickplay.js';
import { ResilienciaDirector } from './resiliencia.js';
import {
  INTERCEPTION_WINDOW_MS,
  RoomStore,
  shouldOpenInterception,
  toPublicState,
  type RoomSession,
} from './room-store.js';
import type { GameServer } from './socket-types.js';

const SALA = 'MESA01';
const LIMITE = 30_000;
const TOLERANCIA = 20_000;
const PAUSA = 100;

function carta(filtro: (c: Carta) => boolean, n = 0): Carta {
  return Constants.BARALHO_COMPLETO_108.filter(filtro)[n]!;
}
const numero = (cor: string, valor: number, n = 0) =>
  carta((c) => c.tipo === 'NUMERADA' && !c.acao && c.cor === cor && c.valor === valor, n);

const AZUL1 = numero('AZUL', 1);
const AZUL1_B = numero('AZUL', 1, 1);
const AZUL2 = numero('AZUL', 2);
const AZUL3 = numero('AZUL', 3);
const VERDE5 = numero('VERDE', 5);
const VERDE6 = numero('VERDE', 6);
const PULA_AZUL = carta((c) => c.acao === 'SKIP' && c.cor === 'AZUL');

function criarIoFalso() {
  const estados: Array<ReturnType<typeof toPublicState>> = [];
  const io = {
    to: () => ({
      emit: (evento: string, payload: { estado: ReturnType<typeof toPublicState> }) => {
        if (evento === 'server:estado:atualizado') estados.push(payload.estado);
      },
    }),
    in: () => ({ socketsLeave: () => undefined }),
    sockets: { sockets: new Map() },
  };
  return { io: io as unknown as GameServer, estados };
}

const parar: Array<() => void> = [];

function montar(
  nomes: readonly string[],
  opcoes: { limite?: number; tolerancia?: number; persistence?: RoomPersistence } = {},
) {
  const { io, estados } = criarIoFalso();
  const store = new RoomStore(opcoes.persistence, { turnLimitMs: opcoes.limite ?? LIMITE });
  const bots = new QuickPlayDirector(io, store, { botDelayMs: { min: PAUSA, max: PAUSA } });
  const diretor = new ResilienciaDirector(io, store, {
    disconnectGraceMs: opcoes.tolerancia ?? TOLERANCIA,
  });
  bots.start();
  diretor.start();
  parar.push(
    () => bots.stop(),
    () => diretor.stop(),
  );
  const tokens = new Map<string, string>();
  for (const nome of nomes) {
    const entrada = store.join({ jogadorId: nome, salaId: SALA, nome, socketId: `s-${nome}` });
    tokens.set(nome, entrada.resumeToken);
  }
  store.start(SALA, `s-${nomes[0]}`);
  const estado = () => store.get(SALA)!.estado!;
  const jogador = (id: string) => estado().jogadores.find((j) => j.id === id)!;
  return {
    store,
    estados,
    estado,
    jogador,
    tokens,
    voltar(nome: string) {
      const volta = store.join({
        jogadorId: nome,
        salaId: SALA,
        nome,
        socketId: `s-${nome}-novo`,
        resumeToken: tokens.get(nome)!,
      });
      tokens.set(nome, volta.resumeToken);
      return volta;
    },
    /** Situação controlada: topo AZUL 3, sem ataque, e as mãos informadas. */
    preparar(vezDe: JogadorId, maos: Record<string, Carta[]>) {
      const sessao = store.get(SALA)!;
      gravar(store, {
        ...sessao,
        estado: {
          ...sessao.estado!,
          jogadores: sessao.estado!.jogadores.map((j) => ({ ...j, mao: maos[j.id] ?? j.mao })),
          monteDescarte: [AZUL3],
          corAtiva: 'AZUL',
          sentido: 1,
          ataqueAcumulado: 0,
          ataqueStack: [],
          silencio: { ativo: false, jogadoresQuebraram: [] },
          interceptacao: undefined,
          vezDe,
        } as EstadoPartida,
      });
    },
  };
}

/** Grava como uma ação de turno do servidor gravaria. */
function gravar(store: RoomStore, session: RoomSession): void {
  (store as unknown as { commit(s: RoomSession, novaVez: boolean): void }).commit(session, true);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const fim of parar.splice(0)) fim();
  vi.useRealTimers();
});

describe('abandono explícito', () => {
  it('um bot assume o assento (mesmo id, posição e mão) e a partida de 2 pessoas segue', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1, VERDE5], bia: [AZUL2, VERDE6] });
    const saida = t.store.abandonGame(SALA, 'ana');

    expect(saida.estado!.finalizada).toBe(false);
    expect(saida.sala.status).toBe('EM_PARTIDA');
    expect(saida.estado!.jogadores.map((j) => j.id)).toEqual(['ana', 'bia']);
    expect(t.jogador('ana').mao).toEqual([AZUL1, VERDE5]);
    expect(saida.sala.hostId).toBe('bia');
    const publico = toPublicState(saida.estado!);
    expect(publico.jogadores[0]).toMatchObject({
      isBot: true,
      controladoPorBot: true,
      motivoBot: 'SAIU',
      quantidadeCartas: 2,
    });
    expect(JSON.stringify(publico)).not.toContain('"mao"');
    expect(publico.turno).toBeUndefined();

    // O bot joga a vez de quem saiu.
    vi.advanceTimersByTime(PAUSA);
    expect(t.jogador('ana').mao).toEqual([VERDE5]);
  });

  it('quem saiu não retoma a vaga, mas pode entrar em outra sala', () => {
    const t = montar(['ana', 'bia']);
    t.store.abandonGame(SALA, 'ana');
    expect(() => t.voltar('ana')).toThrow('Credenciais de retomada inválidas');
    expect(() => t.store.abandonGame(SALA, 'ana')).toThrow('Credenciais');
    expect(
      t.store.join({ jogadorId: 'ana', salaId: 'OUTRA', nome: 'Ana', socketId: 'x' }).reconectado,
    ).toBe(false);
    expect(
      t.store.quickJoin({ jogadorId: 'caio', nome: 'Caio', socketId: 'y', tamanho: 3 }).session.sala
        .rapida,
    ).toBeDefined();
  });

  it('quem saiu de uma sala rápida pode pedir "Jogar agora" de novo', () => {
    const t = montar(['x', 'y']);
    const pedir = (nome: string) =>
      t.store.quickJoin({ jogadorId: nome, nome, socketId: `q-${nome}`, tamanho: 2 }).session.sala
        .id;
    const primeira = pedir('ana');
    expect(pedir('bia')).toBe(primeira);
    vi.advanceTimersByTime(0);
    t.store.abandonGame(primeira, 'ana');
    expect(pedir('ana')).not.toBe(primeira);
    expect(t.store.get(primeira)!.estado!.finalizada).toBe(false);
  });

  it('o host passa para alguém conectado e a última pessoa encerra a partida', () => {
    const t = montar(['ana', 'bia', 'caio']);
    t.store.disconnect('s-bia');
    expect(t.store.abandonGame(SALA, 'ana').sala.hostId).toBe('caio');
    expect(t.store.abandonGame(SALA, 'caio').sala.hostId).toBe('bia');
    const fim = t.store.abandonGame(SALA, 'bia');
    expect(fim.estado!.finalizada).toBe(true);
    expect(fim.sala.status).toBe('FINALIZADA');
    expect(fim.estado!.historico.at(-1)).toMatchObject({
      tipo: 'PARTIDA_FINALIZADA',
      motivo: 'ABANDONO',
    });
  });

  it('o assento assumido pode vencer', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1], bia: [AZUL2, VERDE6] });
    t.store.abandonGame(SALA, 'ana');
    vi.advanceTimersByTime(PAUSA);
    expect(t.estado()).toMatchObject({ finalizada: true, vencedor: 'ana' });
  });

  it('sair com o Corta-Frente aberto não fecha a janela dos outros', () => {
    const t = montar(['ana', 'bia', 'caio']);
    t.preparar('ana', { ana: [AZUL1, VERDE5], bia: [VERDE6, AZUL2], caio: [VERDE6, AZUL1_B] });
    t.store.play(SALA, 'ana', AZUL1.id);
    const janela = t.store.openInterceptionWindow(SALA, 'ana')!.estado!.interceptacao!;
    t.store.abandonGame(SALA, 'ana');
    expect(t.estado().interceptacao?.janelaId).toBe(janela.janelaId);
    t.store.intercept(SALA, 'caio', janela.janelaId, janela.revisao, AZUL1_B.id);
    expect(t.estado().interceptacao).toBeUndefined();
    expect(t.jogador('caio').mao).toEqual([VERDE6]);
  });

  it('em nova partida na mesma sala, quem saiu continua representado por bot', () => {
    const t = montar(['ana', 'bia']);
    t.store.abandonGame(SALA, 'bia');
    expect(() => t.store.start(SALA, 's-ana')).toThrow('já começou');
    const sessao = t.store.get(SALA)!;
    gravar(t.store, {
      ...sessao,
      estado: { ...sessao.estado!, finalizada: true, vencedor: 'ana' },
    });
    expect(() => t.store.start(SALA, 's-ana')).toThrow('já começou');
    t.store.startRematch(SALA, t.estado().partidaId, new Set(['ana']));
    expect(t.jogador('bia')).toMatchObject({ isBot: true, motivoBot: 'SAIU' });
  });
});

describe('queda de conexão', () => {
  it('depois da tolerância um bot joga pelo assento; a volta devolve o controle', () => {
    const t = montar(['ana', 'bia', 'caio']);
    t.preparar('ana', { ana: [AZUL1, VERDE5, VERDE6] });
    t.store.disconnect('s-ana');
    vi.advanceTimersByTime(TOLERANCIA - 1);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();

    vi.advanceTimersByTime(1);
    expect(t.jogador('ana')).toMatchObject({
      isBot: false,
      conectado: false,
      controladoPorBot: true,
      motivoBot: 'CAIU',
    });
    vi.advanceTimersByTime(PAUSA);
    expect(t.jogador('ana').mao).toEqual([VERDE5, VERDE6]);
    expect(t.jogador('ana').isBot).toBe(false);

    const volta = t.voltar('ana');
    expect(volta.reconectado).toBe(true);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
    expect(t.jogador('ana').motivoBot).toBeUndefined();
    expect(t.jogador('ana').mao).toEqual([VERDE5, VERDE6]);
  });

  it('a volta durante a pausa do bot cancela a jogada dele', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1, VERDE5] });
    t.store.disconnect('s-ana');
    vi.advanceTimersByTime(TOLERANCIA + PAUSA / 2);
    expect(t.jogador('ana').controladoPorBot).toBe(true);
    t.voltar('ana');
    vi.advanceTimersByTime(PAUSA * 3);
    expect(t.jogador('ana').mao).toEqual([AZUL1, VERDE5]);
    expect(t.estado().vezDe).toBe('ana');
  });

  it('reconectar e cair de novo recomeça a tolerância', () => {
    const t = montar(['ana', 'bia']);
    t.store.disconnect('s-ana');
    vi.advanceTimersByTime(TOLERANCIA - 10);
    t.voltar('ana');
    t.store.disconnect('s-ana-novo');
    vi.advanceTimersByTime(TOLERANCIA - 1);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(t.jogador('ana').controladoPorBot).toBe(true);
  });

  it('com a mesa inteira fora nada joga sozinho; quem volta religa a tolerância dos outros', () => {
    const t = montar(['ana', 'bia', 'caio']);
    t.preparar('bia', {});
    t.store.abandonGame(SALA, 'caio');
    t.store.disconnect('s-ana');
    vi.advanceTimersByTime(TOLERANCIA); // ana passa a ser jogada por bot
    t.store.disconnect('s-bia');
    const antes = t.estado().historico.length;
    t.preparar('ana', {}); // vez de um assento automático
    vi.advanceTimersByTime(60 * 60_000);
    expect(t.estado().historico.length).toBe(antes);
    expect(t.jogador('bia').controladoPorBot).toBeUndefined();

    t.voltar('ana');
    expect(t.estado().turno?.jogadorId).toBe('ana');
    vi.advanceTimersByTime(TOLERANCIA);
    expect(t.jogador('bia').controladoPorBot).toBe(true);
  });

  it('tolerância 0 desliga o recurso', () => {
    const t = montar(['ana', 'bia'], { tolerancia: 0 });
    t.store.disconnect('s-ana');
    vi.advanceTimersByTime(60 * 60_000);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
  });

  it('o Corta-Frente não muda por causa de um controle temporário', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1, VERDE5], bia: [VERDE6, VERDE5] });
    t.store.disconnect('s-ana');
    vi.advanceTimersByTime(TOLERANCIA + PAUSA);
    // Bia não tem a idêntica e mesmo assim a janela abre: o contrário revelaria a mão dela.
    expect(t.estado().interceptacao?.jogadorOrigemId).toBe('ana');
    expect(shouldOpenInterception(t.estado(), 'ana')).toBe(true);
  });
});

describe('limite por vez', () => {
  it('expõe o prazo e, ao estourar, joga só aquela vez', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1, VERDE5, VERDE6], bia: [AZUL2, VERDE6] });
    vi.advanceTimersByTime(10_000);
    const turno = toPublicState(t.estado()).turno!;
    expect(turno).toMatchObject({ jogadorId: 'ana', duracaoMs: LIMITE, restanteMs: 20_000 });
    expect(turno.expiraEm).toBe(Date.now() + 20_000);

    vi.advanceTimersByTime(19_999);
    expect(t.jogador('ana').mao).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(t.jogador('ana').mao).toEqual([VERDE5, VERDE6]);
    expect(t.jogador('ana')).toMatchObject({ isBot: false });
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
  });

  it('durante o Corta-Frente o prazo fica parado e recomeça inteiro ao fechar', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1, VERDE5], bia: [AZUL2, VERDE6] });
    vi.advanceTimersByTime(LIMITE - 100);
    t.store.play(SALA, 'ana', AZUL1.id);
    t.store.openInterceptionWindow(SALA, 'ana');
    expect(t.estado().turno).toBeUndefined();
    vi.advanceTimersByTime(INTERCEPTION_WINDOW_MS);
    expect(t.estado().turno).toMatchObject({
      jogadorId: 'bia',
      expiraEm: Date.now() + LIMITE,
    });
    vi.advanceTimersByTime(LIMITE - 1);
    expect(t.jogador('bia').mao).toEqual([AZUL2, VERDE6]);
    vi.advanceTimersByTime(1);
    expect(t.jogador('bia').mao).toEqual([VERDE6]);
  });

  it('vez que volta ao mesmo jogador (pula com 2 pessoas) ganha prazo e revisão novos', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [PULA_AZUL, AZUL1, VERDE5], bia: [AZUL2, VERDE6] });
    const antiga = t.estado().turno!;
    vi.advanceTimersByTime(LIMITE - 1);
    t.store.play(SALA, 'ana', PULA_AZUL.id);
    expect(t.estado().vezDe).toBe('ana');
    expect(t.estado().turno!.revisao).toBeGreaterThan(antiga.revisao);
    vi.advanceTimersByTime(LIMITE - 1); // o prazo antigo já teria disparado
    expect(t.jogador('ana').mao).toEqual([AZUL1, VERDE5]);

    // Mesmo forçado, um prazo de outra vez não faz nada.
    const partidaId = t.estado().partidaId;
    expect(
      t.store.expirarVez(SALA, { partidaId, jogadorId: 'ana', revisao: antiga.revisao }),
    ).toBeUndefined();
    expect(
      t.store.expirarVez(SALA, {
        partidaId: 'outra',
        jogadorId: 'ana',
        revisao: t.estado().turno!.revisao,
      }),
    ).toBeUndefined();
    expect(t.jogador('ana').mao).toEqual([AZUL1, VERDE5]);

    vi.advanceTimersByTime(1);
    expect(t.jogador('ana').mao).toEqual([VERDE5]);
  });

  it('dois estouros seguidos marcam inatividade; o bot segue até a pessoa agir', () => {
    const t = montar(['ana', 'bia']);
    const maos = { ana: [AZUL1, VERDE5, VERDE6], bia: [AZUL2, VERDE6] };
    t.preparar('ana', maos);
    vi.advanceTimersByTime(LIMITE);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
    t.preparar('ana', maos);
    vi.advanceTimersByTime(LIMITE);
    expect(t.jogador('ana')).toMatchObject({
      isBot: false,
      conectado: true,
      controladoPorBot: true,
      motivoBot: 'INATIVO',
    });

    t.preparar('ana', maos);
    expect(t.estado().turno).toBeUndefined();
    vi.advanceTimersByTime(PAUSA); // joga na pausa de bot, sem esperar o limite
    expect(t.jogador('ana').mao).toEqual([VERDE5, VERDE6]);

    t.preparar('ana', maos);
    expect(t.store.registrarPresenca(SALA, 'ana')).toBeDefined();
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
    expect(t.estado().turno).toMatchObject({ jogadorId: 'ana' });
    vi.advanceTimersByTime(PAUSA * 3);
    expect(t.jogador('ana').mao).toEqual(maos.ana);
    // A contagem recomeçou: um estouro só não marca de novo.
    vi.advanceTimersByTime(LIMITE);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
  });

  it('agir entre dois estouros zera a contagem', () => {
    const t = montar(['ana', 'bia']);
    const maos = { ana: [AZUL1, VERDE5, VERDE6], bia: [AZUL2, VERDE6] };
    t.preparar('ana', maos);
    vi.advanceTimersByTime(LIMITE);
    expect(t.store.registrarPresenca(SALA, 'ana')).toBeUndefined();
    t.preparar('ana', maos);
    vi.advanceTimersByTime(LIMITE);
    expect(t.jogador('ana').controladoPorBot).toBeUndefined();
  });

  it('recarregar a página não renova o prazo, mas garante um mínimo', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1, VERDE5] });
    vi.advanceTimersByTime(10_000);
    t.store.disconnect('s-ana');
    expect(t.estado().turno).toBeUndefined();
    vi.advanceTimersByTime(3_000);
    t.voltar('ana');
    expect(toPublicState(t.estado()).turno!.restanteMs).toBe(20_000);
    vi.advanceTimersByTime(19_000);
    t.store.disconnect('s-ana-novo');
    t.voltar('ana');
    expect(toPublicState(t.estado()).turno!.restanteMs).toBe(5_000);
  });

  it('queda e volta de outra pessoa e penalidade de silêncio não mexem no prazo', () => {
    const t = montar(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1, VERDE5] });
    const prazo = t.estado().turno!;
    vi.advanceTimersByTime(5_000);
    t.store.disconnect('s-bia');
    t.voltar('bia');
    const sessao = t.store.get(SALA)!;
    sessao.estado = { ...sessao.estado!, silencio: { ativo: true, jogadoresQuebraram: [] } };
    expect(t.store.penalizeSilenceBreak(SALA, 'ana').penalized).toBe(true);
    expect(t.estado().turno).toEqual(prazo);
  });

  it('limite 0 desliga: sem prazo no estado e sem jogada automática', () => {
    const t = montar(['ana', 'bia'], { limite: 0 });
    t.preparar('ana', { ana: [AZUL1, VERDE5] });
    expect(toPublicState(t.estado())).not.toHaveProperty('turno');
    vi.advanceTimersByTime(60 * 60_000);
    expect(t.jogador('ana').mao).toEqual([AZUL1, VERDE5]);
  });

  it('falha ao gravar a jogada automática é tentada de novo', () => {
    let falhar = false;
    const t = montar(['ana', 'bia'], {
      persistence: {
        load: () => [],
        save: () => {
          if (falhar) throw new Error('disco cheio');
        },
      },
    });
    t.preparar('ana', { ana: [AZUL1, VERDE5], bia: [AZUL2, VERDE6] });
    falhar = true;
    vi.advanceTimersByTime(LIMITE);
    expect(t.jogador('ana').mao).toEqual([AZUL1, VERDE5]);
    falhar = false;
    vi.advanceTimersByTime(5_000);
    expect(t.jogador('ana').mao).toEqual([VERDE5]);
  });
});

describe('persistência', () => {
  it('não grava o prazo e, ao reiniciar, ninguém estoura até voltar', () => {
    let salvo: readonly PersistedRoomSession[] = [];
    const t = montar(['ana', 'bia', 'caio'], {
      persistence: {
        load: () => [],
        save: (rooms) => {
          salvo = JSON.parse(JSON.stringify(rooms)) as PersistedRoomSession[];
        },
      },
    });
    t.store.abandonGame(SALA, 'caio');
    t.store.disconnect('s-bia');
    vi.advanceTimersByTime(TOLERANCIA); // bia em controle temporário
    t.preparar('ana', { ana: [AZUL1, VERDE5], bia: [AZUL2, VERDE6] });
    expect(t.estado().turno).toBeDefined();
    expect(JSON.stringify(salvo)).not.toContain('"turno"');
    for (const fim of parar.splice(0)) fim();

    vi.advanceTimersByTime(24 * 60 * 60_000);
    const { io } = criarIoFalso();
    const novo = new RoomStore(
      { load: () => [...salvo], save: () => undefined },
      { turnLimitMs: LIMITE },
    );
    const bots = new QuickPlayDirector(io, novo, { botDelayMs: { min: PAUSA, max: PAUSA } });
    const diretor = new ResilienciaDirector(io, novo, { disconnectGraceMs: TOLERANCIA });
    bots.start();
    diretor.start();
    parar.push(
      () => bots.stop(),
      () => diretor.stop(),
    );
    vi.advanceTimersByTime(10 * 60_000);
    const jogador = (id: string) => novo.get(SALA)!.estado!.jogadores.find((j) => j.id === id)!;
    expect(jogador('ana').mao).toEqual([AZUL1, VERDE5]);
    expect(jogador('bia').controladoPorBot).toBeUndefined();
    expect(jogador('caio')).toMatchObject({ isBot: true, motivoBot: 'SAIU', conectado: true });

    novo.join({
      jogadorId: 'ana',
      salaId: SALA,
      nome: 'ana',
      socketId: 'novo',
      resumeToken: t.tokens.get('ana')!,
    });
    expect(toPublicState(novo.get(SALA)!.estado!).turno!.restanteMs).toBe(LIMITE);
    vi.advanceTimersByTime(TOLERANCIA - 1);
    expect(jogador('bia').controladoPorBot).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(jogador('bia').controladoPorBot).toBe(true);
  });
});
