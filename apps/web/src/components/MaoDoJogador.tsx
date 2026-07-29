import React from 'react';
import { Carta, EstadoPartida } from '@kabemjunto/shared/types';
import { validarJogada } from '../services/gameEngine';
import { CartaView } from './CartaView';
import { ConfirmarDescarteMultiplo } from './ConfirmarDescarteMultiplo';
import {
  canSelectMultipleDiscardCard,
  getSelectedMultipleDiscardCards,
  toggleMultipleDiscardSelection,
} from './multipleDiscard';

interface MaoDoJogadorProps {
  estado: EstadoPartida;
  onSelecionarCarta: (index: number) => void;
  /** Optional UI bridge for a future authoritative batch-play contract. */
  onPlayMultiple?: (cartas: ReadonlyArray<Carta>) => void;
  selectedIndex?: number | null;
  /** F8: key da carta que deve tremer (clicou inválida). Se null, sem shake. */
  shakeCartaKey?: string | null;
}

/**
 * Mão do jogador em leque.
 * O primeiro toque seleciona a carta; o segundo toque é resolvido pelo App.
 */
export const MaoDoJogador: React.FC<MaoDoJogadorProps> = ({
  estado,
  onSelecionarCarta,
  onPlayMultiple,
  selectedIndex = null,
  shakeCartaKey = null,
}) => {
  const [descarteMultiploAtivo, setDescarteMultiploAtivo] = React.useState(false);
  const [confirmandoDescarteMultiplo, setConfirmandoDescarteMultiplo] = React.useState(false);
  const [cartasSelecionadasParaDescarte, setCartasSelecionadasParaDescarte] = React.useState<
    ReadonlyArray<string>
  >([]);
  const revisarDescarteMultiploRef = React.useRef<HTMLButtonElement>(null);
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);

  if (!jogadorAtual) return null;

  const maoDoJogadorAtual = jogadorAtual.mao;
  const cartasJogaveis = jogadorAtual.mao.filter(
    (carta: Carta) => validarJogada(estado, carta, jogadorAtual.id).valida,
  ).length;
  const total = jogadorAtual.mao.length;
  const cartasSelecionadas = getSelectedMultipleDiscardCards(
    jogadorAtual.mao,
    cartasSelecionadasParaDescarte,
  );

  function alternarDescarteMultiplo(): void {
    setDescarteMultiploAtivo((ativo) => !ativo);
    setConfirmandoDescarteMultiplo(false);
    setCartasSelecionadasParaDescarte([]);
  }

  function selecionarCarta(index: number, carta: Carta, primeiraCartaJogavel: boolean): void {
    if (!descarteMultiploAtivo) {
      onSelecionarCarta(index);
      return;
    }
    setCartasSelecionadasParaDescarte((selecionadas) => {
      if (
        !canSelectMultipleDiscardCard(selecionadas, carta, maoDoJogadorAtual, primeiraCartaJogavel)
      ) {
        return selecionadas;
      }
      return toggleMultipleDiscardSelection(selecionadas, carta, maoDoJogadorAtual);
    });
  }

  function concluirDescarteMultiplo(cartas: ReadonlyArray<Carta>): void {
    onPlayMultiple?.(cartas);
    setConfirmandoDescarteMultiplo(false);
    setDescarteMultiploAtivo(false);
    setCartasSelecionadasParaDescarte([]);
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
            : `${cartasJogaveis} carta${cartasJogaveis === 1 ? '' : 's'} disponível${
                cartasJogaveis === 1 ? '' : 'is'
              }`}
        </span>
        <div className="multiple-discard-controls">
          <button
            type="button"
            className="button button-secondary"
            aria-pressed={descarteMultiploAtivo}
            disabled={jogadorAtual.isBot}
            onClick={alternarDescarteMultiplo}
          >
            {descarteMultiploAtivo ? 'Cancelar descarte múltiplo' : 'Descarte múltiplo'}
          </button>
          {descarteMultiploAtivo && (
            <>
              <span>
                {cartasSelecionadas.length} carta{cartasSelecionadas.length === 1 ? '' : 's'}{' '}
                selecionada{cartasSelecionadas.length === 1 ? '' : 's'}
              </span>
              <button
                ref={revisarDescarteMultiploRef}
                type="button"
                className="button button-primary"
                disabled={cartasSelecionadas.length < 2}
                onClick={() => setConfirmandoDescarteMultiplo(true)}
              >
                Revisar descarte múltiplo
              </button>
            </>
          )}
        </div>
      </div>

      <div className="hand-cards hand-fan" aria-label={`Sua mão: ${total} cartas`} role="list">
        {jogadorAtual.mao.map((carta: Carta, index: number) => {
          const res = validarJogada(estado, carta, jogadorAtual.id);
          const jogavel = res.valida && !jogadorAtual.isBot;
          const podeSelecionarNoDescarteMultiplo =
            !jogadorAtual.isBot &&
            canSelectMultipleDiscardCard(
              cartasSelecionadasParaDescarte,
              carta,
              maoDoJogadorAtual,
              res.valida,
            );
          const isSelected = descarteMultiploAtivo
            ? cartasSelecionadasParaDescarte.includes(carta.id)
            : selectedIndex === index;
          const isShaking = shakeCartaKey !== null && shakeCartaKey.startsWith(`${carta.id}-`);
          const center = (total - 1) / 2;
          const angle = Math.max(-12, Math.min(12, (index - center) * 4));

          return (
            <div
              key={`${carta.id}_${index}`}
              className={`hand-card-slot ${isSelected ? 'selected-slot' : ''}`}
              role="listitem"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <CartaView
                carta={carta}
                jogavel={descarteMultiploAtivo ? podeSelecionarNoDescarteMultiplo : jogavel}
                selecionada={isSelected}
                {...(jogadorAtual.isBot
                  ? { motivoBloqueio: 'Aguardando o bot jogar.' }
                  : res.motivo
                    ? { motivoBloqueio: res.motivo }
                    : {})}
                onClick={() =>
                  (descarteMultiploAtivo ? podeSelecionarNoDescarteMultiplo : jogavel) &&
                  selecionarCarta(index, carta, res.valida)
                }
                shaking={isShaking}
              />
            </div>
          );
        })}
      </div>
      {confirmandoDescarteMultiplo && (
        <ConfirmarDescarteMultiplo
          cartas={cartasSelecionadas}
          onCancel={() => setConfirmandoDescarteMultiplo(false)}
          triggerRef={revisarDescarteMultiploRef}
          {...(onPlayMultiple ? { onPlayMultiple: concluirDescarteMultiplo } : {})}
        />
      )}
    </div>
  );
};
