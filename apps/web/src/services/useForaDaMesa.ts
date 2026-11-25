import { useEffect } from 'react';
import { ficouDeFora, type useGameSocket } from './socketClient';

export const AVISO_REVANCHE = 'A revanche começou sem você. Escolha outra mesa para jogar.';
export const AVISO_MESA_DESFEITA = 'A mesa foi desfeita depois do fim da partida.';
/** Folga para a partida nova chegar depois do fim da contagem. */
export const FOLGA_MS = 3000;

/** Depois do fim, quem não entrou na revanche volta ao menu sabendo o motivo. */
export function useForaDaMesa(
  online: Pick<ReturnType<typeof useGameSocket>, 'ficarDeFora' | 'jogadorId' | 'state'>,
): void {
  const { ficarDeFora, jogadorId } = online;
  const { erroCodigo, estado, jogadores, revanche, status } = online.state;
  const acabou = Boolean(estado?.finalizada);

  // A partida nova chegou, e a pessoa não está nela.
  const semLugar = Boolean(estado && jogadorId && !acabou && ficouDeFora(estado, jogadorId));
  // A sala já não conta com ela.
  const semAssento =
    acabou &&
    jogadorId !== undefined &&
    jogadores.length > 0 &&
    !jogadores.some((jogador) => jogador.id === jogadorId && !jogador.isBot);
  useEffect(() => {
    if (semLugar || semAssento) ficarDeFora(AVISO_REVANCHE);
  }, [ficarDeFora, semAssento, semLugar]);

  const recusada = acabou && (erroCodigo === 'SALA_INEXISTENTE' || erroCodigo === 'AUTH_REQUIRED');
  useEffect(() => {
    if (recusada) ficarDeFora(AVISO_MESA_DESFEITA);
  }, [ficarDeFora, recusada]);

  // A contagem acabou, ninguém avisou nada e a pessoa não tinha pedido.
  const minha = acabou && revanche?.partidaId === estado?.partidaId ? revanche : undefined;
  const prazo =
    minha?.restanteMs !== undefined &&
    minha.prontos.length > 0 &&
    jogadorId !== undefined &&
    status === 'connected' &&
    !minha.prontos.includes(jogadorId)
      ? minha.recebidaEm + minha.restanteMs + FOLGA_MS
      : undefined;
  useEffect(() => {
    if (prazo === undefined) return undefined;
    const timer = window.setTimeout(
      () => ficarDeFora(AVISO_REVANCHE),
      Math.max(0, prazo - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [ficarDeFora, prazo]);
}
