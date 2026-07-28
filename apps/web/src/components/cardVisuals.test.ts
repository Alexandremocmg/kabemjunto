import { describe, it, expect } from 'vitest';
import { getCardVisual, CARD_BACK_ASSET } from './cardVisuals.js';
import type { Carta } from '@kabemjunto/shared/types';

// Helper para criar carta canônica mínima sem tocar packages/shared
function carta(overrides: Partial<Carta> & { tipo: Carta['tipo'] }): Carta {
  return {
    id: 'test-carta',
    cor: 'NEUTRO',
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: 'Teste',
    efeito_texto_longo: 'Carta de teste',
    ...overrides,
  };
}

describe('cardVisuals — catálogo visual', () => {
  describe('Cartas com arte premium (assets reais)', () => {
    it('MAIS_QUATRO mapeia para mais-quatro.webp', () => {
      const v = getCardVisual(carta({ tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'MAIS_QUATRO' }));
      expect(v.kind).toBe('asset');
      if (v.kind === 'asset') {
        expect(v.src).toContain('mais-quatro.webp');
        expect(v.src).toContain('/assets/cards/kabemjunto/');
      }
    });

    it('ZERO_MAIS mapeia para zero-mais.webp', () => {
      const v = getCardVisual(carta({ tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'ZERO_MAIS' }));
      expect(v.kind).toBe('asset');
      if (v.kind === 'asset') expect(v.src).toContain('zero-mais.webp');
    });

    it('TROCA_MAO mapeia para troca-mao.webp', () => {
      const v = getCardVisual(carta({ tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'TROCA_MAO' }));
      expect(v.kind).toBe('asset');
      if (v.kind === 'asset') expect(v.src).toContain('troca-mao.webp');
    });

    it('GIRA_MAO mapeia para gira-mao.webp', () => {
      const v = getCardVisual(carta({ tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'GIRA_MAO' }));
      expect(v.kind).toBe('asset');
      if (v.kind === 'asset') expect(v.src).toContain('gira-mao.webp');
    });

    it('CORINGA_SIMPLES mapeia para coringa.webp', () => {
      const v = getCardVisual(carta({ tipo: 'NEUTRA', cor: 'NEUTRO', acao: 'CORINGA_SIMPLES' }));
      expect(v.kind).toBe('asset');
      if (v.kind === 'asset') expect(v.src).toContain('coringa.webp');
    });
  });

  describe('MAIS_DOIS — +2 canônico', () => {
    it('MAIS_DOIS retorna template, não arte especial', () => {
      const v = getCardVisual(carta({ tipo: 'ACAO', cor: 'LARANJA', acao: 'MAIS_DOIS' }));
      expect(v.kind).toBe('template');
    });

    it('MAIS_DOIS usa template acao-colorida', () => {
      const v = getCardVisual(carta({ tipo: 'ACAO', cor: 'AZUL', acao: 'MAIS_DOIS' }));
      if (v.kind === 'template') expect(v.variant).toBe('acao-colorida');
    });
  });

  describe('Carta 7 (SILENCIO) — visualmente secreta', () => {
    it('carta 7 retorna template numeric (regra do silêncio visualmente oculta)', () => {
      const v = getCardVisual(
        carta({ tipo: 'NUMERADA', cor: 'LARANJA', valor: 7, acao: 'SILENCIO' }),
      );
      expect(v.kind).toBe('template');
      if (v.kind === 'template') expect(v.variant).toBe('numeric');
    });
  });

  describe('Cartas numéricas', () => {
    it('carta numérica 0 retorna template numeric', () => {
      const v = getCardVisual(carta({ tipo: 'NUMERADA', cor: 'AZUL', valor: 0 }));
      expect(v.kind).toBe('template');
      if (v.kind === 'template') expect(v.variant).toBe('numeric');
    });

    it('carta numérica 9 retorna template numeric', () => {
      const v = getCardVisual(carta({ tipo: 'NUMERADA', cor: 'PRETO', valor: 9 }));
      expect(v.kind).toBe('template');
      if (v.kind === 'template') expect(v.variant).toBe('numeric');
    });
  });

  describe('Ações coloridas', () => {
    it('SKIP retorna template acao-colorida', () => {
      const v = getCardVisual(carta({ tipo: 'ACAO', cor: 'VERDE', acao: 'SKIP' }));
      expect(v.kind).toBe('template');
      if (v.kind === 'template') expect(v.variant).toBe('acao-colorida');
    });

    it('REVERSE retorna template acao-colorida', () => {
      const v = getCardVisual(carta({ tipo: 'ACAO', cor: 'PRETO', acao: 'REVERSE' }));
      expect(v.kind).toBe('template');
      if (v.kind === 'template') expect(v.variant).toBe('acao-colorida');
    });
  });

  describe('Verso e constante CARD_BACK_ASSET', () => {
    it('CARD_BACK_ASSET aponta para card-back.webp', () => {
      expect(CARD_BACK_ASSET).toContain('card-back.webp');
      expect(CARD_BACK_ASSET).toContain('/assets/cards/kabemjunto/');
    });
  });
});
