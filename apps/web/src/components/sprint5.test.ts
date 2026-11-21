import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotFound } from './NotFound';
import { VitoriaAnimada } from './VitoriaAnimada';
import { PainelColecao } from './PainelColecao';

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

  describe('[Fase 5] PainelColecao — prévia premium do baralho', () => {
    const basePainelProps = {
      avatarId: '01',
      tema: 'FLORESTA' as const,
      onAvatarChange: () => {},
      onTemaChange: () => {},
      onClose: () => {},
    };

    it('renderiza dialog com aria-modal e título associado', () => {
      const html = renderToStaticMarkup(React.createElement(PainelColecao, basePainelProps));
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="collection-title"');
      expect(html).toContain('id="collection-title"');
    });

    it('renderiza botão fechar com aria-label acessível', () => {
      const html = renderToStaticMarkup(React.createElement(PainelColecao, basePainelProps));
      expect(html).toContain('aria-label="Fechar coleção"');
    });

    it('renderiza imagem do verso do baralho na prévia', () => {
      const html = renderToStaticMarkup(React.createElement(PainelColecao, basePainelProps));
      expect(html).toContain('card-back.webp');
      expect(html).toContain('Verso do baralho Kabemjunto');
    });

    it('renderiza as 3 cartas especiais canônicas na prévia', () => {
      const html = renderToStaticMarkup(React.createElement(PainelColecao, basePainelProps));
      expect(html).toContain('mais-quatro.webp');
      expect(html).toContain('zero-mais.webp');
      expect(html).toContain('troca-mao.webp');
    });

    it('renderiza radiogroup de avatares com aria-label', () => {
      const html = renderToStaticMarkup(React.createElement(PainelColecao, basePainelProps));
      expect(html).toContain('aria-label="Escolha seu avatar"');
      expect(html).toContain('role="radiogroup"');
    });

    it('renderiza radiogroup de temas com aria-label', () => {
      const html = renderToStaticMarkup(React.createElement(PainelColecao, basePainelProps));
      expect(html).toContain('aria-label="Escolha o tema da mesa"');
    });

    it('marca o tema NEON como selecionado quando passado via props', () => {
      const html = renderToStaticMarkup(
        React.createElement(PainelColecao, { ...basePainelProps, tema: 'NEON' }),
      );
      expect(html).toContain('aria-checked="true"');
    });
  });
});
