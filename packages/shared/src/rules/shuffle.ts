/**
 * Embaralhamento Fisher-Yates.
 * Função pura: dado o mesmo input e o mesmo RNG, produz o mesmo output.
 *
 * IMPORTANTE: o motor puro usa `Math.random()` por padrão. Para testes
 * determinísticos, prefira `embaralharComSeed()`.
 */

/** Embaralha uma cópia do array (não muta o original). Fisher-Yates. */
export function embaralhar<T>(array: readonly T[], rng: () => number = Math.random): T[] {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copia[i] as T;
    copia[i] = copia[j] as T;
    copia[j] = tmp;
  }
  return copia;
}

/**
 * Versão com seed determinística (mulberry32) para testes.
 * Use APENAS em testes, nunca em produção.
 */
export function embaralharComSeed<T>(array: readonly T[], seed: number): T[] {
  let s = seed >>> 0;
  const rng = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return embaralhar(array, rng);
}
