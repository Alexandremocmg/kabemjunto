/**
 * Sistema de telemetria do Kabemjunto.
 * Coleta eventos do motor de jogo pra debug, analytics e anti-cheat.
 *
 * ADR-006: telemetria é OPCIONAL e DESLIGADA por padrão.
 * Por LGPD, evento de jogo NÃO inclui dados pessoais (só IDs).
 *
 * USO (frontend):
 *   import { getTelemetry, logEvent } from '@shared/telemetry';
 *   const tele = getTelemetry();
 *   tele.record(eventoPartida); // a cada jogada, compra, etc.
 *
 * O motor de regras JÁ retorna `eventos` em `ResultadoJogada`, `ResultadoCompra`,
 * etc. O wrapper frontend consome esses eventos e despacha pra telemetria.
 *
 * FONTE DE DADOS:
 *   - Eventos do motor: ver `types/game.ts#EventoPartida`
 *   - Eventos de UI: clicks, navegação, erros (futuro)
 *
 * PROD vs DEV:
 *   - DEV: console.log estruturado (default)
 *   - PROD: integração com PostHog / Sentry / custom (futuro)
 */

import type { EventoPartida } from '../types/game.js';
import type { EstadoPartida } from '../types/game.js';

/** Configuração de telemetria. */
export interface TelemetryConfig {
  /** Liga/desliga. Default false (LGPD-friendly). */
  enabled: boolean;
  /** Taxa de amostragem (0.0 a 1.0). Default 1.0 (100% dos eventos). */
  sampleRate: number;
  /** Sink de eventos (pra onde vão). Default: console. */
  sink: TelemetrySink;
  /** Contexto adicional (ex: userId, partidaId). */
  context?: TelemetryContext;
}

/** Contexto adicional anexado a cada evento. */
export interface TelemetryContext {
  partidaId?: string;
  salaId?: string;
  /** Modo de jogo (ex: 'HOTSEAT', 'ONLINE'). */
  modo?: string;
  /** Quantidade de jogadores. */
  totalJogadores?: number;
  /** User agent (auto-preenchido). */
  userAgent?: string;
  /** Locale (ex: 'pt-BR'). */
  locale?: string;
}

/** Sink: destino dos eventos. */
export interface TelemetrySink {
  /** Nome do sink (ex: 'console', 'posthog', 'sentry'). */
  name: string;
  /** Envia o evento. Pode ser async. */
  emit(event: TelemetryEvent): void | Promise<void>;
}

/** Evento enriquecido com timestamp e contexto. */
export interface TelemetryEvent {
  /** Tipo do evento (espelha EventoPartida.tipo). */
  tipo: string;
  /** Timestamp em ms. */
  timestamp: number;
  /** Propriedades do evento (específicas de cada tipo). */
  properties: Record<string, unknown>;
  /** Contexto adicional. */
  context: TelemetryContext;
}

/** Sink padrão: console.log estruturado. Útil pra dev. */
export const consoleSink: TelemetrySink = {
  name: 'console',
  emit(event: TelemetryEvent) {
    console.log(`[telemetry] ${event.tipo}`, event.properties);
  },
};

/** Sink no-op: descarta eventos. Útil pra testes. */
export const noopSink: TelemetrySink = {
  name: 'noop',
  emit() {
    // intentionally empty
  },
};

/** Config padrão: desligada, console sink. */
const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: false,
  sampleRate: 1.0,
  sink: consoleSink,
};

/** Instância global de telemetria. */
let currentConfig: TelemetryConfig = { ...DEFAULT_CONFIG };

/**
 * Define a config de telemetria. Chame no boot do app.
 */
export function configureTelemetry(config: Partial<TelemetryConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Retorna a config atual (read-only).
 */
export function getTelemetryConfig(): Readonly<TelemetryConfig> {
  return Object.freeze({ ...currentConfig });
}

/**
 * Logger principal. Recebe um EventoPartida e despacha pro sink.
 *
 * - Respeita `enabled` (se false, noop)
 * - Respeita `sampleRate` (se Math.random() > sampleRate, descarta)
 * - Enriquece com timestamp e contexto
 */
export function logEvent(evento: EventoPartida): void {
  if (!currentConfig.enabled) return;
  if (Math.random() > currentConfig.sampleRate) return;

  const telEvent: TelemetryEvent = {
    tipo: evento.tipo,
    timestamp: Date.now(),
    properties: extractProperties(evento),
    context: currentConfig.context ?? {},
  };

  try {
    const result = currentConfig.sink.emit(telEvent);
    if (result instanceof Promise) {
      result.catch((err) => {
        console.error('[telemetry] sink error:', err);
      });
    }
  } catch (err) {
    console.error('[telemetry] sync error:', err);
  }
}

/**
 * Log de múltiplos eventos (batch). Mais eficiente que chamar logEvent N vezes.
 */
export function logEvents(eventos: ReadonlyArray<EventoPartida>): void {
  for (const e of eventos) logEvent(e);
}

/**
 * Helper: log de evento custom (não do motor).
 * Útil pra UI events: 'CARTA_CLICADA', 'PARTIDA_INICIADA', etc.
 */
export function logCustom(tipo: string, properties: Record<string, unknown> = {}): void {
  logEvent({
    tipo,
    timestamp: Date.now(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({} as any), // hack pra satisfazer tipo discriminado
    properties,
  } as unknown as EventoPartida);
}

/**
 * Helper: extrai propriedades relevantes do evento pra telemetria.
 * Dependendo do tipo, extrai campos diferentes.
 */
function extractProperties(evento: EventoPartida): Record<string, unknown> {
  switch (evento.tipo) {
    case 'CARTA_JOGADA':
      return {
        jogadorId: evento.jogadorId,
        cartaId: evento.cartaId,
        ...(evento.corEscolhida !== undefined ? { corEscolhida: evento.corEscolhida } : {}),
      };
    case 'CARTA_COMPRADA':
      return { jogadorId: evento.jogadorId, cartaId: evento.cartaId, origem: evento.origem };
    case 'ATAQUE_ACUMULADO':
      return { novo: evento.novo, stackSize: evento.stack.length };
    case 'ATAQUE_REFLETIDO_ZERO_MAIS':
      return { origem: evento.origem, alvo: evento.alvo, cartas: evento.cartasDevolvidas };
    case 'VITORIA':
      return { vencedorId: evento.vencedorId };
    case 'PARTIDA_FINALIZADA':
      return { motivo: evento.motivo };
    case 'SILENCIO_ATIVADO':
    case 'SILENCIO_QUEBRADO':
      return {
        por: evento.por,
        ...(evento.tipo === 'SILENCIO_QUEBRADO' ? { cartasCompradas: evento.cartasCompradas } : {}),
      };
    default:
      return { ...evento };
  }
}

/**
 * Helper: cria contexto a partir do estado atual.
 */
export function makeContext(estado: EstadoPartida): TelemetryContext {
  return {
    partidaId: estado.partidaId,
    salaId: estado.salaId,
    totalJogadores: estado.jogadores.length,
  };
}
