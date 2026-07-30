/// <reference types="vite/client" />
/**
 * Wrapper FRONTEND do motor de regras.
 *
 * ADR-004: este arquivo é uma fina camada sobre `@kabemjunto/shared/rules`.
 * Sua única responsabilidade é:
 *   1. Encaminhar chamadas para o motor puro
 *   2. Despachar side effects (SFX) com base no que o motor retornou
 *   3. Despachar telemetria (M13/ADR-006) com base nos eventos do motor
 *
 * TUDO que toca regra de jogo DEVE estar em `@kabemjunto/shared/rules`.
 * Se você está adicionando lógica de regra aqui, pare e mova para o shared.
 */

import {
  embaralhar as embaralharPure,
  criarPartidaInicial,
  validarJogada,
  executarJogada,
  executarDescarteMultiplo,
  comprarCartas,
  executarTurnoBot,
  configureTelemetry,
  logEvent,
  logEvents,
  makeContext,
  consoleSink,
  type CriarPartidaOpcoes,
  type ModoJogo,
} from '@kabemjunto/shared';
import { BARALHO_COMPLETO_108 } from '@kabemjunto/shared/constants';
import type { Carta, Cor, EstadoPartida, JogadorId } from '@kabemjunto/shared';
import { audioService } from './audioService';

// ─────────────────────────────────────────────────────────────────────
// Setup de telemetria (M13)
// ─────────────────────────────────────────────────────────────────────

// Por padrão, telemetria desliga em dev (LGPD-friendly).
// Liga automaticamente em produção via env var.
const TELEMETRY_ENABLED = import.meta.env.PROD === true;
configureTelemetry({
  enabled: TELEMETRY_ENABLED,
  sampleRate: 1.0,
  sink: consoleSink,
});

// ─────────────────────────────────────────────────────────────────────
// Re-exports para o App.tsx e componentes
// ─────────────────────────────────────────────────────────────────────

export { embaralharPure as embaralhar };
export { validarJogada };
export type { EstadoPartida, Carta, Cor };

// ─────────────────────────────────────────────────────────────────────
// Wrappers que disparam áudio + telemetria
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
  // Configura contexto de telemetria com IDs da partida
  configureTelemetry({ context: makeContext(estado) });
  logEvent({
    tipo: 'PARTIDA_INICIADA',
    timestamp: Date.now(),
    jogadores: estado.jogadores.map((j) => j.id),
  });
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
  alvoTrocaId?: JogadorId,
): EstadoPartida {
  const resultado = executarJogada({
    estado,
    cartaIndex,
    ...(corEscolhida ? { corEscolhida } : {}),
    ...(alvoTrocaId ? { alvoTrocaId } : {}),
  });
  tocarSFX(resultado.sfx);
  logEvents(resultado.eventos);
  return resultado.novoEstado;
}

/** Executa um descarte múltiplo local pelo mesmo motor puro do modo Online. */
export function jogarMultiplasCartas(
  estado: EstadoPartida,
  cartaIds: ReadonlyArray<string>,
): EstadoPartida {
  const jogador = estado.jogadores.find((item) => item.id === estado.vezDe);
  const cartaIndices = cartaIds.map(
    (cartaId) => jogador?.mao.findIndex((carta) => carta.id === cartaId) ?? -1,
  );
  const resultado = executarDescarteMultiplo({ estado, cartaIndices });
  tocarSFX(resultado.sfx);
  logEvents(resultado.eventos);
  return resultado.novoEstado;
}

/**
 * Compra cartas e toca o SFX de compra.
 *
 * `turnoMantido` indica que a carta comprada é jogável e o jogador segue na
 * vez (GDD §7), para a UI não anunciar passagem de turno indevidamente.
 */
export function comprar(estado: EstadoPartida): {
  estado: EstadoPartida;
  turnoMantido: boolean;
} {
  const resultado = comprarCartas({ estado });
  tocarSFX(resultado.sfx);
  logEvents(resultado.eventos);
  return { estado: resultado.novoEstado, turnoMantido: resultado.turnoMantido };
}

/**
 * Executa o turno do bot (com delay visual decidido pelo caller).
 */
export function turnoBot(estado: EstadoPartida): EstadoPartida {
  const resultado = executarTurnoBot({ estado });
  tocarSFX(resultado.sfx);
  logEvents(resultado.eventos);
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
