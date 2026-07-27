import React, { useEffect, useRef } from 'react';
import { Check, Palette, X } from 'lucide-react';
import { AvatarComStatus } from './AvatarComStatus';

export type TemaColecao = 'FLORESTA' | 'NEON' | 'AREIA';

interface PainelColecaoProps {
  avatarId: string;
  tema: TemaColecao;
  onAvatarChange: (avatarId: string) => void;
  onTemaChange: (tema: TemaColecao) => void;
  onClose: () => void;
}

const AVATARES = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const TEMAS: Array<{ id: TemaColecao; nome: string; cores: string[] }> = [
  { id: 'FLORESTA', nome: 'Floresta', cores: ['#0d1c15', '#27ae60', '#f8c56b'] },
  { id: 'NEON', nome: 'Neon', cores: ['#15102a', '#c026d3', '#22d3ee'] },
  { id: 'AREIA', nome: 'Areia', cores: ['#2a2016', '#d97706', '#fde68a'] },
];

export const PainelColecao: React.FC<PainelColecaoProps> = ({
  avatarId,
  tema,
  onAvatarChange,
  onTemaChange,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="collection-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="collection-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-title"
      >
        <header className="collection-header">
          <div>
            <span className="local-home-kicker">COLEÇÃO</span>
            <h2 id="collection-title">Seu estilo de mesa</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="collection-close"
            onClick={onClose}
            type="button"
            aria-label="Fechar coleção"
          >
            <X size={19} />
          </button>
        </header>

        <div className="collection-preview" data-theme={tema}>
          <AvatarComStatus avatarId={avatarId} nome="Seu Nome" size={72} />
          <div>
            <strong>Seu Nome</strong>
            <span>Prévia local</span>
          </div>
          <Palette size={19} aria-hidden="true" />
        </div>

        <div className="collection-section">
          <h3>Avatar</h3>
          <div className="avatar-grid" role="radiogroup" aria-label="Escolha seu avatar">
            {AVATARES.map((id) => (
              <button
                key={id}
                className={`avatar-choice ${avatarId === id ? 'selected' : ''}`}
                onClick={() => onAvatarChange(id)}
                role="radio"
                aria-checked={avatarId === id}
                type="button"
              >
                <AvatarComStatus avatarId={id} nome={`Avatar ${id}`} size={42} />
                {avatarId === id && <Check size={13} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>

        <div className="collection-section">
          <h3>Tema da mesa</h3>
          <div className="theme-grid" role="radiogroup" aria-label="Escolha o tema da mesa">
            {TEMAS.map((item) => (
              <button
                key={item.id}
                className={`theme-choice ${tema === item.id ? 'selected' : ''}`}
                onClick={() => onTemaChange(item.id)}
                role="radio"
                aria-checked={tema === item.id}
                type="button"
              >
                <span
                  className="theme-swatch"
                  style={{ background: `linear-gradient(135deg, ${item.cores.join(', ')})` }}
                />
                <strong>{item.nome}</strong>
                {tema === item.id && <Check size={14} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>

        <p className="collection-note">
          Prévia local. Cosméticos não alteram regras nem o estado autoritativo.
        </p>
      </section>
    </div>
  );
};
