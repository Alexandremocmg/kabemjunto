/**
 * Mantém a partida andando quando alguém cai ou fica parado.
 *
 * - **Queda:** se uma pessoa fica sem conexão além da tolerância, um bot passa a
 *   jogar pelo assento até ela voltar.
 * - **Cair e voltar em ciclo:** o tempo fora se acumula dentro da mesma vez, então
 *   reconectar não renova a tolerância.
 * - **Sala manual vazia:** partida sem ninguém conectado é encerrada depois de um
 *   tempo (na hora, se não sobrou nenhuma pessoa); na espera ou terminada, a sala some.
 * - **Prazo da vez:** quando o prazo que o `RoomStore` gravou em `estado.turno`
 *   acaba, um bot joga só aquela vez.
 *
 * Como o `QuickPlayDirector`, é um observador do `RoomStore`: aqui só há
 * timers, e quem joga as vezes seguintes dos assentos assumidos é o próprio
 * `QuickPlayDirector` (um único lugar que joga por bots, sem eventos dobrados).
 * Sem nenhuma pessoa conectada na sala tudo fica parado.
 */
import { DISCONNECT_GRACE_PADRAO_MS } from './config.js';
import { maybeOpenInterceptionWindow, transmitirPartida } from './room-broadcast.js';
import {
  humanPlayers,
  jogaComoBot,
  type RoomSession,
  type RoomStore,
  type VezEsperada,
} from './room-store.js';
import type { GameServer } from './socket-types.js';

export interface ResilienciaOptions {
  /** Quanto esperar por quem caiu antes de um bot jogar por ele; 0 desliga. */
  disconnectGraceMs?: number;
  /** Quanto uma sala manual fica sem ninguém conectado até ser encerrada (ou apagada). */
  salaVaziaMs?: number;
}

/** Tempo até encerrar a partida (e depois apagar a sala) sem ninguém conectado. */
const SALA_VAZIA_PADRAO_MS = 30 * 60_000;
/** Sala terminada para a qual ninguém mais pode voltar. */
const SALA_SEM_VOLTA_MS = 60_000;

/** Espera antes de tentar de novo quando gravar falha (ex.: disco cheio). */
const NOVA_TENTATIVA_MS = 5_000;

type Cronometro = ReturnType<typeof setTimeout>;

interface Prazo extends VezEsperada {
  timer: Cronometro;
  expiraEm: number;
}

/** Tempo que o dono da vez passou fora, somado dentro da mesma vez. */
interface Fora {
  revisao: number;
  acumuladoMs: number;
  desde?: number;
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
  private readonly fora = new Map<string, Fora>();
  /** Salas manuais sem ninguém conectado. */
  private readonly vazias = new Map<string, { timer: Cronometro; chave: string }>();
  private readonly salaVazia: number;
  private readonly tolerancia: number;
  private pararDeObservar: (() => void) | undefined;
  private pararDeObservarRemocoes: (() => void) | undefined;

  constructor(
    private readonly io: GameServer,
    private readonly store: RoomStore,
    opcoes: ResilienciaOptions = {},
  ) {
    this.tolerancia = opcoes.disconnectGraceMs ?? DISCONNECT_GRACE_PADRAO_MS;
    this.salaVazia = opcoes.salaVaziaMs ?? SALA_VAZIA_PADRAO_MS;
  }

  /** Passa a observar o store e reavalia as salas que já existiam. */
  start(): void {
    this.pararDeObservar?.();
    this.pararDeObservarRemocoes?.();
    this.pararDeObservarRemocoes = this.store.addRemoveObserver((id) => this.esquecer(id));
    this.pararDeObservar = this.store.addCommitObserver((session) => this.aoMudar(session));
    for (const session of this.store.sessions()) this.aoMudar(session);
  }

  /** Cancela todos os timers e para de observar (usado nos testes). */
  stop(): void {
    this.pararDeObservar?.();
    this.pararDeObservar = undefined;
    this.pararDeObservarRemocoes?.();
    this.pararDeObservarRemocoes = undefined;
    for (const { timer } of this.prazos.values()) clearTimeout(timer);
    for (const daSala of this.ausencias.values()) {
      for (const { timer } of daSala.values()) clearTimeout(timer);
    }
    for (const { timer } of this.vazias.values()) clearTimeout(timer);
    this.prazos.clear();
    this.ausencias.clear();
    this.fora.clear();
    this.vazias.clear();
  }

  /** A sala foi apagada: nenhum timer dela pode sobrar. */
  private esquecer(id: string): void {
    const prazo = this.prazos.get(id);
    if (prazo) clearTimeout(prazo.timer);
    this.prazos.delete(id);
    for (const { timer } of this.ausencias.get(id)?.values() ?? []) clearTimeout(timer);
    this.ausencias.delete(id);
    this.fora.delete(id);
    this.cancelarVazia(id);
  }

  private aoMudar(session: RoomSession): void {
    this.reavaliarPrazo(session);
    this.reavaliarAusencias(session);
    this.reavaliarVazia(session);
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
    transmitirPartida(this.io, resultado.session, { maos: true });
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

    const tolerancia = this.toleranciaDe(sala.id, idsAusentes);
    const daSala = this.ausencias.get(sala.id) ?? new Map<string, Ausencia>();
    for (const [jogadorId, ausencia] of daSala) {
      if (idsAusentes.has(jogadorId) && ausencia.partidaId === partidaId) continue;
      clearTimeout(ausencia.timer);
      daSala.delete(jogadorId);
    }
    if (partidaId !== undefined) {
      for (const jogadorId of idsAusentes) {
        if (!daSala.has(jogadorId)) {
          this.armarAusencia(sala.id, daSala, partidaId, jogadorId, tolerancia(jogadorId));
        }
      }
    }
    if (daSala.size > 0) this.ausencias.set(sala.id, daSala);
    else this.ausencias.delete(sala.id);
  }

  /**
   * Atualiza o tempo fora do dono da vez e diz quanto ainda esperar por quem caiu
   * agora. Só para o dono da vez: fora dela, cair não prende a mesa.
   */
  private toleranciaDe(id: string, ausentes: ReadonlySet<string>): (jogadorId: string) => number {
    const vez = this.store.vezAtual(id);
    if (!vez) {
      this.fora.delete(id);
      return () => this.tolerancia;
    }
    const agora = Date.now();
    let fora = this.fora.get(id);
    if (fora?.revisao !== vez.revisao) {
      fora = { revisao: vez.revisao, acumuladoMs: 0 };
      this.fora.set(id, fora);
    }
    if (ausentes.has(vez.jogadorId)) fora.desde ??= agora;
    else if (fora.desde !== undefined) {
      fora.acumuladoMs += agora - fora.desde;
      delete fora.desde;
    }
    const restante = Math.max(0, this.tolerancia - fora.acumuladoMs);
    return (jogadorId) => (jogadorId === vez.jogadorId ? restante : this.tolerancia);
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
    if (session) transmitirPartida(this.io, session);
  }

  // ─── Salas manuais sem ninguém ──────────────────────────────────────────────

  private reavaliarVazia(session: RoomSession): void {
    const { sala, estado } = session;
    const pessoas = humanPlayers(session);
    // Quem saiu de vez não tem mais socket nem credencial, mesmo que conste na sala.
    const presente = pessoas.some((p) => p.conectado && session.socketByPlayer.has(p.id));
    // As salas rápidas têm a própria limpeza (QuickPlayDirector).
    if (sala.rapida || presente) {
      this.cancelarVazia(sala.id);
      return;
    }
    const chave = this.chaveVazia(session);
    if (this.vazias.get(sala.id)?.chave === chave) return;
    const alguemPodeVoltar = pessoas.some((p) => session.resumeTokenHashByPlayer.has(p.id));
    const emMs = alguemPodeVoltar ? this.salaVazia : estado?.finalizada ? SALA_SEM_VOLTA_MS : 0;
    this.armarVazia(sala.id, chave, emMs);
  }

  private armarVazia(id: string, chave: string, emMs: number): void {
    this.cancelarVazia(id);
    const timer = setTimeout(() => this.encerrarVazia(id, chave), emMs);
    timer.unref?.();
    this.vazias.set(id, { timer, chave });
  }

  private encerrarVazia(id: string, chave: string): void {
    this.vazias.delete(id);
    const session = this.store.get(id);
    if (!session || this.chaveVazia(session) !== chave) return;
    const { estado } = session;
    try {
      // Encerrar reavalia a sala, que então espera de novo antes de ser apagada.
      if (!estado || estado.finalizada) this.store.removeRoom(id);
      else this.store.encerrarSemHumanos(id, estado.partidaId);
    } catch {
      this.armarVazia(id, chave, NOVA_TENTATIVA_MS);
    }
  }

  private chaveVazia({ estado }: RoomSession): string {
    return estado ? `${estado.partidaId}:${estado.finalizada}` : 'AGUARDANDO';
  }

  private cancelarVazia(id: string): void {
    const atual = this.vazias.get(id);
    if (atual) clearTimeout(atual.timer);
    this.vazias.delete(id);
  }
}
