import React from 'react';
import { VolumeX } from 'lucide-react';

export const RegraDoSilencioBanner: React.FC = () => {
  return (
    <div className="silence-banner">
      <VolumeX size={24} style={{ color: '#F1C40F', animation: 'pulse 1s infinite' }} />
      <div>
        <span style={{ color: '#F1C40F', fontWeight: '900' }}>🤫 REGRA DO SILÊNCIO ATIVA!</span>
        <div style={{ fontSize: '12px', opacity: 0.9, fontWeight: '500' }}>
          Um 7 foi jogado! Todos em silêncio até a próxima carta não-7. Quem falar compra +2 cartas!
        </div>
      </div>
    </div>
  );
};
