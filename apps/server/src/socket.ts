import type { Server, Socket } from 'socket.io';
import type {
  ClientChatEvent,
  ClientEntrarSalaEvent,
  ClientEscolherCorEvent,
  ClientIniciarPartidaEvent,
  ClientJogarEvent,
  ClientComprarEvent,
  ServerChatEvent,
  ServerCorTrocadaEvent,
  ServerEstadoAtualizadoEvent,
  ServerErroEvent,
  ServerJogadaAceitaEvent,
  ServerJogadaRejeitadaEvent,
  ServerMaoAtualizadaEvent,
  ServerSalaAtualizadaEvent,
  ServerSessaoEmitidaEvent,
  SocketEventMap,
} from '@kabemjunto/shared';
import { RoomError, RoomStore, toPublicState } from './room-store.js';

type ClientEvents = {
  'client:entrar:sala': (payload: ClientEntrarSalaEvent) => void;
  'client:iniciar:partida': (payload: ClientIniciarPartidaEvent) => void;
  'client:jogar': (payload: ClientJogarEvent) => void;
  'client:comprar': (payload: ClientComprarEvent) => void;
  'client:escolher:cor': (payload: ClientEscolherCorEvent) => void;
  'client:chat:msg': (payload: ClientChatEvent) => void;
};

type ServerEvents = {
  'server:estado:atualizado': (payload: ServerEstadoAtualizadoEvent) => void;
  'server:sessao:emitida': (payload: ServerSessaoEmitidaEvent) => void;
  'server:jogada:aceita': (payload: ServerJogadaAceitaEvent) => void;
  'server:jogada:rejeitada': (payload: ServerJogadaRejeitadaEvent) => void;
  'server:sala:atualizada': (payload: ServerSalaAtualizadaEvent) => void;
  'server:cor:trocada': (payload: ServerCorTrocadaEvent) => void;
  'server:chat:msg': (payload: ServerChatEvent) => void;
  'server:mao:atualizada': (payload: ServerMaoAtualizadaEvent) => void;
  'server:erro': (payload: ServerErroEvent) => void;
};

type GameServer = Server<ClientEvents, ServerEvents>;
type GameSocket = Socket<ClientEvents, ServerEvents>;

const EMPTY_EVENT: ClientIniciarPartidaEvent = {};
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

function broadcastState(io: GameServer, salaId: string, estado: ServerEstadoAtualizadoEvent): void {
  io.to(salaId).emit('server:estado:atualizado', estado);
}

/**
 * Envia a mão privada de cada jogador pro socket correspondente.
 * (Sprint 3 — M14: canal privado de mão, complemento do broadcast público.)
 */
function sendPrivateHands(io: GameServer, session: ReturnType<RoomStore['get']>): void {
  if (!session?.estado) return;
  for (const [jogadorId, socketId] of session.socketByPlayer) {
    const jogador = session.estado.jogadores.find((item) => item.id === jogadorId);
    const playerSocket = io.sockets.sockets.get(socketId);
    if (jogador && playerSocket) {
      playerSocket.emit('server:mao:atualizada', { mao: jogador.mao });
    }
  }
}

export function registerSocketHandlers(io: GameServer, store: RoomStore): void {
  io.on('connection', (socket: GameSocket) => {
    socket.on('client:entrar:sala', (payload) => {
      try {
        const joined = store.join({
          jogadorId: payload.jogadorId,
          salaId: payload.salaId,
          nome: payload.nome,
          socketId: socket.id,
          ...(payload.criar !== undefined ? { criar: payload.criar } : {}),
          ...(payload.resumeToken !== undefined ? { resumeToken: payload.resumeToken } : {}),
        });
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
        io.to(joined.session.sala.id).emit('server:sala:atualizada', {
          hostId: joined.session.sala.hostId,
          jogadores: joined.session.sala.jogadores,
        });

        // Se a partida JÁ está em andamento (reconexão no meio do jogo),
        // reenvia o estado público + a mão privada pro novo socket.
        if (joined.session.estado) {
          socket.emit('server:estado:atualizado', {
            estado: toPublicState(joined.session.estado),
          });
          sendPrivateHands(io, joined.session);
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('client:iniciar:partida', () => {
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

    socket.on('client:jogar', (payload) => {
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
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
      } catch (error) {
        const roomError =
          error instanceof RoomError ? error : new RoomError('JOGADA_INVALIDA', 'Jogada inválida.');
        socket.emit('server:jogada:rejeitada', {
          cartaId: payload.cartaId,
          motivo: roomError.message,
        });
        emitError(socket, roomError);
      }
    });

    socket.on('client:comprar', (_payload) => {
      try {
        const salaId = roomId(socket);
        const jogadorId = jogadorIdFromSocket(socket);
        if (!salaId || !jogadorId) {
          throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        }
        const session = store.buy(salaId, jogadorId);
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
        sendPrivateHands(io, session);
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('client:escolher:cor', (_payload) => {
      socket.emit('server:erro', {
        codigo: 'INTERNAL',
        mensagem: 'A cor deve ser enviada junto com a jogada da carta coringa.',
      });
    });

    socket.on('client:chat:msg', (payload) => {
      const salaId = roomId(socket);
      const jogadorId = jogadorIdFromSocket(socket);
      if (!salaId || !jogadorId) {
        emitError(socket, new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.'));
        return;
      }
      const texto = payload.texto.replace(/[<>]/g, '').trim().slice(0, 240);
      if (!texto) return;
      const message: ServerChatEvent = { jogadorId, texto, timestamp: Date.now() };
      io.to(salaId).emit('server:chat:msg', message);
    });

    socket.on('disconnect', () => {
      const session = store.disconnect(socket.id);
      if (session) {
        io.to(session.sala.id).emit('server:sala:atualizada', {
          hostId: session.sala.hostId,
          jogadores: session.sala.jogadores,
        });
      }
    });
  });
}

export type { ClientEvents, ServerEvents, GameServer, GameSocket, SocketEventMap };
