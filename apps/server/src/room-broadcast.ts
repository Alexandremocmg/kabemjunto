import type { ServerEstadoAtualizadoEvent, ServerSalaAtualizadaEvent } from '@kabemjunto/shared';
import { toPublicState, type RoomSession, type RoomStore } from './room-store.js';
import type { GameServer } from './socket-types.js';

/** Evento de sala atualizada; nas salas "Jogar agora" leva também o tamanho da mesa e o início. */
export function salaAtualizada(session: RoomSession): ServerSalaAtualizadaEvent {
  return {
    hostId: session.sala.hostId,
    jogadores: session.sala.jogadores,
    ...(session.sala.rapida ? { rapida: session.sala.rapida } : {}),
    ...(session.ranking ? { grupoRanking: session.ranking.grupo } : {}),
  };
}

export function broadcastState(
  io: GameServer,
  salaId: string,
  estado: ServerEstadoAtualizadoEvent,
): void {
  io.to(salaId).emit('server:estado:atualizado', estado);
}

/**
 * Envia a mão privada de cada jogador pro socket correspondente.
 * (Sprint 3 — M14: canal privado de mão, complemento do broadcast público.)
 */
export function sendPrivateHands(io: GameServer, session: ReturnType<RoomStore['get']>): void {
  if (!session?.estado) return;
  for (const [jogadorId, socketId] of session.socketByPlayer) {
    const jogador = session.estado.jogadores.find((item) => item.id === jogadorId);
    const playerSocket = io.sockets.sockets.get(socketId);
    if (jogador && playerSocket) {
      playerSocket.emit('server:mao:atualizada', { mao: jogador.mao });
    }
  }
}

/**
 * Transmite o estado (e as mãos) a partir de um timer. O estado já foi gravado:
 * uma falha aqui não pode derrubar o processo nem travar a mesa.
 */
export function transmitirPartida(
  io: GameServer,
  session: RoomSession,
  opcoes: { sala?: boolean; maos?: boolean } = {},
): void {
  const id = session.sala.id;
  try {
    if (opcoes.sala) io.to(id).emit('server:sala:atualizada', salaAtualizada(session));
    if (session.estado) broadcastState(io, id, { estado: toPublicState(session.estado) });
    if (opcoes.maos) sendPrivateHands(io, session);
  } catch {
    // A próxima transmissão (ou reconexão) leva o estado atual.
  }
}

/**
 * Após qualquer ação que possa deixar uma carta elegível no topo do
 * descarte (jogada normal, descarte múltiplo, compra que descarta — hoje
 * só as duas primeiras se aplicam), tenta abrir uma janela de Corta-Frente.
 * Sem efeito se não houver carta elegível, se já existir janela ativa, ou
 * se a partida já tiver terminado. Nunca lança: se não der para gravar a
 * janela, a partida segue sem ela.
 */
export function maybeOpenInterceptionWindow(
  io: GameServer,
  store: RoomStore,
  salaId: string,
  jogadorOrigemId: string,
): void {
  try {
    const opened = store.openInterceptionWindow(salaId, jogadorOrigemId);
    if (!opened?.estado?.interceptacao) return;
    io.to(salaId).emit('server:interceptacao:aberta', { janela: opened.estado.interceptacao });
    broadcastState(io, salaId, { estado: toPublicState(opened.estado) });
  } catch {
    // A jogada já valeu; o Corta-Frente é só uma chance extra.
  }
}
