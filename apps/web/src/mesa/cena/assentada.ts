/**
 * Curvas do "peso" das cartas ao pousar no descarte (opção `?peso=1`).
 *
 * São funções puras, sem Three.js: a cena só lê os números e aplica na malha.
 * Ficam separadas para poder testar o ritmo e os limites sem abrir WebGL.
 */

/** Quanto dura a acomodação depois que a carta chega ao descarte, em segundos. */
export const DURACAO_ASSENTADA = 0.26;

/** Altura máxima do arco de voo (a mesma que `voar()` usa na cena). */
export const ALTURA_MAXIMA_DE_VOO = 1.7;

/** Voos mais curtos que isso (rearranjo da pilha) não ganham pouso nem sombra. */
export const DISTANCIA_MINIMA_DO_POUSO = 0.6;

const AMPLITUDE_DO_POP = 0.12;
const INCLINACAO_INICIAL = 0.1; // radianos
const OPACIDADE_DA_SOMBRA_NO_CHAO = 0.3;
const QUEDA_DA_SOMBRA_NO_ALTO = 0.14;

export interface Assentada {
  /** Multiplicador da escala da carta (passa de 1 e volta, com leve sobra). */
  escala: number;
  /** Inclinação, em radianos, em torno do eixo da largura da carta: ela "bate" e achata. */
  inclinacao: number;
  /** Opacidade da sombra sob a carta. */
  sombra: number;
  /** Multiplicador do tamanho da sombra (maior logo após o impacto). */
  sombraEscala: number;
}

export interface SombraDeVoo {
  opacidade: number;
  escala: number;
  /** Deslocamento da sombra em relação ao ponto da mesa sob a carta. */
  deslocamentoX: number;
  deslocamentoZ: number;
}

function limitar01(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor));
}

/**
 * Acomodação da carta depois de pousar. `progresso` vai de 0 (impacto) a 1 (parada).
 * Em 1 devolve exatamente o estado final, para a cena não deixar resíduo.
 */
export function curvaDaAssentada(progresso: number): Assentada {
  const p = limitar01(progresso);
  if (p >= 1) return { escala: 1, inclinacao: 0, sombra: 0, sombraEscala: 1 };
  const restante = 1 - p;
  return {
    escala: 1 + AMPLITUDE_DO_POP * Math.exp(-5 * p) * Math.cos(2 * Math.PI * p),
    inclinacao: INCLINACAO_INICIAL * restante ** 3,
    sombra: OPACIDADE_DA_SOMBRA_NO_CHAO * restante ** 2,
    sombraEscala: 1 + 0.25 * restante,
  };
}

/**
 * Sombra de uma carta em voo, conforme a altura do arco: quanto mais alta,
 * mais larga, mais fraca e mais deslocada. Em altura 0 coincide com o início
 * da acomodação, então não há salto entre as duas fases.
 */
export function sombraDeVoo(altura: number): SombraDeVoo {
  const alta = Math.max(0, Number.isFinite(altura) ? altura : 0);
  const t = limitar01(alta / ALTURA_MAXIMA_DE_VOO);
  return {
    opacidade: OPACIDADE_DA_SOMBRA_NO_CHAO - QUEDA_DA_SOMBRA_NO_ALTO * t,
    escala: 1 + 0.35 * t,
    deslocamentoX: 0.1 * alta,
    deslocamentoZ: 0.16 * alta,
  };
}
