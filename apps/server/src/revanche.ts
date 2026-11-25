/**
 * Fim de partida e revanche.
 *
 * - **Fim:** na primeira gravação com a partida terminada, por qualquer caminho,
 *   transmite `server:partida:encerrada` uma única vez.
 * - **Revanche:** começa na hora se todas as pessoas conectadas aceitaram; senão,
 *   depois da espera (contada do primeiro pedido) com quem aceitou. Quem sai perde
 *   o aceite; quem cai deixa de contar enquanto está fora, mas volta pronto se
 *   voltar antes do fim da espera. As outras vagas viram bots.
 *
 * Como os outros diretores, observa o `RoomStore`. A contagem vive só em memória:
 * reiniciar o servidor derruba todo mundo, então não há o que retomar.
 */
import type { JogadorId, ServerRevancheAtualizadaEvent } from '@kabemjunto/shared';
import { REVANCHE_WAIT_PADRAO_MS } from './config.js';
import { transmitirPartida } from './room-broadcast.js';
import {
  humanPlayers,
  partidaEncerrada,
  possiveisNaRevanche,
  RoomError,
  type RoomSession,
  type RoomStore,
} from './room-store.js';
import type { GameServer, GameSocket } from './socket-types.js';

export interface RevancheOptions {
  /** Quanto esperar, desde o primeiro pedido, por quem ainda não aceitou. */
  esperaMs?: number;
  /** Tempo extra quando alguém acabou de cair e os demais já aceitaram. */
  toleranciaQuedaMs?: number;
}

/** Espera antes de tentar de novo quando gravar falha (ex.: disco cheio). */
const NOVA_TENTATIVA_MS = 5_000;
/** Quem caiu agora (ex.: recarregou a página) ganha este tempo antes de perder a vaga. */
const TOLERANCIA_QUEDA_MS = 5_000;

interface Andamento {
  partidaId: string;
  /** Quem aceitou, inclusive quem caiu depois: só conta quem está conectado. */
  prontos: Set<JogadorId>;
  /** Último conjunto transmitido, para só avisar quando algo muda. */
  transmitido: string;
  comecaEm?: number;
  /** Fim da espera contada do primeiro pedido; até lá vale o aceite de quem caiu. */
  limite?: number;
  timer?: ReturnType<typeof setTimeout>;
}

export class RevancheDirector {
  private readonly andamentos = new Map<string, Andamento>();
  /** Quando cada pessoa que está fora caiu, por sala. */
  private readonly quedas = new Map<string, Map<JogadorId, number>>();
  private readonly espera: number;
  private readonly toleranciaQueda: number;
  private pararDeObservar: (() => void) | undefined;
  private pararDeObservarRemocoes: (() => void) | undefined;

  constructor(
    private readonly io: GameServer,
    private readonly store: RoomStore,
    opcoes: RevancheOptions = {},
  ) {
    this.espera = opcoes.esperaMs ?? REVANCHE_WAIT_PADRAO_MS;
    this.toleranciaQueda = opcoes.toleranciaQuedaMs ?? TOLERANCIA_QUEDA_MS;
  }

  start(): void {
    this.pararDeObservar?.();
    this.pararDeObservarRemocoes?.();
    this.pararDeObservarRemocoes = this.store.addRemoveObserver((id) => {
      this.esquecer(id);
      this.quedas.delete(id);
    });
    // O que já tinha terminado antes de ligar não é transmitido de novo.
    for (const session of this.store.sessions()) {
      // Nem quem já estava fora conta como queda recente.
      this.anotarQuedas(session, Number.NEGATIVE_INFINITY);
      if (session.estado?.finalizada) this.novo(session.sala.id, session.estado.partidaId);
    }
    this.pararDeObservar = this.store.addCommitObserver((session) => this.aoMudar(session));
  }

  /** Cancela os timers e para de observar (usado nos testes). */
  stop(): void {
    this.pararDeObservar?.();
    this.pararDeObservar = undefined;
    this.pararDeObservarRemocoes?.();
    this.pararDeObservarRemocoes = undefined;
    for (const id of [...this.andamentos.keys()]) this.esquecer(id);
    this.quedas.clear();
  }

  /** Há uma contagem correndo nesta sala? */
  pendente(salaId: string): boolean {
    return this.andamentos.get(salaId)?.comecaEm !== undefined;
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
    socket.emit(
      'server:partida:encerrada',
      this.store.fimPara(session, socket.data.jogadorId ?? '', fim),
    );
    socket.emit('server:revanche:atualizada', this.evento(session, this.andamento(session)));
  }

  private aoMudar(session: RoomSession): void {
    const { sala, estado } = session;
    this.anotarQuedas(session, Date.now());
    if (!estado?.finalizada) {
      this.esquecer(sala.id);
      return;
    }
    if (this.andamentos.get(sala.id)?.partidaId !== estado.partidaId) {
      this.novo(sala.id, estado.partidaId);
      const fim = partidaEncerrada(session)!;
      if (session.ranking) {
        for (const [jogadorId, socketId] of session.socketByPlayer) {
          this.io.sockets.sockets
            .get(socketId)
            ?.emit('server:partida:encerrada', this.store.fimPara(session, jogadorId, fim));
        }
      } else {
        this.io.to(sala.id).emit('server:partida:encerrada', fim);
      }
    }
    this.reavaliar(session);
  }

  /** Transmite o que mudou e decide se a revanche começa, espera ou é cancelada. */
  private reavaliar(session: RoomSession): void {
    const id = session.sala.id;
    const andamento = this.andamento(session);
    const agora = Date.now();
    const pessoas = new Set(humanPlayers(session).map((jogador) => jogador.id));
    for (const pronto of andamento.prontos) {
      if (!pessoas.has(pronto)) andamento.prontos.delete(pronto);
    }
    if (andamento.limite !== undefined && agora >= andamento.limite) {
      this.esquecerAusentes(session, andamento);
    }

    const possiveis = possiveisNaRevanche(session);
    const presentes = possiveis.filter((pronto) => andamento.prontos.has(pronto)).length;
    if (andamento.prontos.size === 0) this.cancelar(andamento);
    else {
      andamento.limite ??= agora + this.espera;
      const { limite } = andamento;
      if (presentes === 0) {
        // Só há aceites de quem caiu: não há contagem, apenas a validade deles.
        delete andamento.comecaEm;
        this.agendar(id, andamento, limite - agora);
      } else {
        let alvo = limite;
        if (presentes === possiveis.length) {
          // Quem acabou de cair (ex.: recarregou a página) ganha um tempo para voltar.
          const ultima = Math.max(...(this.quedas.get(id)?.values() ?? []));
          alvo = Math.min(limite, Math.max(agora, ultima + this.toleranciaQueda));
        }
        const atual = andamento.comecaEm;
        // Passado o limite, só há uma nova tentativa de gravar: ela não é mexida.
        if (atual === undefined || (atual !== alvo && atual <= limite)) {
          andamento.comecaEm = alvo;
          this.agendar(id, andamento, alvo - agora);
        }
      }
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
      ...(andamento.comecaEm !== undefined && possiveis.some((id) => andamento.prontos.has(id))
        ? { restanteMs: Math.max(0, andamento.comecaEm - Date.now()) }
        : {}),
    };
  }

  /** Nunca começa dentro da gravação que disparou a reavaliação: sempre por timer. */
  private agendar(id: string, andamento: Andamento, emMs: number): void {
    if (andamento.timer) clearTimeout(andamento.timer);
    andamento.timer = setTimeout(() => this.comecar(id, andamento), Math.max(0, emMs));
    andamento.timer.unref?.();
  }

  /** Marca quem está fora (`em` vale para quem ainda não estava) e esquece quem voltou. */
  private anotarQuedas(session: RoomSession, em: number): void {
    const antes = this.quedas.get(session.sala.id);
    const agora = new Map<JogadorId, number>();
    for (const { id, conectado } of humanPlayers(session)) {
      if (!conectado) agora.set(id, antes?.get(id) ?? em);
    }
    if (agora.size > 0) this.quedas.set(session.sala.id, agora);
    else this.quedas.delete(session.sala.id);
  }

  /** O limite passou: quem aceitou e continua fora perde o aceite. */
  private esquecerAusentes(session: RoomSession, andamento: Andamento): void {
    const possiveis = possiveisNaRevanche(session);
    for (const pronto of andamento.prontos) {
      if (!possiveis.includes(pronto)) andamento.prontos.delete(pronto);
    }
  }

  private comecar(id: string, andamento: Andamento): void {
    if (this.andamentos.get(id) !== andamento) return;
    const antes = this.store.get(id);
    if (!antes) {
      this.esquecer(id);
      return;
    }
    const presentes = possiveisNaRevanche(antes).filter((pronto) => andamento.prontos.has(pronto));
    if (presentes.length === 0) {
      // Ninguém pronto está aqui: se o limite venceu, volta ao começo.
      delete andamento.timer;
      this.reavaliar(antes);
      return;
    }
    let session: RoomSession;
    try {
      session = this.store.startRematch(id, andamento.partidaId, andamento.prontos);
    } catch {
      if (this.andamentos.get(id) === andamento) {
        andamento.comecaEm = Date.now() + NOVA_TENTATIVA_MS;
        this.agendar(id, andamento, NOVA_TENTATIVA_MS);
        this.io.to(id).emit('server:revanche:atualizada', this.evento(antes, andamento));
      }
      return;
    }
    this.retirarQuemFicouFora(session);
    transmitirPartida(this.io, session, { sala: true, maos: true });
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
    delete andamento.limite;
  }

  private esquecer(id: string): void {
    const andamento = this.andamentos.get(id);
    if (andamento) this.cancelar(andamento);
    this.andamentos.delete(id);
  }
}
