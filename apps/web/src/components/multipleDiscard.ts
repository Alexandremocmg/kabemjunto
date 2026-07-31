import type { Carta } from '@kabemjunto/shared/types';

const ACOES_PERMITIDAS = new Set(['MAIS_DOIS', 'SKIP', 'REVERSE']);

export function isEligibleForMultipleDiscard(carta: Carta): boolean {
  return (
    (carta.tipo === 'NUMERADA' && carta.acao === undefined) ||
    (carta.tipo === 'ACAO' && ACOES_PERMITIDAS.has(carta.acao ?? ''))
  );
}

/**
 * Converts the click-order IDs into cards without re-sorting them by hand order.
 */
export function getSelectedMultipleDiscardCards(
  mao: ReadonlyArray<Carta>,
  selectedCardIds: ReadonlyArray<string>,
): ReadonlyArray<Carta> {
  const cartasPorId = new Map(mao.map((carta) => [carta.id, carta]));
  return selectedCardIds.flatMap((id) => {
    const carta = cartasPorId.get(id);
    return carta && isEligibleForMultipleDiscard(carta) ? [carta] : [];
  });
}

/**
 * A first card has to be normally playable. Once it is selected, following
 * cards are constrained only by the selected face because they are played in
 * the same batch, not against the original discard pile.
 */
export function canSelectMultipleDiscardCard(
  selectedCardIds: ReadonlyArray<string>,
  carta: Carta,
  mao: ReadonlyArray<Carta>,
  primeiraCartaJogavel: boolean,
): boolean {
  if (!isEligibleForMultipleDiscard(carta)) return false;

  if (selectedCardIds.length === 0) return primeiraCartaJogavel;

  const primeiraSelecionada = mao.find((item) => item.id === selectedCardIds[0]);
  return primeiraSelecionada !== undefined && temMesmaFace(primeiraSelecionada, carta);
}

/** Creates the ordered two-card stack produced by a pointer drag. */
export function createMultipleDiscardStack(
  anchor: Carta,
  target: Carta,
  mao: ReadonlyArray<Carta>,
  anchorIsNormallyPlayable: boolean,
): ReadonlyArray<string> {
  if (anchor.id === target.id) return [];
  if (!canSelectMultipleDiscardCard([], anchor, mao, anchorIsNormallyPlayable)) return [];
  if (!canSelectMultipleDiscardCard([anchor.id], target, mao, false)) return [];
  return [anchor.id, target.id];
}

/** Appends a matching card while preserving the order in which it joined the stack. */
export function appendCardToMultipleDiscardStack(
  selectedCardIds: ReadonlyArray<string>,
  carta: Carta,
  mao: ReadonlyArray<Carta>,
): ReadonlyArray<string> {
  if (selectedCardIds.includes(carta.id)) return selectedCardIds;
  return canSelectMultipleDiscardCard(selectedCardIds, carta, mao, false)
    ? [...selectedCardIds, carta.id]
    : selectedCardIds;
}

export function canActivateMultipleDiscardStack(
  selectedCardIds: ReadonlyArray<string>,
  hasPlayMultipleHandler: boolean,
): boolean {
  return selectedCardIds.length >= 2 && hasPlayMultipleHandler;
}

export function toggleMultipleDiscardSelection(
  selectedCardIds: ReadonlyArray<string>,
  carta: Carta,
  mao: ReadonlyArray<Carta> = [],
): ReadonlyArray<string> {
  if (!isEligibleForMultipleDiscard(carta)) return selectedCardIds;

  if (selectedCardIds.includes(carta.id)) {
    return selectedCardIds.filter((id) => id !== carta.id);
  }

  const primeiraSelecionada = mao.find((item) => item.id === selectedCardIds[0]);
  if (primeiraSelecionada && !temMesmaFace(primeiraSelecionada, carta)) return selectedCardIds;

  return [...selectedCardIds, carta.id];
}

export function temMesmaFace(a: Carta, b: Carta): boolean {
  if (a.tipo === 'NUMERADA' || b.tipo === 'NUMERADA') {
    return a.tipo === 'NUMERADA' && b.tipo === 'NUMERADA' && a.valor === b.valor;
  }
  return a.acao !== undefined && a.acao === b.acao;
}

/** Circular rotation: [a,b,c] → [b,c,a]. Returns the same array reference for length ≤ 1. */
export function rotateStack(ids: ReadonlyArray<string>): ReadonlyArray<string> {
  if (ids.length <= 1) return ids;
  const [first, ...rest] = ids;
  return [...rest, first!];
}

/**
 * Reconciles stacks against the current hand:
 * - Removes IDs missing from the hand
 * - Dissolves stacks with < 2 remaining cards
 * - Does NOT add new cards automatically
 */
export function reconcileStacks(
  stacks: ReadonlyArray<ReadonlyArray<string>>,
  mao: ReadonlyArray<Carta>,
): ReadonlyArray<ReadonlyArray<string>> {
  const maoIds = new Set(mao.map((c) => c.id));
  return stacks
    .map((stack) => stack.filter((id) => maoIds.has(id)))
    .filter((stack) => stack.length >= 2);
}

/**
 * Rotates the stack so the first card that passes `isValid` is at position 0.
 * If the first card is already valid, or none are valid, the original order is preserved.
 */
export function findFirstValidInStack(
  stack: ReadonlyArray<string>,
  mao: ReadonlyArray<Carta>,
  isValid: (carta: Carta) => boolean,
): ReadonlyArray<string> {
  if (stack.length === 0) return stack;
  const maoById = new Map(mao.map((c) => [c.id, c]));
  const firstValidIdx = stack.findIndex((id) => {
    const c = maoById.get(id);
    return c !== undefined && isValid(c);
  });
  if (firstValidIdx <= 0) return stack;
  return [...stack.slice(firstValidIdx), ...stack.slice(0, firstValidIdx)];
}
