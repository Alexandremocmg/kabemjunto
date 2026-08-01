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
  {
    id: 'oito-verde',
    tipo: 'NUMERADA',
    cor: 'VERDE',
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
  it('permite comprar do monte quando a única carta jogável na mão é TROCA_MAO', () => {
    const trocaMao: Carta = {
      id: 'troca-mao',
      tipo: 'NEUTRA',
      cor: 'NEUTRO',
      acao: 'TROCA_MAO',
      raridade: 'RARA',
      colecao: 'base-v1',
      efeito_texto_curto: 'Troca Mão',
      efeito_texto_longo: 'Escolha um jogador e troque toda a sua mão com a dele!',
    };
    const maoComTroca: ReadonlyArray<Carta> = [trocaMao];
    const estadoComTroca: EstadoPartidaPublico = {
      ...estado,
      jogadores: estado.jogadores.map((j) =>
        j.id === 'jogador' ? { ...j, quantidadeCartas: maoComTroca.length } : j,
      ),
    };

    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const onComprarCarta = vi.fn();
    act(() => {
      root.render(
        <MesaOnline
          estado={estadoComTroca}
          mao={maoComTroca}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={onComprarCarta}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    const deckSlot = container.querySelector<HTMLElement>('.deck-slot');
    expect(deckSlot?.getAttribute('title')).toBe('Comprar carta');
    expect(deckSlot?.textContent).not.toContain('Você tem uma carta válida na mão');

    act(() => root.unmount());
  });

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
    ).toContain('Ordem: 7 AZUL, 7 VERDE');
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

// ---------------------------------------------------------------------------
// Organização fora da vez — comportamentos novos
// ---------------------------------------------------------------------------

const estadoForaDaVez: EstadoPartidaPublico = {
  ...estado,
  vezDe: 'oponente', // local player is NOT the active player
};

function renderMesaForaDaVez(onSelecionarCarta = vi.fn(), onPlayMultiple = vi.fn()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(
      <MesaOnline
        estado={estadoForaDaVez}
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

describe('MesaOnline — organização fora da vez', () => {
  it('mantém carta elegível tocável e focável para organização local', () => {
    const rendered = renderMesaForaDaVez();
    const slot = rendered.container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    const carta = slot?.querySelector<HTMLElement>('.card-wrapper');
    if (!slot || !carta) throw new Error('Carta não encontrada');

    expect(slot.tabIndex).toBe(0);
    expect(slot.getAttribute('aria-label')).toContain('organizar pilha');
    expect(carta.getAttribute('aria-disabled')).toBe('true');
    act(() => rendered.root.unmount());
  });

  it('primeiro toque fora da vez cria âncora local sem chamar onSelecionarCarta/onPlayMultiple', () => {
    const rendered = renderMesaForaDaVez();
    const slot = rendered.container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!slot) throw new Error('Carta não encontrada');

    act(() => tap(slot, 'touch'));

    expect(rendered.onSelecionarCarta).not.toHaveBeenCalled();
    expect(rendered.onPlayMultiple).not.toHaveBeenCalled();
    act(() => rendered.root.unmount());
  });

  it('segundo toque em outra carta da mesma face cria pilha preparada de 2 cartas fora da vez', () => {
    const rendered = renderMesaForaDaVez();
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    expect(rendered.onSelecionarCarta).not.toHaveBeenCalled();
    expect(rendered.onPlayMultiple).not.toHaveBeenCalled();
    const stack = rendered.container.querySelector('.multiple-discard-inline-stack');
    expect(stack).not.toBeNull();
    expect(stack?.getAttribute('aria-label')).toContain('2 cartas');
    act(() => rendered.root.unmount());
  });

  it('botão Rotacionar pilha responde a Enter por teclado fora da vez sem interceptação do ancestral', () => {
    const rendered = renderMesaForaDaVez();
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    const ordemAntes = rendered.container
      .querySelector('.multiple-discard-inline-stack')
      ?.querySelector('.multiple-discard-inline-stack-card')
      ?.getAttribute('data-stack-card-id');
    expect(ordemAntes).toBe('sete-azul');

    const rotateButton =
      rendered.container.querySelector<HTMLButtonElement>('.stack-rotate-button');
    if (!rotateButton) throw new Error('Botão de rotação não encontrado.');
    act(() => {
      rotateButton.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      rotateButton.click();
    });

    const ordemDepois = rendered.container
      .querySelector('.multiple-discard-inline-stack')
      ?.querySelector('.multiple-discard-inline-stack-card')
      ?.getAttribute('data-stack-card-id');
    expect(ordemDepois).toBe('sete-verde');
    expect(rendered.onPlayMultiple).not.toHaveBeenCalled();
    act(() => rendered.root.unmount());
  });

  it('âncora solitária criada fora da vez é cancelada quando começa a vez local', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <MesaOnline
          estado={estadoForaDaVez}
          mao={cartas}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // Tap to create singleton anchor while off-turn
    const slot = container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!slot) throw new Error('Carta não encontrada');
    act(() => tap(slot, 'touch'));
    // Singleton should be visible (no stack yet, just selection feedback)
    const feedbackBefore = container.querySelector('.multiple-discard-touch-feedback')?.textContent;
    expect(feedbackBefore).toContain('Pilha armada');

    // Now it becomes our turn
    act(() => {
      root.render(
        <MesaOnline
          estado={{ ...estadoForaDaVez, vezDe: 'jogador' }}
          mao={cartas}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // Singleton should be dissolved - no stack button visible
    expect(container.querySelector('.multiple-discard-inline-stack')).toBeNull();
    act(() => root.unmount());
  });

  it('pilha preparada de 2+ cartas persiste quando começa a vez local', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <MesaOnline
          estado={estadoForaDaVez}
          mao={cartas}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // Build a 2-card stack off-turn
    const [primeira, segunda] = Array.from(
      container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');
    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));
    expect(container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();

    // Now it becomes our turn
    act(() => {
      root.render(
        <MesaOnline
          estado={{ ...estadoForaDaVez, vezDe: 'jogador' }}
          mao={cartas}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // 2-card stack should survive
    expect(container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();
    act(() => root.unmount());
  });

  it('toque no corpo da pilha preparada rotaciona a ordem sem jogar', () => {
    const rendered = renderMesaForaDaVez();
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    const stackBefore = rendered.container.querySelector<HTMLElement>(
      '.multiple-discard-inline-stack',
    );
    expect(stackBefore).not.toBeNull();
    const cardsBefore = Array.from(
      stackBefore!.querySelectorAll('.multiple-discard-inline-stack-card'),
    ).map((el) => el.getAttribute('data-stack-card-id'));

    act(() => {
      stackBefore!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const stackAfter = rendered.container.querySelector<HTMLElement>(
      '.multiple-discard-inline-stack',
    );
    const cardsAfter = Array.from(
      stackAfter!.querySelectorAll('.multiple-discard-inline-stack-card'),
    ).map((el) => el.getAttribute('data-stack-card-id'));

    // Order should have changed (rotated)
    expect(cardsAfter).not.toEqual(cardsBefore);
    // No play was emitted
    expect(rendered.onPlayMultiple).not.toHaveBeenCalled();
    act(() => rendered.root.unmount());
  });
});

// ---------------------------------------------------------------------------
// ACK flow — pending, accept and reject
// ---------------------------------------------------------------------------

function renderMesaComMao(maoInicial: ReadonlyArray<Carta>, onPlayMultiple = vi.fn()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);

  function rerender(novasMao: ReadonlyArray<Carta>) {
    act(() => {
      root.render(
        <MesaOnline
          estado={estado}
          mao={novasMao}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={vi.fn()}
          onPlayMultiple={onPlayMultiple}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });
  }

  act(() => {
    root.render(
      <MesaOnline
        estado={estado}
        mao={maoInicial}
        mensagens={[]}
        jogadorId="jogador"
        onSelecionarCarta={vi.fn()}
        onPlayMultiple={onPlayMultiple}
        onComprarCarta={() => {}}
        onEnviarFalaRapida={() => {}}
      />,
    );
  });

  return { container, root, rerender, onPlayMultiple };
}

describe('MesaOnline — ACK flow (pilha enviada)', () => {
  it('serializa duas pilhas e bloqueia a segunda enquanto a primeira aguarda ACK', () => {
    const rendered = renderMesaComMao(cartas);
    const slots = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    expect(slots).toHaveLength(4);

    act(() => tap(slots[0]!, 'touch'));
    act(() => tap(slots[1]!, 'touch'));
    act(() => tap(slots[2]!, 'touch'));
    act(() => tap(slots[3]!, 'touch'));

    const stacks = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.multiple-discard-inline-stack'),
    );
    expect(stacks).toHaveLength(2);

    const playButtons = Array.from(
      rendered.container.querySelectorAll<HTMLButtonElement>('.stack-play-button'),
    );
    expect(playButtons).toHaveLength(2);
    act(() => {
      playButtons[0]!.click();
      playButtons[1]!.click();
    });

    expect(rendered.onPlayMultiple).toHaveBeenCalledOnce();
    expect(rendered.container.querySelectorAll('.multiple-discard-inline-stack')).toHaveLength(2);
    expect(
      rendered.container.querySelectorAll('.multiple-discard-inline-stack[aria-disabled="true"]'),
    ).toHaveLength(2);
    act(() => rendered.root.unmount());
  });

  it('pilha fica em "enviando" até que mao mude — feedback visível', () => {
    const rendered = renderMesaComMao(cartas);
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    // Build 2-card stack on your turn via touch
    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    // Activate via keyboard Enter on the stack
    const stack = rendered.container.querySelector<HTMLElement>('.multiple-discard-inline-stack');
    expect(stack).not.toBeNull();
    act(() => {
      stack!.querySelector<HTMLButtonElement>('.stack-play-button')!.click();
    });

    // onPlayMultiple should have been called
    expect(rendered.onPlayMultiple).toHaveBeenCalledOnce();

    // Feedback should say "enviando" — stack still present while mao hasn't changed
    const feedback = rendered.container.querySelector('.multiple-discard-touch-feedback');
    expect(feedback?.textContent).toContain('Enviando');

    // Stack visual should still be visible (not cleared yet)
    expect(rendered.container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();

    act(() => rendered.root.unmount());
  });

  it('pilha é removida quando servidor aceita (cartas saem da mão)', () => {
    const rendered = renderMesaComMao(cartas);
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    const stack = rendered.container.querySelector<HTMLElement>('.multiple-discard-inline-stack');
    act(() => {
      stack!.querySelector<HTMLButtonElement>('.stack-play-button')!.click();
    });

    // Simulate server accepting: mao no longer has the two played cards
    const maoAposAceite = cartas.filter((c) => c.id !== 'sete-azul' && c.id !== 'sete-verde');
    rendered.rerender(maoAposAceite);

    // Stack should be gone
    expect(rendered.container.querySelector('.multiple-discard-inline-stack')).toBeNull();
    // Feedback should indicate acceptance
    const feedback = rendered.container.querySelector('.multiple-discard-touch-feedback');
    expect(feedback?.textContent).toContain('aceita');

    act(() => rendered.root.unmount());
  });

  it('pilha é preservada quando servidor rejeita (via descarteMultiploErro)', () => {
    // Rejection is signalled via descarteMultiploErro counter increment, not mao reference change
    const rendered = renderMesaComErro(cartas, 0);
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    const stack = rendered.container.querySelector<HTMLElement>('.multiple-discard-inline-stack');
    act(() => {
      stack!.querySelector<HTMLButtonElement>('.stack-play-button')!.click();
    });

    // Simulate server rejecting: increment descarteMultiploErro (no mao change)
    rendered.rerender(cartas, 1);

    // Stack should still be present (preserved)
    expect(rendered.container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();
    // Feedback should indicate rejection
    const feedback = rendered.container.querySelector('.multiple-discard-touch-feedback');
    expect(feedback?.textContent).toContain('rejeitada');

    act(() => rendered.root.unmount());
  });
});

// ---------------------------------------------------------------------------
// Bug 1: sendingStack stuck forever on rejection via descarteMultiploErro prop
// ---------------------------------------------------------------------------

function renderMesaComErro(
  maoInicial: ReadonlyArray<Carta>,
  descarteMultiploErro?: number,
  onPlayMultiple = vi.fn(),
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);

  function rerender(novasMao: ReadonlyArray<Carta>, novoErro?: number) {
    act(() => {
      root.render(
        <MesaOnline
          estado={estado}
          mao={novasMao}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={vi.fn()}
          onPlayMultiple={onPlayMultiple}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
          descarteMultiploErro={novoErro}
        />,
      );
    });
  }

  act(() => {
    root.render(
      <MesaOnline
        estado={estado}
        mao={maoInicial}
        mensagens={[]}
        jogadorId="jogador"
        onSelecionarCarta={vi.fn()}
        onPlayMultiple={onPlayMultiple}
        onComprarCarta={() => {}}
        onEnviarFalaRapida={() => {}}
        descarteMultiploErro={descarteMultiploErro}
      />,
    );
  });

  return { container, root, rerender, onPlayMultiple };
}

describe('MesaOnline — ACK flow (bug fixes)', () => {
  it('sendingStack persiste quando mao muda por outra razão com cartas ainda presentes', () => {
    // Bug 2 companion: mao reference changes but sent cards still present
    // should NOT falsely trigger rejection
    const rendered = renderMesaComMao(cartas);
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    const stack = rendered.container.querySelector<HTMLElement>('.multiple-discard-inline-stack');
    act(() => {
      stack!.querySelector<HTMLButtonElement>('.stack-play-button')!.click();
    });

    // Simulate mao changing (e.g. Troca/Gira) but sent cards still present
    // Use same cards in new array - sendingStack should remain active (no false rejection)
    const maoComMesmasCartas = [...cartas];
    rendered.rerender(maoComMesmasCartas);

    // Stack should still be visible (not falsely rejected just because mao ref changed)
    expect(rendered.container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();
    // Feedback should NOT say "rejeitada" falsely - only descarteMultiploErro triggers rejection
    const feedback = rendered.container.querySelector('.multiple-discard-touch-feedback');
    // sendingStack still active, feedback should NOT say rejected (it should stay 'Enviando' or similar)
    expect(feedback?.textContent).not.toContain('rejeitada');

    act(() => rendered.root.unmount());
  });

  it('descarteMultiploErro prop libera sendingStack e preserva pilha sem alterar mao', () => {
    const rendered = renderMesaComErro(cartas, 0);
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    const stack = rendered.container.querySelector<HTMLElement>('.multiple-discard-inline-stack');
    act(() => {
      stack!.querySelector<HTMLButtonElement>('.stack-play-button')!.click();
    });

    // Verify sending state
    const feedbackBefore = rendered.container.querySelector('.multiple-discard-touch-feedback');
    expect(feedbackBefore?.textContent).toContain('Enviando');

    // Server rejects via error counter increment (no mao change)
    rendered.rerender(cartas, 1);

    // Stack should still be visible (preserved)
    expect(rendered.container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();
    // Feedback should indicate rejection
    const feedback = rendered.container.querySelector('.multiple-discard-touch-feedback');
    expect(feedback?.textContent).toContain('rejeitada');
    // sendingStack should be cleared (no .stack-sending class)
    const stackEl = rendered.container.querySelector('.multiple-discard-inline-stack');
    expect(stackEl?.classList.contains('stack-sending')).toBe(false);

    act(() => rendered.root.unmount());
  });
});

// ---------------------------------------------------------------------------
// Bug 2: reconcileStacks on every mao change
// ---------------------------------------------------------------------------

describe('MesaOnline — reconcileStacks em toda mudança de mao', () => {
  it('reconcileStacks é executado em toda mudança de mao mesmo sem sendingStack', () => {
    const rendered = renderMesaForaDaVez();
    const [primeira, segunda] = Array.from(
      rendered.container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    // Build 2-card stack off-turn
    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));
    expect(rendered.container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();

    // Re-render with mao that only has oito-azul (sete-azul and sete-verde removed)
    act(() => {
      rendered.root.render(
        <MesaOnline
          estado={estadoForaDaVez}
          mao={[cartas[2]!]} // only oito-azul
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={vi.fn()}
          onPlayMultiple={vi.fn()}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // Stack should be dissolved since both cards were removed from mao
    expect(rendered.container.querySelector('.multiple-discard-inline-stack')).toBeNull();

    act(() => rendered.root.unmount());
  });
});

// ---------------------------------------------------------------------------
// Bug 3: Auto-promotion feedback on turn start
// ---------------------------------------------------------------------------

describe('MesaOnline — feedback de promoção ao iniciar turno', () => {
  it('promoção ao iniciar turno emite feedback com primeira carta/cor da pilha', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);

    // Start off-turn with 2-card stack [sete-verde, sete-azul]
    // corAtiva = AZUL, so sete-azul matches by color, sete-verde matches by value (7)
    act(() => {
      root.render(
        <MesaOnline
          estado={estadoForaDaVez}
          mao={cartas}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // Build 2-card stack off-turn with sete-verde first, sete-azul second
    const slots = Array.from(
      container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    const seteVerdeSlot = slots.find((s) => s.getAttribute('data-card-id') === 'sete-verde');
    const seteAzulSlot = slots.find((s) => s.getAttribute('data-card-id') === 'sete-azul');
    if (!seteVerdeSlot || !seteAzulSlot) throw new Error('Cartas não encontradas');

    act(() => tap(seteVerdeSlot, 'touch'));
    act(() => tap(seteAzulSlot, 'touch'));

    expect(container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();

    // Now it becomes our turn
    act(() => {
      root.render(
        <MesaOnline
          estado={{ ...estadoForaDaVez, vezDe: 'jogador' }}
          mao={cartas}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // Stack should still be present (2-card stack survives turn start)
    expect(container.querySelector('.multiple-discard-inline-stack')).not.toBeNull();

    // Feedback should contain card face info (number or color)
    const feedback = container.querySelector('.multiple-discard-touch-feedback');
    expect(feedback?.textContent).toMatch(/Pilha pronta/);
    // Should contain color info
    expect(feedback?.textContent).toMatch(/AZUL|VERDE/);

    act(() => root.unmount());
  });
});

// ---------------------------------------------------------------------------
// Bug 4: setPointerCapture not called for mouse on stack drags
// ---------------------------------------------------------------------------

describe('MesaOnline — setPointerCapture apenas para touch', () => {
  it('iniciarArrasto em pilha via mouse NÃO chama setPointerCapture', () => {
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
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // Build a 2-card stack on your turn
    const slots = Array.from(
      container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    const [primeira, segunda] = slots;
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    // Now there should be a stack with anchor at sete-azul
    const stackEl = container.querySelector<HTMLElement>('.multiple-discard-inline-stack');
    expect(stackEl).not.toBeNull();

    // Get the anchor slot (first card in stack = sete-azul)
    const anchorSlot = container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!anchorSlot) throw new Error('Anchor slot not found');

    // Mock setPointerCapture on the anchor slot
    const mockSetPointerCapture = vi.fn();
    anchorSlot.setPointerCapture = mockSetPointerCapture;

    // Dispatch pointerdown with pointerType='mouse' on the anchor slot
    act(() => {
      dispatchPointer(anchorSlot, 'pointerdown', 'mouse');
    });

    // setPointerCapture should NOT have been called for mouse
    expect(mockSetPointerCapture).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it('iniciarArrasto em pilha via touch CHAMA setPointerCapture', () => {
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
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    // Build a 2-card stack on your turn
    const slots = Array.from(
      container.querySelectorAll<HTMLElement>('.online-hand-container .hand-card-slot'),
    );
    const [primeira, segunda] = slots;
    if (!primeira || !segunda) throw new Error('Cartas não encontradas');

    act(() => tap(primeira, 'touch'));
    act(() => tap(segunda, 'touch'));

    const anchorSlot = container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!anchorSlot) throw new Error('Anchor slot not found');

    const mockSetPointerCapture = vi.fn();
    anchorSlot.setPointerCapture = mockSetPointerCapture;

    act(() => {
      dispatchPointer(anchorSlot, 'pointerdown', 'touch');
    });

    expect(mockSetPointerCapture).toHaveBeenCalled();

    act(() => root.unmount());
  });
});

// ---------------------------------------------------------------------------
// Regressões — carta única: touch, mouse, teclado
// ---------------------------------------------------------------------------

describe('MesaOnline — regressões carta única', () => {
  it('toque único confirma carta no segundo toque (touch)', () => {
    const onSelecionarCarta = vi.fn();
    const rendered = renderMesa(onSelecionarCarta);
    const slot = rendered.container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!slot) throw new Error('Carta não encontrada');

    act(() => tap(slot, 'touch'));
    act(() => tap(slot, 'touch'));

    expect(onSelecionarCarta).toHaveBeenCalledTimes(2);
    expect(onSelecionarCarta).toHaveBeenNthCalledWith(1, cartas[0]);
    expect(onSelecionarCarta).toHaveBeenNthCalledWith(2, cartas[0]);
    act(() => rendered.root.unmount());
  });

  it('clique de mouse seleciona carta diretamente (mouse)', () => {
    const onSelecionarCarta = vi.fn();
    const rendered = renderMesa(onSelecionarCarta);
    const slot = rendered.container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!slot) throw new Error('Carta não encontrada');

    const cartaView =
      slot.querySelector<HTMLElement>('.card-wrapper, [role="button"], button') ?? slot;
    act(() => {
      cartaView.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelecionarCarta).toHaveBeenCalledWith(cartas[0]);
    act(() => rendered.root.unmount());
  });

  it('Enter no slot da carta chama onSelecionarCarta via CartaView (teclado)', () => {
    const onSelecionarCarta = vi.fn();
    const rendered = renderMesa(onSelecionarCarta);
    const slot = rendered.container.querySelector<HTMLElement>('[data-card-id="sete-azul"]');
    if (!slot) throw new Error('Carta não encontrada');

    // CartaView renders an interactive element that handles Enter
    const interactive = slot.querySelector<HTMLElement>('[role="button"], button') ?? slot;
    act(() => {
      interactive.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      interactive.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelecionarCarta).toHaveBeenCalledWith(cartas[0]);
    act(() => rendered.root.unmount());
  });
});

// ---------------------------------------------------------------------------
// Corta-Frente (interceptação) — Task 6
// ---------------------------------------------------------------------------

describe('MesaOnline — Corta-Frente (interceptação)', () => {
  const janela: NonNullable<EstadoPartidaPublico['interceptacao']> = {
    janelaId: 'janela-1',
    cartaAlvoId: estado.topo.id,
    jogadorOrigemId: 'oponente',
    fechaEm: Date.now() + 4000,
    proximaVezId: 'jogador',
    revisao: 3,
  };

  function renderComJanela(onInterceptar = vi.fn(), overrides: Partial<EstadoPartidaPublico> = {}) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <MesaOnline
          estado={{ ...estado, interceptacao: janela, ...overrides }}
          mao={cartas}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
          onInterceptar={onInterceptar}
        />,
      );
    });
    return { container, root, onInterceptar };
  }

  it('mostra o banner só para quem não descartou a carta alvo, com as cartas idênticas da própria mão', () => {
    const { container, root } = renderComJanela();

    expect(container.querySelector('.interceptacao-banner')).not.toBeNull();
    // `cartas[0]` (sete-azul) é idêntica ao topo (também sete-azul); as
    // demais (cores/valores diferentes) não devem virar botão de interceptar.
    expect(container.querySelectorAll('.interceptacao-carta-botao')).toHaveLength(1);

    act(() => root.unmount());
  });

  it('clicar na carta elegível dispara onInterceptar com janelaId, revisão e cartaId corretos', () => {
    const { container, onInterceptar, root } = renderComJanela();

    const botao = container.querySelector<HTMLButtonElement>('.interceptacao-carta-botao');
    expect(botao).not.toBeNull();
    act(() => botao!.click());

    expect(onInterceptar).toHaveBeenCalledWith('janela-1', 3, 'sete-azul');

    act(() => root.unmount());
  });

  it('não mostra o banner para quem descartou a própria carta alvo (regra #6)', () => {
    const onInterceptar = vi.fn();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <MesaOnline
          estado={{ ...estado, interceptacao: { ...janela, jogadorOrigemId: 'jogador' } }}
          mao={cartas}
          mensagens={[]}
          jogadorId="jogador"
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
          onInterceptar={onInterceptar}
        />,
      );
    });

    expect(container.querySelector('.interceptacao-banner')).toBeNull();
    act(() => root.unmount());
  });

  it('sem janela ativa, não renderiza o banner', () => {
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
          onSelecionarCarta={() => {}}
          onPlayMultiple={() => {}}
          onComprarCarta={() => {}}
          onEnviarFalaRapida={() => {}}
        />,
      );
    });

    expect(container.querySelector('.interceptacao-banner')).toBeNull();
    act(() => root.unmount());
  });
});
