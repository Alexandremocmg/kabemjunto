import type { FormEvent } from 'react';
import { useState } from 'react';
import { useGameSocket } from './services/socketClient';

function gerarCodigo(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function App() {
  const online = useGameSocket();
  const [salaInput, setSalaInput] = useState('');
  const [nomeInput, setNomeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [cartaInput, setCartaInput] = useState('');
  const entrouNaSala = Boolean(online.salaId);
  const partidaIniciada = Boolean(online.state.estado);

  function entrar(criar: boolean): void {
    const salaId = criar ? gerarCodigo() : salaInput;
    if (!salaId.trim() || !nomeInput.trim()) return;
    setSalaInput(salaId);
    online.entrarSala({ salaId, nome: nomeInput });
  }

  function entrarExistente(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    entrar(false);
  }

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
        <span className={`connection connection-${online.state.status}`}>
          {online.state.status === 'reconnecting' ? 'Reconectando...' : online.state.status}
        </span>
      </header>

      {!entrouNaSala ? (
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
              />
            </label>
            <label>
              Código da sala
              <input
                value={salaInput}
                onChange={(event) => setSalaInput(event.target.value.toUpperCase())}
                maxLength={6}
                placeholder="K4B3MJ"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="button button-secondary">
                Entrar em sala
              </button>
              <button type="button" className="button button-primary" onClick={() => entrar(true)}>
                Criar sala
              </button>
            </div>
          </form>
          {online.state.erro && <p className="error-message">{online.state.erro}</p>}
        </section>
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
                        disabled={online.socketId !== online.state.estado?.vezDe}
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
                  <li key={jogador.id}>
                    <span>
                      {jogador.avatar} {jogador.nome}
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
    </main>
  );
}
