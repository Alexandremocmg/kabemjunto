/**
 * Wrapper FRONTEND do motor de regras.
 *
 * ADR-004: este arquivo é uma fina camada sobre `@kabemjunto/shared/rules`.
 * Sua única responsabilidade é:
 *   1. Encaminhar chamadas para o motor puro
 *   2. Despachar side effects (SFX) com base no que o motor retornou
 *
 * TUDO que toca regra de jogo DEVE estar em `@kabemjunto/shared/rules`.
 * Se você está adicionando lógica de regra aqui, pare e mova para o shared.
 */

import {
  embaralhar as embaralharPure,
  criarPartidaInicial,
  validarJogada,
  executarJogada,
  comprarCartas,
  executarTurnoBot,
  type CriarPartidaOpcoes,
  type ModoJogo,
} from '@shared';
import { BARALHO_COMPLETO_108 } from '@shared/constants';
import type { Carta, Cor, EstadoPartida } from '@shared';
import { audioService } from './audioService';

// ─────────────────────────────────────────────────────────────────────
// Re-exports para o App.tsx e componentes
// ─────────────────────────────────────────────────────────────────────

export { embaralharPure as embaralhar };
export { validarJogada };
export type { EstadoPartida, Carta, Cor };

// ─────────────────────────────────────────────────────────────────────
// Wrappers que disparam áudio
// ─────────────────────────────────────────────────────────────────────

/**
 * Cria uma nova partida e toca o SFX de descarte inicial.
 */
export function criarPartida(
  modo: ModoJogo,
  totalJogadores: number = 4,
  nomesCustomizados: string[] = [],
): EstadoPartida {
  const opcoes: CriarPartidaOpcoes = {
    baralho: BARALHO_COMPLETO_108,
    modo,
    totalJogadores,
    ...(nomesCustomizados.length > 0 ? { nomesCustomizados } : {}),
  };
  const estado = criarPartidaInicial(opcoes);
  audioService.play('descarte');
  return estado;
}

/**
 * Executa uma jogada e toca os SFXs apropriados.
 * Lança erro se a jogada for inválida.
 */
export function jogarCarta(
  estado: EstadoPartida,
  cartaIndex: number,
  corEscolhida?: Exclude<Cor, 'NEUTRO'>,
): EstadoPartida {
  const resultado = executarJogada({ estado, cartaIndex, corEscolhida });
  tocarSFX(resultado.sfx);
  return resultado.novoEstado;
}

/**
 * Compra cartas e toca o SFX de compra.
 */
export function comprar(estado: EstadoPartida): EstadoPartida {
  const resultado = comprarCartas({ estado });
  tocarSFX(resultado.sfx);
  return resultado.novoEstado;
}

/**
 * Executa o turno do bot (com delay visual decidido pelo caller).
 */
export function turnoBot(estado: EstadoPartida): EstadoPartida {
  const resultado = executarTurnoBot({ estado });
  tocarSFX(resultado.sfx);
  return resultado.novoEstado;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────

function tocarSFX(sfx: readonly string[]): void {
  for (const s of sfx) {
    audioService.play(s as Parameters<typeof audioService.play>[0]);
  }
}
