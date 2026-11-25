import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ServerSalaDisponivel } from '@kabemjunto/shared';

const PLAYER_NAME_KEY = 'kabemjunto-player-name';

/** Cartas que enfeitam o menu, da esquerda para a direita (arquivos pequenos em /assets/menu). */
const LEQUE = ['troca-mao', 'coringa', 'mais-quatro', 'gira-mao', 'zero-mais'] as const;

export interface LobbyOnlineCredentials {
  salaId: string;
  nome: string;
  nomeSala?: string;
  visibilidade?: 'privada' | 'publica';
}

export interface LobbyOnlineProps {
  onEntrar: (credentials: LobbyOnlineCredentials & { criar: boolean }) => void;
  /**
   * Caminho principal: entra numa mesa pública pelo servidor e, se faltar gente, os bots
   * completam. Sem esta função (ou sem internet) o botão cai para a partida local.
   */
  onJogarAgora?: (nome: string, totalJogadores: number) => void;
  /** Partida local, no aparelho, sem servidor e sem esperar ninguém. */
  onJogarContraBots?: (nome: string, totalJogadores: number) => void;
  erro?: string | undefined;
  desabilitado?: boolean;
  /** Navegador sem rede: salas online esperam a conexão; contra bots segue funcionando. */
  semInternet?: boolean;
  salasPublicas?: ReadonlyArray<ServerSalaDisponivel>;
  onListarSalas?: () => void;
}

function gerarCodigo(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const LobbyOnline: React.FC<LobbyOnlineProps> = ({
  onEntrar,
  onJogarAgora,
  onJogarContraBots,
  erro,
  desabilitado,
  semInternet = false,
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
  const [maisJogadores, setMaisJogadores] = useState(false);
  const [salasAbertas, setSalasAbertas] = useState<boolean | undefined>();
  const nomeInputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const errorMessage = validationError ?? erro;
  const temNome = Boolean(nomeInput.trim());
  const salasIndisponiveis = Boolean(desabilitado) || semInternet;

  useEffect(() => {
    // No celular, focar o campo abriria o teclado e esconderia as duas escolhas do menu.
    if (window.matchMedia?.('(pointer: fine)').matches) nomeInputRef.current?.focus();
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
      nomeInputRef.current?.focus();
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

  function jogarContraBots(): void {
    const nome = nomeInput.trim();
    if (nome) salvarNome(nome);
    onJogarContraBots?.(nome || 'Você', jogadoresContraBots);
  }

  // Com servidor à vista, "Jogar agora" entra numa mesa pública; sem ele, joga no aparelho.
  const jogarAgoraOnline = Boolean(onJogarAgora) && !semInternet && !desabilitado;

  function jogarAgora(): void {
    if (!jogarAgoraOnline || !onJogarAgora) {
      jogarContraBots();
      return;
    }
    const nome = nomeInput.trim();
    if (nome) salvarNome(nome);
    onJogarAgora(nome || 'Você', jogadoresContraBots);
  }

  const totaisVisiveis = maisJogadores || jogadoresContraBots > 6 ? [7, 8, 9, 10] : [];
  const salasVisiveis = salasAbertas ?? salasPublicas.length > 0;

  return (
    <section className="lobby-panel menu-inicial" aria-labelledby="lobby-title">
      <h2 id="lobby-title" className="sr-only">
        Como você quer jogar?
      </h2>
      <img
        className="menu-logo"
        src="/assets/cards/kabemjunto/brand-kabemjunto.webp"
        alt="Kabemjunto"
        width={230}
        height={90}
      />
      <div className="menu-leque" aria-hidden="true">
        {LEQUE.map((carta) => (
          <img
            key={carta}
            className={`menu-leque-carta menu-leque-${carta}`}
            src={`/assets/menu/leque-${carta}.webp`}
            alt=""
            width={180}
            height={260}
          />
        ))}
      </div>
      <form className="lobby-form" onSubmit={entrarExistente} noValidate>
        <label>
          Seu apelido
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
            placeholder="Como você quer ser chamado"
            aria-describedby={errorMessage ? errorId : undefined}
            aria-invalid={Boolean(errorMessage)}
          />
        </label>
        {(onJogarContraBots || onJogarAgora) && (
          <section className="menu-escolha menu-escolha-bots" aria-labelledby="bots-title">
            <span className="menu-etiqueta">Começa em segundos</span>
            <h3 id="bots-title">{jogarAgoraOnline ? 'Entrar numa mesa' : 'Jogar contra bots'}</h3>
            <p className="muted">
              {jogarAgoraOnline
                ? 'Você entra numa mesa pública. Se faltar gente, os bots completam.'
                : 'Sem internet e sem esperar ninguém.'}
            </p>
            <fieldset className="menu-jogadores">
              <legend>Quantos jogadores na mesa?</legend>
              <div className="menu-fichas">
                {[2, 3, 4, 5, 6, ...totaisVisiveis].map((total) => (
                  <label key={total} className="menu-ficha">
                    <input
                      type="radio"
                      name="jogadores-na-mesa"
                      value={total}
                      checked={jogadoresContraBots === total}
                      onChange={() => setJogadoresContraBots(total)}
                    />
                    <span>{total}</span>
                  </label>
                ))}
                {totaisVisiveis.length === 0 && (
                  <button
                    type="button"
                    className="menu-ficha-mais"
                    onClick={() => setMaisJogadores(true)}
                    aria-label="Mais jogadores, de 7 a 10"
                  >
                    7+
                  </button>
                )}
              </div>
            </fieldset>
            <button type="button" className="button button-primary" onClick={jogarAgora}>
              Jogar agora
            </button>
            {jogarAgoraOnline && onJogarContraBots && (
              <button
                type="button"
                className="button button-secondary menu-so-bots"
                onClick={jogarContraBots}
              >
                Só contra bots, neste aparelho
              </button>
            )}
          </section>
        )}
        <p className="menu-ou" aria-hidden="true">
          ou
        </p>
        <section className="menu-escolha" aria-labelledby="amigos-title">
          <h3 id="amigos-title">Jogar com amigos</h3>
          <p className="muted" role={semInternet ? 'status' : undefined}>
            {semInternet
              ? 'Sem internet: só dá para jogar contra bots. As salas voltam quando a conexão voltar.'
              : 'Online: crie uma sala e mande o código.'}
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={abrirCriacao}
            disabled={salasIndisponiveis}
          >
            Criar sala
          </button>
          <div className="menu-entrar">
            <label className="sr-only" htmlFor="codigo-sala">
              Código da sala
            </label>
            <input
              id="codigo-sala"
              name="codigo-sala"
              autoComplete="off"
              spellCheck={false}
              value={salaInput}
              onChange={(event) => setSalaInput(event.target.value.toUpperCase())}
              maxLength={6}
              placeholder="Código: MOHPSR"
              disabled={salasIndisponiveis}
              aria-describedby={errorMessage ? errorId : undefined}
              aria-invalid={Boolean(errorMessage)}
            />
            <button
              type="submit"
              className="button button-secondary"
              disabled={salasIndisponiveis}
              aria-label="Entrar em sala"
            >
              Entrar
            </button>
          </div>
        </section>
      </form>
      {errorMessage && (
        <p id={errorId} className="error-message" aria-live="polite">
          {errorMessage}
        </p>
      )}
      {temNome && (
        <details
          className="public-rooms"
          open={salasVisiveis}
          onToggle={(event) => setSalasAbertas(event.currentTarget.open)}
        >
          <summary>
            <h3 id="public-rooms-title">Salas públicas ({salasPublicas.length})</h3>
          </summary>
          <div className="public-rooms-heading">
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
        </details>
      )}
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
