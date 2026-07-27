interface NotFoundProps {
  onVoltar?: () => void;
  mensagem?: string;
}

/**
 * Componente 404 estilizado para salas/rotas não encontradas (A11 - Antigravity).
 * Alinhado com a paleta ADR-002 e design system do Kabemjunto.
 */
export function NotFound({ onVoltar, mensagem }: NotFoundProps) {
  const handleVoltar = () => {
    if (onVoltar) {
      onVoltar();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <section className="not-found-container" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div className="lobby-panel" style={{ margin: '0 auto', maxWidth: '480px' }}>
        <div style={{ fontSize: '64px', lineHeight: 1, marginBottom: '16px' }} aria-hidden="true">
          🃏🔍
        </div>
        <p className="eyebrow" style={{ fontSize: '14px', letterSpacing: '0.15em' }}>
          ERRO 404
        </p>
        <h2 style={{ fontSize: '28px', color: '#F8FAFC', marginBottom: '12px' }}>
          Carta fora do baralho!
        </h2>
        <p className="muted" style={{ marginBottom: '28px' }}>
          {mensagem ||
            'A sala ou página que você está procurando não existe, expirou ou foi fechada.'}
        </p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          <button className="button button-primary" onClick={handleVoltar} type="button">
            Voltar ao Lobby
          </button>
        </div>
      </div>
    </section>
  );
}
