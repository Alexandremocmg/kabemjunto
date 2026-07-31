import React from 'react';
import { Carta, EstadoPartida } from '@kabemjunto/shared/types';
import { validarJogada } from '../services/gameEngine';
import { CartaView } from './CartaView';
import {
  appendCardToMultipleDiscardStack,
  canActivateMultipleDiscardStack,
  canSelectMultipleDiscardCard,
  createMultipleDiscardStack,
  getSelectedMultipleDiscardCards,
  isEligibleForMultipleDiscard,
  reconcileStacks,
  rotateStack,
  temMesmaFace,
} from './multipleDiscard';

interface MaoDoJogadorProps {
  estado: EstadoPartida;
  jogadorId?: string;
  onSelecionarCarta: (index: number) => void;
  onPlayMultiple?: (cartas: ReadonlyArray<Carta>) => boolean;
  selectedIndex?: number | null;
  shakeCartaKey?: string | null;
}

/** Mão do jogador em leque, com pilha de descarte múltiplo criada por arrastar. */
export const MaoDoJogador: React.FC<MaoDoJogadorProps> = ({
  estado,
  jogadorId,
  onSelecionarCarta,
  onPlayMultiple,
  selectedIndex = null,
  shakeCartaKey = null,
}) => {
  const [stackIds, setStackIds] = React.useState<ReadonlyArray<string>>([]);
  const [stackFeedback, setStackFeedback] = React.useState('');
  const [dropZoneActive, setDropZoneActive] = React.useState(false);
  const dropZoneRef = React.useRef<HTMLDivElement>(null);
  const stackExecutionDragRef = React.useRef<{
    pointerId: number;
    x: number;
    y: number;
    locked: 'none' | 'horizontal' | 'vertical';
  }>();
  const dragAnchorRef = React.useRef<{
    carta: Carta;
    primeiraCartaJogavel: boolean;
    x: number;
    y: number;
  }>();
  const suppressNextClickRef = React.useRef(false);
  const suppressStackExecutionClickRef = React.useRef(false);
  const ultimoPonteiroFoiToqueRef = React.useRef(false);
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);
  const jogadorDaMao = estado.jogadores.find((j) => j.id === jogadorId) ?? jogadorAtual;
  const mao = jogadorDaMao?.mao ?? [];
  const minhaVez = jogadorDaMao?.id === estado.vezDe;

  React.useEffect(() => {
    setStackIds((atuais) => reconcileStacks(atuais.length > 0 ? [atuais] : [], mao)[0] ?? []);
  }, [mao]);

  if (!jogadorAtual || !jogadorDaMao) return null;
  const cartasSelecionadas = getSelectedMultipleDiscardCards(mao, stackIds);
  const cartasJogaveis = mao.filter(
    (carta) => validarJogada(estado, carta, jogadorDaMao.id).valida,
  ).length;
  const pilhaPreparada = canActivateMultipleDiscardStack(stackIds, onPlayMultiple !== undefined);
  const podeExecutarPilha = minhaVez && pilhaPreparada;

  function adicionarPorTeclado(carta: Carta, primeiraCartaJogavel: boolean): void {
    setStackIds((atuais) => {
      if (atuais.length === 0) {
        return canSelectMultipleDiscardCard([], carta, mao, primeiraCartaJogavel)
          ? [carta.id]
          : atuais;
      }
      return appendCardToMultipleDiscardStack(atuais, carta, mao);
    });
  }

  function iniciarArrasto(
    event: React.PointerEvent<HTMLDivElement>,
    carta: Carta,
    primeiraCartaJogavel: boolean,
  ): void {
    ultimoPonteiroFoiToqueRef.current = event.pointerType === 'touch';
    if (
      !jogadorDaMao?.isBot &&
      (stackIds.length > 0 || canSelectMultipleDiscardCard([], carta, mao, primeiraCartaJogavel))
    ) {
      if (event.pointerType === 'touch') event.currentTarget.setPointerCapture?.(event.pointerId);
      dragAnchorRef.current = { carta, primeiraCartaJogavel, x: event.clientX, y: event.clientY };
    }
  }

  function tocarCarta(carta: Carta, primeiraCartaJogavel: boolean, index: number): void {
    if (!onPlayMultiple || !jogadorDaMao || jogadorDaMao.isBot) return;
    if (!minhaVez) {
      if (!isEligibleForMultipleDiscard(carta)) return;
      setStackIds((atuais) => {
        if (atuais.includes(carta.id)) return atuais;
        if (atuais.length === 0) {
          setStackFeedback('Pilha armada: toque outra carta de mesma face para preparar.');
          return [carta.id];
        }
        const proximas = appendCardToMultipleDiscardStack(atuais, carta, mao);
        setStackFeedback(
          proximas === atuais
            ? 'Essa carta não tem a mesma face da pilha.'
            : `Pilha com ${proximas.length} cartas. Aguarde sua vez para jogar.`,
        );
        return proximas;
      });
      return;
    }
    if (stackIds.length === 0) {
      onSelecionarCarta(index);
      if (!canSelectMultipleDiscardCard([], carta, mao, primeiraCartaJogavel)) return;
      setStackIds([carta.id]);
      setStackFeedback(
        'Pilha armada: toque outra carta de mesma face ou toque de novo para jogar.',
      );
      return;
    }
    if (stackIds.length === 1 && stackIds[0] === carta.id) {
      setStackIds([]);
      setStackFeedback('Jogada comum confirmada.');
      onSelecionarCarta(index);
      return;
    }
    const proximas = appendCardToMultipleDiscardStack(stackIds, carta, mao);
    setStackFeedback(
      proximas === stackIds
        ? 'Essa carta não tem a mesma face da pilha.'
        : `Pilha com ${proximas.length} cartas. Toque a pilha para descartar.`,
    );
    setStackIds(proximas);
  }

  function soltarNaCarta(event: React.PointerEvent<HTMLDivElement>, fallbackTarget: Carta): void {
    const drag = dragAnchorRef.current;
    dragAnchorRef.current = undefined;
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 8) return;
    const cardIdAtExpandedPointer = Array.from(
      document.querySelectorAll<HTMLElement>('[data-card-id]'),
    ).find((element) => {
      const rect = element.getBoundingClientRect();
      return (
        event.clientX >= rect.left - 32 &&
        event.clientX <= rect.right + 32 &&
        event.clientY >= rect.top - 32 &&
        event.clientY <= rect.bottom + 32
      );
    })?.dataset.cardId;
    const target = mao.find((carta) => carta.id === cardIdAtExpandedPointer) ?? fallbackTarget;
    if (drag.carta.id === target.id) return;

    setStackIds((atuais) => {
      const proximas =
        atuais.length === 0
          ? createMultipleDiscardStack(drag.carta, target, mao, drag.primeiraCartaJogavel)
          : temMesmaFace(drag.carta, target)
            ? appendCardToMultipleDiscardStack(atuais, drag.carta, mao)
            : atuais;
      if (proximas !== atuais && proximas.length > atuais.length) {
        suppressNextClickRef.current = true;
        setStackFeedback(`Pilha com ${proximas.length} cartas. Toque a pilha para descartar.`);
      }
      return proximas;
    });
  }

  function jogarPilha(): void {
    if (podeExecutarPilha) {
      const aceita = onPlayMultiple?.(cartasSelecionadas) ?? false;
      if (aceita) {
        setStackFeedback('Descarte múltiplo aceito.');
        setStackIds([]);
      } else {
        setStackFeedback('Jogada rejeitada — pilha preservada. Tente novamente.');
      }
    }
  }

  function rotacionarPilha(): void {
    setStackIds((atuais) => rotateStack(atuais));
    setStackFeedback('Ordem da pilha rotacionada.');
  }

  function iniciarArrastoDaPilha(event: React.PointerEvent<HTMLDivElement>): void {
    if (!podeExecutarPilha) return;
    stackExecutionDragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      locked: 'none',
    };
    if (event.pointerType === 'touch') {
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Eventos sintéticos E2E não representam um ponteiro físico capturável.
      }
    }
  }

  function moverArrastoDaPilha(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = stackExecutionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = Math.abs(event.clientX - drag.x);
    const deslocamentoY = event.clientY - drag.y;
    const dy = Math.abs(deslocamentoY);
    if (drag.locked === 'none' && Math.max(dx, dy) >= 12) {
      drag.locked = dx > dy ? 'horizontal' : 'vertical';
    }
    if (drag.locked === 'vertical' && deslocamentoY < -20) {
      suppressStackExecutionClickRef.current = true;
      setDropZoneActive(true);
    }
  }

  function finalizarArrastoDaPilha(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = stackExecutionDragRef.current;
    stackExecutionDragRef.current = undefined;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const rect = dropZoneRef.current?.getBoundingClientRect();
    const soltouNaZona =
      dropZoneActive &&
      rect !== undefined &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    setDropZoneActive(false);
    if (event.pointerType === 'touch' && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (soltouNaZona) jogarPilha();
  }

  return (
    <div className="hand-container">
      {dropZoneActive && (
        <div
          ref={dropZoneRef}
          className="discard-drop-zone"
          role="status"
          aria-live="assertive"
          aria-label={`Solte aqui para jogar ${cartasSelecionadas.length} cartas`}
        >
          Solte aqui para jogar {cartasSelecionadas.length} cartas
        </div>
      )}
      <div className="hand-status" role="status" aria-live="polite">
        <strong>
          {jogadorAtual.id === estado.vezDe && !jogadorAtual.isBot ? 'SUA VEZ' : jogadorAtual.nome}
        </strong>
        <span>
          {jogadorAtual.isBot
            ? 'Bot em turno automático'
            : `${cartasJogaveis} carta${cartasJogaveis === 1 ? '' : 's'} disponível${cartasJogaveis === 1 ? '' : 'is'}`}
        </span>
      </div>
      <p className="multiple-discard-touch-feedback" role="status" aria-live="polite">
        {stackFeedback}
      </p>

      <div className="hand-cards hand-fan" aria-label={`Sua mão: ${mao.length} cartas`} role="list">
        {mao.map((carta, index) => {
          const res = validarJogada(estado, carta, jogadorDaMao.id);
          const podeOrganizar = !minhaVez && isEligibleForMultipleDiscard(carta);
          const primeiraCartaSelecionavel = minhaVez ? res.valida : podeOrganizar;
          const jogavel = minhaVez && res.valida && !jogadorDaMao.isBot;
          const inStack = stackIds.includes(carta.id);
          const isStackAnchor = pilhaPreparada && carta.id === stackIds[0];
          const isShaking = shakeCartaKey !== null && shakeCartaKey.startsWith(`${carta.id}-`);
          const center = (mao.length - 1) / 2;
          const angle = Math.max(-12, Math.min(12, (index - center) * 4));

          if (pilhaPreparada && inStack && !isStackAnchor) return null;

          return (
            <div
              key={`${carta.id}_${index}`}
              className={`hand-card-slot ${inStack || selectedIndex === index ? 'selected-slot' : ''}`}
              role="listitem"
              data-card-id={carta.id}
              style={{ transform: `rotate(${angle}deg)` }}
              onPointerDown={(event) =>
                isStackAnchor
                  ? iniciarArrastoDaPilha(event)
                  : iniciarArrasto(event, carta, primeiraCartaSelecionavel)
              }
              onPointerMove={(event) => isStackAnchor && moverArrastoDaPilha(event)}
              onPointerUp={(event) =>
                isStackAnchor ? finalizarArrastoDaPilha(event) : soltarNaCarta(event, carta)
              }
              onClickCapture={(event) => {
                const clicouNaPilha =
                  event.target instanceof Element &&
                  event.target.closest('.multiple-discard-inline-stack') !== null;
                const suppressClick = suppressNextClickRef.current;
                if (suppressClick && !clicouNaPilha) {
                  event.preventDefault();
                  event.stopPropagation();
                }
                if (
                  !suppressClick &&
                  !clicouNaPilha &&
                  ultimoPonteiroFoiToqueRef.current &&
                  onPlayMultiple
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  tocarCarta(carta, primeiraCartaSelecionavel, index);
                }
                suppressNextClickRef.current = false;
                ultimoPonteiroFoiToqueRef.current = false;
              }}
              onKeyDownCapture={(event) => {
                if (event.altKey && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  event.stopPropagation();
                  adicionarPorTeclado(carta, primeiraCartaSelecionavel);
                }
              }}
            >
              {isStackAnchor ? (
                <div
                  className="multiple-discard-inline-stack"
                  role="group"
                  aria-label={`Pilha de descarte múltiplo com ${cartasSelecionadas.length} cartas. Ordem: ${cartasSelecionadas
                    .map(
                      (item) =>
                        `${item.tipo === 'NUMERADA' ? item.valor : (item.acao ?? '')} ${item.cor}`,
                    )
                    .join(', ')}`}
                  onClick={() => {
                    if (suppressStackExecutionClickRef.current) {
                      suppressStackExecutionClickRef.current = false;
                      return;
                    }
                    rotacionarPilha();
                  }}
                  style={{ '--stack-count': cartasSelecionadas.length } as React.CSSProperties}
                >
                  {cartasSelecionadas.map((cartaDaPilha, stackIndex) => (
                    <span
                      key={cartaDaPilha.id}
                      className="multiple-discard-inline-stack-card"
                      data-stack-card-id={cartaDaPilha.id}
                      style={{ '--stack-index': stackIndex } as React.CSSProperties}
                      aria-hidden="true"
                    >
                      <CartaView carta={cartaDaPilha} jogavel={false} />
                    </span>
                  ))}
                  <button
                    type="button"
                    className="stack-rotate-button"
                    aria-label={`Rotacionar pilha. Ordem atual: ${cartasSelecionadas
                      .map(
                        (item) =>
                          `${item.tipo === 'NUMERADA' ? item.valor : (item.acao ?? '')} ${item.cor}`,
                      )
                      .join(', ')}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      rotacionarPilha();
                    }}
                  >
                    Rotacionar pilha
                  </button>
                  {podeExecutarPilha && (
                    <button
                      type="button"
                      className="stack-play-button"
                      aria-label={`Jogar ${cartasSelecionadas.length} cartas`}
                      onClick={(event) => {
                        event.stopPropagation();
                        jogarPilha();
                      }}
                    >
                      Jogar {cartasSelecionadas.length} cartas
                    </button>
                  )}
                </div>
              ) : (
                <CartaView
                  carta={carta}
                  jogavel={jogavel}
                  selecionada={inStack || selectedIndex === index}
                  {...(jogadorAtual.isBot
                    ? { motivoBloqueio: 'Aguardando o bot jogar.' }
                    : res.motivo
                      ? { motivoBloqueio: res.motivo }
                      : {})}
                  onClick={() => jogavel && onSelecionarCarta(index)}
                  shaking={isShaking}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
