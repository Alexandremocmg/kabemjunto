import { describe, expect, it } from 'vitest';
import {
  ALTURA_MAXIMA_DE_VOO,
  DURACAO_ASSENTADA,
  curvaDaAssentada,
  sombraDeVoo,
} from './assentada';

describe('curvaDaAssentada', () => {
  it('começa com um pop acima de 1 e termina exatamente no estado final', () => {
    const inicio = curvaDaAssentada(0);
    expect(inicio.escala).toBeGreaterThan(1.05);
    expect(inicio.escala).toBeLessThan(1.2);
    expect(inicio.inclinacao).toBeGreaterThan(0);
    expect(curvaDaAssentada(1)).toEqual({ escala: 1, inclinacao: 0, sombra: 0, sombraEscala: 1 });
  });

  it('a escala acomoda sem passar de 1 por mais que uma sobra pequena', () => {
    let menor = Infinity;
    let maior = -Infinity;
    for (let i = 0; i <= 100; i += 1) {
      const { escala } = curvaDaAssentada(i / 100);
      menor = Math.min(menor, escala);
      maior = Math.max(maior, escala);
    }
    expect(maior).toBeLessThanOrEqual(1.12 + 1e-9);
    // A sobra abaixo de 1 existe (acomodação), mas é discreta.
    expect(menor).toBeGreaterThan(0.98);
  });

  it('a inclinação e a sombra só diminuem e nunca ficam negativas', () => {
    let anterior = curvaDaAssentada(0);
    for (let i = 1; i <= 100; i += 1) {
      const atual = curvaDaAssentada(i / 100);
      expect(atual.inclinacao).toBeLessThanOrEqual(anterior.inclinacao + 1e-12);
      expect(atual.sombra).toBeLessThanOrEqual(anterior.sombra + 1e-12);
      expect(atual.inclinacao).toBeGreaterThanOrEqual(0);
      expect(atual.sombra).toBeGreaterThanOrEqual(0);
      anterior = atual;
    }
  });

  it('limita valores fora de 0..1 e ignora entradas inválidas', () => {
    expect(curvaDaAssentada(-3)).toEqual(curvaDaAssentada(0));
    expect(curvaDaAssentada(7)).toEqual(curvaDaAssentada(1));
    expect(curvaDaAssentada(Number.NaN)).toEqual(curvaDaAssentada(0));
  });

  it('dura menos de meio segundo, para não segurar jogadas em sequência', () => {
    expect(DURACAO_ASSENTADA).toBeGreaterThan(0.1);
    expect(DURACAO_ASSENTADA).toBeLessThan(0.5);
  });
});

describe('sombraDeVoo', () => {
  it('no chão coincide com o início da acomodação (sem salto entre as fases)', () => {
    const chao = sombraDeVoo(0);
    expect(chao.opacidade).toBeCloseTo(curvaDaAssentada(0).sombra, 10);
    expect(chao.escala).toBe(1);
    expect(chao.deslocamentoX).toBe(0);
    expect(chao.deslocamentoZ).toBe(0);
  });

  it('quanto mais alta a carta, mais larga, mais fraca e mais deslocada é a sombra', () => {
    const baixa = sombraDeVoo(0.3);
    const alta = sombraDeVoo(ALTURA_MAXIMA_DE_VOO);
    expect(alta.escala).toBeGreaterThan(baixa.escala);
    expect(alta.opacidade).toBeLessThan(baixa.opacidade);
    expect(alta.deslocamentoX).toBeGreaterThan(baixa.deslocamentoX);
    expect(alta.deslocamentoZ).toBeGreaterThan(baixa.deslocamentoZ);
  });

  it('mantém a opacidade em uma faixa visível e limitada, mesmo acima do máximo', () => {
    const muitoAlta = sombraDeVoo(50);
    expect(muitoAlta.opacidade).toBeGreaterThan(0.1);
    expect(muitoAlta.opacidade).toBeLessThanOrEqual(0.3);
    expect(sombraDeVoo(-2)).toEqual(sombraDeVoo(0));
    expect(sombraDeVoo(Number.NaN)).toEqual(sombraDeVoo(0));
  });
});
