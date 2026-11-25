import type {
  ClientIniciarPartidaEvent,
  ServerChatEvent,
  SocketEventMap,
} from '@kabemjunto/shared';
import { createNoopMetrics, type MetricsRegistry } from './observability.js';
import type { ClientEvents, GameServer, GameSocket, ServerEvents } from './socket-types.js';
import { QuickPlayDirector, type QuickPlayOptions } from './quickplay.js';
import { RevancheDirector, type RevancheOptions } from './revanche.js';
import { ResilienciaDirector, type ResilienciaOptions } from './resiliencia.js';
import {
  broadcastState,
  maybeOpenInterceptionWindow,
  salaAtualizada,
  sendPrivateHands,
} from './room-broadcast.js';
import { RoomError, RoomStore, toPublicState } from './room-store.js';
import {
  isNonEmptyString,
  SocketRateLimiter,
  type SocketActionCategory,
} from './socket-security.js';

const EMPTY_EVENT: ClientIniciarPartidaEvent = {};
const MAX_MULTIPLE_DISCARD_CARD_IDS = 109; // ADR-013: baralho canônico não contém mais que 109 cartas.
void EMPTY_EVENT;

function emitError(socket: GameSocket, error: unknown): void {
  const roomError = error instanceof RoomError ? error : new RoomError('INTERNAL', 'Erro interno.');
  socket.emit('server:erro', { codigo: roomError.code, mensagem: roomError.message });
}

function roomId(socket: GameSocket): string | undefined {
  return socket.data.salaId as string | undefined;
}

function jogadorIdFromSocket(socket: GameSocket): string | undefined {
  return socket.data.jogadorId as string | undefined;
}

export function registerSocketHandlers(
  io: GameServer,
  store: RoomStore,
  metrics: MetricsRegistry = createNoopMetrics(),
  options: {
    quickPlay?: QuickPlayOptions;
    resiliencia?: ResilienciaOptions;
    revanche?: RevancheOptions;
  } = {},
): void {
  const limiter = new SocketRateLimiter();
  const revanche = new RevancheDirector(io, store, options.revanche);
  revanche.start();
  new QuickPlayDirector(io, store, {
    revanchePendente: (salaId) => revanche.pendente(salaId),
    ...options.quickPlay,
  }).start();
  new ResilienciaDirector(io, store, options.resiliencia).start();

  store.setInterceptionExpiredHandler((salaId, session, janelaId, proximaVezId) => {
    io.to(salaId).emit('server:interceptacao:resolvida', {
      janelaId,
      resultado: 'EXPIRADA',
      proximaVezId,
    });
    broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
  });

  /** Aplica o limite da categoria; se excedido, avisa o cliente e sinaliza pra abortar o handler. */
  function checkRateLimit(socket: GameSocket, category: SocketActionCategory): boolean {
    if (limiter.allow(socket.id, category)) return true;
    socket.emit('server:erro', {
      codigo: 'INTERNAL',
      mensagem: 'Muitas ações em pouco tempo. Aguarde um instante.',
    });
    return false;
  }

  /** A pessoa deu sinal de vida: se um bot jogava por ela, devolve o assento e avisa a mesa. */
  function registrarPresenca(salaId: string, jogadorId: string): void {
    const session = store.registrarPresenca(salaId, jogadorId);
    if (session?.estado) broadcastState(io, salaId, { estado: toPublicState(session.estado) });
  }

  /** O que acontece depois de entrar numa sala (por código ou por "Jogar agora"). */
  function finalizarEntrada(socket: GameSocket, joined: ReturnType<RoomStore['join']>): void {
    // Veio direto de outra sala ("Jogar agora" depois do fim): não ouve mais nada dela.
    const anterior = roomId(socket);
    if (anterior && anterior !== joined.session.sala.id) {
      void socket.leave(anterior);
      const sala = store.get(anterior);
      if (sala) io.to(anterior).emit('server:sala:atualizada', salaAtualizada(sala));
    }
    socket.data.salaId = joined.session.sala.id;
    socket.data.jogadorId = joined.jogadorId;
    void socket.join(joined.session.sala.id);

    // Revoga o socket anterior: uma identidade só pode ter uma conexão ativa por vez.
    if (joined.previousSocketId && joined.previousSocketId !== socket.id) {
      io.sockets.sockets.get(joined.previousSocketId)?.disconnect(true);
    }

    // Credenciais rotativas: só pro socket que autenticou, nunca em broadcast.
    socket.emit('server:sessao:emitida', {
      jogadorId: joined.jogadorId,
      salaId: joined.session.sala.id,
      resumeToken: joined.resumeToken,
    });

    // Broadcast: sala atualizada (incluindo `conectado: true` no reconectado).
    io.to(joined.session.sala.id).emit('server:sala:atualizada', salaAtualizada(joined.session));

    // Se a partida JÁ está em andamento (reconexão no meio do jogo),
    // reenvia o estado público + a mão privada pro novo socket. O estado vai
    // para a mesa toda: a volta pode devolver o assento e religar o prazo da vez.
    if (joined.session.estado) {
      broadcastState(io, joined.session.sala.id, {
        estado: toPublicState(joined.session.estado),
      });
      sendPrivateHands(io, joined.session);
      revanche.reenviar(socket, joined.session);
    }
  }

  io.on('connection', (socket: GameSocket) => {
    metrics.recordConnection(1);

    socket.on('client:listar:salas', () => {
      socket.emit('server:salas:disponiveis', { salas: store.listAvailablePublicRooms() });
    });

    socket.on('client:entrar:sala', (payload) => {
      if (!checkRateLimit(socket, 'sala')) return;
      if (
        !isNonEmptyString(payload.jogadorId, 128) ||
        !isNonEmptyString(payload.salaId, 32) ||
        !isNonEmptyString(payload.nome, 64) ||
        (payload.nomeSala !== undefined && !isNonEmptyString(payload.nomeSala, 48)) ||
        (payload.visibilidade !== undefined &&
          payload.visibilidade !== 'PRIVADA' &&
          payload.visibilidade !== 'PUBLICA') ||
        (payload.resumeToken !== undefined && !isNonEmptyString(payload.resumeToken, 256))
      ) {
        emitError(socket, new RoomError('INTERNAL', 'Payload inválido para entrar na sala.'));
        return;
      }
      try {
        const joined = store.join({
          jogadorId: payload.jogadorId,
          salaId: payload.salaId,
          nome: payload.nome,
          socketId: socket.id,
          ...(payload.criar !== undefined ? { criar: payload.criar } : {}),
          ...(payload.nomeSala !== undefined ? { nomeSala: payload.nomeSala } : {}),
          ...(payload.visibilidade !== undefined ? { visibilidade: payload.visibilidade } : {}),
          ...(payload.avatarId !== undefined ? { avatarId: payload.avatarId } : {}),
          ...(payload.resumeToken !== undefined ? { resumeToken: payload.resumeToken } : {}),
        });
        finalizarEntrada(socket, joined);
        metrics.recordEventOutcome('sala', 'accepted');
      } catch (error) {
        metrics.recordEventOutcome('sala', 'rejected');
        if (!(error instanceof RoomError)) metrics.recordPersistenceFailure();
        emitError(socket, error);
      }
    });

    socket.on('client:jogar:rapido', (payload) => {
      if (!checkRateLimit(socket, 'sala')) return;
      if (
        !isNonEmptyString(payload.jogadorId, 128) ||
        !isNonEmptyString(payload.nome, 64) ||
        !Number.isInteger(payload.tamanho) ||
        (payload.resumeToken !== undefined && !isNonEmptyString(payload.resumeToken, 256))
      ) {
        emitError(socket, new RoomError('INTERNAL', 'Payload inválido para jogar agora.'));
        return;
      }
      try {
        const joined = store.quickJoin({
          jogadorId: payload.jogadorId,
          nome: payload.nome,
          socketId: socket.id,
          tamanho: payload.tamanho,
          ...(payload.avatarId !== undefined ? { avatarId: payload.avatarId } : {}),
          ...(payload.resumeToken !== undefined ? { resumeToken: payload.resumeToken } : {}),
        });
        finalizarEntrada(socket, joined);
        metrics.recordEventOutcome('sala', 'accepted');
      } catch (error) {
        metrics.recordEventOutcome('sala', 'rejected');
        if (!(error instanceof RoomError)) metrics.recordPersistenceFailure();
        emitError(socket, error);
      }
    });

    socket.on('client:sair:sala', () => {
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        const session = store.leaveWaitingRoom(salaId, jogadorId);
        // Depois do fim quem sai também recebe a resposta, como no abandono.
        if (session?.estado) {
          broadcastState(io, salaId, { estado: toPublicState(session.estado) });
          io.to(salaId).emit('server:sala:atualizada', salaAtualizada(session));
        }
        void socket.leave(salaId);
        delete socket.data.salaId;
        delete socket.data.jogadorId;
        if (session && !session.estado) {
          io.to(salaId).emit('server:sala:atualizada', salaAtualizada(session));
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('client:abandonar:partida', () => {
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        const session = store.abandonGame(salaId, jogadorId);
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
        io.to(salaId).emit('server:sala:atualizada', salaAtualizada(session));
        void socket.leave(salaId);
        delete socket.data.salaId;
        delete socket.data.jogadorId;
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('client:retomar:controle', () => {
      if (!checkRateLimit(socket, 'jogo')) return;
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        registrarPresenca(salaId, jogadorId);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('client:iniciar:partida', () => {
      if (!checkRateLimit(socket, 'jogo')) return;
      try {
        const salaId = roomId(socket);
        if (!salaId) throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        const session = store.start(salaId, socket.id);
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
        sendPrivateHands(io, session);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('client:revanche:pedir', () => {
      if (!checkRateLimit(socket, 'jogo')) return;
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        const session = store.get(salaId);
        if (session && session.socketByPlayer.get(jogadorId) !== socket.id) {
          throw new RoomError('AUTH_REQUIRED', 'Você não participa mais desta sala.');
        }
        revanche.pedir(salaId, jogadorId);
        metrics.recordEventOutcome('jogo', 'accepted');
      } catch (error) {
        metrics.recordEventOutcome('jogo', 'rejected');
        emitError(socket, error);
      }
    });

    socket.on('client:jogar', (payload) => {
      if (!checkRateLimit(socket, 'jogo')) return;
      if (
        !isNonEmptyString(payload.cartaId, 128) ||
        (payload.alvoTrocaId !== undefined && !isNonEmptyString(payload.alvoTrocaId, 128))
      ) {
        emitError(socket, new RoomError('INTERNAL', 'Payload inválido para jogar carta.'));
        return;
      }
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        registrarPresenca(salaId, jogadorId);
        const corEscolhida = payload.corEscolhida === 'NEUTRO' ? undefined : payload.corEscolhida;
        const session = store.play(
          salaId,
          jogadorId,
          payload.cartaId,
          corEscolhida,
          payload.alvoTrocaId,
        );
        socket.emit('server:jogada:aceita', { cartaId: payload.cartaId, jogadorId });
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
        sendPrivateHands(io, session);
        maybeOpenInterceptionWindow(io, store, salaId, jogadorId);
        metrics.recordEventOutcome('jogo', 'accepted');
      } catch (error) {
        metrics.recordEventOutcome('jogo', 'rejected');
        if (!(error instanceof RoomError)) metrics.recordPersistenceFailure();
        const roomError =
          error instanceof RoomError ? error : new RoomError('JOGADA_INVALIDA', 'Jogada inválida.');
        socket.emit('server:jogada:rejeitada', {
          cartaId: payload.cartaId,
          motivo: roomError.message,
        });
        emitError(socket, roomError);
      }
    });

    socket.on('client:descarte:multiplo', (payload) => {
      if (!checkRateLimit(socket, 'jogo')) return;
      if (
        payload === null ||
        typeof payload !== 'object' ||
        !Array.isArray(payload.cartaIds) ||
        payload.cartaIds.length < 2 ||
        payload.cartaIds.length > MAX_MULTIPLE_DISCARD_CARD_IDS ||
        new Set(payload.cartaIds).size !== payload.cartaIds.length ||
        payload.cartaIds.some((cartaId) => !isNonEmptyString(cartaId, 128))
      ) {
        emitError(socket, new RoomError('JOGADA_INVALIDA', 'Lote de descarte múltiplo inválido.'));
        return;
      }
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        registrarPresenca(salaId, jogadorId);
        const session = store.playMultiple(salaId, jogadorId, payload.cartaIds);
        socket.emit('server:descarte:multiplo:aceito', { cartaIds: payload.cartaIds, jogadorId });
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
        sendPrivateHands(io, session);
        maybeOpenInterceptionWindow(io, store, salaId, jogadorId);
        metrics.recordEventOutcome('jogo', 'accepted');
      } catch (error) {
        metrics.recordEventOutcome('jogo', 'rejected');
        if (!(error instanceof RoomError)) metrics.recordPersistenceFailure();
        emitError(socket, error);
      }
    });

    socket.on('client:comprar', (_payload) => {
      if (!checkRateLimit(socket, 'jogo')) return;
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        registrarPresenca(salaId, jogadorId);
        const session = store.buy(salaId, jogadorId);
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
        sendPrivateHands(io, session);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('client:escolher:cor', (_payload) => {
      if (!checkRateLimit(socket, 'jogo')) return;
      socket.emit('server:erro', {
        codigo: 'INTERNAL',
        mensagem: 'A cor deve ser enviada junto com a jogada da carta coringa.',
      });
    });

    socket.on('client:interceptar', (payload) => {
      if (!checkRateLimit(socket, 'jogo')) return;
      if (
        !isNonEmptyString(payload.janelaId, 128) ||
        !Number.isSafeInteger(payload.revisao) ||
        payload.revisao < 1 ||
        !isNonEmptyString(payload.cartaId, 128)
      ) {
        emitError(
          socket,
          new RoomError('INTERCEPTACAO_INVALIDA', 'Payload inválido para interceptar.'),
        );
        return;
      }
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        registrarPresenca(salaId, jogadorId);
        const session = store.intercept(
          salaId,
          jogadorId,
          payload.janelaId,
          payload.revisao,
          payload.cartaId,
        );
        io.to(salaId).emit('server:interceptacao:resolvida', {
          janelaId: payload.janelaId,
          resultado: 'INTERCEPTADA',
          interceptadorId: jogadorId,
          proximaVezId: session.estado!.vezDe,
        });
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
        sendPrivateHands(io, session);
        maybeOpenInterceptionWindow(io, store, salaId, jogadorId);
        metrics.recordEventOutcome('jogo', 'accepted');
      } catch (error) {
        metrics.recordEventOutcome('jogo', 'rejected');
        if (!(error instanceof RoomError)) metrics.recordPersistenceFailure();
        emitError(socket, error);
      }
    });

    socket.on('client:chat:msg', (payload) => {
      if (!checkRateLimit(socket, 'chat')) return;
      if (!isNonEmptyString(payload.texto, 512)) return;
      const salaId = roomId(socket);
      const jogadorId = jogadorIdFromSocket(socket);
      if (!salaId || !jogadorId) {
        emitError(socket, new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.'));
        return;
      }
      const texto = payload.texto.replace(/[<>]/g, '').trim().slice(0, 240);
      if (!texto) return;
      try {
        registrarPresenca(salaId, jogadorId);
      } catch {
        // Falha ao gravar a presença não pode impedir a mensagem.
      }
      const activeState = store.get(salaId)?.estado;
      const silence = activeState ? store.penalizeSilenceBreak(salaId, jogadorId) : undefined;
      const message: ServerChatEvent = { jogadorId, texto, timestamp: Date.now() };
      io.to(salaId).emit('server:chat:msg', message);
      if (silence?.penalized) {
        io.to(salaId).emit('server:silencio:quebrado', { jogadorId, cartasCompradas: 2 });
        broadcastState(io, salaId, { estado: toPublicState(silence.session.estado!) });
        sendPrivateHands(io, silence.session);
      }
    });

    socket.on('disconnect', () => {
      metrics.recordConnection(-1);
      limiter.releaseSocket(socket.id);
      const session = store.disconnect(socket.id);
      if (session) {
        io.to(session.sala.id).emit('server:sala:atualizada', salaAtualizada(session));
        // A queda de quem está na vez para o relógio: a mesa precisa saber.
        if (session.estado && !session.estado.finalizada) {
          broadcastState(io, session.sala.id, { estado: toPublicState(session.estado) });
        }
      }
    });
  });
}

export type { ClientEvents, ServerEvents, GameServer, GameSocket, SocketEventMap };
