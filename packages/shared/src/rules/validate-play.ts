/**
 * Validação de uma jogada.
 * Função pura: dado o estado e a carta, retorna se a jogada é válida.
 *
 * GDD §02.6 — Tabela de validação:
 * - Se a carta é neutra (coringa) → sempre pode jogar
 * - Se há ataque acumulado:
 *   - +2 sobre +2 OK
 *   - +4 sobre +2 OK
 *   - +2 sobre +4 PROIBIDO
 *   - +4 sobre +4 OK
 *   - 0+ sobre qualquer ataque OK (reflete)
 *   - Skip/Reverse/Coringa Simples PROIBIDOS (só números e mais-ataques)
 * - Senão (turno normal):
 *   - Mesma cor (corAtiva)
 *   - Mesmo número (numerada sobre numerada)
 *   - Mesma ação (Skip sobre Skip, +2 sobre +2, etc.)
 *   - Qualquer neutra
 */

import type { Carta, Acao } from '../types/card.js';
import type { EstadoPartida } from '../types/game.js';
import type { JogadorId } from '../types/player.js';

export interface ResultadoValidacao {
  valida: boolean;
  motivo?: string;
}

/**
 * Valida se `carta` pode ser jogada por `jogadorId` no estado atual.
 * Não muta nada.
 */
export function validarJogada(
  estado: EstadoPartida,
  carta: Carta,
  jogadorId: JogadorId,
): ResultadoValidacao {
  // 1. Turno correto
  if (estado.vezDe !== jogadorId) {
    return { valida: false, motivo: 'Não é o seu turno!' };
  }

  // 2. Jogo finalizado
  if (estado.finalizada) {
    return { valida: false, motivo: 'A partida já acabou.' };
  }

  // 3. Existem cartas no topo
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  if (!topo) {
    return { valida: false, motivo: 'Monte de descarte vazio (estado inválido).' };
  }

  // 4. Caso especial: ataque acumulado
  if (estado.ataqueAcumulado > 0) {
    return validarJogadaEmAtaque(carta, topo);
  }

  // 5. Turno normal — neutras sempre podem
  if (carta.tipo === 'NEUTRA') {
    return { valida: true };
  }

  // 6. Mesma cor (ativa)
  if (carta.cor === estado.corAtiva) {
    return { valida: true };
  }

  // 7. Mesmo número (numerada sobre numerada)
  if (carta.tipo === 'NUMERADA' && topo.tipo === 'NUMERADA' && carta.valor === topo.valor) {
    return { valida: true };
  }

  // 8. Mesma ação (Skip sobre Skip, +2 sobre +2, etc.)
  if (
    carta.tipo === 'ACAO' &&
    carta.acao !== undefined &&
    topo.tipo === 'ACAO' &&
    carta.acao === topo.acao
  ) {
    return { valida: true };
  }

  return {
    valida: false,
    motivo: 'Sua carta deve corresponder à cor ativa ou ao valor/ação no topo.',
  };
}

/**
 * Sub-rotina: valida jogada quando há ataque acumulado.
 * GDD §02.5: +2 sobre +4 é PROIBIDO, +0+ (ZERO_MAIS) sempre OK.
 */
function validarJogadaEmAtaque(carta: Carta, topo: Carta): ResultadoValidacao {
  const acaoCarta = carta.acao;

  // 0+ sempre pode (reflete o ataque)
  if (acaoCarta === 'ZERO_MAIS') {
    return { valida: true };
  }

  // Regra do projeto: +2 sobre +4 é PROIBIDO
  if (topo.acao === 'MAIS_QUATRO' && acaoCarta === 'MAIS_DOIS') {
    return {
      valida: false,
      motivo: 'Proibido jogar +2 sobre um +4! Defenda com +4, 0+ ou compre as cartas.',
    };
  }

  // +2 ou +4 sempre pode (acumula)
  if (acaoCarta === 'MAIS_DOIS' || acaoCarta === 'MAIS_QUATRO') {
    return { valida: true };
  }

  // Qualquer outra coisa (número, Skip, Reverse, Coringa, Troca, Gira)
  // não pode defender um ataque
  return {
    valida: false,
    motivo: `Há um ataque acumulado! Defenda com +2, +4, 0+ ou compre.`,
  };
}

/**
 * Helper: conta quantas cartas o jogador precisa comprar se
 * optar por "comprar em vez de cobrir" o ataque.
 */
export function cartasAPagar(estado: EstadoPartida): number {
  return Math.max(estado.ataqueAcumulado, 1);
}

/** Helper: tipo só para o compilador não reclamar de imports não usados. */
export type _AcaoInterna = Acao;
