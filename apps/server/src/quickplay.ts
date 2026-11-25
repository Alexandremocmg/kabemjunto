/**
 * "Jogar agora": cuida do que acontece com uma sala rápida ao longo do tempo.
 *
 * - **Espera:** a sala fica aberta até `iniciaEm` (ou até a mesa encher de
 *   pessoas). Passado o prazo, completa a mesa com bots e começa a partida.
 * - **Bots:** depois que a partida começa, joga a vez de cada bot pelo motor
 *   compartilhado (`executarTurnoBot`), depois de uma pausa curta para a mesa
 *   não parecer instantânea. Vale para qualquer sala, e também para assentos em
 *   que um bot assumiu no lugar de alguém que saiu, caiu ou ficou inativo. Sem
 *   nenhuma pessoa conectada os bots param.
 * - **Limpeza:** sala terminada, ou sem ninguém conectado, sai da memória
 *   depois de um tempo de tolerância (reconexões rápidas não perdem a vaga). Com
 *   a partida terminada e gente conectada, espera mais, para dar tempo à revanche.
 *
 * É um observador do `RoomStore`: reage a cada estado gravado, então qualquer
 * caminho que muda a sala (jogada, compra, janela de Corta-Frente que expira,
 * reconexão) já reavalia o que falta fazer, sem lógica duplicada.
 */
import type { GameServer } from './socket-types.js';
import { maybeOpenInterceptionWindow, transmitirPartida } from './room-broadcast.js';
import {
  humanPlayers,
  jogaComoBot,
  possiveisNaRevanche,
  type RoomSession,
  type RoomStore,
} from './room-store.js';

export interface QuickPlayOptions {
  /** Pausa, em ms, antes de cada jogada de bot (sorteada entre `min` e `max`). */
  botDelayMs?: { min: number; max: number };
  /** Quanto uma sala terminada ou sem ninguém conectado demora para sair da memória. */
  graceMs?: number;
  /** Teto, desde o fim, de uma sala terminada em que ainda há gente conectada. */
  tetoTerminadaMs?: number;
  /** Há uma contagem de revanche correndo nesta sala? Se sim, a limpeza espera por ela. */
  revanchePendente?: (salaId: string) => boolean;
}

const BOT_PAUSA_PADRAO = { min: 900, max: 1700 };
const LIMPEZA_PADRAO_MS = 60_000;
const TETO_TERMINADA_PADRAO_MS = 5 * 60_000;
/** Espera antes de tentar de novo quando gravar falha (ex.: disco cheio). */
const NOVA_TENTATIVA_MS = 5_000;

type Cronometro = ReturnType<typeof setTimeout>;

export class QuickPlayDirector {
  private readonly esperas = new Map<string, Cronometro>();
  private readonly bots = new Map<
    string,
    { timer: Cronometro; botId: string; partidaId: string }
  >();
  private readonly limpezas = new Map<string, { timer: Cronometro; comGente: boolean }>();
  /** Quando esta partida terminou (visto por este processo). */
  private readonly fins = new Map<string, { partidaId: string; em: number }>();
  private readonly pausaDoBot: { min: number; max: number };
  private readonly tolerancia: number;
  private readonly tetoTerminada: number;
  private pararDeObservar: (() => void) | undefined;
  private pararDeObservarRemocoes: (() => void) | undefined;

  constructor(
    private readonly io: GameServer,
    private readonly store: RoomStore,
    private readonly opcoes: QuickPlayOptions = {},
  ) {
    this.pausaDoBot = opcoes.botDelayMs ?? BOT_PAUSA_PADRAO;
    this.tolerancia = opcoes.graceMs ?? LIMPEZA_PADRAO_MS;
    this.tetoTerminada = opcoes.tetoTerminadaMs ?? TETO_TERMINADA_PADRAO_MS;
  }

  /** Passa a observar o store e reavalia as salas que já existiam (ex.: depois de reiniciar). */
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
    for (const timer of this.esperas.values()) clearTimeout(timer);
    for (const { timer } of this.bots.values()) clearTimeout(timer);
    for (const { timer } of this.limpezas.values()) clearTimeout(timer);
    this.esperas.clear();
    this.bots.clear();
    this.limpezas.clear();
    this.fins.clear();
  }

  private aoMudar(session: RoomSession): void {
    const { sala, estado } = session;
    const id = sala.id;
    const temBots = (estado?.jogadores ?? []).some(jogaComoBot);
    const rapida = sala.rapida !== undefined;
    const humanosConectados = humanPlayers(session).some((jogador) => jogador.conectado);

    // Só salas rápidas têm limpeza automática; as criadas à mão seguem como sempre.
    if (rapida && (!humanosConectados || estado?.finalizada || sala.status === 'FINALIZADA')) {
      this.cancelarEspera(id);
      this.cancelarBot(id);
      this.agendarLimpeza(session);
      return;
    }
    this.cancelarLimpeza(id);
    this.fins.delete(id);

    // 1. Esperando gente.
    if (sala.rapida && sala.status === 'AGUARDANDO') {
      const mesaCheia = humanPlayers(session).length >= sala.rapida.tamanhoAlvo;
      this.agendarInicio(id, mesaCheia ? 0 : sala.rapida.iniciaEm - Date.now());
      return;
    }
    this.cancelarEspera(id);

    // 2. Partida com bots.
    if (!estado || estado.finalizada || !temBots || !humanosConectados) {
      this.cancelarBot(id);
      return;
    }
    // Janela de Corta-Frente aberta: a vez só anda quando ela resolver (o commit
    // da expiração chama esta função de novo).
    if (estado.interceptacao) return;
    const daVez = estado.jogadores.find((jogador) => jogador.id === estado.vezDe);
    if (daVez && jogaComoBot(daVez)) this.agendarBot(id, estado.partidaId, daVez.id);
    else this.cancelarBot(id);
  }

  // ─── Espera e início ────────────────────────────────────────────────────────

  private agendarInicio(id: string, emMs: number): void {
    this.cancelarEspera(id);
    const timer = setTimeout(() => this.iniciar(id), Math.max(0, emMs));
    timer.unref?.();
    this.esperas.set(id, timer);
  }

  private iniciar(id: string): void {
    this.esperas.delete(id);
    const atual = this.store.get(id);
    if (!atual?.sala.rapida || atual.sala.status !== 'AGUARDANDO') return;
    let iniciada: RoomSession;
    try {
      iniciada = this.store.startWithBots(id);
    } catch {
      // Sem jogadores, a limpeza cuida da sala; com gente, foi a gravação que falhou.
      if (humanPlayers(atual).length > 0) this.agendarInicio(id, NOVA_TENTATIVA_MS);
      return;
    }
    transmitirPartida(this.io, iniciada, { sala: true, maos: true });
  }

  // ─── Vez dos bots ───────────────────────────────────────────────────────────

  private agendarBot(id: string, partidaId: string, botId: string, pausaMs?: number): void {
    const existente = this.bots.get(id);
    if (existente && existente.botId === botId && existente.partidaId === partidaId) return;
    this.cancelarBot(id);
    const { min, max } = this.pausaDoBot;
    const pausa = pausaMs ?? min + Math.random() * Math.max(0, max - min);
    const timer = setTimeout(() => this.jogarBot(id, botId), pausa);
    timer.unref?.();
    this.bots.set(id, { timer, botId, partidaId });
  }

  private jogarBot(id: string, botId: string): void {
    this.bots.delete(id);
    const atual = this.store.get(id);
    const estado = atual?.estado;
    if (!atual || !estado || estado.finalizada || estado.interceptacao) return;
    if (estado.vezDe !== botId) return; // o estado mudou enquanto esperava
    const assento = estado.jogadores.find((jogador) => jogador.id === botId);
    if (!assento || !jogaComoBot(assento)) return; // a pessoa voltou
    let resultado;
    try {
      resultado = this.store.playBotTurn(id);
    } catch {
      this.agendarBot(id, estado.partidaId, botId, NOVA_TENTATIVA_MS);
      return;
    }
    transmitirPartida(this.io, resultado.session, { maos: true });
    if (resultado.acao === 'JOGOU') {
      maybeOpenInterceptionWindow(this.io, this.store, id, resultado.botId);
    }
  }

  // ─── Limpeza ────────────────────────────────────────────────────────────────

  private agendarLimpeza(session: RoomSession): void {
    const id = session.sala.id;
    const comGente = possiveisNaRevanche(session).length > 0;
    if (this.limpezas.get(id)?.comGente === comGente) return;
    this.cancelarLimpeza(id);
    let emMs = this.tolerancia;
    if (session.estado?.finalizada) {
      // O teto conta do fim da partida: cair e voltar não o renova.
      const { partidaId } = session.estado;
      const conhecido = this.fins.get(id);
      const fim = conhecido?.partidaId === partidaId ? conhecido : { partidaId, em: Date.now() };
      this.fins.set(id, fim);
      const resta = Math.max(0, fim.em + this.tetoTerminada - Date.now());
      emMs = comGente ? resta : Math.min(this.tolerancia, resta);
    }
    this.armarLimpeza(id, comGente, emMs);
  }

  private armarLimpeza(id: string, comGente: boolean, emMs: number): void {
    const timer = setTimeout(() => this.limpar(id), emMs);
    timer.unref?.();
    this.limpezas.set(id, { timer, comGente });
  }

  private limpar(id: string): void {
    this.limpezas.delete(id);
    const atual = this.store.get(id);
    if (!atual?.sala.rapida) return;
    const semGente = !humanPlayers(atual).some((jogador) => jogador.conectado);
    if (!semGente && !atual.estado?.finalizada && atual.sala.status !== 'FINALIZADA') return;
    if (!semGente && this.opcoes.revanchePendente?.(id)) {
      this.armarLimpeza(id, true, NOVA_TENTATIVA_MS);
      return;
    }
    try {
      this.store.removeRoom(id);
    } catch {
      this.armarLimpeza(id, !semGente, NOVA_TENTATIVA_MS);
      return;
    }
    this.io.in(id).socketsLeave(id);
  }

  private esquecer(id: string): void {
    this.cancelarEspera(id);
    this.cancelarBot(id);
    this.cancelarLimpeza(id);
    this.fins.delete(id);
  }

  private cancelarEspera(id: string): void {
    const timer = this.esperas.get(id);
    if (timer) clearTimeout(timer);
    this.esperas.delete(id);
  }

  private cancelarBot(id: string): void {
    const atual = this.bots.get(id);
    if (atual) clearTimeout(atual.timer);
    this.bots.delete(id);
  }

  private cancelarLimpeza(id: string): void {
    const atual = this.limpezas.get(id);
    if (atual) clearTimeout(atual.timer);
    this.limpezas.delete(id);
  }
}
