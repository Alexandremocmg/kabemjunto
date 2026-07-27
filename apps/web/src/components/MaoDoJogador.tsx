import React from 'react';
import { Carta, EstadoPartida } from '@kabemjunto/shared/types';
import { validarJogada } from '../services/gameEngine';
import { CartaView } from './CartaView';

interface MaoDoJogadorProps {
  estado: EstadoPartida;
  onSelecionarCarta: (index: number) => void;
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
  selectedIndex = null,
  shakeCartaKey = null,
}) => {
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);

  if (!jogadorAtual) return null;

  const cartasJogaveis = jogadorAtual.mao.filter(
    (carta: Carta) => validarJogada(estado, carta, jogadorAtual.id).valida,
  ).length;
  const total = jogadorAtual.mao.length;

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
      </div>

      <div className="hand-cards hand-fan" aria-label={`Sua mão: ${total} cartas`} role="list">
        {jogadorAtual.mao.map((carta: Carta, index: number) => {
          const res = validarJogada(estado, carta, jogadorAtual.id);
          const jogavel = res.valida && !jogadorAtual.isBot;
          const isSelected = selectedIndex === index;
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
                jogavel={jogavel}
                selecionada={isSelected}
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
    </div>
  );
};
