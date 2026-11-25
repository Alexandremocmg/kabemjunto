/**
 * Mantém a partida andando quando alguém cai ou fica parado.
 *
 * - **Queda:** se uma pessoa fica sem conexão além da tolerância, um bot passa a
 *   jogar pelo assento até ela voltar.
 * - **Prazo da vez:** quando o prazo que o `RoomStore` gravou em `estado.turno`
 *   acaba, um bot joga só aquela vez.
 *
 * Como o `QuickPlayDirector`, é um observador do `RoomStore`: aqui só há
 * timers, e quem joga as vezes seguintes dos assentos assumidos é o próprio
 * `QuickPlayDirector` (um único lugar que joga por bots, sem eventos dobrados).
 * Sem nenhuma pessoa conectada na sala tudo fica parado.
 */
import { DISCONNECT_GRACE_PADRAO_MS } from './config.js';
import { broadcastState, maybeOpenInterceptionWindow, sendPrivateHands } from './room-broadcast.js';
import {
  humanPlayers,
  jogaComoBot,
  toPublicState,
  type RoomSession,
  type RoomStore,
  type VezEsperada,
} from './room-store.js';
import type { GameServer } from './socket-types.js';

export interface ResilienciaOptions {
  /** Quanto esperar por quem caiu antes de um bot jogar por ele; 0 desliga. */
  disconnectGraceMs?: number;
}

/** Espera antes de tentar de novo quando gravar falha (ex.: disco cheio). */
const NOVA_TENTATIVA_MS = 5_000;

type Cronometro = ReturnType<typeof setTimeout>;

interface Prazo extends VezEsperada {
  timer: Cronometro;
  expiraEm: number;
}

interface Ausencia {
  timer: Cronometro;
  partidaId: string;
}

export class ResilienciaDirector {
  /** Prazo da vez, por sala. */
  private readonly prazos = new Map<string, Prazo>();
  /** Tolerância de quem caiu, por sala e jogador. */
  private readonly ausencias = new Map<string, Map<string, Ausencia>>();
  private readonly tolerancia: number;
  private pararDeObservar: (() => void) | undefined;

  constructor(
    private readonly io: GameServer,
    private readonly store: RoomStore,
    opcoes: ResilienciaOptions = {},
  ) {
    this.tolerancia = opcoes.disconnectGraceMs ?? DISCONNECT_GRACE_PADRAO_MS;
  }

  /** Passa a observar o store e reavalia as salas que já existiam. */
  start(): void {
    this.pararDeObservar?.();
    this.pararDeObservar = this.store.addCommitObserver((session) => this.aoMudar(session));
    for (const session of this.store.sessions()) this.aoMudar(session);
  }

  /** Cancela todos os timers e para de observar (usado nos testes). */
  stop(): void {
    this.pararDeObservar?.();
    this.pararDeObservar = undefined;
    for (const { timer } of this.prazos.values()) clearTimeout(timer);
    for (const daSala of this.ausencias.values()) {
      for (const { timer } of daSala.values()) clearTimeout(timer);
    }
    this.prazos.clear();
    this.ausencias.clear();
  }

  private aoMudar(session: RoomSession): void {
    this.reavaliarPrazo(session);
    this.reavaliarAusencias(session);
  }

  // ─── Prazo da vez ───────────────────────────────────────────────────────────

  private reavaliarPrazo({ sala, estado }: RoomSession): void {
    const turno = estado?.turno;
    const atual = this.prazos.get(sala.id);
    if (!estado || !turno) {
      if (atual) clearTimeout(atual.timer);
      this.prazos.delete(sala.id);
      return;
    }
    if (
      atual &&
      atual.partidaId === estado.partidaId &&
      atual.jogadorId === turno.jogadorId &&
      atual.revisao === turno.revisao &&
      atual.expiraEm === turno.expiraEm
    ) {
      return;
    }
    this.armarPrazo(
      sala.id,
      { partidaId: estado.partidaId, jogadorId: turno.jogadorId, revisao: turno.revisao },
      turno.expiraEm,
      turno.expiraEm - Date.now(),
    );
  }

  private armarPrazo(id: string, vez: VezEsperada, expiraEm: number, emMs: number): void {
    const anterior = this.prazos.get(id);
    if (anterior) clearTimeout(anterior.timer);
    const timer = setTimeout(() => this.estourar(id, vez, expiraEm), Math.max(0, emMs));
    timer.unref?.();
    this.prazos.set(id, { ...vez, timer, expiraEm });
  }

  private estourar(id: string, vez: VezEsperada, expiraEm: number): void {
    this.prazos.delete(id);
    let resultado;
    try {
      // O store confere partida, vez e revisão: um prazo antigo não faz nada.
      resultado = this.store.expirarVez(id, vez);
    } catch {
      this.armarPrazo(id, vez, expiraEm, NOVA_TENTATIVA_MS);
      return;
    }
    if (!resultado) return;
    broadcastState(this.io, id, { estado: toPublicState(resultado.session.estado!) });
    sendPrivateHands(this.io, resultado.session);
    if (resultado.acao === 'JOGOU') {
      maybeOpenInterceptionWindow(this.io, this.store, id, resultado.botId);
    }
  }

  // ─── Quedas ─────────────────────────────────────────────────────────────────

  private reavaliarAusencias(session: RoomSession): void {
    const { sala, estado } = session;
    const alguemConectado = humanPlayers(session).some((jogador) => jogador.conectado);
    // A tolerância só corre se há alguém esperando: se a mesa inteira cair, para tudo.
    const ausentes =
      estado && !estado.finalizada && alguemConectado && this.tolerancia > 0
        ? estado.jogadores.filter((jogador) => !jogador.conectado && !jogaComoBot(jogador))
        : [];
    const idsAusentes = new Set(ausentes.map((jogador) => jogador.id));
    const partidaId = estado?.partidaId;

    const daSala = this.ausencias.get(sala.id) ?? new Map<string, Ausencia>();
    for (const [jogadorId, ausencia] of daSala) {
      if (idsAusentes.has(jogadorId) && ausencia.partidaId === partidaId) continue;
      clearTimeout(ausencia.timer);
      daSala.delete(jogadorId);
    }
    if (partidaId !== undefined) {
      for (const jogadorId of idsAusentes) {
        if (!daSala.has(jogadorId)) {
          this.armarAusencia(sala.id, daSala, partidaId, jogadorId, this.tolerancia);
        }
      }
    }
    if (daSala.size > 0) this.ausencias.set(sala.id, daSala);
    else this.ausencias.delete(sala.id);
  }

  private armarAusencia(
    id: string,
    daSala: Map<string, Ausencia>,
    partidaId: string,
    jogadorId: string,
    emMs: number,
  ): void {
    const timer = setTimeout(() => {
      daSala.delete(jogadorId);
      if (daSala.size === 0) this.ausencias.delete(id);
      this.assumir(id, partidaId, jogadorId);
    }, emMs);
    timer.unref?.();
    daSala.set(jogadorId, { timer, partidaId });
  }

  private assumir(id: string, partidaId: string, jogadorId: string): void {
    let session: RoomSession | undefined;
    try {
      session = this.store.assumirAssentoDesconectado(id, partidaId, jogadorId);
    } catch {
      const daSala = this.ausencias.get(id) ?? new Map<string, Ausencia>();
      this.ausencias.set(id, daSala);
      this.armarAusencia(id, daSala, partidaId, jogadorId, NOVA_TENTATIVA_MS);
      return;
    }
    if (session?.estado) broadcastState(this.io, id, { estado: toPublicState(session.estado) });
  }
}
