import React from 'react';
import { Cor, EstadoPartida } from '@shared/types';
import { PALETA_CORES } from '@shared/constants/cards';
import { CartaView } from './CartaView';

interface MesaDeJogoProps {
  estado: EstadoPartida;
  onComprarCarta: () => void;
}

export const MesaDeJogo: React.FC<MesaDeJogoProps> = ({ estado, onComprarCarta }) => {
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  const corAtiva = (estado.corAtiva || 'LARANJA') as Cor;
  const infoCor = PALETA_CORES[corAtiva] || PALETA_CORES.NEUTRO;
  const jogadorAtual = estado.jogadores.find((j) => j.id === estado.vezDe);
  const compraDisponivel = Boolean(jogadorAtual && !jogadorAtual.isBot && !estado.finalizada);
  const compraLabel =
    estado.ataqueAcumulado > 0 ? `Pagar +${estado.ataqueAcumulado}` : 'Comprar carta';

  return (
    <div className="table-area">
      {/* Monte de Compra e Monte de Descarte */}
      <div className="table-center">
        {/* Monte de Compra */}
        <div className="deck-slot" title={compraLabel}>
          <CartaView
            verso={true}
            jogavel={compraDisponivel}
            motivoBloqueio={jogadorAtual?.isBot ? 'Aguardando o bot jogar.' : undefined}
            onClick={onComprarCarta}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-24px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '12px',
              fontWeight: '700',
              color: '#8B949E',
            }}
          >
            {estado.monteCompra.length} no monte
          </div>
          {compraDisponivel && (
            <button className="draw-action" onClick={onComprarCarta}>
              {compraLabel}
            </button>
          )}
        </div>

        {/* Monte de Descarte */}
        <div className="discard-slot" style={{ position: 'relative' }}>
          {/* Badge de Ataque Acumulado (+2 / +4 / +6 / +8) */}
          {estado.ataqueAcumulado > 0 && (
            <div className="attack-badge">+{estado.ataqueAcumulado}</div>
          )}

          {topo && <CartaView carta={topo} jogavel={false} />}

          <div
            style={{
              position: 'absolute',
              bottom: '-24px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '12px',
              fontWeight: '700',
              color: '#8B949E',
              whiteSpace: 'nowrap',
            }}
          >
            Descarte ({estado.monteDescarte.length})
          </div>
        </div>
      </div>

      <div className={`turn-summary ${estado.ataqueAcumulado > 0 ? 'danger' : ''}`}>
        <strong>{jogadorAtual?.nome ?? 'Jogador'}</strong>
        <span>
          {jogadorAtual?.isBot
            ? 'Bot executando o turno.'
            : estado.ataqueAcumulado > 0
              ? `Ataque acumulado: +${estado.ataqueAcumulado}. Cubra com +2, +4 ou 0+.`
              : 'Jogue uma carta valida ou compre do monte.'}
        </span>
      </div>

      {/* Indicador de Cor Ativa & Sentido de Jogo */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
        }}
      >
        <div className="color-indicator">
          <span style={{ fontSize: '13px', color: '#8B949E' }}>Cor Ativa:</span>
          <div className="color-dot" style={{ backgroundColor: infoCor.hex, color: infoCor.hex }} />
          <span style={{ fontWeight: '800', color: infoCor.hex }}>
            {infoCor.nomePt} {infoCor.simboloAcessivel}
          </span>
        </div>

        <div className="color-indicator">
          <span style={{ fontSize: '13px', color: '#8B949E' }}>Sentido:</span>
          <span style={{ fontWeight: '800', color: '#F0F6FC' }}>
            {estado.sentido === 1 ? '🔄 Horário' : '🔁 Anti-Horário'}
          </span>
        </div>
      </div>
    </div>
  );
};
