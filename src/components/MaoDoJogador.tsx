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

          return (
            <div key={`${carta.id}_${index}`} style={{ display: 'inline-block' }}>
              <CartaView
                carta={carta}
                jogavel={jogavel}
                motivoBloqueio={jogadorAtual.isBot ? 'Aguardando o bot jogar.' : res.motivo}
                onClick={() => jogavel && onJogarCarta(index)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
