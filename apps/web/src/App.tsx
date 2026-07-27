import { useState, type FormEvent } from 'react';
import { useGameSocket } from './services/socketClient';
import { AvatarComStatus } from '../../src/components/AvatarComStatus';
import { WifiStatus } from '../../src/components/WifiStatus';
import { Reconectando } from '../../src/components/Reconectando';
import { LobbyOnline } from './components/LobbyOnline';

/**
 * App principal do Kabemjunto multiplayer (B10 + Sprint 4 polish).
 *
 * - Lobby: extraído para `LobbyOnline.tsx` (B12)
 * - Status de conexão: usa `WifiStatus` (B15 do Antigravity)
 * - Reconexão: mostra `Reconectando` overlay + `logCustom('RECONECTADO')` no hook
 * - Lista de jogadores: usa `AvatarComStatus` (B11 do Antigravity)
 */
export default function App() {
  const online = useGameSocket();
  const [chatInput, setChatInput] = useState('');
  const [cartaInput, setCartaInput] = useState('');
  const entrouNaSala = Boolean(online.salaId);
  const partidaIniciada = Boolean(online.state.estado);
  const wifiOn = online.state.status === 'connected';

  function enviarChat(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!chatInput.trim()) return;
    online.enviarChat(chatInput);
    setChatInput('');
  }

  return (
    <main className="app-shell">
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

      {!entrouNaSala ? (
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
                        onClick={() => online.jogarCarta(carta.id)}
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

      {/* Overlay de reconexão (Sprint 4 polish — B13) */}
      {online.state.status === 'reconnecting' && (
        <Reconectando
          tentativa={online.tentativaReconexao}
          mensagem="Conexão perdida, tentando reconectar..."
        />
      )}
    </main>
  );
}
