import React from 'react';
import { Carta, EstadoPartida } from '@shared/types';
import { validarJogada } from '../services/gameEngine';
import { CartaView } from './CartaView';

interface MaoDoJogadorProps {
  estado: EstadoPartida;
  onJogarCarta: (index: number) => void;
}

export const MaoDoJogador: React.FC<MaoDoJogadorProps> = ({ estado, onJogarCarta }) => {
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);

  if (!jogadorAtual) return null;

  return (
    <div className="hand-container">
      <div className="hand-cards">
        {jogadorAtual.mao.map((carta: Carta, index: number) => {
          const res = validarJogada(estado, carta, jogadorAtual.id);
          const jogavel = res.valida && !jogadorAtual.isBot;

          return (
            <div key={`${carta.id}_${index}`} style={{ display: 'inline-block' }}>
              <CartaView
                carta={carta}
                jogavel={jogavel}
                onClick={() => jogavel && onJogarCarta(index)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
