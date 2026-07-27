/**
 * Tipos do domínio Carta.
 * Fonte canônica: GDD Kabemjunto §03.4.3 (modelo de dados) e §02 (regras).
 *
 * Princípios:
 * - Union types em vez de booleanos soltos (mais difícil errar).
 * - Enums em string para serialização estável (JSON em WebSocket).
 * - `Carta.id` é a chave primária em todo o sistema (baralho, mão, descarte).
 */

/** Cores do baralho. 4 cores coloridas + 1 marcador para neutras (coringas). */
export const CORES = ['LARANJA', 'AZUL', 'VERDE', 'PRETO', 'NEUTRO'] as const;
export type Cor = (typeof CORES)[number];

/** Cores "jogáveis" (excluindo NEUTRO). Usadas em validação de cor. */
export const CORES_COLORIDAS: ReadonlyArray<Exclude<Cor, 'NEUTRO'>> = [
  'LARANJA',
  'AZUL',
  'VERDE',
  'PRETO',
] as const;

/** Tipo da carta. NUMERADA e ACAO têm cor; NEUTRA sempre tem cor NEUTRO. */
export const TIPOS_CARTA = ['NUMERADA', 'ACAO', 'NEUTRA'] as const;
export type TipoCarta = (typeof TIPOS_CARTA)[number];

/**
 * Ações possíveis. SILENCIO é sub-efeito da carta 7 (numerada).
 * ZERO_MAIS é o "0+" lendário que reflete o ataque acumulado.
 */
export const ACOES = [
  'SKIP',
  'REVERSE',
  'MAIS_DOIS',
  'MAIS_QUATRO',
  'TROCA_MAO',
  'GIRA_MAO',
  'ZERO_MAIS',
  'CORINGA_SIMPLES',
  'SILENCIO',
] as const;
export type Acao = (typeof ACOES)[number];

/** Raridade — usada em loja, balanceamento e UI. */
export const RARIDADES = ['COMUM', 'INCOMUM', 'RARA', 'UNICA'] as const;
export type Raridade = (typeof RARIDADES)[number];

/**
 * Carta do baralho.
 *
 * Invariantes (validadas no construtor `criarCarta()` — ver `card.factory.ts`):
 * - `cor === 'NEUTRO'` ⇔ `tipo === 'NEUTRA'`
 * - `tipo === 'NUMERADA'` ⇒ `valor ∈ [0, 9]`
 * - `tipo === 'ACAO'` ⇒ `acao ∈ {SKIP, REVERSE, MAIS_DOIS, SILENCIO}` e `cor ≠ 'NEUTRO'`
 * - `tipo === 'NEUTRA'` ⇒ `acao ∈ {MAIS_QUATRO, TROCA_MAO, GIRA_MAO, ZERO_MAIS, CORINGA_SIMPLES}` e `cor === 'NEUTRO'`
 * - `acao === 'SILENCIO'` ⇔ `valor === 7` (a regra do 7 é literalmente a carta 7)
 *
 * O `id` segue o padrão:
 * - Numerada:  `"<valor>-<COR>"`          ex: `"7-LARANJA"`
 * - Ação:      `"<ACAO>-<COR>-<n>"`       ex: `"SKIP-AZUL-1"` (n = 1 ou 2 cópias)
 * - Neutra:    `"<ACAO>-UNICA"` ou `"+4-<n>"`  ex: `"MAIS_QUATRO-2"` (n = 1..4)
 */
export interface Carta {
  /** Identificador único estável. Ex: "7-LARANJA", "+4-2", "ZERO_MAIS-UNICA". */
  id: string;
  /** Cor da carta. NEUTRO apenas para coringas. */
  cor: Cor;
  /** Categoria da carta. */
  tipo: TipoCarta;
  /** Valor numérico 0-9. Obrigatório se tipo === NUMERADA. */
  valor?: number;
  /** Ação. Obrigatório se tipo === ACAO ou NEUTRA. */
  acao?: Acao;
  /** Raridade — afeta loja, balanceamento, animação. */
  raridade: Raridade;
  /** Coleção temática. Ex: "base-v1", "tropical-v1", "rock-v1". */
  colecao: string;
  /** Texto curto do efeito (1-2 palavras). Ex: "Silêncio", "Pula". */
  efeito_texto_curto: string;
  /** Texto longo do efeito (1 frase). Ex: "Próximo a falar compra +2". */
  efeito_texto_longo: string;
}
