import React from 'react';
import { Cor } from '@shared/types';
import { PALETA_CORES } from '@shared/constants/cards';

type CorAtiva = Exclude<Cor, 'NEUTRO'>;

interface ModalEscolhaCorProps {
  onEscolherCor: (cor: CorAtiva) => void;
}

export const ModalEscolhaCor: React.FC<ModalEscolhaCorProps> = ({ onEscolherCor }) => {
  const cores: CorAtiva[] = ['LARANJA', 'AZUL', 'VERDE', 'PRETO'];

  return (
    <div className="modal-overlay">
      <div className="glass-panel modal-content">
        <h2 style={{ fontSize: '24px', marginBottom: '8px', color: '#F39C12' }}>
          🎨 Escolha a Nova Cor
        </h2>
        <p style={{ color: '#8B949E', marginBottom: '24px' }}>
          Qual cor você deseja ativar para as próximas jogadas?
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {cores.map((cor) => (
            <button
              key={cor}
              onClick={() => onEscolherCor(cor)}
              style={{
                backgroundColor: PALETA_CORES[cor].hex,
                color: '#FFFFFF',
                border: 'none',
                padding: '20px',
                borderRadius: '16px',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: '900',
                fontSize: '18px',
                cursor: 'pointer',
                boxShadow: `0 4px 15px ${PALETA_CORES[cor].hex}66`,
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {PALETA_CORES[cor].nomePt} {PALETA_CORES[cor].simboloAcessivel}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
