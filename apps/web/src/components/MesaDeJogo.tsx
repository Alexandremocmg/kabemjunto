import React from 'react';
import { Cor, EstadoPartida, Jogador } from '@kabemjunto/shared/types';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { CartaView } from './CartaView';

interface MesaDeJogoProps {
  estado: EstadoPartida;
  onComprarCarta: () => void;
}

function SentidoIcone({ sentido }: { sentido: number }) {
  return (
    <span aria-hidden="true" className="status-sentido-icone">
      {sentido === 1 ? '↻' : '↺'}
    </span>
  );
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
  const previewCards = Math.min(jogador.mao.length, 5);
  const angle = 180 + (index * 360) / totalJogadores;
  const radians = (angle * Math.PI) / 180;
  const seatStyle = {
    '--seat-angle': `${angle}deg`,
    '--seat-offset-x': `${Math.sin(radians) * 140}px`,
    '--seat-offset-y': `${-Math.cos(radians) * 160}px`,
  } as React.CSSProperties;

  return (
    <div
      className={`player-seat player-seat-ring ${jogador.isBot ? '' : 'player-seat-you'} ${active ? 'active' : ''}`}
      style={seatStyle}
      data-seat-index={index}
      aria-label={`${jogador.nome}${active ? ' — vez deste jogador' : ''}, ${jogador.mao.length} cartas`}
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
        {Array.from({ length: previewCards }, (_, i) => (
          <span
            key={i}
            className="mini-card-fan-item"
            style={{ transform: `rotate(${(i - (previewCards - 1) / 2) * 9}deg)` }}
          />
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
      {/* Assentos em anel */}
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

      {/* Núcleo: Monte de Compra (esq.) | Monte de Descarte (dir.) */}
      <div className="table-center" aria-label="Núcleo da mesa">
        <div className="deck-slot" title={compraLabel}>
          <CartaView
            verso={true}
            contador={`${estado.monteCompra.length}`}
            jogavel={compraDisponivel}
            {...(jogadorAtual?.isBot ? { motivoBloqueio: 'Aguardando o bot jogar.' } : {})}
            onClick={onComprarCarta}
          />
          <span className="pile-label pile-label-deck">MONTE</span>
        </div>

        <div className="discard-slot">
          {estado.ataqueAcumulado > 0 && (
            <div
              className={`attack-badge ${estado.ataqueAcumulado >= 8 ? 'attack-badge-big' : ''}`}
              role="status"
              aria-label={`Ataque acumulado: +${estado.ataqueAcumulado}`}
            >
              +{estado.ataqueAcumulado}
            </div>
          )}
          {topo && <CartaView carta={topo} jogavel={false} />}
          <span className="pile-label">DESCARTE</span>
        </div>
      </div>

      {/* Resumo de turno — fluxo normal, não absoluto em mobile */}
      <div
        className={`turn-summary ${estado.ataqueAcumulado > 0 ? 'danger' : ''}`}
        role="status"
        aria-live="polite"
      >
        <strong>{jogadorAtual?.nome ?? 'Jogador'}</strong>
        <span>
          {jogadorAtual?.isBot
            ? 'Bot executando o turno.'
            : estado.ataqueAcumulado > 0
              ? `Ataque ativo: +${estado.ataqueAcumulado}. Cubra com +2/+4 ou pague.`
              : 'Toque em uma carta para selecionar, depois confirme. Ou compre no monte.'}
        </span>
      </div>

      {/* Faixa de status — cor, sentido, ataque */}
      <div className="table-status-bar" aria-label="Status da mesa">
        <div
          className="status-pill"
          style={{ '--kb-pill-accent': infoCor.hex } as React.CSSProperties}
        >
          <span
            className="status-color-dot"
            style={{ background: infoCor.hex }}
            aria-hidden="true"
          />
          <span className="status-label">Cor</span>
          <strong style={{ color: infoCor.hex }}>{infoCor.nomePt}</strong>
          <span className="status-symbol" aria-hidden="true">
            {infoCor.simboloAcessivel}
          </span>
        </div>

        <div className="status-pill">
          <SentidoIcone sentido={estado.sentido} />
          <span className="status-label">Sentido</span>
          <strong>{estado.sentido === 1 ? 'Horário' : 'Anti-horário'}</strong>
        </div>

        {estado.ataqueAcumulado > 0 && (
          <div className="status-pill status-pill-danger" role="status">
            <span aria-hidden="true">⚡</span>
            <strong>Ataque +{estado.ataqueAcumulado}</strong>
          </div>
        )}
      </div>
    </div>
  );
};
