import React from 'react';

export interface ReconectandoProps {
  tentativa?: number;
  maxTentativas?: number;
  mensagem?: string;
  className?: string;
}

export const Reconectando: React.FC<ReconectandoProps> = ({
  tentativa,
  maxTentativas,
  mensagem = 'Reconectando...',
  className = '',
}) => {
  return (
    <div
      className={`modal-overlay reconectando-overlay ${className}`}
      role="alert"
      aria-busy="true"
      aria-live="assertive"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(11, 14, 20, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: '#F0F6FC',
      }}
    >
      <div
        className="glass-panel"
        style={{
          padding: '36px 48px',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          border: '1px solid rgba(243, 156, 18, 0.3)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(243, 156, 18, 0.15)',
        }}
      >
        {/* SVG Spinner Animado (Laranja ADR-002) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 50 50"
          width="56"
          height="56"
          style={{
            animation: 'reconectandoSpin 1.2s linear infinite',
          }}
          aria-hidden="true"
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="rgba(243, 156, 18, 0.2)"
            strokeWidth="5"
          />
          <path
            d="M25 5 A 20 20 0 0 1 45 25"
            fill="none"
            stroke="#F39C12"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>

        <style>{`
          @keyframes reconectandoSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>

        <div style={{ textAlign: 'center' }}>
          <h3
            style={{
              fontSize: '22px',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 800,
              color: '#F39C12',
              marginBottom: '6px',
              letterSpacing: '0.5px',
            }}
          >
            {mensagem}
          </h3>

          {tentativa !== undefined && (
            <p
              style={{
                fontSize: '14px',
                color: '#8B949E',
                margin: 0,
                fontWeight: 600,
              }}
            >
              Tentativa {tentativa}
              {maxTentativas ? `/${maxTentativas}` : ''}...
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reconectando;
