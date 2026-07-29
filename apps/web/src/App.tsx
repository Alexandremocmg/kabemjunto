import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGameSocket } from './services/socketClient';
import { AvatarComStatus } from './components/AvatarComStatus';
import { WifiStatus } from './components/WifiStatus';
import { Reconectando } from './components/Reconectando';
import { LobbyOnline } from './components/LobbyOnline';
import { VitoriaAnimada } from './components/VitoriaAnimada';
import { NotFound } from './components/NotFound';
import { SelecionarAlvoTrocaMao } from './components/SelecionarAlvoTrocaMao';
import { ModalEscolhaCor } from './components/ModalEscolhaCor';
import { MesaOnline } from './components/MesaOnline';
import AppSingleplayer from './AppSingleplayer';

type Modo = 'local' | 'online';

export default function App() {
  const [modo, setModo] = useState<Modo>(() =>
    window.sessionStorage.getItem('kabemjunto.modo') === 'local' ? 'local' : 'online',
  );

  useEffect(() => {
    window.sessionStorage.setItem('kabemjunto.modo', modo);
  }, [modo]);

  if (modo === 'local') {
    return (
      <div>
        <ToggleModo modo={modo} onChange={setModo} />
        <AppSingleplayer />
      </div>
    );
  }

  return (
    <main className="app-shell">
      <OnlineApp onMudarModo={() => setModo('local')} />
    </main>
  );
}

function ToggleModo({ modo, onChange }: { modo: Modo; onChange: (m: Modo) => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 10000,
        display: 'flex',
        gap: 4,
        background: 'rgba(15, 23, 42, 0.9)',
        padding: 4,
        borderRadius: 999,
        border: '1px solid #334155',
      }}
    >
      <button
        type="button"
        onClick={() => onChange('local')}
        aria-pressed={modo === 'local'}
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          border: 'none',
          background: modo === 'local' ? '#F39C12' : 'transparent',
          color: modo === 'local' ? '#0F172A' : '#94A3B8',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        🏠 Local
      </button>
      <button
        type="button"
        onClick={() => onChange('online')}
        aria-pressed={modo === 'online'}
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          border: 'none',
          background: modo === 'online' ? '#F39C12' : 'transparent',
          color: modo === 'online' ? '#0F172A' : '#94A3B8',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        🌐 Online
      </button>
    </div>
  );
}

function OnlineApp({ onMudarModo }: { onMudarModo: () => void }) {
  const online = useGameSocket();
  const [chatInput, setChatInput] = useState('');
  const [cartaTrocaPendente, setCartaTrocaPendente] = useState<string>();
  const [cartaCorPendente, setCartaCorPendente] = useState<string>();
  const [cartaSelecionada, setCartaSelecionada] = useState<string>();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [confirmarAbandono, setConfirmarAbandono] = useState(false);
  const utilityTriggerRef = useRef<HTMLButtonElement>(null);
  const utilityCloseRef = useRef<HTMLButtonElement>(null);
  const utilityDrawerRef = useRef<HTMLElement>(null);
  const entrouNaSala = Boolean(online.salaId);
  const partidaIniciada = Boolean(online.state.estado);
  const wifiOn = online.state.status === 'connected';

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

  function enviarFalaRapida(texto: string): void {
    online.enviarChat(texto);
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

  function selecionarCarta(carta: import('@kabemjunto/shared').Carta): void {
    if (cartaSelecionada !== carta.id) {
      setCartaSelecionada(carta.id);
      return;
    }
    setCartaSelecionada(undefined);
    if (carta.acao === 'TROCA_MAO') {
      setCartaTrocaPendente(carta.id);
      return;
    }
    if (
      carta.tipo === 'NEUTRA' ||
      carta.acao === 'MAIS_QUATRO' ||
      carta.acao === 'CORINGA_SIMPLES'
    ) {
      setCartaCorPendente(carta.id);
      return;
    }
    online.jogarCarta(carta.id);
  }

  const utilidades = (
    <>
      <section>
        <h2>Jogadores</h2>
        <ul className="player-list">
          {online.state.jogadores.map((jogador) => (
            <li key={jogador.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AvatarComStatus
                avatarId={jogador.avatar}
                conectado={jogador.conectado}
                nome={jogador.nome}
                size={36}
              />
              <span style={{ flex: 1 }}>
                <strong>{jogador.nome}</strong>
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

  return (
    <>
      {!partidaIniciada && (
        <ToggleModo modo="online" onChange={(m) => m === 'local' && onMudarModo()} />
      )}
      {!partidaIniciada && (
        <header className="app-header">
          <img
            src="/assets/cards/kabemjunto/brand-kabemjunto.webp"
            alt="Kabemjunto"
            className="header-logo"
            width={160}
            height={46}
          />
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
        </header>
      )}

      {online.state.erroCodigo === 'SALA_INEXISTENTE' ? (
        <NotFound
          onVoltar={online.sair}
          {...(online.state.erro ? { mensagem: online.state.erro } : {})}
        />
      ) : !entrouNaSala ? (
        <LobbyOnline
          onEntrar={(credentials) => online.entrarSala(credentials)}
          erro={online.state.erro}
          desabilitado={online.state.status === 'connecting'}
          salasPublicas={online.state.salasPublicas}
          onListarSalas={online.listarSalas}
        />
      ) : !partidaIniciada ? (
        <section className="room-layout">
          <div className="room-main">
            <div className="room-toolbar">
              <div>
                <p className="eyebrow">CÓDIGO DA SALA</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <strong className="room-code">{online.salaId}</strong>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={copiarCodigoSala}
                    aria-label="Copiar código da sala"
                  >
                    {copiedCode ? '✓ Copiado!' : copyError ? '⚠ Falha ao copiar' : '📋 Copiar'}
                  </button>
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
          <aside className="room-sidebar">{utilidades}</aside>
        </section>
      ) : (
        <section className="online-match-layout" aria-label="Partida online">
          <header className="online-match-hud">
            <img
              src="/assets/cards/kabemjunto/brand-kabemjunto.webp"
              alt="Kabemjunto"
              className="online-match-logo"
              width={112}
              height={44}
            />
            <div className="online-match-room">
              <span className="online-match-room-label">Sala</span>
              <strong>{online.salaId}</strong>
              <button type="button" onClick={copiarCodigoSala} aria-label="Copiar código da sala">
                {copiedCode ? '✓' : copyError ? '⚠' : '⧉'}
              </button>
            </div>
            <div className={`connection connection-${online.state.status}`}>
              <WifiStatus status={wifiOn ? 'online' : 'offline'} size={16} />
              <span>{wifiOn ? 'Online' : 'Offline'}</span>
            </div>
            <button
              ref={utilityTriggerRef}
              type="button"
              className="online-utility-trigger"
              aria-haspopup="dialog"
              aria-expanded={utilityOpen}
              aria-controls="online-utility-drawer"
              onClick={() => setUtilityOpen(true)}
            >
              ☰ <span>Menu</span>
            </button>
            <button
              type="button"
              className="online-exit-trigger"
              onClick={() => setConfirmarAbandono(true)}
            >
              Sair
            </button>
          </header>

          <MesaOnline
            estado={online.state.estado!}
            mao={online.state.mao}
            mensagens={online.state.mensagens}
            jogadorId={online.jogadorId}
            selectedCardId={cartaSelecionada}
            onSelecionarCarta={selecionarCarta}
            onComprarCarta={online.comprarCarta}
            onEnviarFalaRapida={enviarFalaRapida}
          />

          {utilityOpen && (
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
                {utilidades}
              </aside>
            </div>
          )}
        </section>
      )}

      {confirmarAbandono && (
        <div className="modal-overlay" role="presentation">
          <section
            className="creation-dialog glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="abandon-match-title"
          >
            <h2 id="abandon-match-title">Abandonar partida?</h2>
            <p className="muted">
              Você sairá desta partida. Esta ação será confirmada pelo servidor.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setConfirmarAbandono(false)}
              >
                Continuar
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setConfirmarAbandono(false);
                  online.abandonarPartida();
                }}
              >
                Abandonar
              </button>
            </div>
          </section>
        </div>
      )}
      {online.state.cartaAceita && (
        <p className="toast-feedback sucesso" role="status">
          Jogada aceita: {online.state.cartaAceita}
        </p>
      )}
      {online.state.cartaRejeitada && (
        <p className="toast-feedback erro" role="alert">
          {online.state.cartaRejeitada}
        </p>
      )}
      {online.state.erro && online.state.erroCodigo !== 'SALA_INEXISTENTE' && (
        <p className="error-message">{online.state.erro}</p>
      )}
      {cartaTrocaPendente && (
        <SelecionarAlvoTrocaMao
          jogadores={online.state.jogadores}
          jogadorAtualId={online.jogadorId}
          onCancel={() => setCartaTrocaPendente(undefined)}
          onConfirm={(alvoId) => {
            online.jogarCarta(cartaTrocaPendente, undefined, alvoId);
            setCartaTrocaPendente(undefined);
          }}
        />
      )}
      {cartaCorPendente && (
        <ModalEscolhaCor
          onEscolherCor={(cor) => {
            online.jogarCarta(cartaCorPendente, cor);
            setCartaCorPendente(undefined);
          }}
        />
      )}
      {online.state.status === 'reconnecting' && (
        <Reconectando
          tentativa={online.tentativaReconexao}
          mensagem="Conexão perdida, tentando reconectar..."
        />
      )}
      {online.state.estado?.vencedor && (
        <VitoriaAnimada
          vencedorNome={
            online.state.jogadores.find((j) => j.id === online.state.estado?.vencedor)?.nome ||
            online.state.estado.vencedor
          }
          isVoce={online.jogadorId === online.state.estado?.vencedor}
          onJogarNovamente={online.sair}
        />
      )}
    </>
  );
}
