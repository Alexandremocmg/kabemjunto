import { useEffect, useState, type ReactNode } from 'react';
import type { JogadorPublico, SalaRapida } from '@kabemjunto/shared';

export interface SalaRapidaEsperaProps {
  jogadores: ReadonlyArray<Pick<JogadorPublico, 'id' | 'nome'>>;
  /** Ausente enquanto o servidor ainda está escolhendo a mesa. */
  rapida: SalaRapida | undefined;
  /** Só quem abriu a mesa pode antecipar o começo. */
  souAnfitriao: boolean;
  onComecar: () => void;
  onCancelar: () => void;
  convite?: ReactNode;
  /** Relógio injetável para testes. */
  agora?: () => number;
}

/** Segundos que faltam para o servidor completar a mesa com bots (nunca negativo). */
export function segundosRestantes(iniciaEm: number, agora: number): number {
  return Math.max(0, Math.ceil((iniciaEm - agora) / 1000));
}

/**
 * Sala de espera do "Jogar agora": mostra quem já sentou, quantas vagas os bots vão
 * ocupar e quanto falta para a partida começar.
 */
export function SalaRapidaEspera({
  jogadores,
  rapida,
  souAnfitriao,
  onComecar,
  onCancelar,
  convite,
  agora = Date.now,
}: SalaRapidaEsperaProps) {
  const [relogio, setRelogio] = useState(() => agora());

  useEffect(() => {
    if (!rapida) return undefined;
    setRelogio(agora());
    const timer = window.setInterval(() => setRelogio(agora()), 500);
    return () => window.clearInterval(timer);
  }, [agora, rapida]);

  if (!rapida) {
    return (
      <section className="rapida" aria-labelledby="rapida-titulo">
        <h2 id="rapida-titulo">Procurando uma mesa…</h2>
        <p className="muted" role="status">
          Conectando ao servidor.
        </p>
        <button type="button" className="button button-secondary" onClick={onCancelar}>
          Cancelar
        </button>
      </section>
    );
  }

  const segundos = segundosRestantes(rapida.iniciaEm, relogio);
  const vagas = Math.max(0, rapida.tamanhoAlvo - jogadores.length);
  const lugares = Array.from({ length: rapida.tamanhoAlvo }, (_, indice) => jogadores[indice]);

  return (
    <section className="rapida" aria-labelledby="rapida-titulo">
      <h2 id="rapida-titulo">Mesa pública</h2>
      <p className="rapida-contagem" role="status">
        {vagas === 0
          ? 'Mesa cheia, começando…'
          : segundos > 0
            ? `Começa em ${segundos} s`
            : 'Chamando os bots…'}
      </p>
      <p className="muted">
        {vagas === 0
          ? 'Todos os lugares foram ocupados.'
          : `${jogadores.length} de ${rapida.tamanhoAlvo} jogadores. Se ninguém mais chegar, ${
              vagas === 1 ? '1 bot completa' : `${vagas} bots completam`
            } a mesa.`}
      </p>
      <ul className="rapida-lugares" aria-label="Lugares da mesa">
        {lugares.map((jogador, indice) => (
          <li key={jogador?.id ?? `vaga-${indice}`} className={jogador ? 'ocupado' : 'vago'}>
            {jogador ? jogador.nome : 'Vaga — um bot entra se ninguém chegar'}
          </li>
        ))}
      </ul>
      <div className="rapida-acoes">
        {vagas > 0 && convite}
        {souAnfitriao && vagas > 0 && (
          <button type="button" className="button button-primary" onClick={onComecar}>
            Começar agora com bots
          </button>
        )}
        <button type="button" className="button button-secondary" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </section>
  );
}

export default SalaRapidaEspera;
