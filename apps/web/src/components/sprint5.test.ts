import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotFound } from './NotFound';
import { VitoriaAnimada } from './VitoriaAnimada';

describe('Sprint 5 Assets & Visual Components (A11, A12)', () => {
  describe('[A11] NotFound', () => {
    it('renderiza título 404 e mensagem padrão', () => {
      const html = renderToStaticMarkup(React.createElement(NotFound));
      expect(html).toContain('ERRO 404');
      expect(html).toContain('Carta fora do baralho!');
      expect(html).toContain('Voltar ao Lobby');
    });

    it('exibe mensagem customizada quando fornecida', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotFound, { mensagem: 'Sala #999 não encontrada!' }),
      );
      expect(html).toContain('Sala #999 não encontrada!');
    });
  });

  describe('[A12] VitoriaAnimada', () => {
    it('renderiza modal de vitória para o jogador atual (isVoce=true)', () => {
      const html = renderToStaticMarkup(
        React.createElement(VitoriaAnimada, {
          vencedorNome: 'Alexandre',
          isVoce: true,
          onJogarNovamente: () => {},
        }),
      );
      expect(html).toContain('Você Venceu!');
      expect(html).toContain('GRANDE VITÓRIA!');
      expect(html).toContain('Jogar Novamente');
      expect(html).toContain('🏆');
    });

    it('renderiza modal de vitória para outro jogador (isVoce=false)', () => {
      const html = renderToStaticMarkup(
        React.createElement(VitoriaAnimada, {
          vencedorNome: 'MavisBot',
          isVoce: false,
          onJogarNovamente: () => {},
        }),
      );
      expect(html).toContain('MavisBot Venceu!');
      expect(html).toContain('PARTIDA CONCLUÍDA');
      expect(html).toContain('👑');
    });
  });
});
