/**
 * Curvas dos efeitos de impacto (plaqueta atingida e anel do Silêncio).
 * Puras, sem Three.js: `progresso` vai de 0 (começo) a 1 (fim), e em 1 devolvem
 * exatamente o repouso, para a cena não deixar resíduo.
 */

/** Pulso e tremor da plaqueta, em segundos. */
export const DURACAO_IMPACTO = 0.45;
/** Anel que se abre quando a carta de Silêncio pousa, em segundos. */
export const DURACAO_ANEL_SILENCIO = 0.9;

const PULSO = 0.22;
const TREMOR = 0.12;
const OSCILACOES = 4;
const OPACIDADE_DO_ANEL = 0.7;

function limitar01(valor: number): number {
  return Number.isFinite(valor) ? Math.min(1, Math.max(0, valor)) : 1;
}

export function curvaDoImpacto(progresso: number): { escala: number; desvioX: number } {
  const p = limitar01(progresso);
  if (p >= 1) return { escala: 1, desvioX: 0 };
  const restante = 1 - p;
  return {
    escala: 1 + PULSO * Math.sin(Math.PI * p),
    desvioX: TREMOR * Math.sin(2 * Math.PI * OSCILACOES * p) * restante,
  };
}

export function curvaDoAnelDeSilencio(progresso: number): { escala: number; opacidade: number } {
  const p = limitar01(progresso);
  if (p >= 1) return { escala: 1, opacidade: 0 };
  return {
    escala: 1.1 + 0.6 * (1 - (1 - p) ** 2),
    opacidade: OPACIDADE_DO_ANEL * Math.sin(Math.PI * Math.sqrt(p)),
  };
}
