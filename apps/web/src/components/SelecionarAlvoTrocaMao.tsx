import { useEffect, useId, useRef, useState } from 'react';
import type { JogadorPublico } from '@kabemjunto/shared';
import { AvatarComStatus } from './AvatarComStatus';

export interface SelecionarAlvoTrocaMaoProps {
  jogadores: ReadonlyArray<JogadorPublico>;
  jogadorAtualId?: string | undefined;
  onCancel: () => void;
  onConfirm: (alvoId: string) => void;
}

/** Dialog/bottom sheet para escolher o jogador-alvo da carta TROCA_MAO. */
export function SelecionarAlvoTrocaMao({
  jogadores,
  jogadorAtualId,
  onCancel,
  onConfirm,
}: SelecionarAlvoTrocaMaoProps) {
  const [alvoId, setAlvoId] = useState<string>();
  const titleId = useId();
  const descriptionId = useId();
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const alvo = jogadores.find((jogador) => jogador.id === alvoId);
  const opcoes = jogadores.filter((jogador) => jogador.id !== jogadorAtualId);

  useEffect(() => {
    firstOptionRef.current?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="target-modal-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        className="target-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="target-modal-header">
          <div>
            <p className="eyebrow">CARTA ESPECIAL</p>
            <h2 id={titleId}>Troca Mão</h2>
          </div>
          <button
            className="target-modal-close"
            type="button"
            onClick={onCancel}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <p id={descriptionId} className="muted target-modal-description">
          Escolha com quem você quer trocar todas as cartas da sua mão.
        </p>

        <div className="target-options" role="group" aria-label="Jogadores disponíveis">
          {opcoes.map((jogador, index) => {
            const selecionado = jogador.id === alvoId;
            return (
              <button
                key={jogador.id}
                ref={index === 0 ? firstOptionRef : undefined}
                type="button"
                className={`target-option${selecionado ? ' target-option-selected' : ''}`}
                aria-pressed={selecionado}
                onClick={() => setAlvoId(jogador.id)}
              >
                <AvatarComStatus
                  avatarId={jogador.avatar}
                  conectado={jogador.conectado}
                  nome={jogador.nome}
                  size={44}
                />
                <span className="target-option-copy">
                  <strong>{jogador.nome}</strong>
                  <small>
                    {jogador.quantidadeCartas} {jogador.quantidadeCartas === 1 ? 'carta' : 'cartas'}
                    {!jogador.conectado && ' · offline'}
                  </small>
                </span>
                <span className="target-option-check" aria-hidden="true">
                  {selecionado ? '✓' : '○'}
                </span>
              </button>
            );
          })}
        </div>

        {opcoes.length === 0 && (
          <p className="error-message" role="status">
            Não há outro jogador disponível para a troca.
          </p>
        )}

        <div className="target-modal-actions">
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!alvoId}
            onClick={() => alvoId && onConfirm(alvoId)}
          >
            {alvo ? `Trocar mão com ${alvo.nome}` : 'Escolher jogador'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default SelecionarAlvoTrocaMao;
