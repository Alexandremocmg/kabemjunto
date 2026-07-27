import React from 'react';

type EventoVisual = {
  tipo: 'SILENCIO' | 'ATAQUE' | 'ZERO_MAIS';
  titulo: string;
  detalhe: string;
};

interface EventoPartidaOverlayProps {
  evento: EventoVisual | null;
}

export const EventoPartidaOverlay: React.FC<EventoPartidaOverlayProps> = ({ evento }) => {
  if (!evento) return null;
  return (
    <div
      className={`game-event-overlay event-${evento.tipo.toLowerCase()}`}
      role="status"
      aria-live="assertive"
    >
      <div className="game-event-card">
        <span className="game-event-icon" aria-hidden="true">
          {evento.tipo === 'SILENCIO' ? '🤫' : evento.tipo === 'ZERO_MAIS' ? '0+' : '⚡'}
        </span>
        <strong>{evento.titulo}</strong>
        <span>{evento.detalhe}</span>
      </div>
    </div>
  );
};
