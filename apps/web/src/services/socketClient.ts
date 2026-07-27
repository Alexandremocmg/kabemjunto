import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientChatEvent,
  ClientComprarEvent,
  ClientEntrarSalaEvent,
  ClientIniciarPartidaEvent,
  ClientJogarEvent,
  Carta,
  EstadoPartidaPublico,
  JogadorPublico,
  ServerChatEvent,
  ServerErroEvent,
  ServerEstadoAtualizadoEvent,
  ServerJogadaAceitaEvent,
  ServerJogadaRejeitadaEvent,
  ServerMaoAtualizadaEvent,
  ServerSalaAtualizadaEvent,
} from '@kabemjunto/shared';

type ClientEvents = {
  'client:entrar:sala': (payload: ClientEntrarSalaEvent) => void;
  'client:iniciar:partida': (payload: ClientIniciarPartidaEvent) => void;
  'client:jogar': (payload: ClientJogarEvent) => void;
  'client:comprar': (payload: ClientComprarEvent) => void;
  'client:chat:msg': (payload: ClientChatEvent) => void;
};

type ServerEvents = {
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  'server:estado:atualizado': (payload: ServerEstadoAtualizadoEvent) => void;
  'server:sala:atualizada': (payload: ServerSalaAtualizadaEvent) => void;
  'server:chat:msg': (payload: ServerChatEvent) => void;
  'server:erro': (payload: ServerErroEvent) => void;
  'server:jogada:aceita': (payload: ServerJogadaAceitaEvent) => void;
  'server:jogada:rejeitada': (payload: ServerJogadaRejeitadaEvent) => void;
  'server:mao:atualizada': (payload: ServerMaoAtualizadaEvent) => void;
};

export type GameSocket = Socket<ServerEvents, ClientEvents>;
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface SocketGameState {
  estado?: EstadoPartidaPublico;
  jogadores: ReadonlyArray<JogadorPublico>;
  mensagens: ReadonlyArray<ServerChatEvent>;
  status: ConnectionStatus;
  erro: string | undefined;
  cartaAceita: string | undefined;
  cartaRejeitada: string | undefined;
  mao: ReadonlyArray<Carta>;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://127.0.0.1:3001';
const SESSION_KEY = 'kabemjunto-online-session';

export interface SessionCredentials {
  /** Identidade estável do jogador (UUID v4). Persistida entre reconexões. */
  jogadorId: string;
  salaId: string;
  nome: string;
}

/**
 * Gera um identificador único pra jogador.
 *
 * Usa `crypto.randomUUID()` (browser nativo, disponível em todos os
 * navegadores modernos + Node 19+). Fallback pra `Math.random()` se
 * indisponível (não-criptograficamente seguro, mas suficiente pra MVP).
 */
function gerarJogadorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random. NÃO usar em produção real.
  return `jogador-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readSession(): SessionCredentials | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'jogadorId' in parsed &&
      'salaId' in parsed &&
      'nome' in parsed &&
      typeof parsed.jogadorId === 'string' &&
      typeof parsed.salaId === 'string' &&
      typeof parsed.nome === 'string'
    ) {
      return {
        jogadorId: parsed.jogadorId,
        salaId: parsed.salaId,
        nome: parsed.nome,
      };
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
  return undefined;
}

function saveSession(credentials: SessionCredentials): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(credentials));
}

export function createSocket(url = SOCKET_URL): GameSocket {
  return io(url, { autoConnect: false, reconnection: true, reconnectionAttempts: Infinity });
}

export function useGameSocket(): {
  socket: GameSocket;
  state: SocketGameState;
  socketId: string | undefined;
  salaId: string | undefined;
  isHost: boolean;
  entrarSala: (credentials: SessionCredentials) => void;
  iniciarPartida: () => void;
  jogarCarta: (cartaId: string, corEscolhida?: ClientJogarEvent['corEscolhida']) => void;
  comprarCarta: () => void;
  enviarChat: (texto: string) => void;
  sair: () => void;
} {
  const socketRef = useRef<GameSocket>();
  if (!socketRef.current) socketRef.current = createSocket();
  const socket = socketRef.current;
  const [state, setState] = useState<SocketGameState>({
    jogadores: [],
    mensagens: [],
    status: 'idle',
    erro: undefined,
    cartaAceita: undefined,
    cartaRejeitada: undefined,
    mao: [],
  });
  const [credentials, setCredentials] = useState<SessionCredentials | undefined>(readSession);
  const [hostId, setHostId] = useState<string | undefined>();

  useEffect(() => {
    const onConnect = () => {
      setState((current) => ({ ...current, status: 'connected', erro: undefined }));
      setHostId((current) => current ?? socket.id);
      const saved = credentials ?? readSession();
      if (saved) socket.emit('client:entrar:sala', saved);
    };
    const onDisconnect = () => setState((current) => ({ ...current, status: 'reconnecting' }));
    const onConnectError = (error: Error) =>
      setState((current) => ({ ...current, status: 'offline', erro: error.message }));
    const onState = ({ estado }: ServerEstadoAtualizadoEvent) =>
      setState((current) => ({ ...current, estado, erro: undefined }));
    const onRoom = ({ jogadores }: ServerSalaAtualizadaEvent) =>
      setState((current) => ({ ...current, jogadores }));
    const onChat = (message: ServerChatEvent) =>
      setState((current) => ({
        ...current,
        mensagens: [...current.mensagens, message].slice(-40),
      }));
    const onError = ({ mensagem }: ServerErroEvent) =>
      setState((current) => ({ ...current, erro: mensagem }));
    const onAccepted = ({ cartaId }: ServerJogadaAceitaEvent) =>
      setState((current) => ({ ...current, cartaAceita: cartaId, cartaRejeitada: undefined }));
    const onRejected = ({ cartaId, motivo }: ServerJogadaRejeitadaEvent) =>
      setState((current) => ({ ...current, cartaRejeitada: `${cartaId}: ${motivo}` }));
    const onHand = ({ mao }: ServerMaoAtualizadaEvent) =>
      setState((current) => ({ ...current, mao }));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('server:estado:atualizado', onState);
    socket.on('server:sala:atualizada', onRoom);
    socket.on('server:chat:msg', onChat);
    socket.on('server:erro', onError);
    socket.on('server:jogada:aceita', onAccepted);
    socket.on('server:jogada:rejeitada', onRejected);
    socket.on('server:mao:atualizada', onHand);

    if (credentials && !socket.connected) {
      setState((current) => ({ ...current, status: 'connecting' }));
      socket.connect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('server:estado:atualizado', onState);
      socket.off('server:sala:atualizada', onRoom);
      socket.off('server:chat:msg', onChat);
      socket.off('server:erro', onError);
      socket.off('server:jogada:aceita', onAccepted);
      socket.off('server:jogada:rejeitada', onRejected);
      socket.off('server:mao:atualizada', onHand);
    };
  }, [credentials, socket]);

  const entrarSala = useCallback(
    (nextCredentials: Omit<SessionCredentials, 'jogadorId'> & { jogadorId?: string }) => {
      const normalized: SessionCredentials = {
        jogadorId: nextCredentials.jogadorId ?? gerarJogadorId(),
        salaId: nextCredentials.salaId.trim().toUpperCase(),
        nome: nextCredentials.nome.trim(),
      };
      setCredentials(normalized);
      saveSession(normalized);
      if (!socket.connected) {
        setState((current) => ({ ...current, status: 'connecting', erro: undefined }));
        socket.connect();
      } else {
        socket.emit('client:entrar:sala', normalized);
      }
      if (!hostId) setHostId(socket.id);
    },
    [hostId, socket],
  );

  const iniciarPartida = useCallback(() => socket.emit('client:iniciar:partida', {}), [socket]);
  const jogarCarta = useCallback(
    (cartaId: string, corEscolhida?: ClientJogarEvent['corEscolhida']) =>
      socket.emit('client:jogar', { cartaId, ...(corEscolhida ? { corEscolhida } : {}) }),
    [socket],
  );
  const comprarCarta = useCallback(() => socket.emit('client:comprar', {}), [socket]);
  const enviarChat = useCallback(
    (texto: string) => socket.emit('client:chat:msg', { texto: texto.trim() }),
    [socket],
  );
  const sair = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setCredentials(undefined);
    setHostId(undefined);
    socket.disconnect();
    setState({
      jogadores: [],
      mensagens: [],
      status: 'idle',
      erro: undefined,
      cartaAceita: undefined,
      cartaRejeitada: undefined,
      mao: [],
    });
  }, [socket]);

  return useMemo(
    () => ({
      socket,
      state,
      socketId: socket.id,
      salaId: credentials?.salaId,
      isHost: Boolean(hostId && socket.id === hostId),
      entrarSala,
      iniciarPartida,
      jogarCarta,
      comprarCarta,
      enviarChat,
      sair,
    }),
    [
      comprarCarta,
      credentials?.salaId,
      entrarSala,
      enviarChat,
      hostId,
      iniciarPartida,
      jogarCarta,
      sair,
      socket,
      state,
    ],
  );
}
