import React from 'react';
import type { Carta, EstadoPartidaPublico, JogadorPublico } from '@kabemjunto/shared';
import { CartaView } from './CartaView';

interface MesaOnlineProps {
  estado: EstadoPartidaPublico;
  mao: ReadonlyArray<Carta>;
  jogadorId?: string | undefined;
  selectedCardId?: string | undefined;
  onSelecionarCarta: (carta: Carta) => void;
  onComprarCarta: () => void;
}

function AssentoOnline({
  jogador,
  index,
  ativo,
  jogadorId,
}: {
  jogador: JogadorPublico;
  index: number;
  ativo: boolean;
  jogadorId?: string | undefined;
}) {
  const voce = jogador.id === jogadorId;
  return (
    <div
      className={`player-seat player-seat-${index + 1} ${voce ? 'player-seat-you' : ''} ${ativo ? 'active' : ''}`}
    >
      <div className="player-seat-avatar" aria-hidden="true">
        {jogador.avatar || '👤'}
      </div>
      <div className="player-seat-copy">
        <strong>{jogador.nome}</strong>
        <span>{voce ? 'Você' : jogador.conectado ? 'Online' : 'Offline'}</span>
      </div>
      <div className="player-seat-count" aria-label={`${jogador.quantidadeCartas} cartas`}>
        {jogador.quantidadeCartas}
      </div>
    </div>
  );
}

export const MesaOnline: React.FC<MesaOnlineProps> = ({
  estado,
  mao,
  jogadorId,
  selectedCardId,
  onSelecionarCarta,
  onComprarCarta,
}) => {
  const minhaVez = estado.vezDe === jogadorId;
  const jogadorAtual = estado.jogadores.find((jogador) => jogador.id === estado.vezDe);

  return (
    <div className="table-area online-table-area">
      <div className="player-table" aria-label="Jogadores na mesa online">
        {estado.jogadores.slice(0, 4).map((jogador, index) => (
          <AssentoOnline
            key={jogador.id}
            jogador={jogador}
            index={index}
            ativo={jogador.id === estado.vezDe}
            jogadorId={jogadorId}
          />
        ))}
      </div>

      <div className="table-center" aria-label="Núcleo da mesa online">
        <div className="deck-slot" title={minhaVez ? 'Comprar carta' : 'Aguardando sua vez'}>
          <CartaView
            verso
            contador={`MONTE ${estado.quantidadeMonteCompra}`}
            jogavel={minhaVez}
            {...(!minhaVez ? { motivoBloqueio: 'Aguardando o turno.' } : {})}
            onClick={onComprarCarta}
          />
        </div>
        <div className="discard-slot">
          {estado.ataqueAcumulado > 0 && (
            <div className="attack-badge" role="status">
              +{estado.ataqueAcumulado}
            </div>
          )}
          <CartaView carta={estado.topo} jogavel={false} />
          <span className="pile-label">DESCARTE</span>
        </div>
      </div>

      <div className={`turn-summary ${estado.ataqueAcumulado > 0 ? 'danger' : ''}`}>
        <strong>{minhaVez ? 'SUA VEZ' : (jogadorAtual?.nome ?? 'Jogador')}</strong>
        <span>
          {minhaVez
            ? 'Toque uma carta duas vezes para confirmar ou compre no monte.'
            : 'Aguardando o próximo jogador.'}
        </span>
      </div>

      <div className="table-status-bar" aria-label="Status da mesa online">
        <div className="color-indicator">
          <span className="status-label">Cor ativa</span>
          <strong>{estado.corAtiva}</strong>
        </div>
        <div className="color-indicator">
          <span className="status-label">Sentido</span>
          <strong>{estado.sentido === 1 ? '↻ Horário' : '↺ Anti-horário'}</strong>
        </div>
        {estado.ataqueAcumulado > 0 && (
          <div className="color-indicator attack-indicator">Ataque +{estado.ataqueAcumulado}</div>
        )}
      </div>

      <section className="online-hand-container" aria-label={`Sua mão: ${mao.length} cartas`}>
        <div className="hand-status" role="status" aria-live="polite">
          <strong>SUA MÃO</strong>
          <span>
            {minhaVez ? 'SUA VEZ · ' : ''}
            {mao.length} cartas
          </span>
        </div>
        <div className="hand-cards hand-fan" role="list">
          {mao.map((carta, index) => (
            <div
              className={`hand-card-slot ${selectedCardId === carta.id ? 'selected-slot' : ''}`}
              key={`${carta.id}_${index}`}
              role="listitem"
              style={{
                transform: `rotate(${Math.max(-12, Math.min(12, (index - (mao.length - 1) / 2) * 4))}deg)`,
              }}
            >
              <CartaView
                carta={carta}
                jogavel={minhaVez}
                selecionada={selectedCardId === carta.id}
                {...(!minhaVez ? { motivoBloqueio: 'Aguardando o seu turno.' } : {})}
                onClick={() => minhaVez && onSelecionarCarta(carta)}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default MesaOnline;
