import React from 'react';
import { X, Zap, VolumeX } from 'lucide-react';

interface TutorialModalProps {
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ onClose }) => {
  return (
    <div className="modal-overlay">
      <div
        className="glass-panel modal-content"
        style={{ maxWidth: '600px', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ fontSize: '24px', color: '#F39C12' }}>🎴 Como Jogar o Kabemjunto</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: '#E6EDF3',
          }}
        >
          <div>
            <h3 style={{ color: '#3498DB', marginBottom: '4px' }}>🎯 Objetivo Principal</h3>
            <p>
              Seja o primeiro a descartar todas as cartas da sua mão. Em seu turno, jogue uma carta
              da mesma cor ou número da carta no topo do monte de descarte.
            </p>
          </div>

          <div
            style={{
              background: 'rgba(241, 196, 15, 0.1)',
              padding: '12px',
              borderRadius: '12px',
              stroke: '#F1C40F',
              border: '1px solid #F1C40F44',
            }}
          >
            <h3
              style={{
                color: '#F1C40F',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px',
              }}
            >
              <Zap size={18} /> Carta 0+ (Zero Mais / Reflexo)
            </h3>
            <p>
              O momento viral do jogo! Se houver um ataque acumulado (+2, +4, +6...), jogar o{' '}
              <strong>0+</strong> reflete <strong>TODO</strong> o ataque de volta para o último
              atacante e encerra a pilha!
            </p>
          </div>

          <div
            style={{
              background: 'rgba(142, 68, 173, 0.1)',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid #8E44AD44',
            }}
          >
            <h3
              style={{
                color: '#8E44AD',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px',
              }}
            >
              <VolumeX size={18} /> Regra do 7 (Silêncio Social)
            </h3>
            <p>
              Ao jogar uma carta <strong>7</strong>, todos os jogadores entram em silêncio imediato
              até que outra carta diferente de 7 seja jogada. Quem falar no chat paga{' '}
              <strong>+2 cartas</strong>!
            </p>
          </div>

          <div>
            <h3 style={{ color: '#27AE60', marginBottom: '4px' }}>⚔️ Acúmulo de Ataques</h3>
            <ul style={{ paddingLeft: '20px' }}>
              <li>
                <strong>+2 sobre +2:</strong> Permitido (soma +4)
              </li>
              <li>
                <strong>+4 sobre +2:</strong> Permitido (soma +6)
              </li>
              <li>
                <strong>+4 sobre +4:</strong> Permitido (soma +8)
              </li>
              <li>
                <strong>+2 sobre +4:</strong>{' '}
                <span style={{ color: '#E74C3C', fontWeight: 'bold' }}>PROIBIDO!</span> (Regra de
                ouro)
              </li>
            </ul>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={onClose}
          style={{ marginTop: '24px', width: '100%' }}
        >
          Entendido, Vamos Jogar!
        </button>
      </div>
    </div>
  );
};
