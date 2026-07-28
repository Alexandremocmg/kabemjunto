import { describe, expect, it } from 'vitest';
import { createMetricsRegistry, createNoopMetrics } from './observability.js';

describe('createMetricsRegistry', () => {
  it('expõe conexões atuais como gauge e nunca deixa negativo', () => {
    const metrics = createMetricsRegistry();
    metrics.recordConnection(1);
    metrics.recordConnection(1);
    metrics.recordConnection(-1);
    metrics.recordConnection(-1);
    metrics.recordConnection(-1); // não deve ficar negativo

    const text = metrics.renderPrometheus({});
    expect(text).toContain('kabemjunto_socket_connections 0');
  });

  it('conta salas por status recebido, sem depender de estado interno', () => {
    const metrics = createMetricsRegistry();
    const text = metrics.renderPrometheus({ AGUARDANDO: 2, EM_PARTIDA: 1, FINALIZADA: 0 });
    expect(text).toContain('kabemjunto_rooms_total{status="AGUARDANDO"} 2');
    expect(text).toContain('kabemjunto_rooms_total{status="EM_PARTIDA"} 1');
  });

  it('agrega eventos aceitos/rejeitados por categoria de baixa cardinalidade', () => {
    const metrics = createMetricsRegistry();
    metrics.recordEventOutcome('jogo', 'accepted');
    metrics.recordEventOutcome('jogo', 'accepted');
    metrics.recordEventOutcome('jogo', 'rejected');
    metrics.recordEventOutcome('sala', 'accepted');

    const text = metrics.renderPrometheus({});
    expect(text).toContain('kabemjunto_socket_events_total{category="jogo",outcome="accepted"} 2');
    expect(text).toContain('kabemjunto_socket_events_total{category="jogo",outcome="rejected"} 1');
    expect(text).toContain('kabemjunto_socket_events_total{category="sala",outcome="accepted"} 1');
  });

  it('conta falhas de persistência', () => {
    const metrics = createMetricsRegistry();
    metrics.recordPersistenceFailure();
    metrics.recordPersistenceFailure();
    expect(metrics.renderPrometheus({})).toContain('kabemjunto_persistence_failures_total 2');
  });

  it('acumula soma e contagem de latência HTTP (summary)', () => {
    const metrics = createMetricsRegistry();
    metrics.recordHttpRequest(10);
    metrics.recordHttpRequest(20);
    const text = metrics.renderPrometheus({});
    expect(text).toContain('kabemjunto_http_request_duration_ms_sum 30');
    expect(text).toContain('kabemjunto_http_request_duration_ms_count 2');
  });

  it('nunca inclui identificadores dinâmicos (nome, salaId, jogadorId, socketId, chat) nos labels', () => {
    const metrics = createMetricsRegistry();
    metrics.recordEventOutcome('chat', 'accepted');
    metrics.recordConnection(1);
    const text = metrics.renderPrometheus({ AGUARDANDO: 1 });
    for (const forbidden of ['jogadorId', 'socketId', 'salaId=', 'nome=']) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('createNoopMetrics', () => {
  it('não lança e não acumula nada', () => {
    const metrics = createNoopMetrics();
    expect(() => {
      metrics.recordConnection(1);
      metrics.recordEventOutcome('jogo', 'accepted');
      metrics.recordPersistenceFailure();
      metrics.recordHttpRequest(5);
    }).not.toThrow();
    expect(metrics.renderPrometheus({})).toBe('');
  });
});
