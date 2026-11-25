import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ServerSalaDisponivel } from '@kabemjunto/shared';
import { codigoDoConvite } from '../services/convite';
import {
  credencialDoRanking,
  grupoDoConvite,
  normalizarGrupo,
  ultimoGrupo,
} from '../services/rankingAmigos';

const PLAYER_NAME_KEY = 'kabemjunto-player-name';

/** Cartas que enfeitam o menu, da esquerda para a direita (arquivos pequenos em /assets/menu). */
const LEQUE = ['troca-mao', 'coringa', 'mais-quatro', 'gira-mao', 'zero-mais'] as const;

export interface LobbyOnlineCredentials {
  salaId: string;
  nome: string;
  nomeSala?: string;
  visibilidade?: 'privada' | 'publica';
  grupoRanking?: string;
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
  /** Aviso que não é erro (ex.: a mesa continuou sem você). */
  aviso?: string | undefined;
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
  aviso,
  desabilitado,
  semInternet = false,
  salasPublicas = [],
  onListarSalas = () => undefined,
}) => {
  // Link de convite: só preenche o código; a pessoa confere o apelido e entra.
  const [convite] = useState(() =>
    typeof window === 'undefined' ? undefined : codigoDoConvite(window.location.search),
  );
  const [grupoConvidado] = useState(() =>
    convite ? grupoDoConvite(window.location.hash) : undefined,
  );
  const [salaInput, setSalaInput] = useState(convite ?? '');
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
  const [grupoInput, setGrupoInput] = useState('');
  const grupoAnterior = ultimoGrupo();
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

  function entrarExistente(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nomeLimpo = validarNome();
    if (!nomeLimpo) return;

    const salaId = salaInput.trim().toUpperCase();
    if (salaId.length < 4 || salaId.length > 6) {
      setValidationError('Digite o código completo da sala (ex: MOHPSR) para entrar.');
      return;
    }

    const grupoRanking = salaId === convite ? grupoConvidado : undefined;
    if (grupoRanking && !credencialDoRanking(grupoRanking)) {
      setValidationError('Permita o armazenamento deste site para participar do ranking.');
      return;
    }
    setValidationError(undefined);
    salvarNome(nomeLimpo);
    setSalaInput(salaId);
    onEntrar({ salaId, nome: nomeLimpo, criar: false, ...(grupoRanking ? { grupoRanking } : {}) });
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
    const grupoRanking = visibilidade === 'privada' ? normalizarGrupo(grupoInput) : undefined;
    if (visibilidade === 'privada' && grupoInput.trim() && !grupoRanking) {
      setValidationError('Confira o código do grupo semanal ou crie um novo grupo.');
      return;
    }
    if (grupoRanking && !credencialDoRanking(grupoRanking)) {
      setValidationError('Permita o armazenamento deste site para participar do ranking.');
      return;
    }

    const salaId = gerarCodigo();
    const nomeSala = nomeSalaInput.trim() || `Sala de ${nomeLimpo}`;
    setValidationError(undefined);
    salvarNome(nomeLimpo);
    setCriacaoAberta(false);
    onEntrar({
      salaId,
      nome: nomeLimpo,
      criar: true,
      nomeSala,
      visibilidade,
      ...(grupoRanking ? { grupoRanking } : {}),
    });
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
      {aviso && (
        <p className="menu-aviso" role="status">
          {aviso}
        </p>
      )}
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
          {convite && salaInput === convite && (
            <p className="muted" role="status">
              Convite para a sala {convite}
              {grupoConvidado ? ' com ranking semanal' : ''}. Confira seu apelido e toque em Entrar.
            </p>
          )}
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
              {visibilidade === 'privada' && (
                <fieldset className="ranking-grupo">
                  <legend>Ranking semanal entre amigos</legend>
                  <label>
                    Código do grupo (opcional)
                    <input
                      value={grupoInput}
                      maxLength={36}
                      onChange={(event) => setGrupoInput(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <div className="ranking-grupo-acoes">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        const novo = globalThis.crypto?.randomUUID?.();
                        if (novo) setGrupoInput(novo);
                        else setValidationError('Abra o jogo em HTTPS para criar um grupo.');
                      }}
                    >
                      Criar novo grupo
                    </button>
                    {grupoAnterior && (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setGrupoInput(grupoAnterior)}
                      >
                        Usar último grupo
                      </button>
                    )}
                  </div>
                  <small>
                    Entre pelo convite da sala: só o código não basta. Pontua quem joga até o fim
                    sem bot na própria vez. O servidor guarda apelidos e resultados por até duas
                    semanas, visíveis a quem tem o convite do grupo.
                  </small>
                </fieldset>
              )}
              {validationError && <p role="alert">{validationError}</p>}
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
