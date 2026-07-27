import React from 'react';
import { Cor, EstadoPartida, Jogador } from '@kabemjunto/shared/types';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { CartaView } from './CartaView';

interface MesaDeJogoProps {
  estado: EstadoPartida;
  onComprarCarta: () => void;
}

function PlayerSeat({
  jogador,
  index,
  active,
  totalJogadores,
}: {
  jogador: Jogador;
  index: number;
  active: boolean;
  totalJogadores: number;
}) {
  const previewCards = Math.min(jogador.mao.length, 4);
  const angle = 180 + (index * 360) / totalJogadores;
  const radians = (angle * Math.PI) / 180;
  const seatStyle = {
    '--seat-angle': `${angle}deg`,
    '--seat-offset-x': `${Math.sin(radians) * 140}px`,
    '--seat-offset-y': `${-Math.cos(radians) * 210}px`,
  } as React.CSSProperties;
  return (
    <div
      className={`player-seat player-seat-ring ${jogador.isBot ? '' : 'player-seat-you'} ${active ? 'active' : ''}`}
      style={seatStyle}
      data-seat-index={index}
      aria-label={`Assento ${index + 1} de ${totalJogadores}: ${jogador.nome}`}
    >
      <div className="player-seat-avatar" aria-hidden="true">
        {jogador.avatar || '👤'}
      </div>
      <div className="player-seat-copy">
        <strong>{jogador.nome}</strong>
        <span>{jogador.isBot ? 'Bot' : 'Você'}</span>
      </div>
      <div className="player-seat-count" aria-label={`${jogador.mao.length} cartas`}>
        {jogador.mao.length}
      </div>
      <div className="mini-card-fan" aria-hidden="true">
        {Array.from({ length: previewCards }, (_, cardIndex) => (
          <span key={cardIndex} style={{ transform: `rotate(${(cardIndex - 1.5) * 8}deg)` }} />
        ))}
      </div>
    </div>
  );
}

export const MesaDeJogo: React.FC<MesaDeJogoProps> = ({ estado, onComprarCarta }) => {
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  const corAtiva = (estado.corAtiva || 'LARANJA') as Cor;
  const infoCor = PALETA_CORES[corAtiva] || PALETA_CORES.NEUTRO;
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);
  const totalJogadores = estado.jogadores.length;
  const compraDisponivel = Boolean(jogadorAtual && !jogadorAtual.isBot && !estado.finalizada);
  const compraLabel =
    estado.ataqueAcumulado > 0 ? `Pagar +${estado.ataqueAcumulado}` : 'Comprar carta';

  return (
    <div className="table-area">
      <div
        className={`player-table player-table-ring player-count-${Math.min(totalJogadores, 10)}`}
        aria-label="Jogadores na mesa"
      >
        {estado.jogadores.map((jogador, index) => (
          <PlayerSeat
            key={jogador.id}
            jogador={jogador}
            index={index}
            totalJogadores={totalJogadores}
            active={jogador.id === estado.vezDe}
          />
        ))}
      </div>

      <div className="table-center" aria-label="Núcleo da mesa">
        <div className="deck-slot" title={compraLabel}>
          <CartaView
            verso={true}
            contador={`MONTE ${estado.monteCompra.length}`}
            jogavel={compraDisponivel}
            {...(jogadorAtual?.isBot ? { motivoBloqueio: 'Aguardando o bot jogar.' } : {})}
            onClick={onComprarCarta}
          />
        </div>

        <div className="discard-slot">
          {estado.ataqueAcumulado > 0 && (
            <div className="attack-badge" role="status">
              +{estado.ataqueAcumulado}
            </div>
          )}
          {topo && <CartaView carta={topo} jogavel={false} />}
          <span className="pile-label">DESCARTE {estado.monteDescarte.length}</span>
        </div>
      </div>

      <div className={`turn-summary ${estado.ataqueAcumulado > 0 ? 'danger' : ''}`}>
        <strong>{jogadorAtual?.nome ?? 'Jogador'}</strong>
        <span>
          {jogadorAtual?.isBot
            ? 'Bot executando o turno.'
            : estado.ataqueAcumulado > 0
              ? `Ataque ativo: +${estado.ataqueAcumulado}. Cubra com a mesma defesa ou compre.`
              : 'Toque em uma carta para jogar ou no monte para comprar.'}
        </span>
      </div>

      <div className="table-status-bar" aria-label="Status da mesa">
        <div className="color-indicator">
          <span className="status-label">Cor ativa</span>
          <div className="color-dot" style={{ backgroundColor: infoCor.hex, color: infoCor.hex }} />
          <span style={{ fontWeight: '800', color: infoCor.hex }}>
            {infoCor.nomePt} {infoCor.simboloAcessivel}
          </span>
        </div>
        <div className="color-indicator">
          <span className="status-label">Sentido</span>
          <span style={{ fontWeight: '800', color: '#F0F6FC' }}>
            {estado.sentido === 1 ? '↻ Horário' : '↺ Anti-horário'}
          </span>
        </div>
        {estado.ataqueAcumulado > 0 && (
          <div className="color-indicator attack-indicator">Ataque +{estado.ataqueAcumulado}</div>
        )}
      </div>
    </div>
  );
};
