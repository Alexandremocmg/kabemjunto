/** Temas da mesa (Coleção → "Tema da mesa"). Sem Three.js: a mesa 2D também usa. */
export interface TemaMesa {
  fundo: string;
  feltro: string;
  feltroBorda: string;
  aro: string;
  destaque: string;
}

export const TEMAS_MESA: Record<string, TemaMesa> = {
  FLORESTA: {
    fundo: '#0b1f33',
    feltro: '#1fa55b',
    feltroBorda: '#0f6b3a',
    aro: '#ffcf33',
    destaque: '#fff27a',
  },
  NEON: {
    fundo: '#120b2e',
    feltro: '#5b21b6',
    feltroBorda: '#2e1065',
    aro: '#22d3ee',
    destaque: '#f0abfc',
  },
  AREIA: {
    fundo: '#2a1b0e',
    feltro: '#d97706',
    feltroBorda: '#92400e',
    aro: '#fde68a',
    destaque: '#fff7d6',
  },
};

export function temaDaMesa(id: string | null | undefined): TemaMesa {
  return TEMAS_MESA[id ?? ''] ?? TEMAS_MESA['FLORESTA']!;
}
