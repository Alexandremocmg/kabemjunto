import React from 'react';
import { VolumeX } from 'lucide-react';

export const RegraDoSilencioBanner: React.FC = () => {
  return (
    <div className="silence-banner" role="status" aria-live="polite">
      <VolumeX size={18} aria-hidden="true" />
      <strong>🤫 SILÊNCIO ATIVO</strong>
      <span>· Falou? +2 cartas</span>
    </div>
  );
};
