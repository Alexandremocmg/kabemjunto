import { useState, type FormEvent } from 'react';
import { useGameSocket } from './services/socketClient';
import { AvatarComStatus } from './components/AvatarComStatus';
import { WifiStatus } from './components/WifiStatus';
import { Reconectando } from './components/Reconectando';
import { LobbyOnline } from './components/LobbyOnline';
import { VitoriaAnimada } from './components/VitoriaAnimada';
import { NotFound } from './components/NotFound';
import { SelecionarAlvoTrocaMao } from './components/SelecionarAlvoTrocaMao';
import AppSingleplayer from './AppSingleplayer';

/**
 * App principal do Kabemjunto (M16 — Sprint 5).
 *
 * Suporta 2 modos:
 * - **Online** (multiplayer via Socket.IO) — código B10 + Sprint 4 polish
 * - **Local** (single-player/hotseat/bots) — código legacy do `src/`, agora `AppSingleplayer.tsx`
 *
 * Toggle no header (botão "Local" / "Online"). Estado em React state (não persiste).
 */

type Modo = 'local' | 'online';

export default function App() {
  const [modo, setModo] = useState<Modo>('online');

  // Single-player: renderiza o App legacy (independente)
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
  const [cartaInput, setCartaInput] = useState('');
  const [cartaTrocaPendente, setCartaTrocaPendente] = useState<string>();
  const entrouNaSala = Boolean(online.salaId);
  const partidaIniciada = Boolean(online.state.estado);
  const wifiOn = online.state.status === 'connected';

  function enviarChat(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!chatInput.trim()) return;
    online.enviarChat(chatInput);
    setChatInput('');
  }

  function selecionarCarta(cartaId: string): void {
    const carta = online.state.mao.find((item) => item.id === cartaId);
    if (carta?.acao === 'TROCA_MAO') {
      setCartaTrocaPendente(cartaId);
      return;
    }
    online.jogarCarta(cartaId);
  }

  return (
    <>
      <ToggleModo modo="online" onChange={(m) => m === 'local' && onMudarModo()} />
      <header className="app-header">
        <div>
          <p className="eyebrow">KABEMJUNTO</p>
          <h1>Jogue junto, mesmo longe.</h1>
        </div>
        <div className="connection" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

      {online.state.erro?.includes('404') || online.state.erro === 'SALA_NAO_ENCONTRADA' ? (
        <NotFound onVoltar={online.sair} mensagem={online.state.erro} />
      ) : !entrouNaSala ? (
        <LobbyOnline
          onEntrar={({ salaId, nome }) => online.entrarSala({ salaId, nome })}
          erro={online.state.erro}
          desabilitado={online.state.status === 'connecting'}
        />
      ) : (
        <section className="room-layout">
          <div className="room-main">
            <div className="room-toolbar">
              <div>
                <p className="eyebrow">CÓDIGO DA SALA</p>
                <strong className="room-code">{online.salaId}</strong>
              </div>
              <button className="button button-secondary" onClick={online.sair}>
                Sair
              </button>
            </div>

            {!partidaIniciada ? (
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
            ) : (
              <div className="game-state">
                <div className="game-topline">
                  <span>
                    Vez de <strong>{online.state.estado?.vezDe}</strong>
                  </span>
                  <span>
                    Cor ativa: <strong>{online.state.estado?.corAtiva}</strong>
                  </span>
                  <span>
                    Descarte: <strong>{online.state.estado?.topo.efeito_texto_curto}</strong>
                  </span>
                </div>
                <div>
                  <p className="eyebrow">SUA MÃO</p>
                  <div className="hand-grid">
                    {online.state.mao.map((carta) => (
                      <button
                        key={carta.id}
                        className="card-button"
                        disabled={online.jogadorId !== online.state.estado?.vezDe}
                        onClick={() => selecionarCarta(carta.id)}
                      >
                        <strong>{carta.efeito_texto_curto}</strong>
                        <small>{carta.id}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="play-input">
                  Carta ID
                  <input
                    value={cartaInput}
                    onChange={(event) => setCartaInput(event.target.value)}
                    placeholder="LARANJA_NUM_7_1"
                  />
                </label>
                <button
                  className="button button-primary"
                  disabled={!cartaInput.trim()}
                  onClick={() => online.jogarCarta(cartaInput.trim())}
                >
                  Jogar carta pelo servidor
                </button>
                <button className="button button-secondary" onClick={online.comprarCarta}>
                  Comprar carta
                </button>
                {online.state.cartaAceita && (
                  <p className="success-message">Jogada aceita: {online.state.cartaAceita}</p>
                )}
                {online.state.cartaRejeitada && (
                  <p className="error-message">{online.state.cartaRejeitada}</p>
                )}
              </div>
            )}
            {online.state.erro && <p className="error-message">{online.state.erro}</p>}
          </div>

          <aside className="room-sidebar">
            <section>
              <h2>Jogadores</h2>
              <ul className="player-list">
                {online.state.jogadores.map((jogador) => (
                  <li
                    key={jogador.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                  >
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
                {online.state.mensagens.map((message, index) => (
                  <p key={`${message.timestamp}-${index}`}>
                    <strong>{message.jogadorId.slice(0, 6)}:</strong> {message.texto}
                  </p>
                ))}
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
          </aside>
        </section>
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
