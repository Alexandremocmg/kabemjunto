// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoPartidaPublico, ResumoPartida } from '@kabemjunto/shared';

class FakeSocket {
  connected = false;
  id = 'socket-test';
  io = { on: vi.fn(), off: vi.fn() };
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  on = vi.fn((event: string, handler: (payload: unknown) => void) => {
    const listeners = this.handlers.get(event) ?? new Set();
    this.handlers.set(event, listeners.add(handler));
    return this;
  });
  once = this.on;
  off = vi.fn((event: string, handler: (payload: unknown) => void) => {
    this.handlers.get(event)?.delete(handler);
    return this;
  });
  emit = vi.fn((..._args: unknown[]) => this);
  connect = vi.fn(() => this);
  disconnect = vi.fn(() => this);
  servidor(event: string, payload?: unknown): void {
    [...(this.handlers.get(event) ?? [])].forEach((handler) => handler(payload));
  }
  limpar(): void {
    this.handlers.clear();
    this.connected = false;
  }
}

const falso = new FakeSocket();
vi.mock('socket.io-client', () => ({ io: vi.fn(() => falso) }));
const reconectado = vi.fn();
vi.mock('./metricas', () => ({
  reconectado: (ms: number) => reconectado(ms),
  observarPartida: () => {},
}));

import { useGameSocket } from './socketClient';
import { useMesaOnline } from '../mesa/useMesaOnline';
import type { ControladorMesa } from '../mesa/tipos';
import { AVISO_MESA_DESFEITA, AVISO_REVANCHE, FOLGA_MS, useForaDaMesa } from './useForaDaMesa';

let hook: ReturnType<typeof useGameSocket>;
let mesa: ControladorMesa | undefined;
function Harness(): null {
  hook = useGameSocket();
  useForaDaMesa(hook);
  mesa = useMesaOnline(hook);
  return null;
}

const EU = 'eu';
function estado(partidaId: string, extra: Partial<EstadoPartidaPublico> = {}) {
  const jogador = (id: string) => ({
    id,
    nome: id,
    quantidadeCartas: 3,
    isBot: false,
    conectado: true,
    disseUno: false,
    avatar: '01',
    pontos: 0,
  });
  return {
    estado: {
      partidaId,
      salaId: 'ABC234',
      jogadores: [jogador(EU), jogador('ana')],
      finalizada: false,
      ...extra,
    } as unknown as EstadoPartidaPublico,
  };
}
const encerrada = (partidaId: string) => ({
  resumo: { versao: 1, partidaId, premios: [], jogadores: [] } as unknown as ResumoPartida,
  placar: { partidas: 1, vitorias: [] },
});
const revanche = (partidaId: string, prontos: string[], restanteMs?: number) => ({
  partidaId,
  prontos,
  possiveis: [EU, 'ana'],
  ...(restanteMs === undefined ? {} : { restanteMs }),
});
const servidor = (evento: string, payload?: unknown) => act(() => falso.servidor(evento, payload));
const emitida = (jogadorId = EU, salaId = 'ABC234') =>
  servidor('server:sessao:emitida', { jogadorId, salaId, resumeToken: 't' });
const conectar = () => {
  falso.connected = true;
  servidor('connect');
};

/** O Node novo esconde a localStorage do jsdom. */
function guardar(): Storage {
  const valores = new Map<string, string>();
  return {
    get length() {
      return valores.size;
    },
    clear: () => valores.clear(),
    getItem: (chave) => valores.get(chave) ?? null,
    key: (i) => [...valores.keys()][i] ?? null,
    removeItem: (chave) => valores.delete(chave),
    setItem: (chave, valor) => valores.set(chave, valor),
  };
}

let root: Root;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  vi.stubGlobal('localStorage', guardar());
  falso.limpar();
  vi.clearAllMocks();
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  act(() => hook.entrarSala({ jogadorId: EU, salaId: 'ABC234', nome: 'Eu' }));
  conectar();
  emitida();
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fim e revanche', () => {
  it('guarda resumo e revanche, e a partida nova limpa os dois', () => {
    servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
    servidor('server:partida:encerrada', encerrada('p1'));
    servidor('server:revanche:atualizada', revanche('p1', [EU], 9000));
    expect(hook.state.fim?.resumo.partidaId).toBe('p1');
    expect(hook.state.revanche).toMatchObject({ prontos: [EU], restanteMs: 9000 });

    servidor('server:estado:atualizado', estado('p2'));
    expect(hook.state.fim).toBeUndefined();
    expect(hook.state.revanche).toBeUndefined();
  });

  it('o resumo pode chegar antes do estado final', () => {
    servidor('server:estado:atualizado', estado('p1'));
    servidor('server:partida:encerrada', encerrada('p1'));
    servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
    expect(hook.state.fim?.resumo.partidaId).toBe('p1');
  });

  it('evento de partida antiga não apaga o da partida atual', () => {
    servidor('server:estado:atualizado', estado('p2', { finalizada: true }));
    servidor('server:partida:encerrada', encerrada('p2'));
    servidor('server:revanche:atualizada', revanche('p2', ['ana'], 9000));
    servidor('server:partida:encerrada', encerrada('p1'));
    servidor('server:revanche:atualizada', revanche('p1', []));
    expect(hook.state.fim?.resumo.partidaId).toBe('p2');
    expect(hook.state.revanche?.partidaId).toBe('p2');
  });

  it('emite os pedidos do contrato', () => {
    act(() => hook.pedirRevanche());
    act(() => hook.retomarControle());
    expect(falso.emit).toHaveBeenCalledWith('client:revanche:pedir', {});
    expect(falso.emit).toHaveBeenCalledWith('client:retomar:controle', {});
  });

  it('envia o avatar escolhido ao entrar e no "Jogar agora"', () => {
    localStorage.setItem('kabemjunto.avatar', '07');
    act(() => hook.entrarSala({ jogadorId: EU, salaId: 'abc234', nome: 'Eu', criar: true }));
    expect(falso.emit).toHaveBeenLastCalledWith(
      'client:entrar:sala',
      expect.objectContaining({ avatarId: '07', salaId: 'ABC234', criar: true }),
    );
    act(() => hook.jogarRapido('Eu', 4));
    expect(falso.emit).toHaveBeenLastCalledWith(
      'client:jogar:rapido',
      expect.objectContaining({ avatarId: '07', tamanho: 4 }),
    );
  });
});

describe('quem fica de fora', () => {
  it('partida nova sem a pessoa: volta ao menu com o motivo, e o aviso some ao entrar noutra', () => {
    servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
    const { estado: nova } = estado('p2');
    servidor('server:estado:atualizado', {
      estado: { ...nova, jogadores: nova.jogadores.filter((jogador) => jogador.id !== EU) },
    });
    expect(hook.salaId).toBeUndefined();
    expect(hook.state.estado).toBeUndefined();
    expect(hook.avisoMenu).toBe(AVISO_REVANCHE);
    act(() => hook.jogarRapido('Eu', 2));
    expect(hook.avisoMenu).toBeUndefined();
  });

  it('um bot ficou com o assento: também volta ao menu', () => {
    const { estado: nova } = estado('p2');
    servidor('server:estado:atualizado', {
      estado: {
        ...nova,
        jogadores: nova.jogadores.map((j) => (j.id === EU ? { ...j, isBot: true } : j)),
      },
    });
    expect(hook.avisoMenu).toBe(AVISO_REVANCHE);
  });

  it('contagem vencida sem pedir: sai depois da folga; quem pediu espera', () => {
    servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
    servidor('server:revanche:atualizada', revanche('p1', [EU], 5000));
    act(() => vi.advanceTimersByTime(60_000));
    expect(hook.avisoMenu).toBeUndefined();

    servidor('server:revanche:atualizada', revanche('p1', ['ana'], 5000));
    act(() => vi.advanceTimersByTime(4000));
    expect(hook.avisoMenu).toBeUndefined();
    act(() => vi.advanceTimersByTime(1500 + FOLGA_MS));
    expect(hook.avisoMenu).toBe(AVISO_REVANCHE);
  });

  it('sala desfeita depois do fim: menu com aviso, e erro comum na partida não expulsa', () => {
    servidor('server:estado:atualizado', estado('p1'));
    servidor('server:erro', { codigo: 'AUTH_REQUIRED', mensagem: 'x' });
    expect(hook.salaId).toBe('ABC234');
    servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
    servidor('server:erro', { codigo: 'SALA_INEXISTENTE', mensagem: 'x' });
    expect(hook.avisoMenu).toBe(AVISO_MESA_DESFEITA);
  });

  it('voltar ao menu por vontade própria sai da sala, sem aviso', () => {
    servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
    act(() => hook.sair());
    expect(falso.emit).toHaveBeenCalledWith('client:sair:sala', {});
    expect(hook.avisoMenu).toBeUndefined();
  });
});

describe('prazo da revanche e reconexão', () => {
  it('revanche recebida antes da queda não expulsa; a recebida depois arma o prazo', () => {
    servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
    servidor('server:revanche:atualizada', revanche('p1', ['ana'], 5000));
    expect(mesa?.revanche?.prontos).toEqual(['ana']);
    falso.connected = false;
    servidor('disconnect', 'transport close');
    act(() => vi.advanceTimersByTime(20_000));
    conectar();
    expect(mesa?.revanche).toBeUndefined();
    act(() => vi.advanceTimersByTime(20_000));
    expect(hook.avisoMenu).toBeUndefined();
    servidor('server:revanche:atualizada', revanche('p1', ['ana'], 1000));
    act(() => vi.advanceTimersByTime(1500 + FOLGA_MS));
    expect(hook.avisoMenu).toBe(AVISO_REVANCHE);
  });
});

describe('sair e entrar em outra sala', () => {
  const velho = () => servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
  const novo = (salaId: string) => {
    const { estado: base } = estado('p9', { salaId });
    const jogadores = base.jogadores.map((j) =>
      j.id === EU ? { ...j, id: hook.jogadorId ?? '' } : j,
    );
    servidor('server:estado:atualizado', { estado: { ...base, jogadores } });
  };

  it('ignora tudo da sala anterior até a sessão da nova', () => {
    velho();
    act(() => hook.sair());
    act(() => hook.entrarSala({ jogadorId: 'novo', salaId: 'xyz234', nome: 'Eu' }));
    velho();
    servidor('server:partida:encerrada', encerrada('p1'));
    servidor('server:revanche:atualizada', revanche('p1', ['ana'], 1000));
    servidor('server:sala:atualizada', { hostId: 'ana', jogadores: estado('p1').estado.jogadores });
    servidor('server:mao:atualizada', { mao: [{ id: 'x' }] });
    servidor('server:chat:msg', { jogadorId: 'ana', texto: 'oi', timestamp: 1 });
    servidor('server:erro', { codigo: 'NAO_SUA_VEZ', mensagem: 'velho' });
    emitida(EU, 'ABC234');
    velho();
    expect(hook.state).toMatchObject({ jogadores: [], mao: [], mensagens: [] });
    expect(hook.state.estado ?? hook.state.fim ?? hook.state.revanche).toBeUndefined();
    expect(hook.state.erro).toBeUndefined();

    emitida('novo', 'XYZ234');
    velho();
    expect(hook.state.estado).toBeUndefined();
    novo('XYZ234');
    expect(hook.state.estado?.partidaId).toBe('p9');
  });

  it('o erro da própria entrada continua aparecendo', () => {
    act(() => hook.sair());
    act(() => hook.entrarSala({ jogadorId: 'novo', salaId: 'XYZ234', nome: 'Eu' }));
    servidor('server:erro', { codigo: 'SALA_INEXISTENTE', mensagem: 'Sala não encontrada.' });
    expect(hook.state.erroCodigo).toBe('SALA_INEXISTENTE');
  });

  it('"Jogar agora": a sala vem na sessão, e o estado da anterior não entra', () => {
    velho();
    act(() => hook.sair());
    act(() => hook.jogarRapido('Eu', 2));
    velho();
    expect(hook.state.estado).toBeUndefined();
    emitida(hook.jogadorId, 'RAP234');
    expect(hook.salaId).toBe('RAP234');
    velho();
    expect(hook.state.estado).toBeUndefined();
    novo('RAP234');
    expect(hook.state.estado?.partidaId).toBe('p9');
  });

  it('reconexão: o primeiro estado da mesma sala entra, mesmo antes da sessão', () => {
    servidor('server:estado:atualizado', estado('p1'));
    falso.connected = false;
    servidor('disconnect', 'transport close');
    conectar();
    servidor('server:estado:atualizado', estado('p1', { vezDe: 'ana' }));
    expect(hook.state.estado?.vezDe).toBe('ana');
  });
});

describe('RECONECTADO', () => {
  const cair = () => {
    falso.connected = false;
    servidor('disconnect', 'transport close');
  };

  it('conta a queda durante a partida', () => {
    servidor('server:estado:atualizado', estado('p1'));
    const antes = hook.state.conexao;
    cair();
    act(() => vi.advanceTimersByTime(2000));
    conectar();
    expect(reconectado).toHaveBeenCalledTimes(1);
    expect(hook.state.conexao).toBe(antes + 1);
    expect(hook.tentativaReconexao).toBe(0);
  });

  it('não conta queda na sala de espera nem depois do fim', () => {
    cair();
    conectar();
    servidor('server:estado:atualizado', estado('p1', { finalizada: true }));
    cair();
    conectar();
    expect(reconectado).not.toHaveBeenCalled();
  });

  it('sair durante a queda esquece a queda', () => {
    servidor('server:estado:atualizado', estado('p1'));
    cair();
    act(() => hook.sair());
    act(() => hook.entrarSala({ salaId: 'XYZ234', nome: 'Eu' }));
    conectar();
    expect(reconectado).not.toHaveBeenCalled();
  });
});
