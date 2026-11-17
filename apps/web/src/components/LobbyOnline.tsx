import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ServerSalaDisponivel } from '@kabemjunto/shared';

const PLAYER_NAME_KEY = 'kabemjunto-player-name';

export interface LobbyOnlineCredentials {
  salaId: string;
  nome: string;
  nomeSala?: string;
  visibilidade?: 'privada' | 'publica';
}

export interface LobbyOnlineProps {
  onEntrar: (credentials: LobbyOnlineCredentials & { criar: boolean }) => void;
  /** Segundo caminho do menu: partida local, sem esperar ninguém. */
  onJogarContraBots?: (nome: string, totalJogadores: number) => void;
  erro?: string | undefined;
  desabilitado?: boolean;
  salasPublicas?: ReadonlyArray<ServerSalaDisponivel>;
  onListarSalas?: () => void;
}

function gerarCodigo(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const LobbyOnline: React.FC<LobbyOnlineProps> = ({
  onEntrar,
  onJogarContraBots,
  erro,
  desabilitado,
  salasPublicas = [],
  onListarSalas = () => undefined,
}) => {
  const [salaInput, setSalaInput] = useState('');
  const [nomeInput, setNomeInput] = useState(() => {
    try {
      return localStorage.getItem(PLAYER_NAME_KEY) || '';
    } catch {
      return '';
    }
  });
  const [validationError, setValidationError] = useState<string | undefined>();
  const [criacaoAberta, setCriacaoAberta] = useState(false);
  const [nomeSalaInput, setNomeSalaInput] = useState('');
  const [visibilidade, setVisibilidade] = useState<'privada' | 'publica'>('privada');
  const [jogadoresContraBots, setJogadoresContraBots] = useState(4);
  const nomeInputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const errorMessage = validationError ?? erro;
  const temNome = Boolean(nomeInput.trim());

  useEffect(() => {
    nomeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (temNome) onListarSalas();
  }, [onListarSalas, temNome]);

  function salvarNome(nome: string): void {
    try {
      localStorage.setItem(PLAYER_NAME_KEY, nome);
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
  }

  function validarNome(): string | undefined {
    const nomeLimpo = nomeInput.trim();
    if (!nomeLimpo) {
      setValidationError('Informe seu nome antes de continuar.');
      return undefined;
    }
    return nomeLimpo;
  }

  function entrar(criar: boolean): void {
    const nomeLimpo = validarNome();
    if (!nomeLimpo) return;

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

  function abrirCriacao(): void {
    if (!validarNome()) return;
    setValidationError(undefined);
    setCriacaoAberta(true);
  }

  function criarSala(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nomeLimpo = validarNome();
    if (!nomeLimpo) return;

    const salaId = gerarCodigo();
    const nomeSala = nomeSalaInput.trim() || `Sala de ${nomeLimpo}`;
    salvarNome(nomeLimpo);
    setCriacaoAberta(false);
    onEntrar({ salaId, nome: nomeLimpo, criar: true, nomeSala, visibilidade });
  }

  function entrarExistente(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    entrar(false);
  }

  function entrarNaSalaPublica(salaId: string): void {
    const nomeLimpo = validarNome();
    if (!nomeLimpo) return;
    setSalaInput(salaId);
    salvarNome(nomeLimpo);
    onEntrar({ salaId, nome: nomeLimpo, criar: false });
  }

  return (
    <section className="lobby-panel" aria-labelledby="lobby-title">
      <p className="eyebrow">JOGAR ONLINE</p>
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
            onClick={abrirCriacao}
            disabled={desabilitado}
          >
            Criar sala
          </button>
        </div>
      </form>
      {onJogarContraBots && (
        <section className="bots-card" aria-labelledby="bots-title">
          <div>
            <h3 id="bots-title">Jogar contra bots</h3>
            <p className="muted">Partida rápida, sem esperar ninguém.</p>
          </div>
          <div className="bots-card-acoes">
            <label>
              Jogadores na mesa
              <select
                value={jogadoresContraBots}
                onChange={(event) => setJogadoresContraBots(Number(event.target.value))}
              >
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((total) => (
                  <option key={total} value={total}>
                    {total}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                const nome = nomeInput.trim();
                if (nome) salvarNome(nome);
                onJogarContraBots(nome || 'Você', jogadoresContraBots);
              }}
            >
              Começar contra bots
            </button>
          </div>
        </section>
      )}
      {temNome && (
        <section className="public-rooms" aria-labelledby="public-rooms-title">
          <div className="public-rooms-heading">
            <h3 id="public-rooms-title">Salas públicas</h3>
            <button type="button" className="button button-secondary" onClick={onListarSalas}>
              Atualizar
            </button>
          </div>
          {salasPublicas.length === 0 ? (
            <p className="muted">Nenhuma sala pública disponível agora.</p>
          ) : (
            <ul className="public-room-list">
              {salasPublicas.map((sala) => (
                <li key={sala.id} className="public-room-card">
                  <div>
                    <strong>{sala.nome}</strong>
                    <span>Criada por {sala.hostNome}</span>
                    <small>
                      {sala.quantidadeJogadores}/{sala.maxJogadores} jogadores
                    </small>
                  </div>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => entrarNaSalaPublica(sala.id)}
                  >
                    Entrar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {errorMessage && (
        <p id={errorId} className="error-message" aria-live="polite">
          {errorMessage}
        </p>
      )}
      <p className="lobby-hint">A conexão começa ao criar ou entrar em uma sala.</p>
      {criacaoAberta && (
        <div className="modal-overlay" role="presentation">
          <section
            className="creation-dialog glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
          >
            <h2 id="create-room-title">Criar sala</h2>
            <form onSubmit={criarSala}>
              <label>
                Nome da sala
                <input
                  value={nomeSalaInput}
                  onChange={(event) => setNomeSalaInput(event.target.value)}
                  maxLength={48}
                  placeholder="Ex: Mesa da galera"
                  autoFocus
                />
              </label>
              <label>
                Visibilidade
                <select
                  value={visibilidade}
                  onChange={(event) => setVisibilidade(event.target.value as 'privada' | 'publica')}
                >
                  <option value="privada">Privada</option>
                  <option value="publica">Pública</option>
                </select>
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setCriacaoAberta(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="button button-primary">
                  {visibilidade === 'privada' ? 'Criar sala privada' : 'Criar sala pública'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
};

export default LobbyOnline;
