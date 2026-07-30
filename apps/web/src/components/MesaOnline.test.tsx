// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Carta, EstadoPartidaPublico } from '@kabemjunto/shared';
import { MesaOnline } from './MesaOnline';

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

const estado: EstadoPartidaPublico = {
  partidaId: 'partida',
  salaId: 'sala',
  jogadores: [
    {
      id: 'jogador',
      nome: 'Você',
      quantidadeCartas: cartas.length,
      isBot: false,
      conectado: true,
      disseUno: false,
      avatar: '👤',
      pontos: 0,
    },
    {
      id: 'oponente',
      nome: 'Oponente',
      quantidadeCartas: 4,
      isBot: false,
      conectado: true,
      disseUno: false,
      avatar: '🤖',
      pontos: 0,
    },
  ],
  topo: cartas[0]!,
  quantidadeMonteCompra: 40,
  vezDe: 'jogador',
  sentido: 1,
  corAtiva: 'AZUL',
  ataqueAcumulado: 0,
  ataqueStack: [],
  silencio: { ativo: false, jogadoresQuebraram: [] },
  finalizada: false,
};

function dispatchPointer(
  element: HTMLElement,
  type: 'pointerdown' | 'pointerup',
  pointerType: 'touch' | 'mouse',
): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: 20, clientY: 20 });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
  });
  element.dispatchEvent(event);
}

function tap(slot: HTMLElement, pointerType: 'touch' | 'mouse'): void {
  const target = slot.querySelector<HTMLElement>('.card-wrapper') ?? slot;
  dispatchPointer(target, 'pointerdown', pointerType);
  dispatchPointer(target, 'pointerup', pointerType);
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function renderMesa(onSelecionarCarta = vi.fn(), onPlayMultiple = vi.fn()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(
      <MesaOnline
        estado={estado}
        mao={cartas}
        mensagens={[]}
        jogadorId="jogador"
        onSelecionarCarta={onSelecionarCarta}
        onPlayMultiple={onPlayMultiple}
        onComprarCarta={() => {}}
        onEnviarFalaRapida={() => {}}
      />,
    );
  });
  return { container, root, onSelecionarCarta, onPlayMultiple };
}

describe('MesaOnline — toque e descarte múltiplo', () => {
  it('confirma a jogada única no segundo toque da mesma carta', () => {
    const rendered = renderMesa();
    const primeira = rendered.container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!primeira) throw new Error('Carta online não foi renderizada.');

    act(() => tap(primeira, 'touch'));
    const primeiraAtualizada = rendered.container.querySelector<HTMLElement>(
      '[data-card-id="sete-azul"]',
    );
    if (!primeiraAtualizada) throw new Error('Carta online armada desapareceu.');
    act(() => tap(primeiraAtualizada, 'touch'));

    expect(rendered.onSelecionarCarta).toHaveBeenCalledTimes(2);
    expect(rendered.onSelecionarCarta).toHaveBeenNthCalledWith(1, cartas[0]);
    expect(rendered.onSelecionarCarta).toHaveBeenNthCalledWith(2, cartas[0]);
    act(() => rendered.root.unmount());
  });

  it('cria pilha no segundo toque de outra carta da mesma face', () => {
    const rendered = renderMesa();
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas online não foram renderizadas.');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    expect(rendered.onSelecionarCarta).toHaveBeenCalledOnce();
    expect(
      rendered.container
        .querySelector('.multiple-discard-inline-stack')
        ?.getAttribute('aria-label'),
    ).toContain('2 cartas, na ordem selecionada');
    act(() => rendered.root.unmount());
  });

  it('mantém dois cliques normais do mouse fora do Tap-to-Stack', () => {
    const rendered = renderMesa();
    const primeira = rendered.container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!primeira) throw new Error('Carta online não foi renderizada.');

    act(() => tap(primeira, 'mouse'));
    act(() => tap(primeira, 'mouse'));

    expect(rendered.onSelecionarCarta).toHaveBeenCalledTimes(2);
    expect(rendered.container.querySelector('.multiple-discard-inline-stack')).toBeNull();
    act(() => rendered.root.unmount());
  });
});
