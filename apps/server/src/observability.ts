import type { FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { RoomStore } from './room-store.js';

export type EventCategory = 'sala' | 'chat' | 'jogo';
export type EventOutcome = 'accepted' | 'rejected';

/**
 * Registro de métricas em memória. Labels são sempre valores de um conjunto
 * fixo e pequeno (categoria de evento, status de sala) — nunca nome,
 * `salaId`, `jogadorId`, `socketId` ou conteúdo de chat.
 */
export interface MetricsRegistry {
  recordConnection(delta: 1 | -1): void;
  recordEventOutcome(category: EventCategory, outcome: EventOutcome): void;
  recordPersistenceFailure(): void;
  recordHttpRequest(durationMs: number): void;
  renderPrometheus(roomsByStatus: Record<string, number>): string;
}

export function createMetricsRegistry(): MetricsRegistry {
  let socketConnections = 0;
  const eventOutcomes = new Map<string, number>();
  let persistenceFailures = 0;
  let httpRequestCount = 0;
  let httpRequestDurationSumMs = 0;

  return {
    recordConnection(delta) {
      socketConnections = Math.max(0, socketConnections + delta);
    },
    recordEventOutcome(category, outcome) {
      const key = `${category}:${outcome}`;
      eventOutcomes.set(key, (eventOutcomes.get(key) ?? 0) + 1);
    },
    recordPersistenceFailure() {
      persistenceFailures += 1;
    },
    recordHttpRequest(durationMs) {
      httpRequestCount += 1;
      httpRequestDurationSumMs += durationMs;
    },
    renderPrometheus(roomsByStatus) {
      const lines: string[] = [];

      lines.push('# HELP kabemjunto_socket_connections Conexões de socket ativas.');
      lines.push('# TYPE kabemjunto_socket_connections gauge');
      lines.push(`kabemjunto_socket_connections ${socketConnections}`);

      lines.push('# HELP kabemjunto_rooms_total Salas por status.');
      lines.push('# TYPE kabemjunto_rooms_total gauge');
      for (const [status, count] of Object.entries(roomsByStatus)) {
        lines.push(`kabemjunto_rooms_total{status="${status}"} ${count}`);
      }

      lines.push(
        '# HELP kabemjunto_socket_events_total Eventos de socket por categoria e resultado.',
      );
      lines.push('# TYPE kabemjunto_socket_events_total counter');
      for (const [key, count] of eventOutcomes) {
        const [category, outcome] = key.split(':');
        lines.push(
          `kabemjunto_socket_events_total{category="${category}",outcome="${outcome}"} ${count}`,
        );
      }

      lines.push(
        '# HELP kabemjunto_persistence_failures_total Falhas ao persistir snapshot de salas.',
      );
      lines.push('# TYPE kabemjunto_persistence_failures_total counter');
      lines.push(`kabemjunto_persistence_failures_total ${persistenceFailures}`);

      lines.push('# HELP kabemjunto_http_request_duration_ms Duração de requisições HTTP.');
      lines.push('# TYPE kabemjunto_http_request_duration_ms summary');
      lines.push(`kabemjunto_http_request_duration_ms_sum ${httpRequestDurationSumMs}`);
      lines.push(`kabemjunto_http_request_duration_ms_count ${httpRequestCount}`);

      return `${lines.join('\n')}\n`;
    },
  };
}

/** Registro sem efeito, usado quando ninguém injeta métricas (ex.: testes isolados de socket). */
export function createNoopMetrics(): MetricsRegistry {
  return {
    recordConnection: () => undefined,
    recordEventOutcome: () => undefined,
    recordPersistenceFailure: () => undefined,
    recordHttpRequest: () => undefined,
    renderPrometheus: () => '',
  };
}

export function registerObservabilityRoutes(
  app: FastifyInstance,
  store: RoomStore,
  metrics: MetricsRegistry,
  config: AppConfig,
): void {
  app.get('/live', async () => ({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    if (!store.probeStorageWritable()) {
      return reply.code(503).send({ status: 'unavailable', reason: 'storage_not_writable' });
    }
    return { status: 'ok' };
  });

  app.get('/metrics', async (request, reply) => {
    if (config.nodeEnv === 'production') {
      const expected = `Bearer ${config.metricsToken}`;
      if (request.headers.authorization !== expected) {
        return reply.code(401).send({ status: 'unauthorized' });
      }
    }
    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return metrics.renderPrometheus(store.roomsByStatus());
  });
}
