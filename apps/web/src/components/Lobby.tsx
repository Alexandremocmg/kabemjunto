import React, { useEffect, useState } from 'react';
import { Bot, Play, Users, SlidersHorizontal, Sparkles } from 'lucide-react';
import { PainelColecao, type TemaColecao } from './PainelColecao';

interface LobbyProps {
  onIniciarJogo: (
    modo: 'HOTSEAT' | 'BOTS',
    totalJogadores: number,
    nomes: string[],
    dificuldadeBot: ('FACIL' | 'MEDIO' | 'DIFICIL')[],
  ) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onIniciarJogo }) => {
  const [modo, setModo] = useState<'HOTSEAT' | 'BOTS'>('BOTS');
  const [totalJogadores, setTotalJogadores] = useState(4);
  const [nomeJogador, setNomeJogador] = useState('Seu Nome');
  const [showCollection, setShowCollection] = useState(false);
  const [avatarId, setAvatarId] = useState(
    () => window.localStorage.getItem('kabemjunto.avatar') ?? '01',
  );
  const [tema, setTema] = useState<TemaColecao>(
    () => (window.localStorage.getItem('kabemjunto.tema') as TemaColecao | null) ?? 'FLORESTA',
  );
  const dificuldade: 'FACIL' | 'MEDIO' | 'DIFICIL' = 'MEDIO';

  useEffect(() => {
    window.localStorage.setItem('kabemjunto.avatar', avatarId);
    window.localStorage.setItem('kabemjunto.tema', tema);
  }, [avatarId, tema]);

  const iniciar = (modoParaIniciar: 'HOTSEAT' | 'BOTS' = modo) => {
    const nomes = [nomeJogador.trim() || 'Jogador'];
    const dificuldades: ('FACIL' | 'MEDIO' | 'DIFICIL')[] = [dificuldade];
    for (let i = 1; i < totalJogadores; i++) {
      nomes.push(modoParaIniciar === 'BOTS' ? `Bot ${i}` : `Jogador ${i + 1}`);
      dificuldades.push(dificuldade);
    }
    onIniciarJogo(modoParaIniciar, totalJogadores, nomes, dificuldades);
  };

  return (
    <main className="local-home-screen">
      <section className="local-home-card" aria-labelledby="local-home-title">
        <div className="local-home-brand">
          <span className="local-home-kicker">MESA LOCAL</span>
          <h1 id="local-home-title">KABEMJUNTO</h1>
          <p>O jogo de cartas que te denuncia.</p>
        </div>

        <div className="local-home-actions">
          <button className="local-action-primary" onClick={() => iniciar()} type="button">
            <Play size={20} fill="currentColor" />
            <span>JOGAR AGORA</span>
            <small>Partida rápida contra bots</small>
          </button>
          <button
            className="local-action-secondary"
            onClick={() => {
              setModo('HOTSEAT');
              iniciar('HOTSEAT');
            }}
            type="button"
          >
            <Users size={18} /> CRIAR MESA LOCAL
          </button>
          <button
            className="local-collection-trigger"
            onClick={() => setShowCollection(true)}
            type="button"
          >
            <span className="collection-trigger-avatar">◉</span>
            <span>PERSONALIZAR PERFIL</span>
            <small>Avatar e tema da mesa</small>
          </button>
        </div>

        <div className="local-home-divider">
          <span>ou configure sua mesa</span>
        </div>

        <div className="local-config-grid">
          <label className="local-field">
            <span>SEU NOME</span>
            <input value={nomeJogador} onChange={(event) => setNomeJogador(event.target.value)} />
          </label>
          <label className="local-field">
            <span>JOGADORES</span>
            <output>{totalJogadores}</output>
            <input
              aria-label="Quantidade de jogadores"
              type="range"
              min="2"
              max="10"
              value={totalJogadores}
              onChange={(event) => setTotalJogadores(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="local-mode-section">
          <div className="local-section-heading">
            <span>
              <SlidersHorizontal size={15} /> MODO DE JOGO
            </span>
            <small>2–10 assentos visuais em disposição circular</small>
          </div>
          <div className="local-mode-toggle" role="group" aria-label="Modo de jogo">
            <button
              className={modo === 'BOTS' ? 'active' : ''}
              onClick={() => setModo('BOTS')}
              type="button"
            >
              <Bot size={17} /> VS BOTS IA
            </button>
            <button
              className={modo === 'HOTSEAT' ? 'active' : ''}
              onClick={() => setModo('HOTSEAT')}
              type="button"
            >
              <Users size={17} /> HOT-SEAT
            </button>
          </div>
        </div>

        <button className="local-start-secondary" onClick={() => iniciar()} type="button">
          <Sparkles size={17} /> INICIAR PARTIDA CONFIGURADA
        </button>
      </section>
      {showCollection && (
        <PainelColecao
          avatarId={avatarId}
          tema={tema}
          onAvatarChange={setAvatarId}
          onTemaChange={setTema}
          onClose={() => setShowCollection(false)}
        />
      )}
    </main>
  );
};
