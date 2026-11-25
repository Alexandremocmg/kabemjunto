/**
 * "Jogar agora": cuida do que acontece com uma sala rápida ao longo do tempo.
 *
 * - **Espera:** a sala fica aberta até `iniciaEm` (ou até a mesa encher de
 *   pessoas). Passado o prazo, completa a mesa com bots e começa a partida.
 * - **Bots:** depois que a partida começa, joga a vez de cada bot pelo motor
 *   compartilhado (`executarTurnoBot`), depois de uma pausa curta para a mesa
 *   não parecer instantânea.
 * - **Limpeza:** sala terminada, ou sem ninguém conectado, sai da memória
 *   depois de um tempo de tolerância (reconexões rápidas não perdem a vaga).
 *
 * É um observador do `RoomStore`: reage a cada estado gravado, então qualquer
 * caminho que muda a sala (jogada, compra, janela de Corta-Frente que expira,
 * reconexão) já reavalia o que falta fazer, sem lógica duplicada.
 */
import type { GameServer } from './socket-types.js';
import {
  broadcastState,
  maybeOpenInterceptionWindow,
  salaAtualizada,
  sendPrivateHands,
} from './room-broadcast.js';
import { humanPlayers, toPublicState, type RoomSession, type RoomStore } from './room-store.js';

export interface QuickPlayOptions {
  /** Pausa, em ms, antes de cada jogada de bot (sorteada entre `min` e `max`). */
  botDelayMs?: { min: number; max: number };
  /** Quanto uma sala terminada ou sem ninguém conectado demora para sair da memória. */
  graceMs?: number;
}

const BOT_PAUSA_PADRAO = { min: 900, max: 1700 };
const LIMPEZA_PADRAO_MS = 60_000;

type Cronometro = ReturnType<typeof setTimeout>;

export class QuickPlayDirector {
  private readonly esperas = new Map<string, Cronometro>();
  private readonly bots = new Map<
    string,
    { timer: Cronometro; botId: string; partidaId: string }
  >();
  private readonly limpezas = new Map<string, Cronometro>();
  private readonly pausaDoBot: { min: number; max: number };
  private readonly tolerancia: number;

  constructor(
    private readonly io: GameServer,
    private readonly store: RoomStore,
    opcoes: QuickPlayOptions = {},
  ) {
    this.pausaDoBot = opcoes.botDelayMs ?? BOT_PAUSA_PADRAO;
    this.tolerancia = opcoes.graceMs ?? LIMPEZA_PADRAO_MS;
  }

  /** Passa a observar o store e reavalia as salas que já existiam (ex.: depois de reiniciar). */
  start(): void {
    this.store.setCommitHandler((session) => this.aoMudar(session));
    for (const session of this.store.sessions()) this.aoMudar(session);
  }

  /** Cancela todos os timers e para de observar (usado nos testes). */
  stop(): void {
    this.store.setCommitHandler(undefined);
    for (const timer of this.esperas.values()) clearTimeout(timer);
    for (const { timer } of this.bots.values()) clearTimeout(timer);
    for (const timer of this.limpezas.values()) clearTimeout(timer);
    this.esperas.clear();
    this.bots.clear();
    this.limpezas.clear();
  }

  private aoMudar(session: RoomSession): void {
    const { sala, estado } = session;
    const id = sala.id;
    const temBots = (estado?.jogadores ?? []).some((jogador) => jogador.isBot);
    const rapida = sala.rapida !== undefined;
    const humanosConectados = humanPlayers(session).some((jogador) => jogador.conectado);

    // Só salas rápidas têm limpeza automática; as criadas à mão seguem como sempre.
    if (rapida && (!humanosConectados || estado?.finalizada || sala.status === 'FINALIZADA')) {
      this.cancelarEspera(id);
      this.cancelarBot(id);
      this.agendarLimpeza(id);
      return;
    }
    this.cancelarLimpeza(id);

    // 1. Esperando gente.
    if (sala.rapida && sala.status === 'AGUARDANDO') {
      const mesaCheia = humanPlayers(session).length >= sala.rapida.tamanhoAlvo;
      this.agendarInicio(id, mesaCheia ? 0 : sala.rapida.iniciaEm - Date.now());
      return;
    }
    this.cancelarEspera(id);

    // 2. Partida com bots.
    if (!estado || estado.finalizada || !temBots) {
      this.cancelarBot(id);
      return;
    }
    // Janela de Corta-Frente aberta: a vez só anda quando ela resolver (o commit
    // da expiração chama esta função de novo).
    if (estado.interceptacao) return;
    const daVez = estado.jogadores.find((jogador) => jogador.id === estado.vezDe);
    if (daVez?.isBot) this.agendarBot(id, estado.partidaId, daVez.id);
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
      return; // sem jogadores: a limpeza cuida da sala
    }
    this.io.to(id).emit('server:sala:atualizada', salaAtualizada(iniciada));
    broadcastState(this.io, id, { estado: toPublicState(iniciada.estado!) });
    sendPrivateHands(this.io, iniciada);
  }

  // ─── Vez dos bots ───────────────────────────────────────────────────────────

  private agendarBot(id: string, partidaId: string, botId: string): void {
    const existente = this.bots.get(id);
    if (existente && existente.botId === botId && existente.partidaId === partidaId) return;
    this.cancelarBot(id);
    const { min, max } = this.pausaDoBot;
    const pausa = min + Math.random() * Math.max(0, max - min);
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
    let resultado;
    try {
      resultado = this.store.playBotTurn(id);
    } catch {
      return;
    }
    broadcastState(this.io, id, { estado: toPublicState(resultado.session.estado!) });
    sendPrivateHands(this.io, resultado.session);
    if (resultado.acao === 'JOGOU') {
      maybeOpenInterceptionWindow(this.io, this.store, id, resultado.botId);
    }
  }

  // ─── Limpeza ────────────────────────────────────────────────────────────────

  private agendarLimpeza(id: string): void {
    if (this.limpezas.has(id)) return;
    const timer = setTimeout(() => this.limpar(id), this.tolerancia);
    timer.unref?.();
    this.limpezas.set(id, timer);
  }

  private limpar(id: string): void {
    this.limpezas.delete(id);
    const atual = this.store.get(id);
    if (!atual?.sala.rapida) return;
    const semGente = !humanPlayers(atual).some((jogador) => jogador.conectado);
    if (!semGente && !atual.estado?.finalizada && atual.sala.status !== 'FINALIZADA') return;
    this.cancelarEspera(id);
    this.cancelarBot(id);
    this.store.removeRoom(id);
    this.io.in(id).socketsLeave(id);
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
    const timer = this.limpezas.get(id);
    if (timer) clearTimeout(timer);
    this.limpezas.delete(id);
  }
}
