import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  Constants,
  comprarCartas,
  criarPartidaInicial,
  escolherPremios,
  executarDescarteMultiplo,
  executarJogada,
  executarTurnoBot,
  penalizarQuebraSilencio,
  abrirJanelaInterceptacao,
  interceptar as interceptarPure,
  resolverJanelaExpirada,
  resumirPartida,
  isEligibleForInterception,
  saoCartasIdenticas,
  type Carta,
  type EstadoPartida,
  type EstadoPartidaPublico,
  type JogadorId,
  type JogadorPublico,
  type ModoJogo,
  type MotivoControleBot,
  type PlacarSessao,
  type PrazoTurno,
  type Sala,
  type SalaId,
  type SalaRapida,
  type ServerPartidaEncerradaEvent,
  type ServerSalaDisponivel,
  type VisibilidadeSala,
} from '@kabemjunto/shared';
import type { PersistedRoomSession, PlacarGravado, RoomPersistence } from './persistence.js';

/**
 * Duração da janela de Corta-Frente no servidor (autoridade). O cliente
 * (Local) usa sua própria constante para simular o timer — não precisa
 * bater exatamente, pois quem decide o resultado real é sempre o servidor.
 */
export const INTERCEPTION_WINDOW_MS = 5000;

/** Quanto a sala "Jogar agora" espera por outras pessoas antes de completar com bots. */
export const QUICK_PLAY_WAIT_MS = 10_000;

/** Salas que começam em menos que isso não aceitam mais gente (a pessoa esperaria à toa). */
const QUICK_PLAY_JOIN_MARGIN_MS = 2_000;

/** Quem reconecta na própria vez recebe ao menos isto, mesmo se o prazo já tinha acabado. */
const TURNO_MINIMO_AO_VOLTAR_MS = 5_000;

/** Estouros seguidos do limite por vez até um bot jogar pela pessoa. */
export const ESTOUROS_ATE_INATIVO = 2;

const CODIGO_ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface RoomSession {
  sala: Sala;
  estado?: EstadoPartida;
  /** Mapeia `jogadorId` (identidade estável) → `socketId` atual. */
  socketByPlayer: ReadonlyMap<JogadorId, string>;
  /** Hash SHA-256 do token rotativo. Nunca contém o token bruto. */
  resumeTokenHashByPlayer: ReadonlyMap<JogadorId, string>;
  /** Placar desde a criação da sala; ausente até a primeira partida terminar. */
  placar?: PlacarGravado;
}

export interface JoinRoomInput {
  /** Identidade estável do jogador (UUID v4). Veio do cliente. */
  jogadorId: string;
  salaId: string;
  nome: string;
  socketId: string;
  criar?: boolean;
  /** Só é aplicado na criação; o servidor normaliza antes de persistir. */
  nomeSala?: string;
  /** Só é aplicada na criação; omitida cria uma sala privada. */
  visibilidade?: VisibilidadeSala;
  /** Só na criação: sala "Jogar agora", que espera e completa a mesa com bots. */
  rapida?: SalaRapida;
  resumeToken?: string;
  /** Só vale para quem entra agora; quem volta mantém o avatar que já tinha. */
  avatarId?: string;
}

export interface QuickJoinInput {
  jogadorId: string;
  nome: string;
  socketId: string;
  /** Tamanho da mesa quando começar (humanos + bots), 2 a 10. */
  tamanho: number;
  resumeToken?: string;
  avatarId?: string;
}

export interface RoomStoreOptions {
  /** Espera da sala "Jogar agora" antes de completar com bots. */
  quickPlayWaitMs?: number;
  /** Limite por vez de uma pessoa conectada (ms); 0 ou ausente desliga. */
  turnLimitMs?: number;
}

/** Identifica uma vez específica; um prazo de outra vez nunca pode disparar nesta. */
export interface VezEsperada {
  partidaId: string;
  jogadorId: JogadorId;
  revisao: number;
}

/** O que o servidor lembra da vez atual de uma sala (só em memória). */
interface VezAtual extends VezEsperada {
  /** Prazo correndo, se houver. */
  expiraEm?: number;
  /** Tempo que sobrava quando o dono da vez caiu. */
  restanteMs?: number;
}

export interface BotTurnResult {
  session: RoomSession;
  botId: JogadorId;
  acao: 'JOGOU' | 'COMPROU';
}

export interface JoinRoomResult {
  session: RoomSession;
  jogadorId: JogadorId;
  /** True se o jogador já existia (reconexão). False se foi criado agora. */
  reconectado: boolean;
  resumeToken: string;
  previousSocketId?: string;
}

export interface DeterministicVictoryFixture {
  salaId: SalaId;
  vencedorId: JogadorId;
  vencedorCardId: string;
  vencedorCardLabel: string;
  oponenteCardLabels: [string, string];
}

export interface InterceptacaoFixture {
  salaId: SalaId;
  origemId: JogadorId;
  interceptadorId: JogadorId;
  cartaOrigemId: string;
  cartaOrigemLabel: string;
  cartaInterceptadoraId: string;
}

export class RoomError extends Error {
  constructor(
    public readonly code:
      | 'SALA_INEXISTENTE'
      | 'SALA_CHEIA'
      | 'NAO_SUA_VEZ'
      | 'JOGADA_INVALIDA'
      | 'JOGADOR_EM_OUTRA_SALA'
      | 'AUTH_REQUIRED'
      | 'INTERCEPTACAO_INVALIDA'
      | 'INTERNAL',
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

function sanitizeName(name: string): string {
  const normalized = name.replace(/[<>]/g, '').trim().slice(0, 24);
  return normalized || 'Jogador';
}

function sanitizeRoomName(name: string | undefined, salaId: string): string {
  const normalized = name?.replace(/[<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, 48);
  return normalized || `Sala ${salaId}`;
}

const AVATAR_PADRAO = '01';
const AVATAR_BOT = '🤖';

/** Aceita só '01' a '12'; qualquer outra coisa (inclusive snapshots antigos) vira o padrão. */
export function normalizarAvatar(valor: unknown): string {
  return typeof valor === 'string' && /^(0[1-9]|1[0-2])$/.test(valor) ? valor : AVATAR_PADRAO;
}

const AUTH_REQUIRED_MESSAGE = 'Credenciais de retomada inválidas.';

function issueResumeToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: createHash('sha256').update(raw).digest('hex') };
}

function validResumeToken(raw: string | undefined, expectedHash: string | undefined): boolean {
  if (raw === undefined || expectedHash === undefined) return false;
  const actual = createHash('sha256').update(raw).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function publicPlayer(jogador: EstadoPartida['jogadores'][number]): JogadorPublico {
  return {
    id: jogador.id,
    nome: jogador.nome,
    quantidadeCartas: jogador.mao.length,
    isBot: jogador.isBot,
    conectado: jogador.conectado,
    disseUno: jogador.disseUno,
    avatar: jogador.avatar,
    pontos: jogador.pontos,
    ...(jogador.controladoPorBot ? { controladoPorBot: true } : {}),
    ...(jogador.controladoPorBot && jogador.motivoBot !== undefined
      ? { motivoBot: jogador.motivoBot }
      : {}),
  };
}

type JogadorPartida = EstadoPartida['jogadores'][number];

/** Devolve o assento à pessoa (sem mexer em mais nada). */
function semControleDoBot(jogador: JogadorPartida): JogadorPartida {
  if (jogador.controladoPorBot === undefined && jogador.motivoBot === undefined) return jogador;
  const limpo = { ...jogador };
  delete limpo.controladoPorBot;
  delete limpo.motivoBot;
  return limpo;
}

/** Quem saiu de vez: o assento vira bot, mas mantém id, nome, posição e mão. */
function assentoAbandonado<T extends JogadorPublico | JogadorPartida>(jogador: T): T {
  return { ...jogador, isBot: true, conectado: true, controladoPorBot: true, motivoBot: 'SAIU' };
}

/** O prazo da vez só vale no processo que o criou: nunca vai para o disco. */
function semTurno(estado: EstadoPartida): EstadoPartida {
  if (estado.turno === undefined) return estado;
  const limpo = { ...estado };
  delete limpo.turno;
  return limpo;
}

function paraPersistir(session: RoomSession): PersistedRoomSession {
  const resumeTokenHashes = Object.fromEntries(session.resumeTokenHashByPlayer);
  return {
    sala: session.sala,
    ...(session.estado === undefined ? {} : { estado: semTurno(session.estado) }),
    resumeTokenHashes,
    ...(session.placar === undefined ? {} : { placar: session.placar }),
  };
}

/** Um bot joga a vez deste assento (bot de verdade ou assento controlado por bot). */
export function jogaComoBot(jogador: { isBot: boolean; controladoPorBot?: boolean }): boolean {
  return jogador.isBot || jogador.controladoPorBot === true;
}

function cardLabel(carta: Carta): string {
  if (carta.valor !== undefined) {
    return `Carta ${carta.valor} ${carta.cor ?? ''}`.trim();
  }

  const labels: Record<string, string> = {
    SKIP: 'Pula',
    REVERSE: 'Inverte',
    MAIS_DOIS: 'Mais dois',
    MAIS_QUATRO: 'Mais quatro',
    ZERO_MAIS: 'Zero Mais',
    TROCA_MAO: 'Troca mão',
    GIRA_MAO: 'Gira mão',
    CORINGA_SIMPLES: 'Coringa',
    SILENCIO: 'Silêncio',
  };

  return labels[carta.acao ?? ''] ?? 'Carta';
}

export function toPublicState(estado: EstadoPartida): EstadoPartidaPublico {
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  if (!topo) {
    throw new RoomError('INTERNAL', 'A partida não possui carta no descarte.');
  }

  return {
    partidaId: estado.partidaId,
    salaId: estado.salaId,
    jogadores: estado.jogadores.map(publicPlayer),
    topo,
    quantidadeMonteCompra: estado.monteCompra.length,
    vezDe: estado.vezDe,
    sentido: estado.sentido,
    corAtiva: estado.corAtiva,
    ataqueAcumulado: estado.ataqueAcumulado,
    ataqueStack: estado.ataqueStack,
    silencio: estado.silencio,
    finalizada: estado.finalizada,
    ...(estado.vencedor !== undefined ? { vencedor: estado.vencedor } : {}),
    ...(estado.interceptacao !== undefined ? { interceptacao: estado.interceptacao } : {}),
    ...(estado.turno !== undefined
      ? {
          turno: {
            ...estado.turno,
            restanteMs: Math.max(0, estado.turno.expiraEm - Date.now()),
          },
        }
      : {}),
  };
}

/** Humanos (não bots) de uma sala, conectados ou não. */
export function humanPlayers(session: RoomSession): JogadorPublico[] {
  return session.sala.jogadores.filter((jogador) => !jogador.isBot);
}

/**
 * Decide se a jogada de `origemId` deve abrir a janela de Corta-Frente.
 *
 * - Sala só de humanos: sempre abre. É de propósito: se abrisse só quando
 *   alguém tem a carta idêntica, a própria janela revelaria a mão dos outros.
 * - Sala com bots e vários humanos: também sempre abre, pelo mesmo motivo.
 * - Sala com bots e UM humano: abre só se esse humano pode cortar a frente
 *   (como na mesa local). Bots não cortam a frente, então esperar 5 s por
 *   eles só travaria a partida, e não há outro humano a quem revelar a mão.
 *
 * Um assento controlado por bot TEMPORARIAMENTE (queda ou inatividade) conta
 * como humano: a pessoa volta, e se a regra mudasse enquanto ela está fora, a
 * janela (ou a falta dela) contaria o que há na mão de quem ficou. Já quem
 * saiu de vez virou bot (`isBot`) e não conta.
 */
export function shouldOpenInterception(estado: EstadoPartida, origemId: JogadorId): boolean {
  if (!estado.jogadores.some((jogador) => jogador.isBot)) return true;
  const humanos = estado.jogadores.filter((jogador) => !jogador.isBot);
  if (humanos.length !== 1) return true;
  const unico = humanos[0]!;
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  if (!topo || unico.id === origemId) return false;
  return unico.mao.some((carta) => saoCartasIdenticas(carta, topo));
}

/** Pessoas conectadas, com socket, que podem pedir revanche de uma partida terminada. */
export function possiveisNaRevanche(session: RoomSession): JogadorId[] {
  if (!session.estado?.finalizada) return [];
  return humanPlayers(session)
    .filter((jogador) => jogador.conectado && session.socketByPlayer.has(jogador.id))
    .map((jogador) => jogador.id);
}

/**
 * Números, prêmios e placar de uma partida terminada; sem nenhuma carta.
 * Quem abandonou (assento SAIU) não concorre a prêmios.
 */
export function partidaEncerrada(session: RoomSession): ServerPartidaEncerradaEvent | undefined {
  const { estado, placar } = session;
  if (!estado?.finalizada) return undefined;
  const resumo = resumirPartida(estado);
  const ficaram = estado.jogadores.filter((jogador) => jogador.motivoBot !== 'SAIU');
  return {
    resumo: { ...resumo, premios: escolherPremios(ficaram, resumo.jogadores) },
    placar: {
      partidas: placar?.partidas ?? 0,
      vitorias: session.sala.jogadores.map(({ id }) => ({
        jogadorId: id,
        vitorias: vitoriasDe(placar, id),
      })),
    },
  };
}

function vitoriasDe(placar: PlacarSessao | undefined, jogadorId: JogadorId): number {
  return placar?.vitorias.find((item) => item.jogadorId === jogadorId)?.vitorias ?? 0;
}

/** Conta o resultado uma única vez por `partidaId`, junto com a gravação do fim. */
function comPlacar(session: RoomSession): RoomSession {
  const { estado, placar } = session;
  if (!estado?.finalizada || placar?.ultimaPartidaId === estado.partidaId) return session;
  return {
    ...session,
    placar: {
      partidas: (placar?.partidas ?? 0) + 1,
      vitorias: session.sala.jogadores.map(({ id }) => ({
        jogadorId: id,
        vitorias: vitoriasDe(placar, id) + (estado.vencedor === id ? 1 : 0),
      })),
      ultimaPartidaId: estado.partidaId,
    },
  };
}

function botPublico(salaId: string, numero: number): JogadorPublico {
  return {
    id: `bot_${salaId}_${numero}`,
    nome: `Bot ${numero}`,
    quantidadeCartas: 0,
    isBot: true,
    conectado: true,
    disseUno: false,
    avatar: AVATAR_BOT,
    pontos: 0,
  };
}

export class RoomStore {
  private readonly rooms = new Map<SalaId, RoomSession>();
  private readonly commitObservers = new Set<(session: RoomSession) => void>();
  private readonly quickPlayWaitMs: number;
  private readonly turnLimitMs: number;
  /** Vez atual de cada sala com partida. */
  private readonly vezes = new Map<SalaId, VezAtual>();
  private ultimaRevisao = 0;
  /** Estouros seguidos do limite por vez, por sala e jogador. */
  private readonly estouros = new Map<SalaId, Map<JogadorId, number>>();
  /** Timers de janelas de Corta-Frente ativas, indexados por `janelaId`. */
  private readonly interceptionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private interceptionExpiredHandler:
    | ((salaId: SalaId, session: RoomSession, janelaId: string, proximaVezId: JogadorId) => void)
    | undefined;

  constructor(
    private readonly persistence?: RoomPersistence,
    options: RoomStoreOptions = {},
  ) {
    this.quickPlayWaitMs = options.quickPlayWaitMs ?? QUICK_PLAY_WAIT_MS;
    this.turnLimitMs = options.turnLimitMs ?? 0;
    if (persistence) this.restoreState(persistence.load());
  }

  /**
   * Observa cada mudança gravada (bots, salas rápidas, prazos). Pode haver
   * vários observadores; eles só devem agendar trabalho, nunca gravar estado
   * dentro da própria chamada. Devolve a função que para de observar.
   */
  addCommitObserver(observer: (session: RoomSession) => void): () => void {
    this.commitObservers.add(observer);
    return () => {
      this.commitObservers.delete(observer);
    };
  }

  /** Todas as salas atuais (para varrer o que ficou pendente depois de reiniciar). */
  sessions(): RoomSession[] {
    return [...this.rooms.values()];
  }

  /** Apaga a sala (partida terminada, abandonada ou sem ninguém). */
  removeRoom(salaId: string): void {
    const id = salaId.trim().toUpperCase();
    const session = this.rooms.get(id);
    if (!session) return;
    if (session.estado?.interceptacao) {
      this.clearInterceptionTimer(session.estado.interceptacao.janelaId);
    }
    this.rooms.delete(id);
    this.vezes.delete(id);
    this.estouros.delete(id);
    if (this.persistence) {
      this.persistence.save(this.exportState().filter((room) => room.sala.id !== id));
    }
  }

  setInterceptionExpiredHandler(
    handler: (
      salaId: SalaId,
      session: RoomSession,
      janelaId: string,
      proximaVezId: JogadorId,
    ) => void,
  ): void {
    this.interceptionExpiredHandler = handler;
  }

  exportState(): PersistedRoomSession[] {
    return [...this.rooms.values()].map(paraPersistir);
  }

  restoreState(rooms: readonly PersistedRoomSession[]): void {
    for (const timer of this.interceptionTimers.values()) clearTimeout(timer);
    this.interceptionTimers.clear();
    this.vezes.clear();
    this.estouros.clear();

    const restored = new Map<SalaId, RoomSession>();
    for (const room of rooms) {
      const sala = {
        ...room.sala,
        visibilidade: room.sala.visibilidade ?? 'PRIVADA',
        jogadores: room.sala.jogadores.map((player) => ({ ...player, conectado: player.isBot })),
      };
      const estado =
        room.estado === undefined
          ? undefined
          : {
              // Sem prazo e sem controle temporário: quem voltar depois de o
              // servidor reiniciar ganha a vez (e a tolerância) inteiras.
              ...semTurno(room.estado),
              jogadores: room.estado.jogadores.map((player) => ({
                ...(player.isBot ? player : semControleDoBot(player)),
                conectado: player.isBot,
              })),
            };
      restored.set(sala.id, {
        sala,
        ...(estado === undefined ? {} : { estado }),
        socketByPlayer: new Map(),
        resumeTokenHashByPlayer: new Map(Object.entries(room.resumeTokenHashes)),
        ...(room.placar === undefined ? {} : { placar: room.placar }),
      });
    }
    this.rooms.clear();
    for (const [roomId, session] of restored) this.rooms.set(roomId, session);

    for (const [salaId, session] of this.rooms) {
      const janela = session.estado?.interceptacao;
      if (!janela) continue;
      if (janela.fechaEm <= Date.now()) {
        this.resolveExpiredInterceptionWindow(salaId, janela.janelaId);
      } else {
        this.armInterceptionTimer(salaId, janela.janelaId, janela.fechaEm, janela.proximaVezId);
      }
    }
  }

  /**
   * Adiciona ou restaura um jogador na sala.
   *
   * Identidade estável (Sprint 3 — M14):
   * - `jogadorId` novo → cria jogador na sala
   * - `jogadorId` existente NESTA sala → atualiza socket, marca `conectado: true`
   *   (usado em reconexão)
   * - `jogadorId` existente em OUTRA sala → throw `JOGADOR_EM_OUTRA_SALA`
   *   (anti-impersonation: jogador não pode estar em 2 salas ao mesmo tempo)
   */
  join(input: JoinRoomInput): JoinRoomResult {
    const salaId = input.salaId.trim().toUpperCase();
    if (!salaId) throw new RoomError('SALA_INEXISTENTE', 'Informe o código da sala.');

    if (!input.jogadorId) {
      throw new RoomError('INTERNAL', 'Jogador precisa de um jogadorId (UUID v4).');
    }

    // Verifica se o jogador já existe em OUTRA sala.
    for (const [outraSalaId, outraSession] of this.rooms) {
      if (outraSalaId === salaId) continue;
      // Assento que ficou com um bot porque a pessoa saiu não prende a identidade dela.
      if (outraSession.sala.jogadores.some((j) => j.id === input.jogadorId && !j.isBot)) {
        throw new RoomError('AUTH_REQUIRED', AUTH_REQUIRED_MESSAGE);
      }
    }

    let session = this.rooms.get(salaId);
    if (!session && input.criar === false) {
      throw new RoomError('SALA_INEXISTENTE', 'Sala não encontrada.');
    }
    if (!session) {
      const sala: Sala = {
        id: salaId,
        codigo: salaId,
        nome: sanitizeRoomName(input.nomeSala, salaId),
        // hostId é o jogadorId do primeiro jogador (identidade estável).
        // O socketId muda a cada reconexão, mas o jogadorId não.
        hostId: input.jogadorId,
        jogadores: [],
        maxJogadores: (input.rapida ? input.rapida.tamanhoAlvo : 10) as Sala['maxJogadores'],
        modo: input.visibilidade === 'PUBLICA' ? 'ONLINE_PUBLICA' : 'ONLINE_PRIVADA',
        visibilidade: input.visibilidade ?? 'PRIVADA',
        status: 'AGUARDANDO',
        ...(input.rapida ? { rapida: input.rapida } : {}),
      };
      session = {
        sala,
        socketByPlayer: new Map(),
        resumeTokenHashByPlayer: new Map(),
      };
    }

    // Tenta encontrar o jogador existente nesta sala (caso de reconexão).
    const jogadorExistente = session.sala.jogadores.find((j) => j.id === input.jogadorId);

    if (jogadorExistente) {
      if (
        !validResumeToken(input.resumeToken, session.resumeTokenHashByPlayer.get(input.jogadorId))
      ) {
        throw new RoomError('AUTH_REQUIRED', AUTH_REQUIRED_MESSAGE);
      }
      const issued = issueResumeToken();
      const previousSocketId = session.socketByPlayer.get(input.jogadorId);
      const jogadores = session.sala.jogadores.map((j) =>
        j.id === input.jogadorId ? { ...j, conectado: true } : j,
      );
      const socketByPlayer = new Map(session.socketByPlayer);
      socketByPlayer.set(input.jogadorId, input.socketId);
      const resumeTokenHashByPlayer = new Map(session.resumeTokenHashByPlayer);
      resumeTokenHashByPlayer.set(input.jogadorId, issued.hash);
      const next: RoomSession = {
        ...session,
        sala: { ...session.sala, jogadores },
        ...(session.estado === undefined
          ? {}
          : {
              estado: {
                ...session.estado,
                jogadores: session.estado.jogadores.map((player) =>
                  player.id === input.jogadorId
                    ? { ...semControleDoBot(player), conectado: true }
                    : player,
                ),
              },
            }),
        socketByPlayer,
        resumeTokenHashByPlayer,
      };
      this.zerarEstouros(salaId, input.jogadorId);
      return {
        session: this.commit(next),
        jogadorId: input.jogadorId,
        reconectado: true,
        resumeToken: issued.raw,
        ...(previousSocketId === undefined ? {} : { previousSocketId }),
      };
    }

    if (session.sala.status !== 'AGUARDANDO') {
      throw new RoomError('SALA_CHEIA', 'A partida desta sala já começou.');
    }

    // Jogador novo: cria.
    if (session.sala.jogadores.length >= session.sala.maxJogadores) {
      throw new RoomError('SALA_CHEIA', 'A sala atingiu o limite de jogadores.');
    }

    const jogadorId = input.jogadorId;
    const jogador: JogadorPublico = {
      id: jogadorId,
      nome: sanitizeName(input.nome),
      quantidadeCartas: 0,
      isBot: false,
      conectado: true,
      disseUno: false,
      avatar: normalizarAvatar(input.avatarId),
      pontos: 0,
    };
    const socketByPlayer = new Map(session.socketByPlayer);
    socketByPlayer.set(jogadorId, input.socketId);
    const issued = issueResumeToken();
    const resumeTokenHashByPlayer = new Map(session.resumeTokenHashByPlayer);
    resumeTokenHashByPlayer.set(jogadorId, issued.hash);
    const next: RoomSession = {
      ...session,
      sala: { ...session.sala, jogadores: [...session.sala.jogadores, jogador] },
      socketByPlayer,
      resumeTokenHashByPlayer,
    };
    const gravada = this.commit(next);
    return { session: gravada, jogadorId, reconectado: false, resumeToken: issued.raw };
  }

  listAvailablePublicRooms(): ServerSalaDisponivel[] {
    return [...this.rooms.values()].flatMap((session) => {
      const host = session.sala.jogadores.find((player) => player.id === session.sala.hostId);
      if (
        session.sala.visibilidade !== 'PUBLICA' ||
        session.sala.rapida !== undefined ||
        session.sala.status !== 'AGUARDANDO' ||
        !host?.conectado ||
        session.sala.jogadores.length >= session.sala.maxJogadores
      ) {
        return [];
      }
      return [
        {
          id: session.sala.id,
          nome: session.sala.nome,
          hostNome: host.nome,
          quantidadeJogadores: session.sala.jogadores.length,
          maxJogadores: session.sala.maxJogadores,
        },
      ];
    });
  }

  /**
   * "Jogar agora": entra numa sala rápida que ainda espera gente (do mesmo
   * tamanho de mesa) ou cria uma nova. Quem já está numa sala rápida em
   * andamento retoma a mesma; de uma sala rápida já terminada, sai sem afetar
   * quem ainda está nela (a sala some se não sobra ninguém).
   */
  quickJoin(input: QuickJoinInput): JoinRoomResult {
    const tamanho = Math.trunc(input.tamanho);
    if (!Number.isFinite(tamanho) || tamanho < 2 || tamanho > 10) {
      throw new RoomError('INTERNAL', 'Tamanho de mesa inválido (de 2 a 10 jogadores).');
    }
    const base = {
      jogadorId: input.jogadorId,
      nome: input.nome,
      socketId: input.socketId,
      ...(input.resumeToken !== undefined ? { resumeToken: input.resumeToken } : {}),
      ...(input.avatarId !== undefined ? { avatarId: input.avatarId } : {}),
    };
    const agora = Date.now();

    for (const session of [...this.rooms.values()]) {
      if (!session.sala.rapida) continue;
      const assento = session.sala.jogadores.find((jogador) => jogador.id === input.jogadorId);
      if (!assento || assento.isBot) continue; // não participa, ou saiu e um bot ficou no lugar
      if (session.estado?.finalizada || session.sala.status === 'FINALIZADA') {
        // Ids são públicos: só tira da sala uma pessoa conectada se for ela mesma.
        const hash = session.resumeTokenHashByPlayer.get(input.jogadorId);
        if (
          assento.conectado &&
          hash !== undefined &&
          session.socketByPlayer.get(input.jogadorId) !== input.socketId &&
          !validResumeToken(input.resumeToken, hash)
        ) {
          throw new RoomError('AUTH_REQUIRED', AUTH_REQUIRED_MESSAGE);
        }
        this.leaveFinishedRoom(session, input.jogadorId);
        continue;
      }
      return this.join({ ...base, salaId: session.sala.id, criar: false });
    }

    const candidata = [...this.rooms.values()]
      .filter(
        (session) =>
          session.sala.rapida !== undefined &&
          session.sala.status === 'AGUARDANDO' &&
          session.sala.rapida.tamanhoAlvo === tamanho &&
          session.sala.jogadores.length < tamanho &&
          session.sala.rapida.iniciaEm - agora > QUICK_PLAY_JOIN_MARGIN_MS,
      )
      .sort(
        (a, b) =>
          b.sala.jogadores.length - a.sala.jogadores.length ||
          a.sala.rapida!.iniciaEm - b.sala.rapida!.iniciaEm,
      )[0];
    if (candidata) return this.join({ ...base, salaId: candidata.sala.id, criar: false });

    return this.join({
      ...base,
      salaId: this.novoCodigoDeSala(),
      criar: true,
      nomeSala: 'Jogar agora',
      visibilidade: 'PUBLICA',
      rapida: { tamanhoAlvo: tamanho, iniciaEm: agora + this.quickPlayWaitMs },
    });
  }

  private novoCodigoDeSala(): string {
    for (;;) {
      const bytes = randomBytes(6);
      const codigo = [...bytes]
        .map((byte) => CODIGO_ALFABETO[byte % CODIGO_ALFABETO.length])
        .join('');
      if (!this.rooms.has(codigo)) return codigo;
    }
  }

  /**
   * Fecha a espera de uma sala rápida: completa a mesa com bots até o tamanho
   * escolhido e começa a partida. Chamado quando o tempo acaba, quando a mesa
   * enche de pessoas ou quando o anfitrião não quer mais esperar.
   */
  startWithBots(salaId: string): RoomSession {
    const session = this.require(salaId);
    const rapida = session.sala.rapida;
    if (!rapida) throw new RoomError('INTERNAL', 'Esta sala não completa a mesa com bots.');
    if (session.sala.status !== 'AGUARDANDO') {
      throw new RoomError('INTERNAL', 'A partida desta sala já começou.');
    }
    if (humanPlayers(session).length === 0) {
      throw new RoomError('INTERNAL', 'A sala está sem jogadores.');
    }
    const faltam = Math.max(0, rapida.tamanhoAlvo - session.sala.jogadores.length);
    const bots = Array.from({ length: faltam }, (_, indice) =>
      botPublico(session.sala.id, indice + 1),
    );
    return this.beginMatch({
      ...session,
      sala: { ...session.sala, jogadores: [...session.sala.jogadores, ...bots] },
    });
  }

  /** Cria o estado da partida para os jogadores que a sala tem agora (humanos e bots). */
  private beginMatch(session: RoomSession): RoomSession {
    const jogadores = session.sala.jogadores;
    const estado = criarPartidaInicial({
      baralho: Constants.BARALHO_COMPLETO_108,
      modo: session.sala.modo as ModoJogo,
      totalJogadores: jogadores.length,
      nomesCustomizados: jogadores.map((jogador) => jogador.nome),
      idsCustomizados: jogadores.map((jogador) => jogador.id),
      bots: jogadores.map((jogador) => jogador.isBot),
      avatares: jogadores.map((jogador) =>
        jogador.avatar === AVATAR_BOT ? AVATAR_BOT : normalizarAvatar(jogador.avatar),
      ),
      salaId: session.sala.id,
      partidaId: `game_${Date.now()}_${session.sala.id}_${randomUUID().slice(0, 8)}`,
    });
    this.estouros.delete(session.sala.id);
    const next: RoomSession = {
      ...session,
      sala: { ...session.sala, status: 'EM_PARTIDA', partidaId: estado.partidaId },
      estado: {
        ...estado,
        // Quem caiu antes de começar continua fora, e quem saiu de uma partida
        // anterior nesta sala continua representado por um bot.
        jogadores: estado.jogadores.map((jogador, indice) => {
          const assento = jogadores[indice]!;
          return assento.motivoBot === 'SAIU'
            ? assentoAbandonado(jogador)
            : { ...jogador, conectado: assento.conectado };
        }),
      },
    };
    return this.commit(next, true);
  }

  /**
   * Nova partida na mesma sala com quem aceitou. Os outros assentos viram bots
   * (mesmo id, posição e placar) e quem estava neles deixa de ser participante.
   */
  startRematch(
    salaId: string,
    partidaAnterior: string,
    aceitaram: ReadonlySet<JogadorId>,
  ): RoomSession {
    const session = this.requireActive(salaId);
    const { estado } = session;
    if (!estado.finalizada || estado.partidaId !== partidaAnterior) {
      throw new RoomError('INTERNAL', 'Esta partida não pode ter revanche agora.');
    }
    const ficam = possiveisNaRevanche(session).filter((id) => aceitaram.has(id));
    if (ficam.length === 0) throw new RoomError('INTERNAL', 'Ninguém aceitou a revanche.');
    const dentro = new Set(ficam);
    const gravada = this.beginMatch({
      ...session,
      sala: {
        ...session.sala,
        hostId: dentro.has(session.sala.hostId) ? session.sala.hostId : ficam[0]!,
        jogadores: session.sala.jogadores.map((jogador) =>
          jogador.isBot || dentro.has(jogador.id) ? jogador : assentoAbandonado(jogador),
        ),
      },
      socketByPlayer: new Map([...session.socketByPlayer].filter(([id]) => dentro.has(id))),
      resumeTokenHashByPlayer: new Map(
        [...session.resumeTokenHashByPlayer].filter(([id]) => dentro.has(id)),
      ),
    });
    if (estado.interceptacao) this.clearInterceptionTimer(estado.interceptacao.janelaId);
    return gravada;
  }

  /** Executa a vez de um bot (ou de um assento controlado por bot) e grava o novo estado. */
  playBotTurn(salaId: string): BotTurnResult {
    const session = this.requireActive(salaId);
    const estado = session.estado;
    const bot = estado.jogadores.find((jogador) => jogador.id === estado.vezDe);
    if (!bot || !jogaComoBot(bot)) throw new RoomError('NAO_SUA_VEZ', 'Não é a vez de um bot.');
    if (estado.interceptacao) {
      throw new RoomError('INTERCEPTACAO_INVALIDA', 'Corta-Frente em andamento.');
    }
    const { novoEstado, acao } = this.jogadaAutomatica(estado);
    return { session: this.saveState(session, novoEstado), botId: bot.id, acao };
  }

  /**
   * Calcula a jogada de bot para o dono da vez. O motor só joga por quem é bot,
   * então o assento de uma pessoa vira bot apenas durante o cálculo.
   */
  private jogadaAutomatica(estado: EstadoPartida): {
    novoEstado: EstadoPartida;
    acao: BotTurnResult['acao'];
  } {
    const dono = estado.vezDe;
    const humano = estado.jogadores.some((jogador) => jogador.id === dono && !jogador.isBot);
    const comIsBot = (base: EstadoPartida, isBot: boolean): EstadoPartida => ({
      ...base,
      jogadores: base.jogadores.map((jogador) =>
        jogador.id === dono ? { ...jogador, isBot } : jogador,
      ),
    });
    const resultado = executarTurnoBot({
      estado: humano ? comIsBot(estado, true) : estado,
      nivel: 'MEDIO',
    });
    if (resultado.acao === 'PULOU') {
      throw new RoomError('JOGADA_INVALIDA', 'O bot não tinha o que fazer.');
    }
    return {
      novoEstado: humano ? comIsBot(resultado.novoEstado, false) : resultado.novoEstado,
      acao: resultado.acao,
    };
  }

  /**
   * O prazo de uma vez acabou: um bot joga só aquela vez e, no segundo estouro
   * seguido, passa a jogar até a pessoa agir. Devolve `undefined`, sem mexer em
   * nada, se a vez esperada já não é a atual.
   */
  expirarVez(salaId: string, esperada: VezEsperada): BotTurnResult | undefined {
    const session = this.get(salaId);
    const estado = session?.estado;
    const turno = estado?.turno;
    if (
      !session ||
      !estado ||
      !turno ||
      estado.finalizada ||
      estado.interceptacao ||
      estado.partidaId !== esperada.partidaId ||
      estado.vezDe !== esperada.jogadorId ||
      turno.jogadorId !== esperada.jogadorId ||
      turno.revisao !== esperada.revisao
    ) {
      return undefined;
    }
    const { jogadorId } = esperada;
    const { novoEstado, acao } = this.jogadaAutomatica(estado);
    const estouros = (this.estouros.get(session.sala.id)?.get(jogadorId) ?? 0) + 1;
    const inativo = estouros >= ESTOUROS_ATE_INATIVO && !novoEstado.finalizada;
    const gravada = this.saveState(
      session,
      inativo ? this.comControleDoBot(novoEstado, jogadorId, 'INATIVO') : novoEstado,
    );
    const daSala = this.estouros.get(session.sala.id) ?? new Map<JogadorId, number>();
    daSala.set(jogadorId, estouros);
    this.estouros.set(session.sala.id, daSala);
    return { session: gravada, botId: jogadorId, acao };
  }

  /**
   * Um bot passa a jogar pelo assento de quem perdeu a conexão, até a pessoa
   * voltar. Devolve `undefined` se ela já voltou, saiu ou a partida acabou.
   */
  assumirAssentoDesconectado(
    salaId: string,
    partidaId: string,
    jogadorId: JogadorId,
  ): RoomSession | undefined {
    const session = this.get(salaId);
    const estado = session?.estado;
    if (!session || !estado || estado.finalizada || estado.partidaId !== partidaId) {
      return undefined;
    }
    const jogador = estado.jogadores.find((item) => item.id === jogadorId);
    if (!jogador || jogador.conectado || jogaComoBot(jogador)) return undefined;
    return this.commit({ ...session, estado: this.comControleDoBot(estado, jogadorId, 'CAIU') });
  }

  /**
   * A pessoa deu sinal de vida (jogou, tentou jogar, falou ou pediu o controle):
   * zera os estouros e devolve o assento a ela. Devolve a sala só se algo mudou.
   */
  registrarPresenca(salaId: string, jogadorId: JogadorId): RoomSession | undefined {
    const session = this.get(salaId);
    if (!session) return undefined;
    this.zerarEstouros(session.sala.id, jogadorId);
    const estado = session.estado;
    const jogador = estado?.jogadores.find((item) => item.id === jogadorId);
    if (!estado || estado.finalizada || !jogador?.conectado) return undefined;
    if (jogador.isBot || !jogador.controladoPorBot) return undefined;
    return this.commit({
      ...session,
      estado: {
        ...estado,
        jogadores: estado.jogadores.map((item) =>
          item.id === jogadorId ? semControleDoBot(item) : item,
        ),
      },
    });
  }

  private comControleDoBot(
    estado: EstadoPartida,
    jogadorId: JogadorId,
    motivoBot: MotivoControleBot,
  ): EstadoPartida {
    return {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === jogadorId ? { ...jogador, controladoPorBot: true, motivoBot } : jogador,
      ),
    };
  }

  private zerarEstouros(salaId: SalaId, jogadorId: JogadorId): void {
    this.estouros.get(salaId)?.delete(jogadorId);
  }

  /**
   * Saída de uma sala cuja partida já terminou. O resultado não muda: o assento
   * passa a um bot só na sala (para a revanche) e a identidade fica livre. Sem
   * mais ninguém, a sala some (a sessão devolvida é só para avisar quem saiu).
   */
  private leaveFinishedRoom(session: RoomSession, jogadorId: JogadorId): RoomSession {
    const assento = session.sala.jogadores.find((player) => player.id === jogadorId);
    if (!assento || assento.isBot) throw new RoomError('AUTH_REQUIRED', AUTH_REQUIRED_MESSAGE);
    const socketByPlayer = new Map(session.socketByPlayer);
    socketByPlayer.delete(jogadorId);
    const resumeTokenHashByPlayer = new Map(session.resumeTokenHashByPlayer);
    resumeTokenHashByPlayer.delete(jogadorId);
    const ficam = humanPlayers(session).filter((player) => player.id !== jogadorId);
    const next: RoomSession = {
      ...session,
      sala: {
        ...session.sala,
        hostId:
          session.sala.hostId === jogadorId && ficam.length > 0
            ? (ficam.find((player) => player.conectado) ?? ficam[0])!.id
            : session.sala.hostId,
        jogadores: session.sala.jogadores.map((player) =>
          player.id === jogadorId ? assentoAbandonado(player) : player,
        ),
      },
      ...(session.estado === undefined
        ? {}
        : {
            estado: {
              ...session.estado,
              jogadores: session.estado.jogadores.map((player) =>
                player.id === jogadorId ? { ...player, conectado: false } : player,
              ),
            },
          }),
      socketByPlayer,
      resumeTokenHashByPlayer,
    };
    if (ficam.length > 0) return this.commit(next);
    this.removeRoom(session.sala.id);
    return next;
  }

  /** Sai antes de a partida começar ou depois que ela terminou. */
  leaveWaitingRoom(salaId: string, jogadorId: JogadorId): RoomSession | undefined {
    const session = this.require(salaId);
    if (session.estado?.finalizada) return this.leaveFinishedRoom(session, jogadorId);
    if (session.sala.status !== 'AGUARDANDO') {
      throw new RoomError('INTERNAL', 'Não é possível sair depois que a partida começou.');
    }
    if (!session.sala.jogadores.some((player) => player.id === jogadorId)) {
      throw new RoomError('AUTH_REQUIRED', AUTH_REQUIRED_MESSAGE);
    }
    const jogadores = session.sala.jogadores.filter((player) => player.id !== jogadorId);
    if (jogadores.length === 0) {
      if (this.persistence) {
        this.persistence.save(
          this.exportState().filter((room) => room.sala.id !== session.sala.id),
        );
      }
      this.rooms.delete(session.sala.id);
      return undefined;
    }
    const hostId =
      session.sala.hostId === jogadorId
        ? (jogadores.find((player) => player.conectado) ?? jogadores[0])!.id
        : session.sala.hostId;
    const socketByPlayer = new Map(session.socketByPlayer);
    socketByPlayer.delete(jogadorId);
    const resumeTokenHashByPlayer = new Map(session.resumeTokenHashByPlayer);
    resumeTokenHashByPlayer.delete(jogadorId);
    const next: RoomSession = {
      ...session,
      sala: { ...session.sala, hostId, jogadores },
      socketByPlayer,
      resumeTokenHashByPlayer,
    };
    return this.commit(next);
  }

  get(salaId: string): RoomSession | undefined {
    return this.rooms.get(salaId.trim().toUpperCase());
  }

  /** Contagem de salas por status, pra métricas de baixa cardinalidade. */
  roomsByStatus(): Record<Sala['status'], number> {
    const counts: Record<Sala['status'], number> = {
      AGUARDANDO: 0,
      EM_PARTIDA: 0,
      FINALIZADA: 0,
    };
    for (const session of this.rooms.values()) counts[session.sala.status] += 1;
    return counts;
  }

  /** Probe não destrutivo de gravabilidade do storage. Sem persistência configurada, é sempre `true`. */
  probeStorageWritable(): boolean {
    return this.persistence?.probeWritable?.() ?? true;
  }

  /**
   * Encontra a sala em que um socket está conectado. Helper pra `disconnect`.
   */
  findBySocketId(socketId: string): { salaId: SalaId; session: RoomSession } | undefined {
    for (const [salaId, session] of this.rooms) {
      for (const socket of session.socketByPlayer.values()) {
        if (socket === socketId) {
          return { salaId, session };
        }
      }
    }
    return undefined;
  }

  start(salaId: string, requesterSocketId: string): RoomSession {
    const session = this.require(salaId);
    // Encontra o jogadorId do requester via socket → jogadorId
    const requesterEntry = [...session.socketByPlayer.entries()].find(
      ([, socket]) => socket === requesterSocketId,
    );
    const requesterJogadorId = requesterEntry?.[0];

    if (!requesterJogadorId || session.sala.hostId !== requesterJogadorId) {
      // Em caso de reconexão do host, o hostId original (jogadorId do 1º jogador)
      // deve bater. Verificamos pelo socketByPlayer.
      throw new RoomError('INTERNAL', 'Apenas o host pode iniciar a partida.');
    }
    if (session.sala.status !== 'AGUARDANDO') {
      throw new RoomError('INTERNAL', 'A partida desta sala já começou.');
    }
    // "Jogar agora": o anfitrião não quer mais esperar; completa a mesa com bots.
    if (session.sala.rapida) return this.startWithBots(salaId);
    if (session.sala.jogadores.length < 2) {
      throw new RoomError('INTERNAL', 'A sala precisa de pelo menos 2 jogadores.');
    }

    return this.beginMatch(session);
  }

  play(
    salaId: string,
    jogadorId: JogadorId,
    cartaId: string,
    corEscolhida?: Parameters<typeof executarJogada>[0]['corEscolhida'],
    alvoTrocaId?: Parameters<typeof executarJogada>[0]['alvoTrocaId'],
  ): RoomSession {
    const session = this.requireActive(salaId);
    if (session.estado.vezDe !== jogadorId) {
      throw new RoomError('NAO_SUA_VEZ', 'Não é o seu turno.');
    }
    const jogador = session.estado.jogadores.find((item) => item.id === jogadorId);
    const cartaIndex = jogador?.mao.findIndex((carta) => carta.id === cartaId) ?? -1;
    if (cartaIndex < 0) {
      throw new RoomError('JOGADA_INVALIDA', 'Essa carta não está na sua mão.');
    }

    let novoEstado: EstadoPartida;
    try {
      novoEstado = executarJogada({
        estado: session.estado,
        cartaIndex,
        ...(corEscolhida !== undefined ? { corEscolhida } : {}),
        ...(alvoTrocaId !== undefined ? { alvoTrocaId } : {}),
      }).novoEstado;
    } catch (error) {
      throw new RoomError(
        'JOGADA_INVALIDA',
        error instanceof Error ? error.message : 'Jogada inválida.',
      );
    }
    return this.saveState(session, novoEstado);
  }

  /** Executa um descarte múltiplo atomicamente, preservando a ordem enviada pelo jogador. */
  playMultiple(salaId: string, jogadorId: JogadorId, cartaIds: ReadonlyArray<string>): RoomSession {
    const session = this.requireActive(salaId);
    if (session.estado.vezDe !== jogadorId) {
      throw new RoomError('NAO_SUA_VEZ', 'Não é o seu turno.');
    }
    if (cartaIds.length < 2 || new Set(cartaIds).size !== cartaIds.length) {
      throw new RoomError(
        'JOGADA_INVALIDA',
        'Descarte múltiplo requer ao menos duas cartas diferentes.',
      );
    }

    const jogador = session.estado.jogadores.find((item) => item.id === jogadorId);
    const cartaIndices = cartaIds.map(
      (cartaId) => jogador?.mao.findIndex((carta) => carta.id === cartaId) ?? -1,
    );
    if (cartaIndices.some((index) => index < 0)) {
      throw new RoomError('JOGADA_INVALIDA', 'Uma ou mais cartas não estão na sua mão.');
    }

    try {
      const novoEstado = executarDescarteMultiplo({
        estado: session.estado,
        cartaIndices,
      }).novoEstado;
      return this.saveState(session, novoEstado);
    } catch (error) {
      throw new RoomError(
        'JOGADA_INVALIDA',
        error instanceof Error ? error.message : 'Jogada inválida.',
      );
    }
  }

  /**
   * Abre uma janela de Corta-Frente para a carta recém-descartada por
   * `jogadorOrigemId` (via jogada normal ou descarte múltiplo). Chamado
   * pelo orquestrador (socket.ts) logo após `play`/`playMultiple`/`buy`
   * deixarem uma carta elegível no topo, desde que ninguém já tenha
   * interceptado nesse meio-tempo (checagem best-effort: se já existe
   * janela ativa, não abre outra por cima).
   *
   * O prazo é armado internamente via `setTimeout`; o observador registrado
   * com `setInterceptionExpiredHandler` é notificado quando a resolução é
   * efetivada. Nunca há polling/`await sleep`, e o timer é cancelável em
   * abandono, restauração ou interceptação antecipada.
   */
  openInterceptionWindow(salaId: string, jogadorOrigemId: JogadorId): RoomSession | undefined {
    const session = this.requireActive(salaId);
    if (session.estado.interceptacao) return undefined; // já existe janela ativa
    if (session.estado.finalizada) return undefined;

    const topo = session.estado.monteDescarte[session.estado.monteDescarte.length - 1];
    if (!topo || !isEligibleForInterception(topo)) return undefined;
    if (!shouldOpenInterception(session.estado, jogadorOrigemId)) return undefined;
    // Precisa de pelo menos um outro jogador conectado além de quem descartou.
    if (session.estado.jogadores.length < 2) return undefined;

    const janelaId = randomUUID();
    const fechaEm = Date.now() + INTERCEPTION_WINDOW_MS;
    const proximaVezId = session.estado.vezDe;

    const novoEstado = abrirJanelaInterceptacao({
      estado: session.estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId,
      janelaId,
      fechaEm,
      proximaVezId,
    });
    const next = this.saveState(session, novoEstado);
    this.armInterceptionTimer(salaId, janelaId, fechaEm, proximaVezId);
    return next;
  }

  /** Um jogador tenta interceptar a janela ativa da sala. Primeiro pedido válido vence. */
  intercept(
    salaId: string,
    jogadorId: JogadorId,
    janelaId: string,
    revisao: number,
    cartaId: string,
  ): RoomSession {
    const session = this.requireActive(salaId);
    if (
      !session.estado.interceptacao ||
      session.estado.interceptacao.janelaId !== janelaId ||
      session.estado.interceptacao.revisao !== revisao
    ) {
      throw new RoomError(
        'INTERCEPTACAO_INVALIDA',
        'Janela de interceptação inexistente, obsoleta ou já resolvida.',
      );
    }
    let resultado: ReturnType<typeof interceptarPure>;
    try {
      resultado = interceptarPure({ estado: session.estado, janelaId, cartaId, jogadorId });
    } catch (error) {
      throw new RoomError(
        'INTERCEPTACAO_INVALIDA',
        error instanceof Error ? error.message : 'Não foi possível interceptar.',
      );
    }
    this.clearInterceptionTimer(janelaId);
    return this.saveState(session, resultado.novoEstado);
  }

  private armInterceptionTimer(
    salaId: SalaId,
    janelaId: string,
    fechaEm: number,
    proximaVezId: JogadorId,
  ): void {
    this.clearInterceptionTimer(janelaId);
    const timer = setTimeout(
      () => {
        this.interceptionTimers.delete(janelaId);
        try {
          const resolved = this.resolveExpiredInterceptionWindow(salaId, janelaId);
          if (resolved) {
            this.interceptionExpiredHandler?.(salaId, resolved, janelaId, proximaVezId);
          }
        } catch {
          // A janela foi resolvida por interceptação ou a sala deixou de
          // existir. O callback é deliberadamente idempotente.
        }
      },
      Math.max(0, fechaEm - Date.now()),
    );
    // Timers não devem manter o processo vivo sozinhos (ex.: testes/CLI).
    timer.unref?.();
    this.interceptionTimers.set(janelaId, timer);
  }

  /** Resolve a janela por expiração de prazo. Idempotente: chamado só uma vez pelo próprio timer. */
  private resolveExpiredInterceptionWindow(
    salaId: string,
    janelaId: string,
  ): RoomSession | undefined {
    const session = this.get(salaId);
    if (!session?.estado?.interceptacao || session.estado.interceptacao.janelaId !== janelaId) {
      return undefined;
    }
    const novoEstado = resolverJanelaExpirada({ estado: session.estado, janelaId });
    return this.saveState(session, novoEstado);
  }

  private clearInterceptionTimer(janelaId: string): void {
    const timer = this.interceptionTimers.get(janelaId);
    if (timer) {
      clearTimeout(timer);
      this.interceptionTimers.delete(janelaId);
    }
  }

  buy(salaId: string, jogadorId: JogadorId): RoomSession {
    const session = this.requireActive(salaId);
    if (session.estado.vezDe !== jogadorId) {
      throw new RoomError('NAO_SUA_VEZ', 'Não é o seu turno.');
    }
    let resultado: ReturnType<typeof comprarCartas>;
    try {
      resultado = comprarCartas({ estado: session.estado });
    } catch (error) {
      throw new RoomError(
        'JOGADA_INVALIDA',
        error instanceof Error ? error.message : 'Não foi possível comprar.',
      );
    }
    return this.saveState(session, resultado.novoEstado);
  }

  penalizeSilenceBreak(
    salaId: string,
    jogadorId: JogadorId,
  ): { session: RoomSession; penalized: boolean } {
    const session = this.requireActive(salaId);
    if (session.estado.finalizada) return { session, penalized: false };
    const resultado = penalizarQuebraSilencio(session.estado, jogadorId);
    if (!resultado.penalizado) return { session, penalized: false };
    // Não é uma ação de turno: o prazo de quem está jogando continua o mesmo.
    return {
      session: this.commit({ ...session, estado: resultado.novoEstado }),
      penalized: true,
    };
  }

  /**
   * Saída explícita da partida, sem volta. Se sobra alguma pessoa (mesmo uma só,
   * e mesmo que ela esteja temporariamente sem conexão), um bot assume o assento
   * com o mesmo id, posição e mão, e a partida segue. Se quem saiu era a última
   * pessoa, a partida termina por abandono.
   */
  abandonGame(salaId: string, jogadorId: JogadorId): RoomSession {
    const session = this.requireActive(salaId);
    if (session.estado.finalizada) return this.leaveFinishedRoom(session, jogadorId);
    const assento = session.sala.jogadores.find((player) => player.id === jogadorId);
    if (!assento || assento.isBot) {
      throw new RoomError('AUTH_REQUIRED', AUTH_REQUIRED_MESSAGE);
    }
    const resumeTokenHashByPlayer = new Map(session.resumeTokenHashByPlayer);
    resumeTokenHashByPlayer.delete(jogadorId);
    const socketByPlayer = new Map(session.socketByPlayer);
    socketByPlayer.delete(jogadorId);
    this.zerarEstouros(session.sala.id, jogadorId);

    const ficam = humanPlayers(session).filter((player) => player.id !== jogadorId);
    if (ficam.length > 0) {
      const hostId =
        session.sala.hostId === jogadorId
          ? (ficam.find((player) => player.conectado) ?? ficam[0])!.id
          : session.sala.hostId;
      // Uma janela de Corta-Frente aberta segue normalmente até resolver.
      return this.commit({
        ...session,
        sala: {
          ...session.sala,
          hostId,
          jogadores: session.sala.jogadores.map((player) =>
            player.id === jogadorId ? assentoAbandonado(player) : player,
          ),
        },
        estado: {
          ...session.estado,
          jogadores: session.estado.jogadores.map((player) =>
            player.id === jogadorId ? assentoAbandonado(player) : player,
          ),
        },
        socketByPlayer,
        resumeTokenHashByPlayer,
      });
    }

    if (session.estado.interceptacao)
      this.clearInterceptionTimer(session.estado.interceptacao.janelaId);
    const estado: EstadoPartida = {
      ...session.estado,
      jogadores: session.estado.jogadores.map((player) =>
        player.id === jogadorId ? assentoAbandonado(player) : player,
      ),
      interceptacao: undefined,
      finalizada: true,
      historico: [
        ...session.estado.historico,
        { tipo: 'PARTIDA_FINALIZADA', timestamp: Date.now(), motivo: 'ABANDONO' },
      ],
    };
    return this.commit({
      ...session,
      sala: { ...session.sala, status: 'FINALIZADA' },
      estado,
      socketByPlayer,
      resumeTokenHashByPlayer,
    });
  }

  prepareDeterministicVictoryFixture(salaId: string): {
    session: RoomSession & { estado: EstadoPartida };
    fixture: DeterministicVictoryFixture;
  } {
    const session = this.requireActive(salaId);
    const estado = session.estado;
    const vencedorId = session.sala.hostId;
    const vencedorOriginal = estado.jogadores.find((jogador) => jogador.id === vencedorId);
    if (!vencedorOriginal) {
      throw new RoomError('INTERNAL', 'Host não encontrado na partida.');
    }

    const cartaVencedora =
      vencedorOriginal.mao.find((carta) => carta.cor !== 'NEUTRO') ?? vencedorOriginal.mao[0];
    if (!cartaVencedora) {
      throw new RoomError('INTERNAL', 'Host sem cartas para fixture determinística.');
    }
    const vencedorCardLabel = cardLabel(cartaVencedora);

    const oponenteOriginal = estado.jogadores.find((jogador) => jogador.id !== vencedorId);
    if (!oponenteOriginal) {
      throw new RoomError('INTERNAL', 'Fixture precisa de pelo menos dois jogadores.');
    }

    const allCards = [
      ...estado.jogadores.flatMap((jogador) => jogador.mao),
      ...estado.monteCompra,
      ...estado.monteDescarte,
    ];

    const cartasRestantes = allCards.filter((carta) => carta.id !== cartaVencedora.id);

    const topo =
      cartasRestantes.find(
        (carta) => carta.id !== cartaVencedora.id && carta.cor === cartaVencedora.cor,
      ) ??
      cartasRestantes.find(
        (carta) =>
          carta.id !== cartaVencedora.id &&
          ((carta.valor !== undefined && carta.valor === cartaVencedora.valor) ||
            (carta.acao !== undefined && carta.acao === cartaVencedora.acao)),
      );

    if (!topo) {
      throw new RoomError('INTERNAL', 'Não foi possível preparar topo jogável para fixture E2E.');
    }

    const cartasSemTopo = cartasRestantes.filter((carta) => carta.id !== topo.id);
    const cartasNaoVencedoras = cartasSemTopo.filter(
      (carta) => cardLabel(carta) !== vencedorCardLabel,
    );
    const cartaSegredoOponente =
      cartasNaoVencedoras.find((carta) =>
        ['TROCA_MAO', 'GIRA_MAO', 'ZERO_MAIS'].includes(carta.acao ?? ''),
      ) ?? cartasNaoVencedoras[0];
    if (!cartaSegredoOponente) {
      throw new RoomError('INTERNAL', 'Sem cartas suficientes para mão do oponente.');
    }

    const cartasSemSegredo = cartasNaoVencedoras.filter(
      (carta) => carta.id !== cartaSegredoOponente.id,
    );
    const labelSegredo = cardLabel(cartaSegredoOponente);
    const cartaApoioOponente =
      cartasSemSegredo.find((carta) => cardLabel(carta) !== labelSegredo) ?? cartasSemSegredo[0];
    if (!cartaApoioOponente) {
      throw new RoomError('INTERNAL', 'Sem carta de apoio para oponente na fixture E2E.');
    }
    const labelApoio = cardLabel(cartaApoioOponente);

    const idsReservados = new Set<string>([
      cartaVencedora.id,
      topo.id,
      cartaSegredoOponente.id,
      cartaApoioOponente.id,
    ]);

    const monteCompra = allCards.filter((carta) => !idsReservados.has(carta.id));

    const jogadores = estado.jogadores.map((jogador) => {
      if (jogador.id === vencedorId) {
        return { ...jogador, mao: [cartaVencedora], disseUno: false };
      }
      if (jogador.id === oponenteOriginal.id) {
        return { ...jogador, mao: [cartaSegredoOponente, cartaApoioOponente], disseUno: false };
      }
      return { ...jogador, mao: [], disseUno: false };
    });

    const novoEstado: EstadoPartida = {
      partidaId: estado.partidaId,
      salaId: estado.salaId,
      jogadores,
      monteCompra,
      monteDescarte: [topo],
      vezDe: vencedorId,
      sentido: estado.sentido,
      corAtiva: cartaVencedora.cor === 'NEUTRO' ? estado.corAtiva : cartaVencedora.cor,
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false, jogadoresQuebraram: [] },
      historico: estado.historico,
      finalizada: false,
    };

    const next = this.saveState(session, novoEstado) as RoomSession & { estado: EstadoPartida };

    return {
      session: next,
      fixture: {
        salaId: session.sala.id,
        vencedorId,
        vencedorCardId: cartaVencedora.id,
        vencedorCardLabel,
        oponenteCardLabels: [labelSegredo, labelApoio],
      },
    };
  }

  /**
   * Prepara deterministicamente uma janela de Corta-Frente pra E2E: dá ao
   * host uma carta elegível e a um segundo jogador uma carta real idêntica
   * (mesma cor e mesmo número/ação) — ambas já existem no baralho embaralhado,
   * nunca são clonadas. Só `corAtiva` é ajustada pra garantir que a jogada do
   * host seja válida (GDD: mesma cor ativa sempre é jogável, independente do
   * topo atual).
   */
  prepareInterceptacaoFixture(salaId: string): {
    session: RoomSession & { estado: EstadoPartida };
    fixture: InterceptacaoFixture;
  } {
    const session = this.requireActive(salaId);
    const estado = session.estado;
    const origemId = session.sala.hostId;
    const interceptadorJogador = estado.jogadores.find((jogador) => jogador.id !== origemId);
    if (!estado.jogadores.some((jogador) => jogador.id === origemId) || !interceptadorJogador) {
      throw new RoomError(
        'INTERNAL',
        'Fixture de Corta-Frente precisa do host e de pelo menos mais um jogador.',
      );
    }

    const allCards = [
      ...estado.jogadores.flatMap((jogador) => jogador.mao),
      ...estado.monteCompra,
      ...estado.monteDescarte,
    ];

    let par: [Carta, Carta] | undefined;
    for (const a of allCards) {
      if (!isEligibleForInterception(a)) continue;
      const b = allCards.find(
        (candidata) => candidata.id !== a.id && saoCartasIdenticas(a, candidata),
      );
      if (b) {
        par = [a, b];
        break;
      }
    }
    if (!par) {
      throw new RoomError(
        'INTERNAL',
        'Não há duas cartas reais idênticas elegíveis para a fixture E2E de Corta-Frente.',
      );
    }
    const [cartaOrigem, cartaInterceptadora] = par;
    const cartaOrigemLabel = cardLabel(cartaOrigem);

    const idsReservados = new Set([cartaOrigem.id, cartaInterceptadora.id]);
    const restantes = allCards.filter((carta) => !idsReservados.has(carta.id));
    const fillerOrigem = restantes[0];
    const fillerInterceptador = restantes.find((carta) => carta.id !== fillerOrigem?.id);
    if (!fillerOrigem || !fillerInterceptador) {
      throw new RoomError('INTERNAL', 'Sem cartas de apoio suficientes para a fixture E2E.');
    }
    idsReservados.add(fillerOrigem.id);
    idsReservados.add(fillerInterceptador.id);

    const monteCompra = allCards.filter((carta) => !idsReservados.has(carta.id));

    const jogadores = estado.jogadores.map((jogador) => {
      if (jogador.id === origemId) {
        return { ...jogador, mao: [cartaOrigem, fillerOrigem], disseUno: false };
      }
      if (jogador.id === interceptadorJogador.id) {
        return { ...jogador, mao: [cartaInterceptadora, fillerInterceptador], disseUno: false };
      }
      return { ...jogador, mao: [], disseUno: false };
    });

    const novoEstado: EstadoPartida = {
      ...estado,
      jogadores,
      monteCompra,
      vezDe: origemId,
      corAtiva: cartaOrigem.cor !== 'NEUTRO' ? cartaOrigem.cor : estado.corAtiva,
      ataqueAcumulado: 0,
      ataqueStack: [],
      finalizada: false,
    };

    const next = this.saveState(session, novoEstado) as RoomSession & { estado: EstadoPartida };

    return {
      session: next,
      fixture: {
        salaId: session.sala.id,
        origemId,
        interceptadorId: interceptadorJogador.id,
        cartaOrigemId: cartaOrigem.id,
        cartaOrigemLabel,
        cartaInterceptadoraId: cartaInterceptadora.id,
      },
    };
  }

  /**
   * Marca jogador como desconectado, mas NÃO remove ele da sala.
   * M14 (identidade estável): o jogador pode reconectar com o mesmo
   * `jogadorId` e voltar a jogar.
   */
  disconnect(socketId: string): RoomSession | undefined {
    const found = this.findBySocketId(socketId);
    if (!found) return undefined;
    const { session } = found;

    // Encontra o jogadorId deste socket
    const jogadorEntry = [...session.socketByPlayer.entries()].find(
      ([, sock]) => sock === socketId,
    );
    const jogadorId = jogadorEntry?.[0];
    if (!jogadorId) return undefined;

    const jogadores = session.sala.jogadores.map((j) =>
      j.id === jogadorId ? { ...j, conectado: false } : j,
    );
    const estado =
      session.estado === undefined
        ? undefined
        : {
            ...session.estado,
            jogadores: session.estado.jogadores.map((player) =>
              player.id === jogadorId ? { ...player, conectado: false } : player,
            ),
          };
    const next: RoomSession =
      estado === undefined
        ? { ...session, sala: { ...session.sala, jogadores } }
        : { ...session, sala: { ...session.sala, jogadores }, estado };
    return this.commit(next);
  }

  private require(salaId: string): RoomSession {
    const session = this.get(salaId);
    if (!session) throw new RoomError('SALA_INEXISTENTE', 'Sala não encontrada.');
    return session;
  }

  private requireActive(salaId: string): RoomSession & { estado: EstadoPartida } {
    const session = this.require(salaId);
    if (!session.estado) throw new RoomError('INTERNAL', 'A partida ainda não foi iniciada.');
    return session as RoomSession & { estado: EstadoPartida };
  }

  /** Grava o resultado de uma ação de turno: a vez recomeça, mesmo que volte ao mesmo jogador. */
  private saveState(session: RoomSession, estado: EstadoPartida): RoomSession {
    return this.commit({ ...session, estado }, true);
  }

  private commit(proposta: RoomSession, novaVez = false): RoomSession {
    const { session, vez } = this.aplicarPrazo(comPlacar(proposta), novaVez);
    const id = session.sala.id;
    if (this.persistence) {
      this.persistence.save([
        ...this.exportState().filter((room) => room.sala.id !== id),
        paraPersistir(session),
      ]);
    }
    this.rooms.set(id, session);
    if (vez) this.vezes.set(id, vez);
    else this.vezes.delete(id);
    for (const observer of this.commitObservers) {
      try {
        observer(session);
      } catch {
        // Um observador (bots, prazos, salas rápidas) nunca pode impedir uma jogada de ser gravada.
      }
    }
    return session;
  }

  /**
   * Decide o prazo da vez antes de gravar, para que a própria transmissão da
   * jogada já leve o prazo novo. O relógio só corre para uma pessoa conectada
   * que joga por si, fora do Corta-Frente.
   *
   * - Vez nova (ação de turno ou troca de dono): prazo inteiro.
   * - Mesma vez (reconexão de outro, penalidade de silêncio): prazo mantido.
   * - Queda do dono: guarda o que restava; ao voltar, continua dali (com um
   *   mínimo), para que recarregar a página não renda tempo extra.
   */
  private aplicarPrazo(
    session: RoomSession,
    novaVez: boolean,
  ): { session: RoomSession; vez?: VezAtual } {
    if (!session.estado) return { session };
    const estado = semTurno(session.estado);
    const agora = Date.now();
    const conhecida = this.vezes.get(session.sala.id);
    const anterior =
      !novaVez && conhecida?.partidaId === estado.partidaId && conhecida.jogadorId === estado.vezDe
        ? conhecida
        : undefined;
    const vez: VezAtual = {
      partidaId: estado.partidaId,
      jogadorId: estado.vezDe,
      revisao: anterior?.revisao ?? (this.ultimaRevisao += 1),
    };
    const dono = estado.jogadores.find((jogador) => jogador.id === estado.vezDe);
    const correndo =
      this.turnLimitMs > 0 &&
      !estado.finalizada &&
      !estado.interceptacao &&
      dono !== undefined &&
      dono.conectado &&
      !jogaComoBot(dono);

    if (!correndo) {
      const restante =
        anterior?.expiraEm !== undefined
          ? Math.max(0, anterior.expiraEm - agora)
          : anterior?.restanteMs;
      if (restante !== undefined) vez.restanteMs = restante;
      return { session: estado === session.estado ? session : { ...session, estado }, vez };
    }

    const minimo = Math.min(this.turnLimitMs, TURNO_MINIMO_AO_VOLTAR_MS);
    const expiraEm =
      anterior?.expiraEm ??
      agora +
        (anterior?.restanteMs !== undefined
          ? Math.max(minimo, anterior.restanteMs)
          : this.turnLimitMs);
    vez.expiraEm = expiraEm;
    const turno: PrazoTurno = {
      jogadorId: vez.jogadorId,
      expiraEm,
      duracaoMs: this.turnLimitMs,
      revisao: vez.revisao,
    };
    return { session: { ...session, estado: { ...estado, turno } }, vez };
  }
}
