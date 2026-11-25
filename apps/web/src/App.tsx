import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { situacaoDoBot } from './mesa/controleBot';
import { useForaDaMesa } from './services/useForaDaMesa';
import { useGameSocket } from './services/socketClient';
import { ConvidarSala } from './components/ConvidarSala';
import { CardDesafio } from './components/CardDesafio';
import { AvatarComStatus } from './components/AvatarComStatus';
import { WifiStatus } from './components/WifiStatus';
import { Reconectando } from './components/Reconectando';
import { LobbyOnline } from './components/LobbyOnline';
import { SalaRapidaEspera } from './components/SalaRapidaEspera';
import { NotFound } from './components/NotFound';
import { PainelColecao, type TemaColecao } from './components/PainelColecao';
import { iniciarPartidaLocal, temPartidaLocal } from './mesa/partidaLocal';
import { lerPreferenciaMesa } from './mesa/preferencias';
import { buscaRapidaCancelada, buscaRapidaVirouLocal } from './services/metricas';
import { useSemInternet } from './services/useSemInternet';

// A mesa (e o Three.js, carregado só na 3D) fica fora do bundle inicial do menu.
const MesaLocal3D = lazy(() => import('./mesa/MesaLocal3D'));
const MesaOnline3D = lazy(() => import('./mesa/MesaOnline3D'));

type Modo = 'local' | 'online';

/** Sem sala depois disso (servidor fora do ar, rede ruim), "Jogar agora" vira partida local. */
const TEMPO_MAXIMO_PROCURANDO_MS = 8000;
/** Se a conexão já falhou (ou o servidor recusou o pedido), não vale esperar tanto. */
const TEMPO_APOS_FALHA_MS = 1200;

function lerModo(): Modo {
  // Sem partida local salva, o menu (que mora na tela online) é o ponto de partida.
  return window.sessionStorage.getItem('kabemjunto.modo') === 'local' && temPartidaLocal()
    ? 'local'
    : 'online';
}

export default function App() {
  const [modo, setModo] = useState<Modo>(lerModo);

  useEffect(() => {
    window.sessionStorage.setItem('kabemjunto.modo', modo);
  }, [modo]);

  if (modo === 'local') {
    return (
      <Suspense fallback={carregandoMesa}>
        <MesaLocal3D renderizacao={lerPreferenciaMesa()} onVoltarAoMenu={() => setModo('online')} />
      </Suspense>
    );
  }

  return (
    <main className="app-shell">
      <OnlineApp
        onJogarContraBots={(nome, totalJogadores) => {
          iniciarPartidaLocal(totalJogadores, nome);
          setModo('local');
        }}
      />
    </main>
  );
}

const carregandoMesa = (
  <p className="mesa3d-carregando" role="status">
    Preparando a mesa…
  </p>
);

/** Avatar e tema da mesa (o tema vale também para a mesa 3D). */
function BotaoPerfil() {
  const [aberto, setAberto] = useState(false);
  const [avatarId, setAvatarId] = useState(() => lerPreferencia('kabemjunto.avatar') ?? '01');
  const [tema, setTema] = useState<TemaColecao>(
    () => (lerPreferencia('kabemjunto.tema') as TemaColecao | null) ?? 'FLORESTA',
  );

  useEffect(() => {
    try {
      window.localStorage.setItem('kabemjunto.avatar', avatarId);
      window.localStorage.setItem('kabemjunto.tema', tema);
    } catch {
      // Armazenamento bloqueado: a escolha vale só nesta tela.
    }
  }, [avatarId, tema]);

  return (
    <>
      <button type="button" className="menu-perfil" onClick={() => setAberto(true)}>
        Personalizar perfil
      </button>
      {/* Portal: o backdrop-filter do cabeçalho prenderia o painel (position: fixed) a ele. */}
      {aberto &&
        createPortal(
          <PainelColecao
            avatarId={avatarId}
            tema={tema}
            onAvatarChange={setAvatarId}
            onTemaChange={setTema}
            onClose={() => setAberto(false)}
          />,
          document.body,
        )}
    </>
  );
}

function lerPreferencia(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function OnlineApp({
  onJogarContraBots,
}: {
  onJogarContraBots: (nome: string, totalJogadores: number) => void;
}) {
  const online = useGameSocket();
  useForaDaMesa(online);
  const semInternet = useSemInternet();
  const [chatInput, setChatInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const utilityTriggerRef = useRef<HTMLButtonElement>(null);
  const utilityCloseRef = useRef<HTMLButtonElement>(null);
  const utilityDrawerRef = useRef<HTMLElement>(null);
  const entrouNaSala = Boolean(online.salaId);
  const partidaIniciada = Boolean(online.state.estado);
  const procurandoMesa = online.pedidoRapido !== undefined;
  const salaRapida = Boolean(online.state.rapida) || procurandoMesa;
  const wifiOn = online.state.status === 'connected';
  // No "Jogar agora" a mesa espera 10 s: um QR com o código venceria antes de ser aberto.
  const cardDesafio =
    online.state.visibilidadeSala === 'PUBLICA' && online.salaId && !salaRapida ? (
      <CardDesafio key={online.salaId} salaId={online.salaId} />
    ) : undefined;

  // Servidor fora do ar ou sem resposta: em vez de deixar a pessoa esperando, joga contra
  // bots no aparelho (o que "completar com bots" já prometia).
  const pedidoRapido = online.pedidoRapido;
  const buscaFalhou = Boolean(online.state.erro);
  const { sair: sairDaBusca } = online;
  useEffect(() => {
    if (!pedidoRapido) return undefined;
    const timer = window.setTimeout(
      () => {
        buscaRapidaVirouLocal(buscaFalhou ? 'falha' : 'tempo');
        sairDaBusca();
        onJogarContraBots(pedidoRapido.nome, pedidoRapido.tamanho);
      },
      buscaFalhou ? TEMPO_APOS_FALHA_MS : TEMPO_MAXIMO_PROCURANDO_MS,
    );
    return () => window.clearTimeout(timer);
  }, [buscaFalhou, onJogarContraBots, pedidoRapido, sairDaBusca]);

  // A tela de fim é um diálogo: a gaveta não pode ficar por cima disputando o foco.
  const partidaFinalizada = Boolean(online.state.estado?.finalizada);
  useEffect(() => {
    if (partidaFinalizada) setUtilityOpen(false);
  }, [partidaFinalizada]);

  useEffect(() => {
    if (!utilityOpen) return undefined;
    utilityCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeUtilityDrawer();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        utilityDrawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;

      const [first, ...remainingFocusable] = focusable;
      if (first === undefined) return;
      const last = remainingFocusable.at(-1) ?? first;
      const activeElement = document.activeElement;
      if (!utilityDrawerRef.current?.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [utilityOpen]);

  function closeUtilityDrawer(): void {
    setUtilityOpen(false);
    window.setTimeout(() => utilityTriggerRef.current?.focus(), 0);
  }

  function enviarChat(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!chatInput.trim()) return;
    online.enviarChat(chatInput);
    setChatInput('');
  }

  async function copiarCodigoSala(): Promise<void> {
    if (!online.salaId) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(online.salaId);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = online.salaId;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copiado = document.execCommand('copy');
        textarea.remove();
        if (!copiado) throw new Error('clipboard fallback failed');
      }
      setCopyError(false);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(false);
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 3000);
    }
  }

  const textoCopiar = copiedCode ? '✓ Copiado!' : copyError ? '⚠ Falha ao copiar' : '📋 Copiar';

  const jogadoresEChat = (
    <>
      <section>
        <h2>Jogadores</h2>
        <ul className="player-list">
          {/* Na partida, as contagens vêm do estado do jogo (a lista da sala não muda). */}
          {(online.state.estado?.jogadores ?? online.state.jogadores).map((jogador) => (
            <li key={jogador.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AvatarComStatus
                avatarId={jogador.avatar}
                conectado={jogador.conectado}
                nome={jogador.nome}
                size={36}
              />
              <span style={{ flex: 1 }}>
                <strong>{jogador.nome}</strong>
                {jogador.controladoPorBot && (
                  <small className="muted"> {situacaoDoBot(jogador)}</small>
                )}
              </span>
              <small>{jogador.quantidadeCartas} cartas</small>
            </li>
          ))}
        </ul>
      </section>
      <section className="chat-panel">
        <h2>Chat</h2>
        <div className="chat-messages" aria-live="polite">
          {online.state.mensagens.map((message, index) => {
            const nomeRemetente =
              online.state.jogadores.find((jogador) => jogador.id === message.jogadorId)?.nome ??
              'Jogador';
            return (
              <p key={`${message.timestamp}-${index}`}>
                <strong>{nomeRemetente}:</strong> {message.texto}
              </p>
            );
          })}
        </div>
        <form onSubmit={enviarChat} className="chat-form">
          <input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Mensagem"
            maxLength={240}
          />
          <button className="button button-primary" type="submit">
            Enviar
          </button>
        </form>
      </section>
    </>
  );

  const gavetaDaPartida = (
    <div className="online-utility-backdrop" onMouseDown={closeUtilityDrawer}>
      <aside
        ref={utilityDrawerRef}
        id="online-utility-drawer"
        className="online-utility-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="online-utility-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="online-utility-title">Partida</h2>
          <button
            ref={utilityCloseRef}
            type="button"
            className="online-utility-close"
            onClick={closeUtilityDrawer}
            aria-label="Fechar utilidades"
          >
            ×
          </button>
        </header>
        <section className="drawer-sala">
          <h2>Sala {online.salaId}</h2>
          <button type="button" className="button button-secondary" onClick={copiarCodigoSala}>
            {textoCopiar}
          </button>
        </section>
        {jogadoresEChat}
      </aside>
    </div>
  );

  return (
    <>
      {!partidaIniciada && (
        <header className={`app-header${entrouNaSala ? '' : ' app-header-menu'}`}>
          {/* No menu inicial a logo grande fica no próprio menu. */}
          {entrouNaSala && (
            <img
              src="/assets/cards/kabemjunto/brand-kabemjunto.webp"
              alt="Kabemjunto"
              className="header-logo"
              width={160}
              height={46}
            />
          )}
          {/* No menu, antes de criar ou entrar numa sala, ninguém está conectado de propósito:
              mostrar "Offline" ali sugeriria um erro. */}
          {(entrouNaSala || online.state.status !== 'idle') && (
            <div className={`connection connection-${online.state.status}`}>
              <WifiStatus status={wifiOn ? 'online' : 'offline'} size={20} />
              <span>
                {online.state.status === 'reconnecting'
                  ? 'Reconectando...'
                  : online.state.status === 'connecting'
                    ? 'Conectando...'
                    : online.state.status === 'connected'
                      ? 'Online'
                      : 'Offline'}
              </span>
            </div>
          )}
          <BotaoPerfil />
        </header>
      )}

      {online.state.erroCodigo === 'SALA_INEXISTENTE' ? (
        <NotFound
          onVoltar={online.sair}
          {...(online.state.erro ? { mensagem: online.state.erro } : {})}
        />
      ) : !entrouNaSala && !procurandoMesa ? (
        <>
          <LobbyOnline
            onEntrar={(credentials) => online.entrarSala(credentials)}
            onJogarAgora={online.jogarRapido}
            erro={online.state.erro}
            aviso={online.avisoMenu}
            desabilitado={online.state.status === 'connecting'}
            semInternet={semInternet}
            salasPublicas={online.state.salasPublicas}
            onListarSalas={online.listarSalas}
            onJogarContraBots={onJogarContraBots}
          />
          <div className="menu-desafio">
            <CardDesafio />
          </div>
        </>
      ) : !partidaIniciada && salaRapida ? (
        <SalaRapidaEspera
          jogadores={online.state.jogadores}
          rapida={online.state.rapida}
          souAnfitriao={online.isHost}
          onComecar={online.iniciarPartida}
          onCancelar={() => {
            buscaRapidaCancelada();
            online.sair();
          }}
        />
      ) : !partidaIniciada ? (
        <section className="room-layout">
          <div className="room-main">
            <div className="room-toolbar">
              <div>
                <p className="eyebrow">CÓDIGO DA SALA</p>
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}
                >
                  <strong className="room-code">{online.salaId}</strong>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={copiarCodigoSala}
                    aria-label="Copiar código da sala"
                  >
                    {textoCopiar}
                  </button>
                  {online.salaId && <ConvidarSala salaId={online.salaId} />}
                  {cardDesafio}
                </div>
              </div>
              <button className="button button-secondary" onClick={online.sair}>
                Sair
              </button>
            </div>
            <div className="waiting-state">
              <span className="waiting-icon">◈</span>
              <h2>Aguardando o grupo</h2>
              <p className="muted">Compartilhe o código e inicie quando todos entrarem.</p>
              {online.isHost && (
                <button
                  className="button button-primary"
                  disabled={online.state.jogadores.length < 2}
                  onClick={online.iniciarPartida}
                >
                  Iniciar partida
                </button>
              )}
              {!online.isHost && <p className="muted">O host inicia a partida.</p>}
            </div>
          </div>
          <aside className="room-sidebar">{jogadoresEChat}</aside>
        </section>
      ) : (
        <Suspense fallback={carregandoMesa}>
          <MesaOnline3D
            online={online}
            renderizacao={lerPreferenciaMesa()}
            acoesHud={
              <button
                ref={utilityTriggerRef}
                type="button"
                className="mesa3d-hud-botao"
                aria-haspopup="dialog"
                aria-expanded={utilityOpen}
                aria-controls="online-utility-drawer"
                aria-label="Menu da partida: sala, jogadores e chat"
                onClick={() => setUtilityOpen(true)}
              >
                ☰
              </button>
            }
          />
        </Suspense>
      )}

      {partidaIniciada && utilityOpen && gavetaDaPartida}

      {!partidaIniciada && online.state.erro && online.state.erroCodigo !== 'SALA_INEXISTENTE' && (
        <p className="error-message">{online.state.erro}</p>
      )}
      {/* Só bloqueia a tela dentro de uma sala: no menu, jogar contra bots não
          depende do servidor (o cabeçalho já mostra o estado da conexão). */}
      {entrouNaSala && online.state.status === 'reconnecting' && (
        <Reconectando
          tentativa={online.tentativaReconexao}
          mensagem="Conexão perdida, tentando reconectar..."
        />
      )}
    </>
  );
}
