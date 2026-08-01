import React from 'react';
import { Carta } from '@kabemjunto/shared/types';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { getCardVisual, getCardAltText, CARD_BACK_ASSET } from './cardVisuals.js';

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
    MAIS_DOIS_TODOS: '+2 Para Todos',
    ZERO_MAIS: 'Zero Mais',
    TROCA_MAO: 'Troca mão',
    GIRA_MAO: 'Gira mão',
    CORINGA_SIMPLES: 'Coringa',
    SILENCIO: 'Silêncio',
  };

  return labels[carta.acao ?? ''] ?? carta.efeito_texto_curto;
}

function getIconeTexto(carta: Carta): string {
  if (carta.valor !== undefined) return `${carta.valor}`;
  if (carta.acao === 'SKIP') return '⊘';
  if (carta.acao === 'REVERSE') return '⇄';
  if (carta.acao === 'MAIS_DOIS') return '+2';
  if (carta.acao === 'MAIS_QUATRO') return '+4';
  if (carta.acao === 'MAIS_DOIS_TODOS') return '+2🌐';
  if (carta.acao === 'ZERO_MAIS') return '0+';
  if (carta.acao === 'TROCA_MAO') return '⇌';
  if (carta.acao === 'GIRA_MAO') return '↻';
  if (carta.acao === 'CORINGA_SIMPLES') return '✦';
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
  const width = pequena ? '80px' : '130px';
  const height = pequena ? '115px' : '185px';

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (jogavel && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick?.();
    }
  };

  // ── Verso / Monte de Compra ──────────────────────────────────────────────
  if (verso) {
    return (
      <div
        className={`card-wrapper card-back ${!jogavel ? 'disabled' : 'playable'}`}
        onClick={jogavel ? onClick : undefined}
        onKeyDown={handleKeyDown}
        role={onClick ? 'button' : undefined}
        tabIndex={jogavel && onClick ? 0 : -1}
        aria-disabled={!jogavel}
        aria-label={jogavel ? 'Comprar carta' : (motivoBloqueio ?? 'Monte de compra bloqueado')}
        title={motivoBloqueio ?? 'Monte de compra'}
        style={{ width, height }}
      >
        <img
          src={CARD_BACK_ASSET}
          alt="Verso da carta Kabemjunto"
          className="card-back-image"
          draggable={false}
        />
        {contador && (
          <span className="card-back-count" aria-label={`Monte com ${contador} cartas`}>
            {contador}
          </span>
        )}
      </div>
    );
  }

  if (!carta) return null;

  const visual = getCardVisual(carta);
  const corKey = carta.cor || 'NEUTRO';
  const infoCor = PALETA_CORES[corKey] || PALETA_CORES.NEUTRO;
  const iconeTexto = getIconeTexto(carta);

  const classes = [
    'card-wrapper',
    jogavel ? 'playable' : 'disabled',
    carta.acao === 'ZERO_MAIS' ? 'zeroplus-active' : '',
    shaking ? 'card-shake' : '',
    selecionada ? 'selected' : '',
    visual.kind === 'asset' ? 'card-has-art' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // ── Carta com arte premium (5 neutras especiais) ────────────────────────
  if (visual.kind === 'asset') {
    return (
      <div
        className={classes}
        onClick={jogavel ? onClick : undefined}
        onKeyDown={handleKeyDown}
        role={onClick ? 'button' : undefined}
        tabIndex={jogavel && onClick ? 0 : -1}
        aria-disabled={!jogavel}
        aria-pressed={selecionada}
        aria-label={jogavel ? getCartaLabel(carta) : (motivoBloqueio ?? getCartaLabel(carta))}
        title={motivoBloqueio ?? carta.efeito_texto_longo}
        style={{ width, height }}
      >
        <img
          src={visual.src}
          alt={getCardAltText(carta)}
          className="card-art-image"
          draggable={false}
        />
        {/* índice no canto para acessibilidade de leitura rápida */}
        <span className="card-art-corner-index" aria-hidden="true">
          {iconeTexto}
        </span>
      </div>
    );
  }

  // ── Template CSS — numérica, ação colorida ou neutra sem arte ───────────
  const templateClass =
    visual.variant === 'numeric'
      ? 'card-template-numeric'
      : visual.variant === 'acao-colorida'
        ? 'card-template-acao'
        : 'card-template-neutra';

  return (
    <div
      className={classes}
      onClick={jogavel ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={jogavel && onClick ? 0 : -1}
      aria-disabled={!jogavel}
      aria-pressed={selecionada}
      aria-label={jogavel ? getCartaLabel(carta) : (motivoBloqueio ?? getCartaLabel(carta))}
      title={motivoBloqueio ?? carta.efeito_texto_longo}
      style={{ width, height }}
    >
      <div className={`card-face ${corKey} ${templateClass}`}>
        <div
          className="card-corner card-corner-top"
          style={{ fontSize: pequena ? '13px' : '18px' }}
          aria-hidden="true"
        >
          <span className="card-corner-value">{iconeTexto}</span>
          <span className="card-corner-symbol">{infoCor.simboloAcessivel}</span>
        </div>

        <div
          className="card-center-val"
          style={{ fontSize: pequena ? '28px' : '52px' }}
          aria-hidden="true"
        >
          {carta.acao === 'ZERO_MAIS' ? <span className="zeroplus-glow">0+</span> : iconeTexto}
        </div>

        <div
          className="card-corner card-corner-bottom"
          style={{ fontSize: pequena ? '13px' : '18px' }}
          aria-hidden="true"
        >
          <span className="card-corner-value">{iconeTexto}</span>
        </div>
      </div>
    </div>
  );
};
