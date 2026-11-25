/**
 * Tipos do domínio Jogador.
 * Fonte canônica: GDD Kabemjunto §03.4.3.
 *
 * ADR-004: `avatar` e `pontos` foram adicionados pelo Antigravity no MVP.
 * Mantidos aqui para preservar o comportamento do frontend sem quebrar tipos.
 */

/** Identificador opaco de jogador (UUID v4 em produção). */
export type JogadorId = string;

/**
 * Por que um bot assumiu o assento de uma pessoa:
 * - `SAIU`    → abandonou a partida; não volta (`isBot` passa a ser `true`).
 * - `CAIU`    → perdeu a conexão; volta a jogar ao reconectar.
 * - `INATIVO` → deixou o tempo da vez acabar duas vezes; volta ao agir.
 */
export type MotivoControleBot = 'SAIU' | 'CAIU' | 'INATIVO';

/**
 * Estado de um jogador dentro de uma partida.
 *
 * Invariantes:
 * - `mao` é privada — outros jogadores só veem a `quantidade` (não as cartas).
 * - `isBot` define se o jogador é controlado por IA (single-player).
 * - `disseUno` é relevante apenas quando `mao.length === 1` (regra do UNO).
 *   Esquecer de gritar "UNO" antes do próximo jogar = +2 cartas (regra clássica).
 * - `avatar` é o emoji/ícone exibido no HUD. Default aleatório se vazio.
 * - `pontos` é o placar acumulado entre rodadas (F2P / leaderboard).
 *   Zerado no início de cada partida.
 */
export interface Jogador {
  id: JogadorId;
  /** Nome exibido na mesa. Sanitizado para evitar injection. */
  nome: string;
  /** Cartas na mão. Privadas — só o próprio jogador vê. */
  mao: ReadonlyArray<import('./card.js').Carta>;
  /** Se true, o jogador é um bot controlado por IA. */
  isBot: boolean;
  /** Conexão ativa. Em modo online, o servidor usa isso pra detectar drop. */
  conectado: boolean;
  /** Marcado quando o jogador gritou "UNO" ao ficar com 1 carta. */
  disseUno: boolean;
  /** Emoji exibido no HUD. Vazio = sem avatar. */
  avatar: string;
  /** Placar acumulado entre rodadas. */
  pontos: number;
  /**
   * Um bot está jogando por este assento. Com `isBot: false` é temporário: a
   * pessoa recupera o controle ao voltar. Ausente = a própria pessoa joga (ou
   * é um bot que está na mesa desde o início).
   */
  controladoPorBot?: boolean;
  /** Por que um bot assumiu; só existe junto com `controladoPorBot`. */
  motivoBot?: MotivoControleBot;
}

/**
 * Visão pública de um jogador (omitindo cartas da mão).
 * É o que o servidor envia para os OUTROS jogadores.
 */
export interface JogadorPublico {
  id: JogadorId;
  nome: string;
  /** Quantidade de cartas na mão (sem revelar quais). */
  quantidadeCartas: number;
  isBot: boolean;
  conectado: boolean;
  disseUno: boolean;
  avatar: string;
  pontos: number;
  /**
   * Um bot está jogando por este assento. Com `isBot: false` é temporário: a
   * pessoa recupera o controle ao voltar. Ausente = a própria pessoa joga (ou
   * é um bot que está na mesa desde o início).
   */
  controladoPorBot?: boolean;
  /** Por que um bot assumiu; só existe junto com `controladoPorBot`. */
  motivoBot?: MotivoControleBot;
}

/**
 * Identidade persistente de um jogador, independente do socket.
 *
 * Sprint 3 (M14): cada jogador recebe um `jogadorId` UUID v4 na primeira
 * entrada e o persiste no cliente. O servidor mapeia `jogadorId → socketId`
 * (atualizado a cada reconexão), permitindo que o jogador saia e volte sem
 * perder a mão, pontos ou posição na mesa.
 *
 * Fluxo:
 * - Cliente novo: gera UUID local, salva em sessionStorage, envia ao entrar.
 * - Reconexão: lê UUID do sessionStorage, reenvia ao reconectar.
 * - Servidor: aceita UUID novo (cria jogador) ou existente (atualiza socket).
 *
 * Fora de escopo (Sprint 4+): autenticação real, JWT, validação de formato.
 */
export interface SessaoJogador {
  /** UUID v4 gerado pelo cliente via `crypto.randomUUID()`. */
  jogadorId: JogadorId;
  /** Sala em que o jogador está (ou pretende entrar). */
  salaId: string;
  /** Nome de exibição (sanitizado no servidor). */
  nome: string;
}
