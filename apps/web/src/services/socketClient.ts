import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  logCustom,
  type Carta,
  type ClientChatEvent,
  type ClientComprarEvent,
  type ClientEntrarSalaEvent,
  type ClientIniciarPartidaEvent,
  type ClientJogarEvent,
  type EstadoPartidaPublico,
  type JogadorPublico,
  type ServerChatEvent,
  type ServerErroEvent,
  type ServerEstadoAtualizadoEvent,
  type ServerJogadaAceitaEvent,
  type ServerJogadaRejeitadaEvent,
  type ServerMaoAtualizadaEvent,
  type ServerSalaAtualizadaEvent,
  type ServerSalasDisponiveisEvent,
  type ServerSalaDisponivel,
  type ServerSessaoEmitidaEvent,
} from '@kabemjunto/shared';

type RoomCreationOptions = {
  nomeSala?: string;
  visibilidade?: 'privada' | 'publica';
};

type ClientEvents = {
  'client:entrar:sala': (payload: ClientEntrarSalaEvent) => void;
  'client:iniciar:partida': (payload: ClientIniciarPartidaEvent) => void;
  'client:jogar': (payload: ClientJogarEvent) => void;
  'client:comprar': (payload: ClientComprarEvent) => void;
  'client:chat:msg': (payload: ClientChatEvent) => void;
  'client:sair:sala': (payload: Record<string, never>) => void;
  'client:abandonar:partida': (payload: Record<string, never>) => void;
  'client:listar:salas': (payload: Record<string, never>) => void;
};

type ServerEvents = {
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  'server:estado:atualizado': (payload: ServerEstadoAtualizadoEvent) => void;
  'server:sessao:emitida': (payload: ServerSessaoEmitidaEvent) => void;
  'server:sala:atualizada': (payload: ServerSalaAtualizadaEvent) => void;
  'server:chat:msg': (payload: ServerChatEvent) => void;
  'server:erro': (payload: ServerErroEvent) => void;
  'server:jogada:aceita': (payload: ServerJogadaAceitaEvent) => void;
  'server:jogada:rejeitada': (payload: ServerJogadaRejeitadaEvent) => void;
  'server:mao:atualizada': (payload: ServerMaoAtualizadaEvent) => void;
  'server:salas:disponiveis': (payload: ServerSalasDisponiveisEvent) => void;
};

export type GameSocket = Socket<ServerEvents, ClientEvents>;
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface SocketGameState {
  estado?: EstadoPartidaPublico;
  jogadores: ReadonlyArray<JogadorPublico>;
  mensagens: ReadonlyArray<ServerChatEvent>;
  status: ConnectionStatus;
  erro: string | undefined;
  erroCodigo: ServerErroEvent['codigo'] | undefined;
  cartaAceita: string | undefined;
  cartaRejeitada: string | undefined;
  mao: ReadonlyArray<Carta>;
  salasPublicas: ReadonlyArray<ServerSalaDisponivel>;
}

const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
const SOCKET_URL =
  configuredSocketUrl ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3001');
const SESSION_KEY = 'kabemjunto-online-session';

export interface SessionCredentials extends RoomCreationOptions {
  /** Identidade estável do jogador (UUID v4). Persistida entre reconexões. */
  jogadorId: string;
  salaId: string;
  nome: string;
  /** Indica se a primeira entrada podia criar a sala. */
  criar?: boolean;
  /** Token opaco rotativo emitido pelo servidor. Nunca é enviado à telemetria/logs. */
  resumeToken?: string;
}

/** Converte as opções internas (lowercase) da UI para o contrato Socket.IO canônico. */
export function toEntrarSalaEvent({
  visibilidade,
  ...credentials
}: SessionCredentials): ClientEntrarSalaEvent {
  return {
    ...credentials,
    ...(visibilidade === undefined
      ? {}
      : { visibilidade: visibilidade === 'publica' ? 'PUBLICA' : 'PRIVADA' }),
  };
}

/**
 * Gera um identificador único pra jogador.
 *
 * Usa `crypto.randomUUID()` (browser nativo, disponível em todos os
 * navegadores modernos + Node 19+). Fallback pra `Math.random()` se
 * indisponível (não-criptograficamente seguro, mas suficiente pra MVP).
 */
export function gerarJogadorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random. NÃO usar em produção real.
  return `jogador-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readSession(): SessionCredentials | undefined {
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
        ...('nomeSala' in parsed && typeof parsed.nomeSala === 'string'
          ? { nomeSala: parsed.nomeSala }
          : {}),
        ...('visibilidade' in parsed &&
        (parsed.visibilidade === 'privada' || parsed.visibilidade === 'publica')
          ? { visibilidade: parsed.visibilidade }
          : {}),
        ...('criar' in parsed && typeof parsed.criar === 'boolean' ? { criar: parsed.criar } : {}),
        ...('resumeToken' in parsed && typeof parsed.resumeToken === 'string'
          ? { resumeToken: parsed.resumeToken }
          : {}),
      };
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
  return undefined;
}

export function saveSession(credentials: SessionCredentials): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(credentials));
}

/**
 * Funde as credenciais atuais com o token rotativo emitido pelo servidor
 * (`server:sessao:emitida`) e persiste o resultado. O token bruto só existe
 * em memória/sessionStorage — nunca é logado.
 */
export function applyIssuedSession(
  baseCredentials: SessionCredentials,
  issued: ServerSessaoEmitidaEvent,
): SessionCredentials {
  const updated: SessionCredentials = { ...baseCredentials, resumeToken: issued.resumeToken };
  saveSession(updated);
  return updated;
}

export function createSocket(url = SOCKET_URL): GameSocket {
  return io(url, { autoConnect: false, reconnection: true, reconnectionAttempts: Infinity });
}

export function useGameSocket(): {
  socket: GameSocket;
  state: SocketGameState;
  socketId: string | undefined;
  jogadorId: string | undefined;
  salaId: string | undefined;
  isHost: boolean;
  /** Número da tentativa de reconexão atual (0 = conectado). */
  tentativaReconexao: number;
  entrarSala: (
    credentials: Omit<SessionCredentials, 'jogadorId'> & { jogadorId?: string; criar?: boolean },
  ) => void;
  iniciarPartida: () => void;
  jogarCarta: (
    cartaId: string,
    corEscolhida?: ClientJogarEvent['corEscolhida'],
    alvoTrocaId?: ClientJogarEvent['alvoTrocaId'],
  ) => void;
  comprarCarta: () => void;
  enviarChat: (texto: string) => void;
  sair: () => void;
  abandonarPartida: () => void;
  listarSalas: () => void;
} {
  const socketRef = useRef<GameSocket>();
  if (!socketRef.current) socketRef.current = createSocket();
  const socket = socketRef.current;
  const [state, setState] = useState<SocketGameState>({
    jogadores: [],
    mensagens: [],
    status: 'idle',
    erro: undefined,
    erroCodigo: undefined,
    cartaAceita: undefined,
    cartaRejeitada: undefined,
    mao: [],
    salasPublicas: [],
  });
  const [credentials, setCredentials] = useState<SessionCredentials | undefined>(readSession);
  const [hostId, setHostId] = useState<string | undefined>();
  const listRequestedRef = useRef(false);
  /** Timestamp do último `disconnect` (pra telemetria de duração da queda). */
  const disconnectAtRef = useRef<number | undefined>(undefined);
  /** Tentativa atual de reconexão (1, 2, 3, ...). Reseta ao conectar. */
  const [tentativaReconexao, setTentativaReconexao] = useState(0);

  useEffect(() => {
    const onConnect = () => {
      setState((current) => ({
        ...current,
        status: 'connected',
        erro: undefined,
        erroCodigo: undefined,
      }));
      setHostId((current) => current ?? socket.id);

      // Telemetria: log de reconexão (se houve queda anterior).
      if (disconnectAtRef.current !== undefined) {
        const duracaoMs = Date.now() - disconnectAtRef.current;
        logCustom('RECONECTADO', {
          salaId: credentials?.salaId,
          jogadorId: credentials?.jogadorId,
          duracaoMs,
          tentativa: tentativaReconexao,
        });
        disconnectAtRef.current = undefined;
        setTentativaReconexao(0);
      }

      const saved = credentials ?? readSession();
      if (saved) {
        socket.emit(
          'client:entrar:sala',
          toEntrarSalaEvent({ ...saved, criar: saved.criar ?? false }),
        );
      }
      if (listRequestedRef.current) {
        listRequestedRef.current = false;
        socket.emit('client:listar:salas', {});
      }
    };
    const onDisconnect = () => {
      setState((current) => ({ ...current, status: 'reconnecting', erro: undefined }));
      if (disconnectAtRef.current === undefined) {
        disconnectAtRef.current = Date.now();
      }
      setTentativaReconexao((n) => n + 1);
    };
    const onConnectError = (error: Error) => {
      setState((current) => ({ ...current, status: 'reconnecting', erro: error.message }));
      setTentativaReconexao((n) => n + 1);
    };
    const onReconnectAttempt = (attempt: number) => {
      setState((current) => ({ ...current, status: 'reconnecting' }));
      setTentativaReconexao(attempt);
    };
    const onReconnectFailed = () => {
      setState((current) => ({ ...current, status: 'offline' }));
    };
    const onState = ({ estado }: ServerEstadoAtualizadoEvent) =>
      setState((current) => ({ ...current, estado, erro: undefined, erroCodigo: undefined }));
    const onRoom = ({ hostId: nextHostId, jogadores }: ServerSalaAtualizadaEvent) => {
      setHostId(nextHostId);
      setState((current) => ({ ...current, jogadores }));
    };
    const onChat = (message: ServerChatEvent) =>
      setState((current) => ({
        ...current,
        mensagens: [...current.mensagens, message].slice(-40),
      }));
    const onError = ({ codigo, mensagem }: ServerErroEvent) =>
      setState((current) => ({ ...current, erro: mensagem, erroCodigo: codigo }));
    const onAccepted = ({ cartaId }: ServerJogadaAceitaEvent) => {
      setState((current) => ({ ...current, cartaAceita: cartaId, cartaRejeitada: undefined }));
      window.setTimeout(() => {
        setState((current) =>
          current.cartaAceita === cartaId ? { ...current, cartaAceita: undefined } : current,
        );
      }, 1800);
    };
    const onRejected = ({ cartaId, motivo }: ServerJogadaRejeitadaEvent) => {
      const mensagem = `${cartaId}: ${motivo}`;
      setState((current) => ({ ...current, cartaRejeitada: mensagem }));
      window.setTimeout(() => {
        setState((current) =>
          current.cartaRejeitada === mensagem ? { ...current, cartaRejeitada: undefined } : current,
        );
      }, 2500);
    };
    const onHand = ({ mao }: ServerMaoAtualizadaEvent) =>
      setState((current) => ({ ...current, mao }));
    const onSessionIssued = (issued: ServerSessaoEmitidaEvent) => {
      setCredentials((current) => (current ? applyIssuedSession(current, issued) : current));
    };
    const onAvailableRooms = (payload: ServerSalasDisponiveisEvent) =>
      setState((current) => ({
        ...current,
        salasPublicas: payload.salas,
      }));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect_failed', onReconnectFailed);
    socket.on('server:estado:atualizado', onState);
    socket.on('server:sessao:emitida', onSessionIssued);
    socket.on('server:sala:atualizada', onRoom);
    socket.on('server:chat:msg', onChat);
    socket.on('server:erro', onError);
    socket.on('server:jogada:aceita', onAccepted);
    socket.on('server:jogada:rejeitada', onRejected);
    socket.on('server:mao:atualizada', onHand);
    socket.on('server:salas:disponiveis', onAvailableRooms);

    if (credentials && !socket.connected) {
      setState((current) => ({ ...current, status: 'connecting' }));
      socket.connect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect_failed', onReconnectFailed);
      socket.off('server:estado:atualizado', onState);
      socket.off('server:sessao:emitida', onSessionIssued);
      socket.off('server:sala:atualizada', onRoom);
      socket.off('server:chat:msg', onChat);
      socket.off('server:erro', onError);
      socket.off('server:jogada:aceita', onAccepted);
      socket.off('server:jogada:rejeitada', onRejected);
      socket.off('server:mao:atualizada', onHand);
      socket.off('server:salas:disponiveis', onAvailableRooms);
    };
  }, [credentials, socket]);

  const entrarSala = useCallback(
    (
      nextCredentials: Omit<SessionCredentials, 'jogadorId'> & {
        jogadorId?: string;
        criar?: boolean;
      },
    ) => {
      const normalized: SessionCredentials = {
        jogadorId: nextCredentials.jogadorId ?? gerarJogadorId(),
        salaId: nextCredentials.salaId.trim().toUpperCase(),
        nome: nextCredentials.nome.trim(),
        criar: nextCredentials.criar ?? false,
        ...(nextCredentials.nomeSala === undefined
          ? {}
          : { nomeSala: nextCredentials.nomeSala.trim() }),
        ...(nextCredentials.visibilidade === undefined
          ? {}
          : { visibilidade: nextCredentials.visibilidade }),
      };
      setCredentials(normalized);
      saveSession(normalized);
      if (!socket.connected) {
        setState((current) => ({ ...current, status: 'connecting', erro: undefined }));
        socket.connect();
      } else {
        socket.emit('client:entrar:sala', toEntrarSalaEvent(normalized));
      }
    },
    [socket],
  );

  const iniciarPartida = useCallback(() => socket.emit('client:iniciar:partida', {}), [socket]);
  const jogarCarta = useCallback(
    (
      cartaId: string,
      corEscolhida?: ClientJogarEvent['corEscolhida'],
      alvoTrocaId?: ClientJogarEvent['alvoTrocaId'],
    ) =>
      socket.emit('client:jogar', {
        cartaId,
        ...(corEscolhida ? { corEscolhida } : {}),
        ...(alvoTrocaId ? { alvoTrocaId } : {}),
      }),
    [socket],
  );
  const comprarCarta = useCallback(() => socket.emit('client:comprar', {}), [socket]);
  const enviarChat = useCallback(
    (texto: string) => socket.emit('client:chat:msg', { texto: texto.trim() }),
    [socket],
  );
  const limparSessaoLocal = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setCredentials(undefined);
    setHostId(undefined);
    socket.disconnect();
    setState({
      jogadores: [],
      mensagens: [],
      status: 'idle',
      erro: undefined,
      erroCodigo: undefined,
      cartaAceita: undefined,
      cartaRejeitada: undefined,
      mao: [],
      salasPublicas: [],
    });
  }, [socket]);
  const sair = useCallback(() => {
    if (socket.connected) socket.emit('client:sair:sala', {});
    limparSessaoLocal();
  }, [limparSessaoLocal, socket]);
  const abandonarPartida = useCallback(() => {
    if (socket.connected) socket.emit('client:abandonar:partida', {});
    limparSessaoLocal();
  }, [limparSessaoLocal, socket]);
  const listarSalas = useCallback(() => {
    if (socket.connected) {
      socket.emit('client:listar:salas', {});
      return;
    }
    listRequestedRef.current = true;
    socket.connect();
  }, [socket]);

  return useMemo(
    () => ({
      socket,
      state,
      socketId: socket.id,
      jogadorId: credentials?.jogadorId,
      salaId: credentials?.salaId,
      isHost: Boolean(hostId && credentials?.jogadorId === hostId),
      tentativaReconexao,
      entrarSala,
      iniciarPartida,
      jogarCarta,
      comprarCarta,
      enviarChat,
      sair,
      abandonarPartida,
      listarSalas,
    }),
    [
      abandonarPartida,
      comprarCarta,
      credentials?.jogadorId,
      credentials?.salaId,
      entrarSala,
      enviarChat,
      hostId,
      iniciarPartida,
      jogarCarta,
      listarSalas,
      sair,
      socket,
      state,
      tentativaReconexao,
    ],
  );
}
