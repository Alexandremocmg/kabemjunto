import React from 'react';
import { Carta, EstadoPartida } from '@kabemjunto/shared/types';
import { validarJogada } from '../services/gameEngine';
import { CartaView } from './CartaView';

interface MaoDoJogadorProps {
  estado: EstadoPartida;
  onJogarCarta: (index: number) => void;
  /** F8: key da carta que deve tremer (clicou inválida). Se null, sem shake. */
  shakeCartaKey?: string | null;
}

/**
 * Componente que mostra a mão do jogador da vez.
 *
 * Features:
 * - Marca cartas jogáveis (highlight laranja)
 * - Mostra motivo de bloqueio em tooltip
 * - F8: aplica `card-shake` à carta correspondente ao `shakeCartaKey` por 400ms
 * - F7: animação de fly-to-discard é disparada pelo App.tsx (estado externo)
 */
export const MaoDoJogador: React.FC<MaoDoJogadorProps> = ({
  estado,
  onJogarCarta,
  shakeCartaKey = null,
}) => {
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);

  if (!jogadorAtual) return null;

  const cartasJogaveis = jogadorAtual.mao.filter(
    (carta: Carta) => validarJogada(estado, carta, jogadorAtual.id).valida,
  ).length;

  return (
    <div className="hand-container">
      <div className="hand-status">
        <strong>{jogadorAtual.nome}</strong>
        <span>
          {jogadorAtual.isBot
            ? 'Bot em turno automatico'
            : `${cartasJogaveis} carta${cartasJogaveis === 1 ? '' : 's'} disponivel${
                cartasJogaveis === 1 ? '' : 's'
              }`}
        </span>
      </div>

      <div className="hand-cards">
        {jogadorAtual.mao.map((carta: Carta, index: number) => {
          const res = validarJogada(estado, carta, jogadorAtual.id);
          const jogavel = res.valida && !jogadorAtual.isBot;
          // Match simples: se a key do shake começa com o id da carta, treme
          const isShaking = shakeCartaKey !== null && shakeCartaKey.startsWith(`${carta.id}-`);

          return (
            <div key={`${carta.id}_${index}`} style={{ display: 'inline-block' }}>
              <CartaView
                carta={carta}
                jogavel={jogavel}
                {...(jogadorAtual.isBot
                  ? { motivoBloqueio: 'Aguardando o bot jogar.' }
                  : res.motivo
                    ? { motivoBloqueio: res.motivo }
                    : {})}
                onClick={() => jogavel && onJogarCarta(index)}
                shaking={isShaking}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
