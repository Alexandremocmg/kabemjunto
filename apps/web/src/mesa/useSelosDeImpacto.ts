import { useEffect, useRef, useState } from 'react';
import type { EstadoPartidaPublico } from '@kabemjunto/shared';
import { derivarImpactos, type Impacto } from './impactos';

/** Quanto tempo cada selo fica sobre o jogador. */
export const DURACAO_SELO_MS = 1200;
/** Selos esperando a vez, por jogador; além disso, o mais antigo da espera cai. */
export const MAXIMO_NA_FILA = 2;

export interface Selo {
  chave: number;
  impacto: Impacto;
}

/**
 * Selo visível de cada jogador (no máximo um por jogador, com fila curta).
 * `aoMostrar` avisa a cena no instante em que o selo aparece.
 */
export function useSelosDeImpacto(
  anterior: EstadoPartidaPublico | undefined,
  atual: EstadoPartidaPublico,
  jogadorId: string,
  aoMostrar: (impacto: Impacto) => void,
): ReadonlyMap<string, Selo> {
  const [selos, setSelos] = useState<ReadonlyMap<string, Selo>>(new Map());
  const filas = useRef(new Map<string, Impacto[]>());
  const timers = useRef(new Map<string, number>());
  const sequencia = useRef(0);
  const processado = useRef<EstadoPartidaPublico>();
  const aoMostrarRef = useRef(aoMostrar);
  aoMostrarRef.current = aoMostrar;

  // Sai da mesa ou troca de partida: nada de selo velho nem timer solto.
  useEffect(() => {
    const ativos = timers.current;
    const espera = filas.current;
    return () => {
      ativos.forEach((timer) => window.clearTimeout(timer));
      ativos.clear();
      espera.clear();
      setSelos(new Map());
    };
  }, [atual.partidaId]);

  useEffect(() => {
    if (processado.current === atual) return;
    processado.current = atual;

    const mostrar = (impacto: Impacto): void => {
      const id = impacto.jogadorId;
      sequencia.current += 1;
      const selo = { chave: sequencia.current, impacto };
      setSelos((atuais) => new Map(atuais).set(id, selo));
      aoMostrarRef.current(impacto);
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          const proximo = filas.current.get(id)?.shift();
          if (proximo) {
            mostrar(proximo);
            return;
          }
          setSelos((atuais) => {
            const restantes = new Map(atuais);
            restantes.delete(id);
            return restantes;
          });
        }, DURACAO_SELO_MS),
      );
    };

    for (const impacto of derivarImpactos(anterior, atual, jogadorId)) {
      if (!timers.current.has(impacto.jogadorId)) {
        mostrar(impacto);
        continue;
      }
      const fila = filas.current.get(impacto.jogadorId) ?? [];
      filas.current.set(impacto.jogadorId, [...fila, impacto].slice(-MAXIMO_NA_FILA));
    }
  }, [anterior, atual, jogadorId]);

  return selos;
}
