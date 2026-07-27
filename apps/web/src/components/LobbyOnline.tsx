/**
 * LobbyOnline — tela de entrada na sala.
 *
 * Sprint 4 polish (B12): extraído do `App.tsx` para reduzir prop proliferation
 * e deixar a sala/jogo isolados em componentes próprios.
 *
 * Recebe callbacks `onEntrar(credentials)` para não acoplar ao hook de socket.
 */

import { useState, type FormEvent } from 'react';

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
  const [nomeInput, setNomeInput] = useState('');

  function entrar(criar: boolean): void {
    const salaId = criar ? gerarCodigo() : salaInput;
    if (!salaId.trim() || !nomeInput.trim()) return;
    setSalaInput(salaId);
    onEntrar({ salaId, nome: nomeInput, criar });
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
      <form className="lobby-form" onSubmit={entrarExistente}>
        <label>
          Seu nome
          <input
            value={nomeInput}
            onChange={(event) => setNomeInput(event.target.value)}
            maxLength={24}
            required
            disabled={desabilitado}
          />
        </label>
        <label>
          Código da sala
          <input
            value={salaInput}
            onChange={(event) => setSalaInput(event.target.value.toUpperCase())}
            maxLength={6}
            placeholder="K4B3MJ"
            disabled={desabilitado}
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
      {erro && <p className="error-message">{erro}</p>}
    </section>
  );
};

export default LobbyOnline;
