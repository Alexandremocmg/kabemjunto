import React from 'react';
import { Carta } from '@kabemjunto/shared/types';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';

interface CartaViewProps {
  carta?: Carta;
  onClick?: () => void;
  jogavel?: boolean;
  motivoBloqueio?: string;
  verso?: boolean;
  pequena?: boolean;
  /** F8: aplica classe de shake (clicou em carta inválida). */
  shaking?: boolean;
  selecionada?: boolean;
  contador?: string;
}

function getCartaLabel(carta: Carta): string {
  if (carta.valor !== undefined) {
    return `Carta ${carta.valor} ${carta.cor ?? ''}`.trim();
  }

  const labels: Record<string, string> = {
    SKIP: 'Pula',
    REVERSE: 'Inverte',
    MAIS_DOIS: 'Mais dois',
    MAIS_QUATRO: 'Mais quatro',
    ZERO_MAIS: 'Zero Mais',
    TROCA_MAO: 'Troca mão',
    GIRA_MAO: 'Gira mão',
    CORINGA_SIMPLES: 'Coringa',
    SILENCIO: 'Silêncio',
  };

  return labels[carta.acao ?? ''] ?? 'Carta';
}

function getIcone(carta: Carta): string {
  if (carta.valor !== undefined) return `${carta.valor}`;
  if (carta.acao === 'SKIP') return '🚫';
  if (carta.acao === 'REVERSE') return '🔄';
  if (carta.acao === 'MAIS_DOIS') return '+2';
  if (carta.acao === 'MAIS_QUATRO') return '+4';
  if (carta.acao === 'ZERO_MAIS') return '0+';
  if (carta.acao === 'TROCA_MAO') return '🤝';
  if (carta.acao === 'GIRA_MAO') return '🌀';
  if (carta.acao === 'CORINGA_SIMPLES') return '🎨';
  // A carta 7 é deliberadamente secreta: seu valor numérico já foi retornado acima.
  if (carta.acao === 'SILENCIO') return '7';
  return '?';
}

export const CartaView: React.FC<CartaViewProps> = ({
  carta,
  onClick,
  jogavel = true,
  motivoBloqueio,
  verso = false,
  pequena = false,
  shaking = false,
  selecionada = false,
  contador,
}) => {
  if (verso) {
    return (
      <div
        className={`card-wrapper card-back ${!jogavel ? 'disabled' : 'playable'}`}
        onClick={jogavel ? onClick : undefined}
        onKeyDown={(event) => {
          if (jogavel && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onClick?.();
          }
        }}
        role={onClick ? 'button' : undefined}
        tabIndex={jogavel && onClick ? 0 : -1}
        aria-disabled={!jogavel}
        aria-label={jogavel ? 'Comprar carta' : (motivoBloqueio ?? 'Monte de compra bloqueado')}
        title={motivoBloqueio ?? 'Monte de compra'}
        style={{ width: pequena ? '80px' : '130px', height: pequena ? '115px' : '185px' }}
      >
        <img
          src="/assets/svgs/card-back.svg"
          alt="Verso da Carta"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '12px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
          }}
        />
        {contador && <span className="card-back-count">{contador}</span>}
      </div>
    );
  }

  if (!carta) return null;

  const corKey = carta.cor || 'NEUTRO';
  const infoCor = PALETA_CORES[corKey] || PALETA_CORES.NEUTRO;
  const icone = getIcone(carta);
  const classes = [
    'card-wrapper',
    jogavel ? 'playable' : 'disabled',
    carta.acao === 'ZERO_MAIS' ? 'zeroplus-active' : '',
    shaking ? 'card-shake' : '',
    selecionada ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      onClick={jogavel ? onClick : undefined}
      onKeyDown={(event) => {
        if (jogavel && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick?.();
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={jogavel && onClick ? 0 : -1}
      aria-disabled={!jogavel}
      aria-pressed={selecionada}
      aria-label={jogavel ? getCartaLabel(carta) : (motivoBloqueio ?? getCartaLabel(carta))}
      title={motivoBloqueio ?? carta.efeito_texto_longo}
      style={{
        width: pequena ? '85px' : '130px',
        height: pequena ? '120px' : '185px',
      }}
    >
      <div className={`card-face ${corKey}`}>
        <div
          className="card-corner card-corner-top"
          style={{ fontSize: pequena ? '14px' : '20px' }}
        >
          <span>{icone}</span>
          <span style={{ marginLeft: '4px', fontSize: '0.8em', opacity: 0.8 }}>
            {infoCor.simboloAcessivel}
          </span>
        </div>

        <div className="card-center-val" style={{ fontSize: pequena ? '26px' : '48px' }}>
          {carta.acao === 'ZERO_MAIS' ? (
            <span style={{ color: '#F1C40F', textShadow: '0 0 10px #F39C12' }}>0+</span>
          ) : (
            icone
          )}
        </div>

        <div
          className="card-corner card-corner-bottom"
          style={{ fontSize: pequena ? '14px' : '20px' }}
        >
          <span>{icone}</span>
        </div>
      </div>
    </div>
  );
};
