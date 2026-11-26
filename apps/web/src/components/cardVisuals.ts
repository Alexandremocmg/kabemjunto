import type { Carta } from '@kabemjunto/shared/types';

export const CARD_BACK_ASSET = '/assets/cards/kabemjunto/card-back.webp';

const SPECIAL_ASSETS: Partial<Record<string, string>> = {
  MAIS_QUATRO: '/assets/cards/kabemjunto/mais-quatro.webp',
  ZERO_MAIS: '/assets/cards/kabemjunto/zero-mais.webp',
  TROCA_MAO: '/assets/cards/kabemjunto/troca-mao.webp',
  GIRA_MAO: '/assets/cards/kabemjunto/gira-mao.webp',
  CORINGA_SIMPLES: '/assets/cards/kabemjunto/coringa.webp',
  MAIS_DOIS_TODOS: '/assets/cards/kabemjunto/mais-dois-todos.webp',
};

export type CardVisualTemplate = 'numeric' | 'acao-colorida' | 'neutra-especial';

export type CardVisual =
  { kind: 'asset'; src: string } | { kind: 'template'; variant: CardVisualTemplate };

export function getCardVisual(carta: Carta): CardVisual {
  const acao = carta.acao;

  // Cartas com arte premium (6 neutras especiais)
  if (acao !== undefined && acao in SPECIAL_ASSETS) {
    return { kind: 'asset', src: SPECIAL_ASSETS[acao] as string };
  }

  // SILENCIO é a carta 7 — visualmente secreta, tratada como numérica
  if (carta.tipo === 'NUMERADA' || acao === 'SILENCIO') {
    return { kind: 'template', variant: 'numeric' };
  }

  // SKIP, REVERSE, MAIS_DOIS — ação colorida, sem arte especial
  if (carta.tipo === 'ACAO') {
    return { kind: 'template', variant: 'acao-colorida' };
  }

  // Neutras sem arte específica (fallback defensivo)
  return { kind: 'template', variant: 'neutra-especial' };
}

export function getCardAltText(carta: Carta): string {
  if (carta.valor !== undefined) return `Carta ${carta.valor}`;
  const labels: Record<string, string> = {
    MAIS_QUATRO: '+4',
    ZERO_MAIS: '0+ Zero Mais',
    TROCA_MAO: 'Troca Mão',
    GIRA_MAO: 'Gira Mão',
    CORINGA_SIMPLES: 'Coringa',
    MAIS_DOIS_TODOS: '+2 Para Todos',
  };
  return labels[carta.acao ?? ''] ?? carta.efeito_texto_curto;
}
