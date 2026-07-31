import { describe, expect, it } from 'vitest';
import type { Carta } from '@kabemjunto/shared/types';
import {
  appendCardToMultipleDiscardStack,
  canActivateMultipleDiscardStack,
  canSelectMultipleDiscardCard,
  createMultipleDiscardStack,
  findFirstValidInStack,
  getSelectedMultipleDiscardCards,
  isEligibleForMultipleDiscard,
  reconcileStacks,
  rotateStack,
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
  it('cria uma pilha ordenada quando a âncora jogável é arrastada sobre a mesma face', () => {
    const seteAzul = carta({ id: 'sete-azul', tipo: 'NUMERADA', valor: 7, cor: 'AZUL' });
    const seteVerde = carta({ id: 'sete-verde', tipo: 'NUMERADA', valor: 7, cor: 'VERDE' });
    const mao = [seteAzul, seteVerde];

    expect(createMultipleDiscardStack(seteAzul, seteVerde, mao, true)).toEqual([
      'sete-azul',
      'sete-verde',
    ]);
  });

  it('não cria ou amplia uma pilha ao soltar sobre uma face inválida', () => {
    const seteAzul = carta({ id: 'sete-azul', tipo: 'NUMERADA', valor: 7, cor: 'AZUL' });
    const oitoAzul = carta({ id: 'oito-azul', tipo: 'NUMERADA', valor: 8, cor: 'AZUL' });
    const mao = [seteAzul, oitoAzul];

    expect(createMultipleDiscardStack(seteAzul, oitoAzul, mao, true)).toEqual([]);
    expect(appendCardToMultipleDiscardStack(['sete-azul'], oitoAzul, mao)).toEqual(['sete-azul']);
  });

  it('mantém a primeira carta normalmente jogável, mas permite acrescentar a mesma face', () => {
    const seteAzul = carta({ id: 'sete-azul', tipo: 'NUMERADA', valor: 7, cor: 'AZUL' });
    const seteVerde = carta({ id: 'sete-verde', tipo: 'NUMERADA', valor: 7, cor: 'VERDE' });
    const mao = [seteAzul, seteVerde];

    expect(createMultipleDiscardStack(seteAzul, seteVerde, mao, false)).toEqual([]);
    expect(appendCardToMultipleDiscardStack(['sete-azul'], seteVerde, mao)).toEqual([
      'sete-azul',
      'sete-verde',
    ]);
  });

  it('habilita a ativação direta apenas para uma pilha pronta com handler de jogada', () => {
    expect(canActivateMultipleDiscardStack(['sete-azul'], true)).toBe(false);
    expect(canActivateMultipleDiscardStack(['sete-azul', 'sete-verde'], false)).toBe(false);
    expect(canActivateMultipleDiscardStack(['sete-azul', 'sete-verde'], true)).toBe(true);
  });

  it.each([
    carta({ id: 'numerada', tipo: 'NUMERADA', valor: 8 }),
    carta({ id: 'mais-dois', tipo: 'ACAO', acao: 'MAIS_DOIS' }),
    carta({ id: 'skip', tipo: 'ACAO', acao: 'SKIP' }),
    carta({ id: 'reverse', tipo: 'ACAO', acao: 'REVERSE' }),
  ])('aceita $id', (cartaDaMao) => {
    expect(isEligibleForMultipleDiscard(cartaDaMao)).toBe(true);
  });

  it.each([
    carta({ id: 'sete-silencio', tipo: 'NUMERADA', valor: 7, acao: 'SILENCIO' }),
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

    expect(getSelectedMultipleDiscardCards(mao, ['reverse', 'sete'])).toEqual([mao[2]]);
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

describe('rotateStack — rotação circular', () => {
  it('rotaciona [a,b,c] para [b,c,a]', () => {
    expect(rotateStack(['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });

  it('rotaciona um par [a,b] para [b,a]', () => {
    expect(rotateStack(['a', 'b'])).toEqual(['b', 'a']);
  });

  it('retorna singleton sem alteração', () => {
    expect(rotateStack(['a'])).toEqual(['a']);
  });

  it('retorna array vazio sem alteração', () => {
    expect(rotateStack([])).toEqual([]);
  });
});

describe('reconcileStacks — reconciliação contra a mão atual', () => {
  it('remove IDs ausentes da mão', () => {
    const sete = carta({ id: 'sete', tipo: 'NUMERADA', valor: 7 });
    const oito = carta({ id: 'oito', tipo: 'NUMERADA', valor: 8 });
    const mao = [sete, oito];

    expect(reconcileStacks([['sete', 'nove']], mao)).toEqual([]);
  });

  it('dissolve grupos com menos de 2 cartas após remoção', () => {
    const sete = carta({ id: 'sete', tipo: 'NUMERADA', valor: 7 });
    const mao = [sete];

    expect(reconcileStacks([['sete', 'sete-verde']], mao)).toEqual([]);
  });

  it('preserva grupo com 2+ cartas presentes', () => {
    const a = carta({ id: 'a', tipo: 'NUMERADA', valor: 7 });
    const b = carta({ id: 'b', tipo: 'NUMERADA', valor: 7 });
    const mao = [a, b];

    expect(reconcileStacks([['a', 'b']], mao)).toEqual([['a', 'b']]);
  });

  it('não acrescenta cartas novas automaticamente', () => {
    const a = carta({ id: 'a', tipo: 'NUMERADA', valor: 7 });
    const b = carta({ id: 'b', tipo: 'NUMERADA', valor: 7 });
    const c = carta({ id: 'c', tipo: 'NUMERADA', valor: 7 });
    const mao = [a, b, c];

    expect(reconcileStacks([['a', 'b']], mao)).toEqual([['a', 'b']]);
  });

  it('preserva múltiplos grupos independentemente', () => {
    const a = carta({ id: 'a', tipo: 'NUMERADA', valor: 6 });
    const b = carta({ id: 'b', tipo: 'NUMERADA', valor: 6 });
    const c = carta({ id: 'c', tipo: 'NUMERADA', valor: 8 });
    const d = carta({ id: 'd', tipo: 'NUMERADA', valor: 8 });
    const mao = [a, b, c, d];

    const resultado = reconcileStacks(
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
      mao,
    );
    expect(resultado).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('pilhas não jogadas sobrevivem à dissolução de outra', () => {
    const a = carta({ id: 'a', tipo: 'NUMERADA', valor: 6 });
    const b = carta({ id: 'b', tipo: 'NUMERADA', valor: 6 });
    const c = carta({ id: 'c', tipo: 'NUMERADA', valor: 8 });
    const mao = [a, b, c]; // 'd' foi removida da mão (c+d eram pilha)

    const resultado = reconcileStacks(
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
      mao,
    );
    expect(resultado).toEqual([['a', 'b']]);
  });
});

describe('findFirstValidInStack — promoção da primeira carta válida', () => {
  it('rotaciona até a primeira carta válida na ordem preparada', () => {
    const seteAzul = carta({ id: 'sete-azul', tipo: 'NUMERADA', valor: 7, cor: 'AZUL' });
    const seteVerde = carta({ id: 'sete-verde', tipo: 'NUMERADA', valor: 7, cor: 'VERDE' });
    const mao = [seteAzul, seteVerde];
    const isValid = (c: Carta) => c.id === 'sete-verde';

    const resultado = findFirstValidInStack(['sete-azul', 'sete-verde'], mao, isValid);
    expect(resultado).toEqual(['sete-verde', 'sete-azul']);
  });

  it('mantém pilha inalterada se já tem carta válida na posição 0', () => {
    const seteAzul = carta({ id: 'sete-azul', tipo: 'NUMERADA', valor: 7, cor: 'AZUL' });
    const seteVerde = carta({ id: 'sete-verde', tipo: 'NUMERADA', valor: 7, cor: 'VERDE' });
    const mao = [seteAzul, seteVerde];
    const isValid = (c: Carta) => c.id === 'sete-azul';

    expect(findFirstValidInStack(['sete-azul', 'sete-verde'], mao, isValid)).toEqual([
      'sete-azul',
      'sete-verde',
    ]);
  });

  it('preserva a pilha sem desfazê-la quando nenhuma carta é válida', () => {
    const a = carta({ id: 'a', tipo: 'NUMERADA', valor: 7 });
    const b = carta({ id: 'b', tipo: 'NUMERADA', valor: 7 });
    const mao = [a, b];
    const isValid = () => false;

    expect(findFirstValidInStack(['a', 'b'], mao, isValid)).toEqual(['a', 'b']);
  });

  it('retorna array vazio para pilha vazia', () => {
    expect(findFirstValidInStack([], [], () => true)).toEqual([]);
  });
});
