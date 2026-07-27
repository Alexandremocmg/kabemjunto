import React, { useState } from 'react';
import { Users, Bot, Play } from 'lucide-react';

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
  const [totalJogadores, setTotalJogadores] = useState<number>(4);
  const [nomeJogador, setNomeJogador] = useState<string>('Seu Nome');
  const [dificuldade] = useState<'FACIL' | 'MEDIO' | 'DIFICIL'>('MEDIO');

  const handleStart = () => {
    const nomes = [nomeJogador];
    const diffs: ('FACIL' | 'MEDIO' | 'DIFICIL')[] = [dificuldade];

    for (let i = 1; i < totalJogadores; i++) {
      nomes.push(modo === 'BOTS' ? `Bot ${i}` : `Jogador ${i + 1}`);
      diffs.push(dificuldade);
    }

    onIniciarJogo(modo, totalJogadores, nomes, diffs);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'radial-gradient(circle at center, #1B382B 0%, #0D1C15 80%, #050B08 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px',
      }}
    >
      <div
        className="glass-panel"
        style={{ width: '100%', maxWidth: '520px', padding: '36px', textAlign: 'center' }}
      >
        {/* Logo / Banner */}
        <div style={{ marginBottom: '24px' }}>
          <h1
            style={{
              fontSize: '44px',
              fontWeight: '900',
              letterSpacing: '2px',
              background: 'linear-gradient(135deg, #F39C12 0%, #E74C3C 50%, #8E44AD 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '4px',
            }}
          >
            KABEMJUNTO
          </h1>
          <p style={{ color: '#8B949E', fontSize: '14px', fontWeight: '500' }}>
            O jogo de cartas que te denuncia! 🎴
          </p>
        </div>

        {/* Seleção do Modo de Jogo */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '700',
              color: '#8B949E',
              marginBottom: '8px',
              textAlign: 'left',
            }}
          >
            MODO DE JOGO
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={() => setModo('BOTS')}
              style={{
                background: modo === 'BOTS' ? 'rgba(243, 156, 18, 0.2)' : 'rgba(255,255,255,0.05)',
                border: modo === 'BOTS' ? '2px solid #F39C12' : '1px solid rgba(255,255,255,0.1)',
                color: modo === 'BOTS' ? '#F39C12' : '#F0F6FC',
                padding: '14px',
                borderRadius: '12px',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Bot size={18} /> VS Bots IA
            </button>

            <button
              onClick={() => setModo('HOTSEAT')}
              style={{
                background:
                  modo === 'HOTSEAT' ? 'rgba(52, 152, 219, 0.2)' : 'rgba(255,255,255,0.05)',
                border:
                  modo === 'HOTSEAT' ? '2px solid #3498DB' : '1px solid rgba(255,255,255,0.1)',
                color: modo === 'HOTSEAT' ? '#3498DB' : '#F0F6FC',
                padding: '14px',
                borderRadius: '12px',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Users size={18} /> Hot-Seat Local
            </button>
          </div>
        </div>

        {/* Quantidade de Jogadores (2-10) */}
        <div style={{ marginBottom: '24px', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#8B949E' }}>
              QUANTIDADE DE JOGADORES
            </label>
            <span style={{ color: '#F39C12', fontWeight: '800' }}>{totalJogadores} Jogadores</span>
          </div>
          <input
            type="range"
            min="2"
            max="10"
            value={totalJogadores}
            onChange={(e) => setTotalJogadores(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#F39C12', cursor: 'pointer' }}
          />
        </div>

        {/* Nome do Jogador Principal */}
        <div style={{ marginBottom: '24px', textAlign: 'left' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '700',
              color: '#8B949E',
              marginBottom: '8px',
            }}
          >
            SEU NOME DA MESA
          </label>
          <input
            type="text"
            value={nomeJogador}
            onChange={(e) => setNomeJogador(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#FFFFFF',
              padding: '12px 16px',
              borderRadius: '12px',
              fontFamily: 'Inter, sans-serif',
              fontSize: '16px',
              outline: 'none',
            }}
          />
        </div>

        {/* Botão de Iniciar */}
        <button
          className="btn-primary"
          onClick={handleStart}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '18px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Play size={20} fill="currentColor" /> INICIAR PARTIDA
        </button>
      </div>
    </div>
  );
};
