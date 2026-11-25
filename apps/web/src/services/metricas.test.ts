// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Metricas from './metricas';
import type * as Shared from '@kabemjunto/shared';

/** Armazenamento em memória: o storage do jsdom some em algumas versões do Node. */
function armazenamentoEmMemoria(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (chave) => dados.get(chave) ?? null,
    key: (indice) => [...dados.keys()][indice] ?? null,
    removeItem: (chave) => void dados.delete(chave),
    setItem: (chave, valor) => void dados.set(chave, String(valor)),
  };
}

function armazenamentoBloqueado(): Storage {
  const bloquear = (): never => {
    throw new Error('bloqueado');
  };
  return {
    get length(): number {
      return bloquear();
    },
    clear: bloquear,
    getItem: bloquear,
    key: bloquear,
    removeItem: bloquear,
    setItem: bloquear,
  };
}

function instalar(nome: 'localStorage' | 'sessionStorage', armazenamento: Storage): void {
  Object.defineProperty(window, nome, { value: armazenamento, configurable: true });
}

function definirNavegador(nome: 'doNotTrack' | 'globalPrivacyControl', valor: unknown): void {
  Object.defineProperty(window.navigator, nome, { value: valor, configurable: true });
}

interface Envio {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
}

const fetchFalso = vi.fn((_url: string, _opcoes: RequestInit) => Promise.resolve(new Response()));
const envios = (): Envio[] =>
  fetchFalso.mock.calls.map(([, opcoes]) => JSON.parse(String(opcoes.body)) as Envio);
const nomes = (): string[] => envios().map((envio) => envio.event);
const propriedades = (): Record<string, unknown>[] =>
  envios().map(({ properties }) =>
    Object.fromEntries(Object.entries(properties).filter(([nome]) => !nome.startsWith('$'))),
  );

let metricas: typeof Metricas;
let shared: typeof Shared;

/** Como abrir (ou recarregar) a página: módulos novos, armazenamento preservado. */
async function abrirPagina(): Promise<void> {
  vi.resetModules();
  shared = await import('@kabemjunto/shared');
  metricas = await import('./metricas');
  const { posthogSink } = await import('./posthogSink');
  shared.configureTelemetry({ enabled: true, sampleRate: 1, sink: posthogSink });
}

const partida = (extra: Partial<Metricas.PartidaObservada> = {}): Metricas.PartidaObservada => ({
  partidaId: 'game_1_SALA99',
  jogadores: [{ isBot: false }, { isBot: true }, { isBot: true }],
  finalizada: false,
  ...extra,
});

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  instalar('localStorage', armazenamentoEmMemoria());
  instalar('sessionStorage', armazenamentoEmMemoria());
  definirNavegador('doNotTrack', null);
  definirNavegador('globalPrivacyControl', undefined);
  fetchFalso.mockClear();
  vi.stubGlobal('fetch', fetchFalso);
  vi.stubEnv('VITE_POSTHOG_API_KEY', 'chave-de-teste');
  await abrirPagina();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Dispara todos os eventos da lista. */
function dispararTudo(): void {
  metricas.registrarRetorno();
  metricas.observarPartida(partida(), 'rapida', 'eu');
  metricas.observarPartida(partida({ finalizada: true, vencedor: 'eu' }), 'rapida', 'eu');
  metricas.revanchePedida('game_1_SALA99');
  metricas.observarPartida(partida({ partidaId: 'p2' }), 'local', 'eu');
  metricas.partidaAbandonada('p2');
  metricas.buscaRapidaCancelada();
  metricas.buscaRapidaVirouLocal('falha');
  metricas.reconectado(10_000);
}

function esperarNadaEnviadoNemGuardado(): void {
  expect(fetchFalso).not.toHaveBeenCalled();
  expect(window.sessionStorage.length).toBe(0);
  expect(window.localStorage.getItem('kabemjunto.metricas.ultimaVisita')).toBeNull();
}

describe('sem permissão: não envia nem guarda nada', () => {
  it.each(['', '   ', 'phc_your_project_token_here'])('chave ausente (%j)', (chave) => {
    vi.stubEnv('VITE_POSTHOG_API_KEY', chave);
    dispararTudo();
    esperarNadaEnviadoNemGuardado();
    expect(window.localStorage.length).toBe(0);
  });

  it('telemetria desligada (DEV)', () => {
    shared.configureTelemetry({ enabled: false });
    dispararTudo();
    esperarNadaEnviadoNemGuardado();
  });

  it.each([
    ['doNotTrack', '1'],
    ['doNotTrack', 'yes'],
    ['globalPrivacyControl', true],
  ] as const)('navegador pede privacidade (%s)', (nome, valor) => {
    definirNavegador(nome, valor);
    dispararTudo();
    esperarNadaEnviadoNemGuardado();
  });

  it('opt-out vale na hora, apaga o que havia e continua após recarregar', async () => {
    dispararTudo();
    expect(window.sessionStorage.length).toBe(1);
    fetchFalso.mockClear();
    metricas.definirOptOut(true);
    dispararTudo();
    esperarNadaEnviadoNemGuardado();
    await abrirPagina();
    expect(metricas.lerOptOut()).toBe(true);
    dispararTudo();
    esperarNadaEnviadoNemGuardado();
    metricas.definirOptOut(false);
    metricas.buscaRapidaCancelada();
    expect(nomes()).toEqual(['BUSCA_RAPIDA_CANCELADA']);
  });

  it('o sink também respeita o opt-out', () => {
    metricas.definirOptOut(true);
    shared.logCustom('BUSCA_RAPIDA_CANCELADA');
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe('dedupe por partidaId', () => {
  const abrirEFechar = (): void => {
    metricas.observarPartida(partida(), 'local', 'eu');
    metricas.observarPartida(partida(), 'local', 'eu');
    const fim = partida({ finalizada: true, vencedor: 'bot' });
    metricas.observarPartida(fim, 'local', 'eu');
    metricas.observarPartida(fim, 'local', 'eu');
    metricas.revanchePedida(fim.partidaId);
    metricas.revanchePedida(fim.partidaId);
  };
  const umaVez = ['PARTIDA_INICIADA', 'PARTIDA_TERMINADA', 'REVANCHE_PEDIDA'];

  it('na mesma página e depois de recarregar', async () => {
    abrirEFechar();
    await abrirPagina();
    abrirEFechar();
    expect(nomes()).toEqual(umaVez);
  });

  it('recarregar no meio não repete o início e o fim ainda conta, com o modo do início', async () => {
    metricas.observarPartida(partida(), 'rapida', 'eu');
    await abrirPagina();
    metricas.observarPartida(partida(), 'online', 'eu');
    metricas.observarPartida(partida({ finalizada: true }), 'online', 'eu');
    expect(nomes()).toEqual(['PARTIDA_INICIADA', 'PARTIDA_TERMINADA']);
    expect(propriedades()[1]).toEqual({
      modo: 'rapida',
      resultado: 'abandono',
      duracao: '<2min',
    });
  });

  it('término e abandono se excluem', () => {
    metricas.observarPartida(partida(), 'online', 'eu');
    metricas.partidaAbandonada('game_1_SALA99');
    metricas.partidaAbandonada('game_1_SALA99');
    metricas.observarPartida(partida({ finalizada: true }), 'online', 'eu');
    expect(nomes()).toEqual(['PARTIDA_INICIADA', 'PARTIDA_ABANDONADA']);
  });

  it('partida que já aparece terminada, ou desconhecida, não conta', () => {
    metricas.observarPartida(partida({ finalizada: true, vencedor: 'eu' }), 'online', 'eu');
    metricas.partidaAbandonada('outra');
    metricas.revanchePedida('outra');
    expect(nomes()).toEqual([]);
  });

  it('guarda no máximo 30 partidas', () => {
    for (let i = 0; i < 40; i += 1) {
      metricas.observarPartida(partida({ partidaId: `p${i}` }), 'local', 'eu');
    }
    const salvo = window.sessionStorage.getItem('kabemjunto.metricas.partidas') ?? '';
    expect(Object.keys(JSON.parse(salvo) as object)).toHaveLength(30);
  });

  it('useMesaLocal em StrictMode: um início e um abandono', async () => {
    const { useMesaLocal } = await import('../mesa/useMesaLocal');
    let mesa: ReturnType<typeof useMesaLocal> | undefined;
    function Sonda(): null {
      mesa = useMesaLocal();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(StrictMode, null, createElement(Sonda))));
    act(() => mesa?.iniciar(3, 'Nome Secreto'));
    act(() => mesa?.encerrar());
    act(() => root.unmount());
    // O motor também emite um PARTIDA_INICIADA (com ids): o sink o descarta.
    expect(nomes()).toEqual(['PARTIDA_INICIADA', 'PARTIDA_ABANDONADA']);
    expect(propriedades()[0]).toEqual({ modo: 'local', totalJogadores: 3, bots: 2 });
    expect(JSON.stringify(envios())).not.toContain('Nome Secreto');
  });
});

describe('faixas', () => {
  it('duração da partida', () => {
    const min = 60_000;
    const casos = [0, 2 * min - 1, 2 * min, 5 * min, 10 * min, 20 * min, 999 * min];
    expect(casos.map(metricas.faixaDeDuracao)).toEqual([
      '<2min',
      '<2min',
      '2-5min',
      '5-10min',
      '10-20min',
      '20min+',
      '20min+',
    ]);
  });

  it('queda de conexão', () => {
    expect([4_999, 5_000, 30_000, 120_000].map(metricas.faixaDeQueda)).toEqual([
      '<5s',
      '5-30s',
      '30s-2min',
      '2min+',
    ]);
  });

  it('dias', () => {
    expect([-3, 0, 1, 2, 6, 7, 400].map(metricas.faixaDeDias)).toEqual([
      '0',
      '0',
      '1',
      '2-6',
      '2-6',
      '7+',
      '7+',
    ]);
  });

  it('a duração conta desde o início observado', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    metricas.observarPartida(partida(), 'local', 'eu');
    vi.setSystemTime(1_000_000 + 6 * 60_000);
    metricas.observarPartida(partida({ finalizada: true, vencedor: 'eu' }), 'local', 'eu');
    expect(propriedades()[1]).toEqual({ modo: 'local', resultado: 'vitoria', duracao: '5-10min' });
  });
});

describe('RETORNO', () => {
  it('uma vez por dia do calendário, mesmo recarregando', async () => {
    metricas.registrarRetorno(new Date(2026, 1, 27, 23, 59));
    await abrirPagina();
    metricas.registrarRetorno(new Date(2026, 1, 27, 23, 59, 59));
    metricas.registrarRetorno(new Date(2026, 1, 28, 0, 1));
    metricas.registrarRetorno(new Date(2026, 2, 3));
    metricas.registrarRetorno(new Date(2026, 2, 10));
    expect(propriedades().map((p) => p['diasDesdeUltima'])).toEqual(['0', '1', '2-6', '7+']);
  });

  it('valor guardado inválido ou relógio para trás viram "0"', () => {
    window.localStorage.setItem('kabemjunto.metricas.ultimaVisita', 'lixo');
    metricas.registrarRetorno(new Date(2026, 2, 10));
    metricas.registrarRetorno(new Date(2026, 2, 9));
    window.localStorage.setItem('kabemjunto.metricas.ultimaVisita', '2026-99-99');
    metricas.registrarRetorno(new Date(2026, 2, 10));
    expect(propriedades().map((p) => p['diasDesdeUltima'])).toEqual(['0', '0', '0']);
  });
});

describe('dados pessoais', () => {
  it('o que sai é exatamente a lista fechada', () => {
    dispararTudo();
    const automaticas = { $ip: '0.0.0.0', $geoip_disable: true, $process_person_profile: false };
    const enviados = envios();
    expect(enviados.map(({ event, properties }) => ({ event, properties }))).toEqual(
      [
        ['RETORNO', { diasDesdeUltima: '0' }],
        ['PARTIDA_INICIADA', { modo: 'rapida', totalJogadores: 3, bots: 2 }],
        ['PARTIDA_TERMINADA', { modo: 'rapida', resultado: 'vitoria', duracao: '<2min' }],
        ['REVANCHE_PEDIDA', { modo: 'rapida' }],
        ['PARTIDA_INICIADA', { modo: 'local', totalJogadores: 3, bots: 2 }],
        ['PARTIDA_ABANDONADA', { modo: 'local', duracao: '<2min' }],
        ['BUSCA_RAPIDA_CANCELADA', {}],
        ['BUSCA_RAPIDA_VIROU_LOCAL', { motivo: 'falha' }],
        ['RECONECTADO', { duracao: '5-30s' }],
      ].map(([event, properties]) => ({
        event,
        properties: { ...(properties as object), ...automaticas },
      })),
    );
    expect(new Set(nomes())).toEqual(new Set(metricas.EVENTOS));
    for (const envio of enviados) {
      expect(Object.keys(envio).sort()).toEqual([
        'api_key',
        'distinct_id',
        'event',
        'properties',
        'timestamp',
      ]);
    }
    for (const [, opcoes] of fetchFalso.mock.calls) {
      expect(opcoes).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    }
    expect(JSON.stringify(enviados)).not.toContain('SALA99');
  });

  it('o sink descarta extras, contexto e eventos fora da lista', () => {
    shared.configureTelemetry({ context: { salaId: 'SALA99', partidaId: 'p', modo: 'ONLINE' } });
    shared.logCustom('RECONECTADO', { duracao: '<5s', salaId: 'SALA99', jogadorId: 'uuid' });
    expect(propriedades()).toEqual([{ duracao: '<5s' }]);

    fetchFalso.mockClear();
    shared.logCustom('RECONECTADO', { salaId: 'SALA99', jogadorId: 'uuid', duracaoMs: 10 });
    shared.logCustom('REVANCHE_PEDIDA', { modo: 'nome da pessoa' });
    shared.logCustom('CHAT', { texto: 'oi' });
    shared.logCustom('constructor', {});
    shared.logEvent({ tipo: 'PARTIDA_INICIADA', timestamp: 1, jogadores: ['uuid'] });
    shared.logEvent({ tipo: 'VITORIA', timestamp: 1, vencedorId: 'uuid' });
    shared.logEvent({
      tipo: 'CARTA_COMPRADA',
      timestamp: 1,
      jogadorId: 'uuid',
      cartaId: '5-AZUL',
      origem: 'NORMAL',
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('o distinct_id não é guardado: recarregar gera outro', async () => {
    metricas.buscaRapidaCancelada();
    metricas.buscaRapidaCancelada();
    await abrirPagina();
    metricas.buscaRapidaCancelada();
    const ids = envios().map((envio) => envio.distinct_id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it('falha de envio não derruba o app', async () => {
    fetchFalso.mockRejectedValueOnce(new Error('sem rede'));
    fetchFalso.mockImplementationOnce(() => {
      throw new Error('bloqueado');
    });
    expect(() => {
      metricas.buscaRapidaCancelada();
      metricas.buscaRapidaCancelada();
    }).not.toThrow();
    await Promise.resolve();
  });
});

describe('armazenamento indisponível', () => {
  it('sem sessionStorage, o dedupe vale na memória', () => {
    instalar('sessionStorage', armazenamentoBloqueado());
    metricas.observarPartida(partida(), 'local', 'eu');
    metricas.observarPartida(partida(), 'local', 'eu');
    metricas.partidaAbandonada('game_1_SALA99');
    expect(nomes()).toEqual(['PARTIDA_INICIADA', 'PARTIDA_ABANDONADA']);
  });

  it('sessionStorage com lixo não quebra', async () => {
    for (const lixo of ['{', 'null', '{"p":null}', '[1]']) {
      window.sessionStorage.setItem('kabemjunto.metricas.partidas', lixo);
      await abrirPagina();
      metricas.observarPartida(partida(), 'local', 'eu');
    }
    expect(nomes()).toEqual(Array(4).fill('PARTIDA_INICIADA'));
  });

  it('sem ler o localStorage não dá para saber do opt-out: não envia', () => {
    instalar('localStorage', armazenamentoBloqueado());
    dispararTudo();
    metricas.definirOptOut(true);
    metricas.definirOptOut(false);
    dispararTudo();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('se a data da visita não pode ser guardada, RETORNO não sai', () => {
    const cheio = armazenamentoEmMemoria();
    cheio.setItem = () => {
      throw new Error('cota');
    };
    instalar('localStorage', cheio);
    metricas.registrarRetorno();
    expect(nomes()).toEqual([]);
  });
});
