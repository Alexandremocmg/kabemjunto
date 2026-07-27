/**
 * LobbyOnline — tela de entrada na sala.
 *
 * Sprint 4 polish (B12) + Melhores práticas UX (Sprint 5).
 * - Persistência de nome via localStorage.
 * - Validação clara de formulário (nome e código de sala).
 * - Acessibilidade completa (ARIA, focus-visible).
 */

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

const PLAYER_NAME_KEY = 'kabemjunto-player-name';

export interface LobbyOnlineCredentials {
  salaId: string;
  nome: string;
}

export interface LobbyOnlineProps {
  /** Callback chamado quando o usuário clica "Entrar em sala" ou "Criar sala". */
  onEntrar: (credentials: LobbyOnlineCredentials & { criar: boolean }) => void;
  /** Mensagem de erro atual (vinda do servidor ou validação local). */
  erro?: string | undefined;
  /** Se true, desabilita os controles (ex: enquanto tenta conectar). */
  desabilitado?: boolean;
}

function gerarCodigo(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const LobbyOnline: React.FC<LobbyOnlineProps> = ({ onEntrar, erro, desabilitado }) => {
  const [salaInput, setSalaInput] = useState('');
  const [nomeInput, setNomeInput] = useState(() => {
    try {
      return localStorage.getItem(PLAYER_NAME_KEY) || '';
    } catch {
      return '';
    }
  });
  const [validationError, setValidationError] = useState<string | undefined>();
  const nomeInputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const errorMessage = validationError ?? erro;

  useEffect(() => {
    nomeInputRef.current?.focus();
  }, []);

  function salvarNome(nome: string) {
    try {
      localStorage.setItem(PLAYER_NAME_KEY, nome);
    } catch {
      // Ignore quota error
    }
  }

  function entrar(criar: boolean): void {
    const nomeLimpo = nomeInput.trim();
    if (!nomeLimpo) {
      setValidationError('Informe seu nome antes de continuar.');
      return;
    }

    if (
      !criar &&
      (!salaInput.trim() || salaInput.trim().length < 4 || salaInput.trim().length > 6)
    ) {
      setValidationError('Digite o código completo da sala (ex: MOHPSR) para entrar.');
      return;
    }

    setValidationError(undefined);
    salvarNome(nomeLimpo);

    const salaId = criar ? gerarCodigo() : salaInput.trim().toUpperCase();
    setSalaInput(salaId);
    onEntrar({ salaId, nome: nomeLimpo, criar });
  }

  function entrarExistente(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    entrar(false);
  }

  return (
    <section className="lobby-panel" aria-labelledby="lobby-title">
      <p className="eyebrow">SALA ONLINE</p>
      <h2 id="lobby-title">Entre na mesa</h2>
      <p className="muted">Crie uma sala ou use o código que seu grupo compartilhou.</p>
      <form className="lobby-form" onSubmit={entrarExistente} noValidate>
        <label>
          Seu nome
          <input
            ref={nomeInputRef}
            name="nome"
            autoComplete="nickname"
            spellCheck={false}
            value={nomeInput}
            onChange={(event) => setNomeInput(event.target.value)}
            maxLength={24}
            required
            disabled={desabilitado}
            placeholder="Seu apelido no jogo"
            aria-describedby={errorMessage ? errorId : undefined}
            aria-invalid={Boolean(errorMessage)}
          />
        </label>
        <label>
          Código da sala
          <input
            name="codigo-sala"
            autoComplete="off"
            spellCheck={false}
            value={salaInput}
            onChange={(event) => setSalaInput(event.target.value.toUpperCase())}
            maxLength={6}
            placeholder="Ex: MOHPSR"
            disabled={desabilitado}
            aria-describedby={errorMessage ? errorId : undefined}
            aria-invalid={Boolean(errorMessage)}
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="button button-secondary" disabled={desabilitado}>
            Entrar em sala
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => entrar(true)}
            disabled={desabilitado}
          >
            Criar sala
          </button>
        </div>
      </form>
      {errorMessage && (
        <p id={errorId} className="error-message" aria-live="polite">
          {errorMessage}
        </p>
      )}
    </section>
  );
};

export default LobbyOnline;
