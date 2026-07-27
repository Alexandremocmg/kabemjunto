import React, { useEffect } from 'react';
import { EstadoPartida, Jogador } from '@shared/types';
import confetti from 'canvas-confetti';
import { Trophy, RotateCcw } from 'lucide-react';

interface PainelVitoriaProps {
  estado: EstadoPartida;
  onReiniciar: () => void;
}

export const PainelVitoria: React.FC<PainelVitoriaProps> = ({ estado, onReiniciar }) => {
  const vencedor = estado.jogadores.find((j: Jogador) => j.id === estado.vencedor);

  useEffect(() => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
    });
  }, []);

  return (
    <div className="modal-overlay">
      <div className="glass-panel modal-content" style={{ padding: '40px' }}>
        <Trophy
          size={64}
          color="#F39C12"
          style={{ margin: '0 auto 16px', filter: 'drop-shadow(0 0 15px #F39C12)' }}
        />

        <h2 style={{ fontSize: '32px', color: '#FFFFFF', marginBottom: '8px' }}>VITÓRIA! 🏆</h2>

        <p style={{ fontSize: '20px', color: '#F39C12', fontWeight: '800', marginBottom: '24px' }}>
          {vencedor?.nome || 'Jogador'} descartou todas as cartas!
        </p>

        <div
          style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '16px',
            borderRadius: '12px',
            marginBottom: '24px',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '14px', color: '#8B949E', marginBottom: '8px' }}>
            Estatísticas da Partida:
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span>
              Jogadores: <strong>{estado.jogadores.length}</strong>
            </span>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={onReiniciar}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <RotateCcw size={18} /> Jogar Novamente
        </button>
      </div>
    </div>
  );
};
