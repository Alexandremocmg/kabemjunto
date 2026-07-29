import React from 'react';
import type { Carta } from '@kabemjunto/shared/types';

interface ConfirmarDescarteMultiploProps {
  cartas: ReadonlyArray<Carta>;
  onCancel: () => void;
  onPlayMultiple?: (cartas: ReadonlyArray<Carta>) => void;
  /** Trigger that opened the dialog, restored when dismissal returns to selection. */
  triggerRef?: React.RefObject<HTMLElement>;
}

function descricaoDaCarta(carta: Carta): string {
  if (carta.valor !== undefined) return `Carta ${carta.valor} ${carta.cor}`;

  const nomes: Partial<Record<NonNullable<Carta['acao']>, string>> = {
    MAIS_DOIS: 'Mais dois',
    SKIP: 'Pula',
    REVERSE: 'Inverte',
  };
  return carta.acao ? (nomes[carta.acao] ?? 'Carta') : 'Carta';
}

export function getFocusTrapTarget(
  activeIndex: number,
  totalFocusable: number,
  shiftKey: boolean,
): number | undefined {
  if (totalFocusable === 0) return undefined;
  if (shiftKey && activeIndex === 0) return totalFocusable - 1;
  if (!shiftKey && activeIndex === totalFocusable - 1) return 0;
  return undefined;
}

export function ConfirmarDescarteMultiplo({
  cartas,
  onCancel,
  onPlayMultiple,
  triggerRef,
}: ConfirmarDescarteMultiploProps): React.ReactElement {
  const dialogRef = React.useRef<HTMLElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
  const plural = cartas.length === 1 ? 'carta selecionada' : 'cartas selecionadas';
  const prontoParaConfirmar = onPlayMultiple !== undefined;

  React.useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  function fechar(): void {
    onCancel();
    triggerRef?.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      fechar();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusaveis = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const activeIndex = focusaveis.indexOf(document.activeElement as HTMLElement);
    const targetIndex = getFocusTrapTarget(activeIndex, focusaveis.length, event.shiftKey);
    if (targetIndex !== undefined) {
      event.preventDefault();
      focusaveis[targetIndex]?.focus();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="creation-dialog glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="multiple-discard-title"
        aria-describedby="multiple-discard-description"
        onKeyDown={handleKeyDown}
      >
        <h2 id="multiple-discard-title">Confirmação de descarte múltiplo</h2>
        <p id="multiple-discard-description">
          {cartas.length} {plural}
        </p>
        <ul aria-label="Cartas selecionadas para descarte múltiplo">
          {cartas.map((carta) => (
            <li key={carta.id}>{descricaoDaCarta(carta)}</li>
          ))}
        </ul>
        {!prontoParaConfirmar && (
          <p className="muted">
            A confirmação será habilitada quando a mesa receber suporte para jogar várias cartas.
          </p>
        )}
        <div className="form-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            autoFocus
            className="button button-secondary"
            onClick={fechar}
          >
            Ajustar seleção
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!prontoParaConfirmar}
            onClick={() => onPlayMultiple?.(cartas)}
          >
            Confirmar descarte de {cartas.length} cartas
          </button>
        </div>
      </section>
    </div>
  );
}
