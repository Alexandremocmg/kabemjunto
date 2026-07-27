import React from 'react';
import { EstadoPartida, Jogador } from '@shared/types';
import { Volume2, VolumeX, ShieldAlert, HelpCircle } from 'lucide-react';
import { audioService } from '../services/audioService';

interface HUDJogadorProps {
  estado: EstadoPartida;
  onOpenTutorial: () => void;
  onQuebrarSilencio?: () => void;
}

export const HUDJogador: React.FC<HUDJogadorProps> = ({
  estado,
  onOpenTutorial,
  onQuebrarSilencio,
}) => {
  const [muted, setMuted] = React.useState(audioService.isMuted());

  const toggleAudio = () => {
    const isMuted = audioService.toggleMute();
    setMuted(isMuted);
  };

  return (
    <header className="game-header">
      {/* Nome do Jogo & Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <h1
          style={{
            fontSize: '20px',
            letterSpacing: '1px',
            background: 'linear-gradient(135deg, #F39C12, #E74C3C)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          KABEMJUNTO
        </h1>
      </div>

      {/* Lista de Jogadores & Vez Atual */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {estado.jogadores.map((j: Jogador) => {
          const isVez = j.id === estado.vezDe;
          return (
            <div
              key={j.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '20px',
                background: isVez ? 'rgba(243, 156, 18, 0.25)' : 'rgba(255,255,255,0.05)',
                border: isVez ? '2px solid #F39C12' : '1px solid transparent',
                transition: 'all 0.25s ease',
              }}
            >
              <span style={{ fontSize: '20px' }}>{j.avatar || '👤'}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: isVez ? '800' : '600',
                    color: isVez ? '#F39C12' : '#F0F6FC',
                  }}
                >
                  {j.nome} {j.isBot && '🤖'}
                </span>
                <span style={{ fontSize: '11px', color: '#8B949E' }}>
                  {j.mao.length} {j.mao.length === 1 ? 'carta' : 'cartas'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ações: Tutorial, Som, Punição do Silêncio */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {estado.silencio?.ativo && (
          <button
            onClick={onQuebrarSilencio}
            style={{
              background: 'rgba(231, 76, 60, 0.2)',
              border: '1px solid #E74C3C',
              color: '#FF6B6B',
              padding: '6px 12px',
              borderRadius: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: '700',
              fontSize: '12px',
            }}
          >
            <ShieldAlert size={14} /> Denunciar Fala (+2)
          </button>
        )}

        <button
          onClick={onOpenTutorial}
          className="btn-secondary"
          style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <HelpCircle size={16} /> Regras
        </button>

        <button onClick={toggleAudio} className="btn-secondary" style={{ padding: '8px 12px' }}>
          {muted ? <VolumeX size={16} color="#E74C3C" /> : <Volume2 size={16} color="#27AE60" />}
        </button>
      </div>
    </header>
  );
};
