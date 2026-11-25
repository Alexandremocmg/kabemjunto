import { describe, expect, it } from 'vitest';
import { curvaDoAnelDeSilencio, curvaDoImpacto } from './impacto';

describe('curvas de impacto', () => {
  it('a plaqueta parte do repouso, pulsa e termina exatamente nele', () => {
    expect(curvaDoImpacto(0)).toEqual({ escala: 1, desvioX: 0 });
    expect(curvaDoImpacto(0.5).escala).toBeGreaterThan(1.1);
    for (const fim of [1, 1.5, NaN]) expect(curvaDoImpacto(fim)).toEqual({ escala: 1, desvioX: 0 });
  });

  it('o anel abre, aparece e some por completo', () => {
    expect(curvaDoAnelDeSilencio(0).opacidade).toBe(0);
    expect(curvaDoAnelDeSilencio(0.25).opacidade).toBeGreaterThan(0.6);
    expect(curvaDoAnelDeSilencio(0.8).escala).toBeGreaterThan(curvaDoAnelDeSilencio(0.2).escala);
    expect(curvaDoAnelDeSilencio(1)).toEqual({ escala: 1, opacidade: 0 });
  });
});
