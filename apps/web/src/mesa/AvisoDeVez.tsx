/** Prazo da vez: barra e contagem discretas, com urgência no fim. */
import { useMemo } from 'react';
import type { TurnoPublico } from '@kabemjunto/shared';
import { useRestante } from './useRestante';

export const URGENCIA_MS = 8000;

export function AvisoDeVez({ turno, minhaVez }: { turno: TurnoPublico; minhaVez: boolean }) {
  // Conta a partir da chegada (o relógio do aparelho pode estar errado) e só
  // recomeça num prazo novo: o mesmo é reenviado a cada estado.
  const fimEm = useMemo(
    () => performance.now() + turno.restanteMs,
    // Sem `restanteMs` de propósito: ele muda a cada reenvio do mesmo prazo.
    [turno.jogadorId, turno.revisao, turno.expiraEm],
  );
  const restante = useRestante(fimEm);
  const urgente = restante <= URGENCIA_MS;
  const fracao = turno.duracaoMs > 0 ? Math.min(1, restante / turno.duracaoMs) : 0;
  return (
    <div
      className={`mesa3d-prazo ${urgente ? 'mesa3d-prazo-urgente' : ''} ${minhaVez ? 'mesa3d-prazo-meu' : ''}`}
      data-urgente={urgente}
    >
      <span className="mesa3d-prazo-barra" aria-hidden="true">
        <span style={{ transform: `scaleX(${fracao})` }} />
      </span>
      <span className="mesa3d-prazo-segundos" aria-hidden="true">
        {Math.ceil(restante / 1000)} s
      </span>
      {/* Um aviso só por vez (o texto não acompanha a contagem). */}
      <span className="sr-only" role="status">
        {minhaVez && urgente ? 'Sua vez está acabando.' : ''}
      </span>
    </div>
  );
}
