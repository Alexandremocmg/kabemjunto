import React from 'react';
import type { Carta, EstadoPartidaPublico, JogadorPublico } from '@kabemjunto/shared';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { CartaView } from './CartaView';

interface MesaOnlineProps {
  estado: EstadoPartidaPublico;
  mao: ReadonlyArray<Carta>;
  jogadorId?: string | undefined;
  selectedCardId?: string | undefined;
  onSelecionarCarta: (carta: Carta) => void;
  onComprarCarta: () => void;
}

function SentidoIcone({ sentido }: { sentido: number }) {
  return (
    <span aria-hidden="true" className="status-sentido-icone">
      {sentido === 1 ? '↻' : '↺'}
    </span>
  );
}

function AssentoOnline({
  jogador,
  index,
  totalJogadores,
  ativo,
}: {
  jogador: JogadorPublico;
  index: number;
  totalJogadores: number;
  ativo: boolean;
}) {
  const angle = (index * 360) / totalJogadores;
  const radians = (angle * Math.PI) / 180;
  return (
    <div
      className={`player-seat player-seat-ring ${ativo ? 'active' : ''}`}
      style={
        {
          '--seat-angle': `${angle}deg`,
          '--seat-offset-x': `${Math.sin(radians) * 140}px`,
          '--seat-offset-y': `${-Math.cos(radians) * 160}px`,
        } as React.CSSProperties
      }
      data-seat-index={index}
      aria-label={`${jogador.nome}${ativo ? ' — vez deste jogador' : ''} · ${jogador.quantidadeCartas} cartas · ${jogador.conectado ? 'Online' : 'Offline'}`}
    >
      <div className="player-seat-avatar" aria-hidden="true">
        {jogador.avatar || '👤'}
      </div>
      <div className="player-seat-copy">
        <strong>{jogador.nome}</strong>
        <span>{jogador.conectado ? 'Online' : 'Offline'}</span>
      </div>
      <div
        className={`player-seat-count ${!jogador.conectado ? 'player-seat-count-offline' : ''}`}
        aria-label={`${jogador.quantidadeCartas} cartas`}
      >
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
  const jogadorLocal = estado.jogadores.find((jogador) => jogador.id === jogadorId);
  const jogadoresRemotos = estado.jogadores.filter((jogador) => jogador.id !== jogadorId);
  const corAtiva = estado.corAtiva ?? 'LARANJA';
  const infoCor = PALETA_CORES[corAtiva] ?? PALETA_CORES.NEUTRO;

  return (
    <div className="table-area online-table-area">
      <div className="table-status-bar" aria-label="Status da mesa online">
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

      <div className="online-play-stage">
        <div
          className={`player-table player-table-ring player-count-${Math.min(jogadoresRemotos.length, 10)}`}
          aria-label="Jogadores remotos na mesa online"
        >
          {jogadoresRemotos.map((jogador, index) => (
            <AssentoOnline
              key={jogador.id}
              jogador={jogador}
              index={index}
              totalJogadores={jogadoresRemotos.length}
              ativo={jogador.id === estado.vezDe}
            />
          ))}
        </div>

        <div className="table-center" aria-label="Núcleo da mesa online">
          <div className="deck-slot" title={minhaVez ? 'Comprar carta' : 'Aguardando sua vez'}>
            <CartaView
              verso
              contador={`${estado.quantidadeMonteCompra}`}
              jogavel={minhaVez}
              {...(!minhaVez ? { motivoBloqueio: 'Aguardando o turno.' } : {})}
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
            <CartaView carta={estado.topo} jogavel={false} />
            <span className="pile-label">DESCARTE</span>
          </div>
        </div>

        <div
          className={`turn-summary ${estado.ataqueAcumulado > 0 ? 'danger' : ''}`}
          role="status"
          aria-live="polite"
        >
          <strong>{minhaVez ? 'SUA VEZ' : (jogadorAtual?.nome ?? 'Jogador')}</strong>
          <span>
            {minhaVez
              ? estado.ataqueAcumulado > 0
                ? `Ataque +${estado.ataqueAcumulado}: cubra com +2/+4 ou compre no monte.`
                : 'Toque uma carta para selecionar, toque novamente para confirmar.'
              : `Aguardando ${jogadorAtual?.nome ?? 'o próximo jogador'}.`}
          </span>
        </div>
      </div>

      <section className="online-hand-container" aria-label={`Sua mão: ${mao.length} cartas`}>
        <div className="hand-status" role="status" aria-live="polite">
          <div
            className="hand-local-player"
            aria-label={`Você: ${jogadorLocal?.nome ?? 'Jogador'}`}
          >
            <i aria-hidden="true">{jogadorLocal?.avatar || '👤'}</i>
            <em>{jogadorLocal?.nome ?? 'Você'}</em>
          </div>
          <strong>SUA MÃO</strong>
          <span>{mao.length} cartas</span>
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
