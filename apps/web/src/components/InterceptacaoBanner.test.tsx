// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Carta } from '@kabemjunto/shared';
import { InterceptacaoBanner } from './InterceptacaoBanner';

function numero(id: string, cor: Carta['cor'], valor: number): Carta {
  return {
    id,
    tipo: 'NUMERADA',
    cor,
    valor,
    raridade: 'COMUM',
    colecao: 'test',
    efeito_texto_curto: `${valor}`,
    efeito_texto_longo: `${valor}`,
  };
}

describe('InterceptacaoBanner', () => {
  it('mostra a carta alvo e as cartas elegíveis; clique dispara onInterceptar com o id certo', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const onInterceptar = vi.fn();
    const cartaAlvo = numero('topo', 'AZUL', 7);
    const elegivel = numero('minha-azul-7', 'AZUL', 7);

    act(() => {
      root.render(
        <InterceptacaoBanner
          cartaAlvo={cartaAlvo}
          fechaEm={Date.now() + 3000}
          cartasElegiveis={[elegivel]}
          onInterceptar={onInterceptar}
        />,
      );
    });

    const botao = container.querySelector<HTMLButtonElement>('.interceptacao-carta-botao');
    expect(botao).not.toBeNull();
    act(() => botao!.click());
    expect(onInterceptar).toHaveBeenCalledWith('minha-azul-7');

    act(() => root.unmount());
  });

  it('mostra mensagem quando não há cartas elegíveis para interceptar', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const cartaAlvo = numero('topo', 'AZUL', 7);

    act(() => {
      root.render(
        <InterceptacaoBanner
          cartaAlvo={cartaAlvo}
          fechaEm={Date.now() + 3000}
          cartasElegiveis={[]}
          onInterceptar={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain('Você não tem carta idêntica para interceptar.');
    act(() => root.unmount());
  });
});
