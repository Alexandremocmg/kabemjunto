import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalaRapidaEspera, segundosRestantes } from './SalaRapidaEspera';

const AGORA = 1_000_000;

function renderizar(props: Partial<Parameters<typeof SalaRapidaEspera>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(SalaRapidaEspera, {
      jogadores: [{ id: 'a', nome: 'Ana' }],
      rapida: { tamanhoAlvo: 4, iniciaEm: AGORA + 7_200 },
      souAnfitriao: true,
      onComecar: () => {},
      onCancelar: () => {},
      agora: () => AGORA,
      ...props,
    }),
  );
}

describe('segundosRestantes', () => {
  it('arredonda para cima e nunca fica negativo', () => {
    expect(segundosRestantes(AGORA + 7_200, AGORA)).toBe(8);
    expect(segundosRestantes(AGORA + 1, AGORA)).toBe(1);
    expect(segundosRestantes(AGORA, AGORA)).toBe(0);
    expect(segundosRestantes(AGORA - 5_000, AGORA)).toBe(0);
  });
});

describe('SalaRapidaEspera', () => {
  it('mostra a contagem, quem já sentou e quantos bots vão completar a mesa', () => {
    const html = renderizar();
    expect(html).toContain('Começa em 8 s');
    expect(html).toContain('1 de 4 jogadores');
    expect(html).toContain('3 bots completam');
    expect(html).toContain('Ana');
    expect(html.match(/Vaga — um bot entra/g)).toHaveLength(3);
  });

  it('só o anfitrião vê "Começar agora com bots"; todos podem cancelar', () => {
    expect(renderizar({ souAnfitriao: true })).toContain('Começar agora com bots');
    const convidado = renderizar({ souAnfitriao: false });
    expect(convidado).not.toContain('Começar agora com bots');
    expect(convidado).toContain('Cancelar');
  });

  it('com a mesa cheia não oferece completar com bots', () => {
    const html = renderizar({
      jogadores: [
        { id: 'a', nome: 'Ana' },
        { id: 'b', nome: 'Bia' },
      ],
      rapida: { tamanhoAlvo: 2, iniciaEm: AGORA + 9_000 },
    });
    expect(html).toContain('Mesa cheia');
    expect(html).not.toContain('Começar agora com bots');
  });

  it('com o prazo vencido avisa que os bots estão entrando', () => {
    expect(renderizar({ rapida: { tamanhoAlvo: 4, iniciaEm: AGORA - 1 } })).toContain(
      'Chamando os bots',
    );
  });

  it('enquanto o servidor não responde mostra só a busca e o cancelamento', () => {
    const html = renderizar({ rapida: undefined, jogadores: [] });
    expect(html).toContain('Procurando uma mesa');
    expect(html).toContain('Cancelar');
    expect(html).not.toContain('Começar agora');
  });
});
