import React from 'react';
import { Carta, EstadoPartida } from '@kabemjunto/shared/types';
import { validarJogada } from '../services/gameEngine';
import { CartaView } from './CartaView';
import {
  appendCardToMultipleDiscardStack,
  canActivateMultipleDiscardStack,
  canSelectMultipleDiscardCard,
  createMultipleDiscardStack,
  getMultipleDiscardStackHint,
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
  const [showStackHint, setShowStackHint] = React.useState(false);
  const dragAnchorRef = React.useRef<{ carta: Carta; primeiraCartaJogavel: boolean }>();
  const suppressNextClickRef = React.useRef(false);
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);

  React.useEffect(() => {
    if (stackIds.length < 2) return undefined;
    setShowStackHint(true);
    const timeout = window.setTimeout(() => setShowStackHint(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [stackIds.length]);

  if (!jogadorAtual) return null;

  const mao = jogadorAtual.mao;
  const cartasSelecionadas = getSelectedMultipleDiscardCards(mao, stackIds);
  const cartasJogaveis = mao.filter(
    (carta) => validarJogada(estado, carta, jogadorAtual.id).valida,
  ).length;
  const stackHint = getMultipleDiscardStackHint(cartasSelecionadas.length, showStackHint);

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

  function iniciarArrasto(carta: Carta, primeiraCartaJogavel: boolean): void {
    if (
      !jogadorAtual?.isBot &&
      (stackIds.length > 0 || canSelectMultipleDiscardCard([], carta, mao, primeiraCartaJogavel))
    ) {
      dragAnchorRef.current = { carta, primeiraCartaJogavel };
    }
  }

  function soltarNaCarta(target: Carta): void {
    const drag = dragAnchorRef.current;
    dragAnchorRef.current = undefined;
    if (!drag || drag.carta.id === target.id) return;

    setStackIds((atuais) => {
      const proximas =
        atuais.length === 0
          ? createMultipleDiscardStack(drag.carta, target, mao, drag.primeiraCartaJogavel)
          : temMesmaFace(drag.carta, target)
            ? appendCardToMultipleDiscardStack(atuais, drag.carta, mao)
            : atuais;
      if (proximas !== atuais && proximas.length > atuais.length)
        suppressNextClickRef.current = true;
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
        {stackIds.length > 0 && (
          <button type="button" className="multiple-discard-clear" onClick={() => setStackIds([])}>
            Limpar pilha
          </button>
        )}
      </div>

      {canActivateMultipleDiscardStack(stackIds, onPlayMultiple !== undefined) && (
        <button
          type="button"
          className={`multiple-discard-stack ${stackHint ? 'multiple-discard-stack-hint' : ''}`}
          aria-label={`Jogar pilha de descarte múltiplo com ${cartasSelecionadas.length} cartas, na ordem selecionada`}
          onClick={jogarPilha}
        >
          <span className="multiple-discard-stack-cards" aria-hidden="true">
            {cartasSelecionadas.map((carta, index) => (
              <span key={carta.id} style={{ '--stack-index': index } as React.CSSProperties}>
                <CartaView carta={carta} jogavel={false} />
              </span>
            ))}
          </span>
          <span className="multiple-discard-stack-label">{stackHint ?? 'Pilha pronta'}</span>
        </button>
      )}

      <div className="hand-cards hand-fan" aria-label={`Sua mão: ${mao.length} cartas`} role="list">
        {mao.map((carta, index) => {
          const res = validarJogada(estado, carta, jogadorAtual.id);
          const jogavel = res.valida && !jogadorAtual.isBot;
          const inStack = stackIds.includes(carta.id);
          const isShaking = shakeCartaKey !== null && shakeCartaKey.startsWith(`${carta.id}-`);
          const center = (mao.length - 1) / 2;
          const angle = Math.max(-12, Math.min(12, (index - center) * 4));

          return (
            <div
              key={`${carta.id}_${index}`}
              className={`hand-card-slot ${inStack || selectedIndex === index ? 'selected-slot' : ''}`}
              role="listitem"
              style={{ transform: `rotate(${angle}deg)` }}
              onPointerDown={() => iniciarArrasto(carta, res.valida)}
              onPointerUp={() => soltarNaCarta(carta)}
              onClickCapture={(event) => {
                if (suppressNextClickRef.current) {
                  event.preventDefault();
                  event.stopPropagation();
                  suppressNextClickRef.current = false;
                }
              }}
              onKeyDownCapture={(event) => {
                if (event.altKey && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  event.stopPropagation();
                  adicionarPorTeclado(carta, res.valida);
                }
              }}
            >
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
            </div>
          );
        })}
      </div>
      <p className="multiple-discard-keyboard-hint">
        Para montar uma pilha com teclado, use Alt+Enter em uma carta jogável e depois em cartas da
        mesma face.
      </p>
    </div>
  );
};
