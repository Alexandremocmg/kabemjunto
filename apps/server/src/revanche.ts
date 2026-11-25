/**
 * Fim de partida e revanche.
 *
 * - **Fim:** na primeira gravação com a partida terminada, por qualquer caminho,
 *   transmite `server:partida:encerrada` uma única vez.
 * - **Revanche:** começa na hora se todas as pessoas conectadas aceitaram; senão,
 *   depois da espera (contada do primeiro pedido) com quem aceitou. Quem sai ou
 *   cai deixa de contar. As outras vagas viram bots.
 *
 * Como os outros diretores, observa o `RoomStore`. A contagem vive só em memória:
 * reiniciar o servidor derruba todo mundo, então não há o que retomar.
 */
import type { JogadorId, ServerRevancheAtualizadaEvent } from '@kabemjunto/shared';
import { REVANCHE_WAIT_PADRAO_MS } from './config.js';
import { broadcastState, salaAtualizada, sendPrivateHands } from './room-broadcast.js';
import {
  partidaEncerrada,
  possiveisNaRevanche,
  RoomError,
  toPublicState,
  type RoomSession,
  type RoomStore,
} from './room-store.js';
import type { GameServer, GameSocket } from './socket-types.js';

export interface RevancheOptions {
  /** Quanto esperar, desde o primeiro pedido, por quem ainda não aceitou. */
  esperaMs?: number;
}

/** Espera antes de tentar de novo quando gravar falha (ex.: disco cheio). */
const NOVA_TENTATIVA_MS = 5_000;

interface Andamento {
  partidaId: string;
  prontos: Set<JogadorId>;
  /** Último conjunto transmitido, para só avisar quando algo muda. */
  transmitido: string;
  comecaEm?: number;
  timer?: ReturnType<typeof setTimeout>;
}

export class RevancheDirector {
  private readonly andamentos = new Map<string, Andamento>();
  private readonly espera: number;
  private pararDeObservar: (() => void) | undefined;

  constructor(
    private readonly io: GameServer,
    private readonly store: RoomStore,
    opcoes: RevancheOptions = {},
  ) {
    this.espera = opcoes.esperaMs ?? REVANCHE_WAIT_PADRAO_MS;
  }

  start(): void {
    this.pararDeObservar?.();
    // O que já tinha terminado antes de ligar não é transmitido de novo.
    for (const session of this.store.sessions()) {
      if (session.estado?.finalizada) this.novo(session.sala.id, session.estado.partidaId);
    }
    this.pararDeObservar = this.store.addCommitObserver((session) => this.aoMudar(session));
  }

  /** Cancela os timers e para de observar (usado nos testes). */
  stop(): void {
    this.pararDeObservar?.();
    this.pararDeObservar = undefined;
    for (const id of [...this.andamentos.keys()]) this.esquecer(id);
  }

  /** Há uma contagem correndo nesta sala? */
  pendente(salaId: string): boolean {
    return this.andamentos.get(salaId)?.timer !== undefined;
  }

  /** Uma pessoa quer jogar de novo. Repetir o pedido não muda nada. */
  pedir(salaId: string, jogadorId: JogadorId): void {
    const session = this.store.get(salaId);
    if (!session) throw new RoomError('SALA_INEXISTENTE', 'Sala não encontrada.');
    if (!session.estado?.finalizada) {
      throw new RoomError('INTERNAL', 'A partida ainda não terminou.');
    }
    if (!possiveisNaRevanche(session).includes(jogadorId)) {
      throw new RoomError('AUTH_REQUIRED', 'Você não participa mais desta sala.');
    }
    const andamento = this.andamento(session);
    if (andamento.prontos.has(jogadorId)) return;
    andamento.prontos.add(jogadorId);
    this.reavaliar(session);
  }

  /** Quem volta a uma sala terminada recebe de novo o resultado e o andamento. */
  reenviar(socket: GameSocket, session: RoomSession): void {
    const fim = partidaEncerrada(session);
    if (!fim) return;
    socket.emit('server:partida:encerrada', fim);
    socket.emit('server:revanche:atualizada', this.evento(session, this.andamento(session)));
  }

  private aoMudar(session: RoomSession): void {
    const { sala, estado } = session;
    if (!estado?.finalizada) {
      this.esquecer(sala.id);
      return;
    }
    if (this.andamentos.get(sala.id)?.partidaId !== estado.partidaId) {
      this.limparRemovidas();
      this.novo(sala.id, estado.partidaId);
      this.io.to(sala.id).emit('server:partida:encerrada', partidaEncerrada(session)!);
    }
    this.reavaliar(session);
  }

  /** Transmite o que mudou e decide se a revanche começa, espera ou é cancelada. */
  private reavaliar(session: RoomSession): void {
    const id = session.sala.id;
    const andamento = this.andamento(session);
    const possiveis = possiveisNaRevanche(session);
    for (const pronto of andamento.prontos) {
      if (!possiveis.includes(pronto)) andamento.prontos.delete(pronto);
    }

    const agora = Date.now();
    const todos = andamento.prontos.size > 0 && andamento.prontos.size === possiveis.length;
    if (andamento.prontos.size === 0) this.cancelar(andamento);
    else if (todos) this.armar(id, andamento, agora, 0);
    else if (andamento.comecaEm === undefined) {
      this.armar(id, andamento, agora + this.espera, this.espera);
    }

    const evento = this.evento(session, andamento);
    const atual = JSON.stringify([evento.prontos, evento.possiveis, andamento.comecaEm]);
    if (atual === andamento.transmitido) return;
    andamento.transmitido = atual;
    this.io.to(id).emit('server:revanche:atualizada', evento);
  }

  private evento(session: RoomSession, andamento: Andamento): ServerRevancheAtualizadaEvent {
    const possiveis = possiveisNaRevanche(session);
    return {
      partidaId: andamento.partidaId,
      prontos: possiveis.filter((id) => andamento.prontos.has(id)),
      possiveis,
      ...(andamento.comecaEm !== undefined
        ? { restanteMs: Math.max(0, andamento.comecaEm - Date.now()) }
        : {}),
    };
  }

  /** Nunca começa dentro da gravação que disparou a reavaliação: sempre por timer. */
  private armar(id: string, andamento: Andamento, comecaEm: number, emMs: number): void {
    if (andamento.timer) clearTimeout(andamento.timer);
    andamento.comecaEm = comecaEm;
    andamento.timer = setTimeout(() => this.comecar(id, andamento), emMs);
    andamento.timer.unref?.();
  }

  private comecar(id: string, andamento: Andamento): void {
    if (this.andamentos.get(id) !== andamento) return;
    const antes = this.store.get(id);
    if (!antes) {
      this.esquecer(id);
      return;
    }
    let session: RoomSession;
    try {
      session = this.store.startRematch(id, andamento.partidaId, andamento.prontos);
    } catch {
      if (this.andamentos.get(id) === andamento && andamento.prontos.size > 0) {
        this.armar(id, andamento, Date.now() + NOVA_TENTATIVA_MS, NOVA_TENTATIVA_MS);
        this.io.to(id).emit('server:revanche:atualizada', this.evento(antes, andamento));
      }
      return;
    }
    this.retirarQuemFicouFora(session);
    this.io.to(id).emit('server:sala:atualizada', salaAtualizada(session));
    broadcastState(this.io, id, { estado: toPublicState(session.estado!) });
    sendPrivateHands(this.io, session);
  }

  /** Antes de transmitir a partida nova, tira da sala todo socket que não participa dela. */
  private retirarQuemFicouFora(session: RoomSession): void {
    const id = session.sala.id;
    const dentro = new Set(session.socketByPlayer.values());
    for (const socketId of [...(this.io.sockets.adapter.rooms.get(id) ?? [])]) {
      if (dentro.has(socketId)) continue;
      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket) continue;
      void socket.leave(id);
      if (socket.data.salaId !== id) continue;
      delete socket.data.salaId;
      delete socket.data.jogadorId;
      socket.emit('server:erro', {
        codigo: 'SALA_INEXISTENTE',
        mensagem: 'A revanche começou sem você. Entre em outra sala para jogar de novo.',
      });
    }
  }

  private andamento(session: RoomSession): Andamento {
    const id = session.sala.id;
    const { partidaId } = session.estado!;
    const atual = this.andamentos.get(id);
    return atual?.partidaId === partidaId ? atual : this.novo(id, partidaId);
  }

  private novo(id: string, partidaId: string): Andamento {
    this.esquecer(id);
    const andamento: Andamento = { partidaId, prontos: new Set(), transmitido: '' };
    this.andamentos.set(id, andamento);
    return andamento;
  }

  private cancelar(andamento: Andamento): void {
    if (andamento.timer) clearTimeout(andamento.timer);
    delete andamento.timer;
    delete andamento.comecaEm;
  }

  private esquecer(id: string): void {
    const andamento = this.andamentos.get(id);
    if (andamento) this.cancelar(andamento);
    this.andamentos.delete(id);
  }

  private limparRemovidas(): void {
    for (const id of [...this.andamentos.keys()]) if (!this.store.get(id)) this.esquecer(id);
  }
}
