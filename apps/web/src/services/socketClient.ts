import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  type Carta,
  type ClientChatEvent,
  type ClientDescarteMultiploEvent,
  type ClientComprarEvent,
  type ClientEntrarSalaEvent,
  type ClientIniciarPartidaEvent,
  type ClientInterceptarEvent,
  type ClientJogarEvent,
  type ClientJogarRapidoEvent,
  type EstadoPartidaPublico,
  type JogadorPublico,
  type SalaRapida,
  type ServerChatEvent,
  type ServerDescarteMultiploAceitoEvent,
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
import { reconectado } from './metricas';

type RoomCreationOptions = {
  nomeSala?: string;
  visibilidade?: 'privada' | 'publica';
};

type ClientEvents = {
  'client:entrar:sala': (payload: ClientEntrarSalaEvent) => void;
  'client:jogar:rapido': (payload: ClientJogarRapidoEvent) => void;
  'client:iniciar:partida': (payload: ClientIniciarPartidaEvent) => void;
  'client:jogar': (payload: ClientJogarEvent) => void;
  'client:descarte:multiplo': (payload: ClientDescarteMultiploEvent) => void;
  'client:comprar': (payload: ClientComprarEvent) => void;
  'client:interceptar': (payload: ClientInterceptarEvent) => void;
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
  'server:descarte:multiplo:aceito': (payload: ServerDescarteMultiploAceitoEvent) => void;
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
  /** "Jogar agora": tamanho da mesa e quando o servidor completa com bots (só em sala rápida). */
  rapida: SalaRapida | undefined;
  /** Incrementado cada vez que server:erro dispara enquanto há um batch pendente. */
  descarteMultiploErro: number;
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
  /**
   * "Jogar agora": tamanho da mesa pedida. Enquanto `salaId` está vazio, a pessoa ainda
   * está sendo encaixada numa sala pública pelo servidor (que devolve o código da sala).
   */
  rapido?: number;
}

/** Converte as opções internas (lowercase) da UI para o contrato Socket.IO canônico. */
export function toEntrarSalaEvent({
  visibilidade,
  rapido: _rapido,
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
        ...('rapido' in parsed &&
        typeof parsed.rapido === 'number' &&
        Number.isInteger(parsed.rapido)
          ? { rapido: parsed.rapido }
          : {}),
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
  const updated: SessionCredentials = {
    ...baseCredentials,
    // Na entrada "Jogar agora" o código da sala só chega aqui, junto com o token.
    salaId: baseCredentials.salaId || issued.salaId,
    resumeToken: issued.resumeToken,
  };
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
  /** "Jogar agora": o servidor escolhe uma sala pública e completa a mesa com bots se faltar gente. */
  jogarRapido: (nome: string, tamanho: number) => void;
  /** Pedido de "Jogar agora" que o servidor ainda não respondeu com uma sala. */
  pedidoRapido: { nome: string; tamanho: number } | undefined;
  iniciarPartida: () => void;
  jogarCarta: (
    cartaId: string,
    corEscolhida?: ClientJogarEvent['corEscolhida'],
    alvoTrocaId?: ClientJogarEvent['alvoTrocaId'],
  ) => void;
  jogarMultiplasCartas: (cartaIds: ReadonlyArray<string>) => void;
  /** Corta-Frente: tenta interceptar a janela ativa. O servidor decide o vencedor. */
  interceptar: (janelaId: string, revisao: number, cartaId: string) => void;
  comprarCarta: () => void;
  enviarChat: (texto: string) => void;
  sair: () => void;
  abandonarPartida: () => void;
  listarSalas: () => void;
} {
  const socketRef = useRef<GameSocket>();
  if (!socketRef.current) socketRef.current = createSocket();
  const socket = socketRef.current;
  const batchPendenteRef = useRef(false);
  /** Saindo da sala: as últimas mensagens do servidor já não valem para a tela. */
  const saindoRef = useRef(false);
  const cancelarDesconexaoPendenteRef = useRef<() => void>();
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
    rapida: undefined,
    descarteMultiploErro: 0,
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
        reconectado(Date.now() - disconnectAtRef.current);
        disconnectAtRef.current = undefined;
        setTentativaReconexao(0);
      }

      const saved = credentials ?? readSession();
      if (saved && !saved.salaId && saved.rapido !== undefined) {
        // Ainda sem sala: repete o pedido de "Jogar agora" (a conexão caiu antes da resposta).
        socket.emit('client:jogar:rapido', {
          jogadorId: saved.jogadorId,
          nome: saved.nome,
          tamanho: saved.rapido,
        });
      } else if (saved) {
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
      // Saída pedida pela pessoa: não é queda de rede, não há o que reconectar.
      if (saindoRef.current) {
        setState((current) => ({ ...current, status: 'idle' }));
        return;
      }
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
    const onState = ({ estado }: ServerEstadoAtualizadoEvent) => {
      if (saindoRef.current) return;
      setState((current) => ({ ...current, estado, erro: undefined, erroCodigo: undefined }));
    };
    const onRoom = ({ hostId: nextHostId, jogadores, rapida }: ServerSalaAtualizadaEvent) => {
      if (saindoRef.current) return;
      setHostId(nextHostId);
      setState((current) => ({ ...current, jogadores, rapida }));
    };
    const onChat = (message: ServerChatEvent) =>
      !saindoRef.current &&
      setState((current) => ({
        ...current,
        mensagens: [...current.mensagens, message].slice(-40),
      }));
    const onError = ({ codigo, mensagem }: ServerErroEvent) => {
      if (saindoRef.current) return;
      if (batchPendenteRef.current) {
        batchPendenteRef.current = false;
        setState((current) => ({
          ...current,
          erro: mensagem,
          erroCodigo: codigo,
          descarteMultiploErro: current.descarteMultiploErro + 1,
        }));
      } else {
        setState((current) => ({ ...current, erro: mensagem, erroCodigo: codigo }));
      }
    };
    const onMultipleDiscardAccepted = (_payload: ServerDescarteMultiploAceitoEvent) => {
      // O aceite encerra a correlação do request. A UI ainda aguarda a mão
      // privada provar que as cartas saíram antes de remover a pilha visual.
      batchPendenteRef.current = false;
    };
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
    const onHand = ({ mao }: ServerMaoAtualizadaEvent) => {
      if (saindoRef.current) return;
      // NÃO limpar batchPendenteRef aqui: uma atualização de mão pode ser
      // causada por outro evento (Troca/Gira do oponente, etc.) e não prova
      // nem aceite nem rejeição do lote pendente. A correlação do lote só
      // se resolve por 'server:descarte:multiplo:aceito' (aceite) ou por
      // 'server:erro' com batchPendenteRef ainda ativo (rejeição).
      setState((current) => ({ ...current, mao }));
    };
    const onSessionIssued = (issued: ServerSessaoEmitidaEvent) => {
      if (saindoRef.current) return;
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
    socket.on('server:descarte:multiplo:aceito', onMultipleDiscardAccepted);
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
      socket.off('server:descarte:multiplo:aceito', onMultipleDiscardAccepted);
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
      saindoRef.current = false;
      cancelarDesconexaoPendenteRef.current?.();
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

  const jogarRapido = useCallback(
    (nome: string, tamanho: number) => {
      saindoRef.current = false;
      cancelarDesconexaoPendenteRef.current?.();
      const pedido: SessionCredentials = {
        jogadorId: gerarJogadorId(),
        salaId: '',
        nome: nome.trim(),
        rapido: tamanho,
      };
      setCredentials(pedido);
      saveSession(pedido);
      if (!socket.connected) {
        setState((current) => ({ ...current, status: 'connecting', erro: undefined }));
        socket.connect();
      } else {
        socket.emit('client:jogar:rapido', {
          jogadorId: pedido.jogadorId,
          nome: pedido.nome,
          tamanho,
        });
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
  const jogarMultiplasCartas = useCallback(
    (cartaIds: ReadonlyArray<string>) => {
      batchPendenteRef.current = true;
      socket.emit('client:descarte:multiplo', { cartaIds });
    },
    [socket],
  );
  const interceptar = useCallback(
    (janelaId: string, revisao: number, cartaId: string) =>
      socket.emit('client:interceptar', { janelaId, revisao, cartaId }),
    [socket],
  );
  const comprarCarta = useCallback(() => socket.emit('client:comprar', {}), [socket]);
  const enviarChat = useCallback(
    (texto: string) => socket.emit('client:chat:msg', { texto: texto.trim() }),
    [socket],
  );
  /**
   * Envia o último pedido (sair/abandonar) e só desconecta depois que o
   * servidor responder. O Socket.IO do servidor despacha eventos no tick
   * seguinte e descarta os que chegam junto com a desconexão: desconectar na
   * hora fazia o abandono se perder e o adversário ficar numa partida sem fim.
   */
  const enviarEDesconectar = useCallback(
    (evento: 'client:sair:sala' | 'client:abandonar:partida') => {
      cancelarDesconexaoPendenteRef.current?.();
      if (!socket.connected) {
        socket.disconnect();
        return;
      }
      const respostas = [
        'server:estado:atualizado',
        'server:sala:atualizada',
        'server:erro',
      ] as const;
      let timer = 0;
      const limpar = () => {
        window.clearTimeout(timer);
        for (const resposta of respostas) socket.off(resposta, fechar);
        cancelarDesconexaoPendenteRef.current = undefined;
      };
      const fechar = () => {
        limpar();
        socket.disconnect();
      };
      timer = window.setTimeout(fechar, 1500);
      for (const resposta of respostas) socket.once(resposta, fechar);
      // Entrar em outra sala antes da resposta cancela a desconexão.
      cancelarDesconexaoPendenteRef.current = limpar;
      socket.emit(evento, {});
    },
    [socket],
  );

  const limparSessaoLocal = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    saindoRef.current = true;
    setCredentials(undefined);
    setHostId(undefined);
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
      rapida: undefined,
      descarteMultiploErro: 0,
    });
  }, [socket]);
  const sair = useCallback(() => {
    limparSessaoLocal();
    enviarEDesconectar('client:sair:sala');
  }, [enviarEDesconectar, limparSessaoLocal]);
  const abandonarPartida = useCallback(() => {
    limparSessaoLocal();
    enviarEDesconectar('client:abandonar:partida');
  }, [enviarEDesconectar, limparSessaoLocal]);
  const listarSalas = useCallback(() => {
    if (socket.connected) {
      socket.emit('client:listar:salas', {});
      return;
    }
    listRequestedRef.current = true;
    socket.connect();
  }, [socket]);

  const pedidoNome = credentials && !credentials.salaId ? credentials.nome : undefined;
  const pedidoTamanho = credentials && !credentials.salaId ? credentials.rapido : undefined;
  const pedidoRapido = useMemo(
    () =>
      pedidoNome !== undefined && pedidoTamanho !== undefined
        ? { nome: pedidoNome, tamanho: pedidoTamanho }
        : undefined,
    [pedidoNome, pedidoTamanho],
  );

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
      jogarRapido,
      pedidoRapido,
      iniciarPartida,
      jogarCarta,
      jogarMultiplasCartas,
      interceptar,
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
      credentials?.rapido,
      entrarSala,
      jogarRapido,
      enviarChat,
      hostId,
      interceptar,
      iniciarPartida,
      jogarCarta,
      jogarMultiplasCartas,
      listarSalas,
      pedidoRapido,
      sair,
      socket,
      state,
      tentativaReconexao,
    ],
  );
}
