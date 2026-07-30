// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Carta, EstadoPartida } from '@kabemjunto/shared/types';
import { MaoDoJogador } from './MaoDoJogador';

const cartas: ReadonlyArray<Carta> = [
  {
    id: 'sete-azul',
    tipo: 'NUMERADA',
    cor: 'AZUL',
    valor: 7,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: '7',
    efeito_texto_longo: 'Carta numérica',
  },
  {
    id: 'sete-verde',
    tipo: 'NUMERADA',
    cor: 'VERDE',
    valor: 7,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: '7',
    efeito_texto_longo: 'Carta numérica',
  },
  {
    id: 'sete-laranja',
    tipo: 'NUMERADA',
    cor: 'LARANJA',
    valor: 7,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: '7',
    efeito_texto_longo: 'Carta numérica',
  },
  {
    id: 'oito-azul',
    tipo: 'NUMERADA',
    cor: 'AZUL',
    valor: 8,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: '8',
    efeito_texto_longo: 'Carta numérica',
  },
];

const estado = {
  partidaId: 'partida',
  salaId: 'sala',
  jogadores: [
    {
      id: 'jogador',
      nome: 'Você',
      mao: cartas,
      isBot: false,
      conectado: true,
      disseUno: false,
      avatar: '👤',
      pontos: 0,
    },
  ],
  monteCompra: [],
  monteDescarte: [cartas[0]],
  vezDe: 'jogador',
  sentido: 1,
  corAtiva: 'AZUL',
  ataqueAcumulado: 0,
  ataqueStack: [],
  silencio: { ativo: false, jogadoresQuebraram: [] },
  historico: [],
  finalizada: false,
} as EstadoPartida;

describe('MaoDoJogador — pilha por gesto', () => {
  it('arma a primeira carta jogável no toque e acrescenta a mesma face no segundo toque, sem jogar a carta comum', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const selecionarCarta = vi.fn();
    const root = createRoot(container);

    act(() => {
      root.render(
        <MaoDoJogador
          estado={estado}
          onSelecionarCarta={selecionarCarta}
          onPlayMultiple={() => {}}
        />,
      );
    });

    const [primeira, segunda] = Array.from(
      container.querySelectorAll<HTMLElement>('.hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas da mão não foram renderizadas.');

    act(() => {
      primeira.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(selecionarCarta).not.toHaveBeenCalled();
    expect(container.querySelector('.multiple-discard-touch-feedback')?.textContent).toContain(
      'Pilha armada: toque outra carta de mesma face',
    );

    act(() => {
      segunda.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const stack = container.querySelector<HTMLElement>('.multiple-discard-inline-stack');
    expect(stack?.getAttribute('aria-label')).toContain('2 cartas, na ordem selecionada');
    expect(stack?.querySelectorAll('.multiple-discard-inline-stack-card')).toHaveLength(2);

    act(() => root.unmount());
  });

  it('mantém a pilha armada ao tocar uma face diferente e explica o motivo pelo leitor de tela', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <MaoDoJogador estado={estado} onSelecionarCarta={() => {}} onPlayMultiple={() => {}} />,
      );
    });
    const [primeira, , , diferente] = Array.from(
      container.querySelectorAll<HTMLElement>('.hand-card-slot'),
    );
    if (!primeira || !diferente) throw new Error('Cartas da mão não foram renderizadas.');

    act(() => {
      primeira.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      diferente.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.multiple-discard-inline-stack')).toBeNull();
    expect(container.querySelector('.multiple-discard-touch-feedback')?.textContent).toContain(
      'não tem a mesma face',
    );
    act(() => root.unmount());
  });

  it('remove controles e texto de teclado permanentes; o feedback de toque fica em aria-live', () => {
    const html = renderToStaticMarkup(
      <MaoDoJogador estado={estado} onSelecionarCarta={() => {}} onPlayMultiple={() => {}} />,
    );

    expect(html).not.toContain('Descarte múltiplo');
    expect(html).not.toContain('Revisar descarte múltiplo');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('Alt+Enter');
    expect(html).toContain('multiple-discard-touch-feedback');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('hand-fan');
    expect(html).not.toContain('multiple-discard-stack');
    expect(html).not.toContain('Limpar pilha');
  });

  it('empilha qualquer quantidade na âncora, mostra a última carta à frente e descarta na ordem do gesto', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const descartes: ReadonlyArray<Carta>[] = [];
    const root = createRoot(container);

    act(() => {
      root.render(
        <MaoDoJogador
          estado={estado}
          onSelecionarCarta={() => {}}
          onPlayMultiple={(pilha) => descartes.push(pilha)}
        />,
      );
    });

    const [anchor, target, appended] = Array.from(
      container.querySelectorAll<HTMLElement>('.hand-card-slot'),
    );
    if (!anchor || !target || !appended) throw new Error('Cartas da mão não foram renderizadas.');

    act(() => {
      anchor.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }),
      );
      target.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, clientX: 50, clientY: 20 }),
      );
      appended.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 20 }),
      );
      anchor.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, clientX: 110, clientY: 20 }),
      );
    });

    const stack = container.querySelector<HTMLElement>('.multiple-discard-inline-stack');
    expect(stack).not.toBeNull();
    expect(container.querySelectorAll('.hand-card-slot')).toHaveLength(2);
    expect(stack?.getAttribute('aria-label')).toContain('3 cartas, na ordem selecionada');
    expect(stack?.querySelectorAll('.multiple-discard-inline-stack-card')).toHaveLength(3);
    expect(
      stack?.querySelector('.multiple-discard-inline-stack-card:last-child')?.textContent,
    ).toContain('7');
    expect(container.textContent).not.toContain('Pilha pronta');
    expect(container.textContent).not.toContain('Limpar pilha');

    act(() => {
      stack?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(descartes).toEqual([cartas.slice(0, 3)]);
    act(() => {
      root.unmount();
    });
  });
});
