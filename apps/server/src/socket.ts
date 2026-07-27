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
  ServerSalaAtualizadaEvent,
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
  'server:jogada:aceita': (payload: ServerJogadaAceitaEvent) => void;
  'server:jogada:rejeitada': (payload: ServerJogadaRejeitadaEvent) => void;
  'server:sala:atualizada': (payload: ServerSalaAtualizadaEvent) => void;
  'server:cor:trocada': (payload: ServerCorTrocadaEvent) => void;
  'server:chat:msg': (payload: ServerChatEvent) => void;
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

function broadcastState(io: GameServer, salaId: string, estado: ServerEstadoAtualizadoEvent): void {
  io.to(salaId).emit('server:estado:atualizado', estado);
}

export function registerSocketHandlers(io: GameServer, store: RoomStore): void {
  io.on('connection', (socket: GameSocket) => {
    socket.on('client:entrar:sala', (payload) => {
      try {
        const joined = store.join({ ...payload, socketId: socket.id });
        socket.data.salaId = joined.session.sala.id;
        socket.data.jogadorId = joined.jogadorId;
        void socket.join(joined.session.sala.id);
        io.to(joined.session.sala.id).emit('server:sala:atualizada', {
          jogadores: joined.session.sala.jogadores,
        });
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
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('client:jogar', (payload) => {
      try {
        const salaId = roomId(socket);
        if (!salaId) throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        const corEscolhida = payload.corEscolhida === 'NEUTRO' ? undefined : payload.corEscolhida;
        const session = store.play(salaId, socket.id, payload.cartaId, corEscolhida);
        socket.emit('server:jogada:aceita', { cartaId: payload.cartaId, jogadorId: socket.id });
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
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
        if (!salaId) throw new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.');
        const session = store.buy(salaId, socket.id);
        broadcastState(io, salaId, { estado: toPublicState(session.estado!) });
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
      if (!salaId) {
        emitError(socket, new RoomError('SALA_INEXISTENTE', 'Entre em uma sala primeiro.'));
        return;
      }
      const texto = payload.texto.replace(/[<>]/g, '').trim().slice(0, 240);
      if (!texto) return;
      const message: ServerChatEvent = { jogadorId: socket.id, texto, timestamp: Date.now() };
      io.to(salaId).emit('server:chat:msg', message);
    });

    socket.on('disconnect', () => {
      const session = store.disconnect(socket.id);
      if (session) {
        io.to(session.sala.id).emit('server:sala:atualizada', {
          jogadores: session.sala.jogadores,
        });
      }
    });
  });
}

export type { ClientEvents, ServerEvents, GameServer, GameSocket, SocketEventMap };
