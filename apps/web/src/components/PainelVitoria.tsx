import React, { useEffect, useMemo } from 'react';
import { EstadoPartida, Jogador } from '@kabemjunto/shared/types';
import confetti from 'canvas-confetti';
import { Award, Crown, Layers, RotateCcw, Trophy } from 'lucide-react';

interface PainelVitoriaProps {
  estado: EstadoPartida;
  onReiniciar: () => void;
}

export const PainelVitoria: React.FC<PainelVitoriaProps> = ({ estado, onReiniciar }) => {
  const vencedor = estado.jogadores.find((jogador: Jogador) => jogador.id === estado.vencedor);
  const ranking = useMemo(
    () => [...estado.jogadores].sort((a, b) => a.mao.length - b.mao.length),
    [estado.jogadores],
  );
  const cartasJogadas = estado.historico.filter((evento) => evento.tipo === 'CARTA_JOGADA').length;
  const cartasCompradas = estado.historico.filter(
    (evento) => evento.tipo === 'CARTA_COMPRADA',
  ).length;
  const eventosEspeciais = estado.historico.filter(
    (evento) => evento.tipo === 'ACAO_RESOLVIDA' || evento.tipo === 'SILENCIO_ATIVADO',
  ).length;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
  }, []);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="victory-title">
      <div className="victory-panel">
        <div className="victory-icon" aria-hidden="true">
          <Trophy size={58} />
        </div>
        <span className="victory-kicker">FIM DA PARTIDA</span>
        <h2 id="victory-title">VITÓRIA!</h2>
        <p className="victory-winner">
          <Crown size={18} /> {vencedor?.nome || 'Jogador'} ficou sem cartas.
        </p>

        <div className="victory-stats" aria-label="Estatísticas reais da partida">
          <div>
            <Layers size={16} />
            <strong>{cartasJogadas}</strong>
            <span>jogadas</span>
          </div>
          <div>
            <Award size={16} />
            <strong>{cartasCompradas}</strong>
            <span>compras</span>
          </div>
          <div>
            <Trophy size={16} />
            <strong>{eventosEspeciais}</strong>
            <span>efeitos</span>
          </div>
        </div>

        <div className="victory-ranking">
          <span className="victory-ranking-title">ORDEM FINAL</span>
          {ranking.map((jogador, index) => (
            <div
              className={`victory-ranking-row ${jogador.id === vencedor?.id ? 'winner' : ''}`}
              key={jogador.id}
            >
              <span className="victory-position">{index + 1}</span>
              <span className="victory-avatar">{jogador.avatar || '🙂'}</span>
              <strong>{jogador.nome}</strong>
              <span className="victory-card-count">{jogador.mao.length} cartas</span>
            </div>
          ))}
        </div>

        <button className="victory-restart" onClick={onReiniciar} type="button">
          <RotateCcw size={18} /> Jogar novamente
        </button>
      </div>
    </div>
  );
};
