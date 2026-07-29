import type { Carta } from '@kabemjunto/shared/types';

const ACOES_PERMITIDAS = new Set(['MAIS_DOIS', 'SKIP', 'REVERSE']);

export function isEligibleForMultipleDiscard(carta: Carta): boolean {
  return carta.tipo === 'NUMERADA' || ACOES_PERMITIDAS.has(carta.acao ?? '');
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

export function getMultipleDiscardStackHint(
  stackSize: number,
  shouldShow: boolean,
): string | undefined {
  if (!shouldShow || stackSize < 2) return undefined;
  return `Pilha pronta — toque para descartar ${stackSize} cartas`;
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
