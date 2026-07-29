import { describe, expect, it } from 'vitest';
import type { Carta } from '@kabemjunto/shared/types';
import {
  canSelectMultipleDiscardCard,
  getSelectedMultipleDiscardCards,
  isEligibleForMultipleDiscard,
  toggleMultipleDiscardSelection,
} from './multipleDiscard';

function carta(overrides: Partial<Carta> & Pick<Carta, 'tipo'>): Carta {
  return {
    id: 'carta-teste',
    cor: 'LARANJA',
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: 'Teste',
    efeito_texto_longo: 'Carta de teste',
    ...overrides,
  };
}

describe('Descarte múltiplo — seleção de faces permitidas', () => {
  it.each([
    carta({ id: 'numerada', tipo: 'NUMERADA', valor: 8 }),
    carta({ id: 'mais-dois', tipo: 'ACAO', acao: 'MAIS_DOIS' }),
    carta({ id: 'skip', tipo: 'ACAO', acao: 'SKIP' }),
    carta({ id: 'reverse', tipo: 'ACAO', acao: 'REVERSE' }),
  ])('aceita $id', (cartaDaMao) => {
    expect(isEligibleForMultipleDiscard(cartaDaMao)).toBe(true);
  });

  it.each([
    carta({ id: 'mais-quatro', tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'MAIS_QUATRO' }),
    carta({ id: 'troca-mao', tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'TROCA_MAO' }),
    carta({ id: 'gira-mao', tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'GIRA_MAO' }),
    carta({ id: 'zero-mais', tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'ZERO_MAIS' }),
  ])('não aceita $id', (cartaDaMao) => {
    expect(isEligibleForMultipleDiscard(cartaDaMao)).toBe(false);
  });

  it('preserva a ordem em que o jogador selecionou as cartas para confirmação', () => {
    const mao = [
      carta({ id: 'skip', tipo: 'ACAO', acao: 'SKIP' }),
      carta({ id: 'sete', tipo: 'NUMERADA', valor: 7, acao: 'SILENCIO' }),
      carta({ id: 'reverse', tipo: 'ACAO', acao: 'REVERSE' }),
    ];

    expect(getSelectedMultipleDiscardCards(mao, ['reverse', 'sete'])).toEqual([mao[2], mao[1]]);
  });

  it('alterna uma carta permitida sem selecionar faces não aprovadas', () => {
    const numero = carta({ id: 'numero', tipo: 'NUMERADA', valor: 3 });
    const cortaFrente = carta({
      id: 'corta-frente',
      tipo: 'NEUTRA',
      cor: 'NEUTRO',
      acao: 'GIRA_MAO',
    });

    expect(toggleMultipleDiscardSelection([], numero)).toEqual(['numero']);
    expect(toggleMultipleDiscardSelection(['numero'], numero)).toEqual([]);
    expect(toggleMultipleDiscardSelection([], cortaFrente)).toEqual([]);
  });

  it('não permite acrescentar uma face diferente à seleção atual', () => {
    const seteAzul = carta({ id: 'sete-azul', tipo: 'NUMERADA', valor: 7, cor: 'AZUL' });
    const seteVerde = carta({ id: 'sete-verde', tipo: 'NUMERADA', valor: 7, cor: 'VERDE' });
    const maisDois = carta({ id: 'mais-dois', tipo: 'ACAO', acao: 'MAIS_DOIS' });
    const mao = [seteAzul, seteVerde, maisDois];

    expect(toggleMultipleDiscardSelection(['sete-azul'], seteVerde, mao)).toEqual([
      'sete-azul',
      'sete-verde',
    ]);
    expect(toggleMultipleDiscardSelection(['sete-azul'], maisDois, mao)).toEqual(['sete-azul']);
  });

  it('permite a segunda carta da mesma face mesmo quando ela não é jogável contra o topo original', () => {
    const seteAzul = carta({ id: 'sete-azul', tipo: 'NUMERADA', valor: 7, cor: 'AZUL' });
    const seteVerde = carta({ id: 'sete-verde', tipo: 'NUMERADA', valor: 7, cor: 'VERDE' });
    const mao = [seteAzul, seteVerde];

    expect(canSelectMultipleDiscardCard([], seteAzul, mao, true)).toBe(true);
    expect(canSelectMultipleDiscardCard(['sete-azul'], seteVerde, mao, false)).toBe(true);
  });

  it('exige que a primeira carta seja normalmente jogável e bloqueia faces misturadas', () => {
    const seteAzul = carta({ id: 'sete-azul', tipo: 'NUMERADA', valor: 7, cor: 'AZUL' });
    const oitoAzul = carta({ id: 'oito-azul', tipo: 'NUMERADA', valor: 8, cor: 'AZUL' });
    const mao = [seteAzul, oitoAzul];

    expect(canSelectMultipleDiscardCard([], seteAzul, mao, false)).toBe(false);
    expect(canSelectMultipleDiscardCard(['sete-azul'], oitoAzul, mao, true)).toBe(false);
  });
});
