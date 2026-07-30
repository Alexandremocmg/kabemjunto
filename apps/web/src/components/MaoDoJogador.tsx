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
  temMesmaFace,
} from './multipleDiscard';

interface MaoDoJogadorProps {
  estado: EstadoPartida;
  onSelecionarCarta: (index: number) => void;
  onPlayMultiple?: (cartas: ReadonlyArray<Carta>) => void;
  selectedIndex?: number | null;
  shakeCartaKey?: string | null;
}

/** Mão do jogador em leque, com pilha de descarte múltiplo criada por arrastar. */
export const MaoDoJogador: React.FC<MaoDoJogadorProps> = ({
  estado,
  onSelecionarCarta,
  onPlayMultiple,
  selectedIndex = null,
  shakeCartaKey = null,
}) => {
  const [stackIds, setStackIds] = React.useState<ReadonlyArray<string>>([]);
  const [stackFeedback, setStackFeedback] = React.useState('');
  const dragAnchorRef = React.useRef<{
    carta: Carta;
    primeiraCartaJogavel: boolean;
    x: number;
    y: number;
  }>();
  const suppressNextClickRef = React.useRef(false);
  const ultimoPonteiroFoiToqueRef = React.useRef(false);
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);

  if (!jogadorAtual) return null;

  const mao = jogadorAtual.mao;
  const cartasSelecionadas = getSelectedMultipleDiscardCards(mao, stackIds);
  const cartasJogaveis = mao.filter(
    (carta) => validarJogada(estado, carta, jogadorAtual.id).valida,
  ).length;
  const pilhaPronta = canActivateMultipleDiscardStack(stackIds, onPlayMultiple !== undefined);

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
      !jogadorAtual?.isBot &&
      (stackIds.length > 0 || canSelectMultipleDiscardCard([], carta, mao, primeiraCartaJogavel))
    ) {
      if (event.pointerType === 'touch') event.currentTarget.setPointerCapture?.(event.pointerId);
      dragAnchorRef.current = { carta, primeiraCartaJogavel, x: event.clientX, y: event.clientY };
    }
  }

  function tocarCarta(carta: Carta, primeiraCartaJogavel: boolean, index: number): void {
    if (!onPlayMultiple || jogadorAtual?.isBot) return;
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
    if (canActivateMultipleDiscardStack(stackIds, onPlayMultiple !== undefined)) {
      onPlayMultiple?.(cartasSelecionadas);
      setStackIds([]);
    }
  }

  return (
    <div className="hand-container">
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
          const res = validarJogada(estado, carta, jogadorAtual.id);
          const jogavel = res.valida && !jogadorAtual.isBot;
          const inStack = stackIds.includes(carta.id);
          const isStackAnchor = pilhaPronta && carta.id === stackIds[0];
          const isShaking = shakeCartaKey !== null && shakeCartaKey.startsWith(`${carta.id}-`);
          const center = (mao.length - 1) / 2;
          const angle = Math.max(-12, Math.min(12, (index - center) * 4));

          if (pilhaPronta && inStack && !isStackAnchor) return null;

          return (
            <div
              key={`${carta.id}_${index}`}
              className={`hand-card-slot ${inStack || selectedIndex === index ? 'selected-slot' : ''}`}
              role="listitem"
              data-card-id={carta.id}
              style={{ transform: `rotate(${angle}deg)` }}
              onPointerDown={(event) => iniciarArrasto(event, carta, res.valida)}
              onPointerUp={(event) => soltarNaCarta(event, carta)}
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
                  tocarCarta(carta, res.valida, index);
                }
                suppressNextClickRef.current = false;
                ultimoPonteiroFoiToqueRef.current = false;
              }}
              onKeyDownCapture={(event) => {
                if (event.altKey && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  event.stopPropagation();
                  adicionarPorTeclado(carta, res.valida);
                }
              }}
            >
              {isStackAnchor ? (
                <div
                  className="multiple-discard-inline-stack"
                  role="button"
                  tabIndex={0}
                  aria-label={`Jogar pilha de descarte múltiplo com ${cartasSelecionadas.length} cartas, na ordem selecionada`}
                  onClick={jogarPilha}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      jogarPilha();
                    }
                  }}
                  style={{ '--stack-count': cartasSelecionadas.length } as React.CSSProperties}
                >
                  {cartasSelecionadas.map((cartaDaPilha, stackIndex) => (
                    <span
                      key={cartaDaPilha.id}
                      className="multiple-discard-inline-stack-card"
                      style={{ '--stack-index': stackIndex } as React.CSSProperties}
                      aria-hidden="true"
                    >
                      <CartaView carta={cartaDaPilha} jogavel={false} />
                    </span>
                  ))}
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
