import { useEffect } from 'react';
import confetti from 'canvas-confetti';

interface VitoriaAnimadaProps {
  vencedorNome: string;
  isVoce?: boolean;
  onJogarNovamente: () => void;
}

/**
 * Componente modal de vitória com comemoração e animação de confetti (A12 - Antigravity).
 * Dispara confetti de 3s em caso de vitória ou comemoração.
 */
export function VitoriaAnimada({
  vencedorNome,
  isVoce = false,
  onJogarNovamente,
}: VitoriaAnimadaProps) {
  useEffect(() => {
    // Dispara explosão inicial de confetti
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#F39C12', '#3498DB', '#27AE60', '#9B59B6'],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#F39C12', '#3498DB', '#27AE60', '#9B59B6'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        padding: '24px',
        animation: 'fadeIn 0.3s ease-out',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Fim de jogo"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '36px 28px',
          background: '#1E293B',
          border: '2px solid #F59E0B',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(245, 158, 11, 0.25)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '72px', lineHeight: 1, marginBottom: '16px' }} aria-hidden="true">
          {isVoce ? '🏆' : '👑'}
        </div>

        <p className="eyebrow" style={{ fontSize: '14px', letterSpacing: '0.15em' }}>
          {isVoce ? 'GRANDE VITÓRIA!' : 'PARTIDA CONCLUÍDA'}
        </p>

        <h2 style={{ fontSize: '32px', color: '#F8FAFC', margin: '8px 0 12px' }}>
          {isVoce ? 'Você Venceu!' : `${vencedorNome} Venceu!`}
        </h2>

        <p className="muted" style={{ marginBottom: '28px' }}>
          {isVoce
            ? 'Parabéns! Você jogou suas cartas com maestria e dominou a mesa.'
            : `${vencedorNome} foi mais rápido e limpou a mão primeiro.`}
        </p>

        <button
          className="button button-primary"
          onClick={onJogarNovamente}
          type="button"
          style={{ width: '100%', padding: '14px 20px', fontSize: '16px' }}
        >
          Jogar Novamente
        </button>
      </div>
    </div>
  );
}
