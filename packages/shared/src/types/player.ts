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
}
