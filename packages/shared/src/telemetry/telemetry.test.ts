/**
 * Testes do módulo de telemetria.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  configureTelemetry,
  getTelemetryConfig,
  logEvent,
  logEvents,
  logCustom,
  makeContext,
  consoleSink,
  noopSink,
  type TelemetryEvent,
  type TelemetrySink,
} from './telemetry.js';
import type { EventoPartida, EstadoPartida } from '../types/game.js';

describe('configureTelemetry()', () => {
  beforeEach(() => {
    configureTelemetry({ enabled: false, sampleRate: 1.0, sink: consoleSink });
  });

  it('liga/desliga telemetria', () => {
    expect(getTelemetryConfig().enabled).toBe(false);
    configureTelemetry({ enabled: true });
    expect(getTelemetryConfig().enabled).toBe(true);
    configureTelemetry({ enabled: false });
    expect(getTelemetryConfig().enabled).toBe(false);
  });

  it('atualiza sample rate', () => {
    configureTelemetry({ sampleRate: 0.5 });
    expect(getTelemetryConfig().sampleRate).toBe(0.5);
  });

  it('troca sink', () => {
    configureTelemetry({ sink: noopSink });
    expect(getTelemetryConfig().sink.name).toBe('noop');
  });

  it('getTelemetryConfig retorna objeto frozen', () => {
    const config = getTelemetryConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });
});

describe('logEvent()', () => {
  let sinkEvents: TelemetryEvent[];
  let mockSink: TelemetrySink;

  beforeEach(() => {
    sinkEvents = [];
    mockSink = {
      name: 'mock',
      emit: (event) => {
        sinkEvents.push(event);
      },
    };
    configureTelemetry({ enabled: true, sampleRate: 1.0, sink: mockSink });
  });

  it('despacha evento quando enabled', () => {
    logEvent({
      tipo: 'CARTA_JOGADA',
      timestamp: 1000,
      jogadorId: 'j1',
      cartaId: '0-LARANJA',
    });
    expect(sinkEvents).toHaveLength(1);
    expect(sinkEvents[0]?.tipo).toBe('CARTA_JOGADA');
  });

  it('NÃO despacha quando enabled=false', () => {
    configureTelemetry({ enabled: false, sink: mockSink });
    logEvent({ tipo: 'VITORIA', timestamp: 1, vencedorId: 'j1' });
    expect(sinkEvents).toHaveLength(0);
  });

  it('respeita sampleRate (0 = nada, 1 = tudo)', () => {
    configureTelemetry({ sampleRate: 0, sink: mockSink });
    logEvent({ tipo: 'VITORIA', timestamp: 1, vencedorId: 'j1' });
    expect(sinkEvents).toHaveLength(0);
  });

  it('extrai propriedades específicas por tipo', () => {
    logEvent({
      tipo: 'ATAQUE_REFLETIDO_ZERO_MAIS',
      timestamp: 1000,
      origem: 'j1',
      alvo: 'j2',
      cartasDevolvidas: 4,
    });
    expect(sinkEvents[0]?.properties).toEqual({
      origem: 'j1',
      alvo: 'j2',
      cartas: 4,
    });
  });

  it('inclui contexto se configurado', () => {
    configureTelemetry({ context: { partidaId: 'p1', modo: 'ONLINE' } });
    logEvent({ tipo: 'VITORIA', timestamp: 1, vencedorId: 'j1' });
    expect(sinkEvents[0]?.context.partidaId).toBe('p1');
    expect(sinkEvents[0]?.context.modo).toBe('ONLINE');
  });

  it('erro no sink não derruba o app', () => {
    const brokenSink: TelemetrySink = {
      name: 'broken',
      emit: () => {
        throw new Error('sink failed');
      },
    };
    configureTelemetry({ sink: brokenSink });
    // Não deve lançar
    expect(() => logEvent({ tipo: 'VITORIA', timestamp: 1, vencedorId: 'j1' })).not.toThrow();
  });

  it('erro em sink async é capturado', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const asyncSink: TelemetrySink = {
      name: 'async-fail',
      emit: async () => {
        throw new Error('async fail');
      },
    };
    configureTelemetry({ sink: asyncSink });
    logEvent({ tipo: 'VITORIA', timestamp: 1, vencedorId: 'j1' });
    // Espera o microtask rodar
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('logEvents()', () => {
  it('despacha batch de eventos', () => {
    const sinkEvents: TelemetryEvent[] = [];
    configureTelemetry({
      enabled: true,
      sink: { name: 'mock', emit: (e) => sinkEvents.push(e) },
    });

    const eventos: EventoPartida[] = [
      { tipo: 'CARTA_JOGADA', timestamp: 1, jogadorId: 'j1', cartaId: '0-LARANJA' },
      { tipo: 'CARTA_JOGADA', timestamp: 2, jogadorId: 'j2', cartaId: '5-AZUL' },
      { tipo: 'VITORIA', timestamp: 3, vencedorId: 'j1' },
    ];
    logEvents(eventos);
    expect(sinkEvents).toHaveLength(3);
  });
});

describe('logCustom()', () => {
  it('emite evento custom (não do motor)', () => {
    const sinkEvents: TelemetryEvent[] = [];
    configureTelemetry({
      enabled: true,
      sink: { name: 'mock', emit: (e) => sinkEvents.push(e) },
    });
    logCustom('CARTA_CLICADA', { cartaId: '0-LARANJA' });
    expect(sinkEvents).toHaveLength(1);
    expect(sinkEvents[0]?.tipo).toBe('CARTA_CLICADA');
  });
});

describe('makeContext()', () => {
  it('extrai context do estado', () => {
    const estado: EstadoPartida = {
      partidaId: 'p1',
      salaId: 's1',
      jogadores: [{}, {}] as never,
      monteCompra: [],
      monteDescarte: [],
      vezDe: 'j1',
      sentido: 1,
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false },
      historico: [],
      finalizada: false,
    };
    const ctx = makeContext(estado);
    expect(ctx.partidaId).toBe('p1');
    expect(ctx.salaId).toBe('s1');
    expect(ctx.totalJogadores).toBe(2);
  });
});

describe('no-op / default behavior', () => {
  it('config default: enabled=false', () => {
    // Reset
    configureTelemetry({ enabled: false });
    expect(getTelemetryConfig().enabled).toBe(false);
  });

  it('logCustom com sink noop não quebra', () => {
    configureTelemetry({ enabled: true, sink: noopSink });
    expect(() => logCustom('TEST', {})).not.toThrow();
  });
});
