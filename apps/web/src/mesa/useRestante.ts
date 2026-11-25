import { useEffect, useState } from 'react';

/** Milissegundos até `fimEm` (na escala de `performance.now()`), nunca negativo. */
export function useRestante(fimEm: number | undefined): number {
  const [agora, setAgora] = useState(() => performance.now());
  useEffect(() => {
    if (fimEm === undefined) return undefined;
    setAgora(performance.now());
    const timer = window.setInterval(() => {
      const instante = performance.now();
      setAgora(instante);
      if (instante >= fimEm) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [fimEm]);
  return fimEm === undefined ? 0 : Math.max(0, fimEm - agora);
}
