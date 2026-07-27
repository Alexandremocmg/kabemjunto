/**
 * Testes da state machine de turno.
 * Garante que:
 * 1. Transições válidas funcionam
 * 2. Transições inválidas são bloqueadas
 * 3. Estado terminal não tem saída
 * 4. inferirEstadoTurno() é consistente com EstadoPartida
 */

import { describe, it, expect } from 'vitest';
import {
  transicionar,
  podeTransicionar,
  iniciarStateMachine,
  inferirEstadoTurno,
  type EstadoTurno,
  type EventoTurno,
} from './state-machine.js';
import type { Carta, Cor, Acao } from '../types/card.js';
import type { EstadoPartida } from '../types/game.js';

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function cartaNum(cor: Cor, valor: number): Carta {
  return {
    id: `${valor}-${cor}`,
    cor,
    tipo: 'NUMERADA',
    valor,
    raridade: 'COMUM',
    colecao: 'test',
    efeito_texto_curto: String(valor),
    efeito_texto_longo: `${valor} ${cor}`,
  };
}

function cartaAcao(cor: Cor, acao: Acao): Carta {
  return {
    id: `${acao}-${cor}`,
    cor,
    tipo: 'ACAO',
    acao,
    raridade: 'INCOMUM',
    colecao: 'test',
    efeito_texto_curto: String(acao),
    efeito_texto_longo: String(acao),
  };
}

const j1 = 'j1';
const j2 = 'j2';

function estadoInicio(): EstadoTurno {
  return iniciarStateMachine([{ id: j1 }, { id: j2 }]);
}

// ─────────────────────────────────────────────────────────────────────
// Tabela de transições válidas
// ─────────────────────────────────────────────────────────────────────

describe('podeTransicionar() — tabela de transições', () => {
  it('INICIO_TURNO → ESPERANDO_CARTA via TURNO_INICIADO', () => {
    expect(podeTransicionar('INICIO_TURNO', 'TURNO_INICIADO')).toBe(true);
  });

  it('ESPERANDO_CARTA → VALIDANDO via CARTA_SELECIONADA', () => {
    expect(podeTransicionar('ESPERANDO_CARTA', 'CARTA_SELECIONADA')).toBe(true);
  });

  it('ESPERANDO_CARTA → COMPRANDO via CARTA_COMPRADA', () => {
    expect(podeTransicionar('ESPERANDO_CARTA', 'CARTA_COMPRADA')).toBe(true);
  });

  it('VALIDANDO → REJEITADA via CARTA_REJEITADA', () => {
    expect(podeTransicionar('VALIDANDO', 'CARTA_REJEITADA')).toBe(true);
  });

  it('VALIDANDO → RESOLVENDO_ACAO via ACAO_RESOLVIDA', () => {
    expect(podeTransicionar('VALIDANDO', 'ACAO_RESOLVIDA')).toBe(true);
  });

  it('VITORIA → FINALIZADA via PARTIDA_ABANDONADA', () => {
    expect(podeTransicionar('VITORIA', 'PARTIDA_ABANDONADA')).toBe(true);
  });

  it('FINALIZADA não tem transição de saída', () => {
    expect(podeTransicionar('FINALIZADA', 'TURNO_INICIADO')).toBe(false);
    expect(podeTransicionar('FINALIZADA', 'CARTA_SELECIONADA')).toBe(false);
    expect(podeTransicionar('FINALIZADA', 'VITORIA_DETECTADA')).toBe(false);
  });

  it('não pula estados: INICIO_TURNO → CARTA_SELECIONADA (inválido)', () => {
    expect(podeTransicionar('INICIO_TURNO', 'CARTA_SELECIONADA')).toBe(false);
  });

  it('não volta: PASSANDO_TURNO → CARTA_SELECIONADA (inválido)', () => {
    expect(podeTransicionar('PASSANDO_TURNO', 'CARTA_SELECIONADA')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// transicionar() — happy path
// ─────────────────────────────────────────────────────────────────────

describe('transicionar() — caminho feliz', () => {
  it('INICIO_TURNO → ESPERANDO_CARTA com evento de log', () => {
    const inicial = estadoInicio();
    const r = transicionar(inicial, { tipo: 'TURNO_INICIADO', jogadorId: j1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.novoEstado.tipo).toBe('ESPERANDO_CARTA');
      if (r.novoEstado.tipo === 'ESPERANDO_CARTA') {
        expect(r.novoEstado.jogadorId).toBe(j1);
      }
      expect(r.eventosEmitidos).toHaveLength(1);
      expect(r.eventosEmitidos[0]?.tipo).toBe('PARTIDA_INICIADA');
    }
  });

  it('fluxo completo de uma jogada: ESPERANDO → VALIDANDO → RESOLVENDO', () => {
    let estado: EstadoTurno = estadoInicio();
    const r1 = transicionar(estado, { tipo: 'TURNO_INICIADO', jogadorId: j1 });
    if (!r1.ok) throw new Error('setup');
    estado = r1.novoEstado;

    const carta = cartaAcao('LARANJA', 'SKIP');
    const r2 = transicionar(estado, {
      tipo: 'CARTA_SELECIONADA',
      jogadorId: j1,
      carta,
    });
    if (!r2.ok) throw new Error('selecionar');
    expect(r2.novoEstado.tipo).toBe('VALIDANDO');
    estado = r2.novoEstado;

    const r3 = transicionar(estado, { tipo: 'ACAO_RESOLVIDA', jogadorId: j1, carta });
    if (!r3.ok) throw new Error('resolver');
    expect(r3.novoEstado.tipo).toBe('RESOLVENDO_ACAO');
    if (r3.novoEstado.tipo === 'RESOLVENDO_ACAO') {
      expect(r3.novoEstado.acao).toBe('SKIP');
    }
  });

  it('rejeição volta para ESPERANDO_CARTA (UX: carta shake + escolhe outra)', () => {
    let estado: EstadoTurno = estadoInicio();
    const r1 = transicionar(estado, { tipo: 'TURNO_INICIADO', jogadorId: j1 });
    if (!r1.ok) throw new Error('setup');
    estado = r1.novoEstado;

    const cartaInvalida = cartaNum('PRETO', 7);
    const r2 = transicionar(estado, {
      tipo: 'CARTA_SELECIONADA',
      jogadorId: j1,
      carta: cartaInvalida,
    });
    if (!r2.ok) throw new Error('selecionar');
    estado = r2.novoEstado;

    const r3 = transicionar(estado, {
      tipo: 'CARTA_REJEITADA',
      jogadorId: j1,
      carta: cartaInvalida,
      motivo: 'Cor não combina',
    });
    expect(r3.ok).toBe(true);
    if (r3.ok) {
      expect(r3.novoEstado.tipo).toBe('REJEITADA');
      if (r3.novoEstado.tipo === 'REJEITADA') {
        expect(r3.novoEstado.motivo).toBe('Cor não combina');
      }
    }
  });

  it('vitória: chega em VITORIA via VITORIA_DETECTADA após resolver ação', () => {
    let estado: EstadoTurno = estadoInicio();
    const r1 = transicionar(estado, { tipo: 'TURNO_INICIADO', jogadorId: j1 });
    if (!r1.ok) throw new Error('setup1');
    estado = r1.novoEstado;

    const carta = cartaAcao('LARANJA', 'SKIP');
    const r2 = transicionar(estado, { tipo: 'CARTA_SELECIONADA', jogadorId: j1, carta });
    if (!r2.ok) throw new Error('setup2');
    estado = r2.novoEstado;

    const r3 = transicionar(estado, { tipo: 'ACAO_RESOLVIDA', jogadorId: j1, carta });
    if (!r3.ok) throw new Error('setup3');
    estado = r3.novoEstado;

    // Vitória é detectada durante a resolução da ação
    const r4 = transicionar(estado, { tipo: 'VITORIA_DETECTADA', vencedorId: j1 });
    expect(r4.ok).toBe(true);
    if (r4.ok) {
      expect(r4.novoEstado.tipo).toBe('VITORIA');
      if (r4.novoEstado.tipo === 'VITORIA') {
        expect(r4.novoEstado.vencedorId).toBe(j1);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// transicionar() — bloqueios
// ─────────────────────────────────────────────────────────────────────

describe('transicionar() — bloqueios', () => {
  it('rejeita transições inválidas com motivo explicativo', () => {
    const r = transicionar(
      { tipo: 'INICIO_TURNO', timestamp: 0 },
      { tipo: 'VITORIA_DETECTADA', vencedorId: j1 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain('INICIO_TURNO');
      expect(r.motivo).toContain('VITORIA_DETECTADA');
    }
  });

  it('FINALIZADA é estado terminal', () => {
    const estado: EstadoTurno = {
      tipo: 'FINALIZADA',
      timestamp: 0,
      motivo: 'ABANDONO',
    };
    const r = transicionar(estado, { tipo: 'TURNO_INICIADO', jogadorId: j1 });
    expect(r.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// inferirEstadoTurno() — coerência com EstadoPartida
// ─────────────────────────────────────────────────────────────────────

describe('inferirEstadoTurno()', () => {
  it('estado normal: jogador da vez ESPERANDO_CARTA', () => {
    const ep: EstadoPartida = {
      partidaId: 'p1',
      salaId: 's1',
      jogadores: [],
      monteCompra: [],
      monteDescarte: [cartaNum('LARANJA', 0)],
      vezDe: j1,
      sentido: 1,
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false },
      historico: [],
      finalizada: false,
    };
    const t = inferirEstadoTurno(ep);
    expect(t.tipo).toBe('ESPERANDO_CARTA');
    if (t.tipo === 'ESPERANDO_CARTA') {
      expect(t.jogadorId).toBe(j1);
    }
  });

  it('com ataque acumulado: COMPRANDO', () => {
    const ep: EstadoPartida = {
      partidaId: 'p1',
      salaId: 's1',
      jogadores: [],
      monteCompra: [],
      monteDescarte: [cartaAcao('LARANJA', 'MAIS_DOIS')],
      vezDe: j2,
      sentido: 1,
      corAtiva: 'LARANJA',
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_DOIS', 'MAIS_DOIS'],
      silencio: { ativo: false },
      historico: [],
      finalizada: false,
    };
    const t = inferirEstadoTurno(ep);
    expect(t.tipo).toBe('COMPRANDO');
    if (t.tipo === 'COMPRANDO') {
      expect(t.quantidade).toBe(4);
      expect(t.jogadorId).toBe(j2);
    }
  });

  it('partida finalizada: FINALIZADA', () => {
    const ep: EstadoPartida = {
      partidaId: 'p1',
      salaId: 's1',
      jogadores: [],
      monteCompra: [],
      monteDescarte: [],
      vezDe: j1,
      sentido: 1,
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false },
      historico: [],
      finalizada: true,
    };
    const t = inferirEstadoTurno(ep);
    expect(t.tipo).toBe('FINALIZADA');
  });

  it('com vencedor: VITORIA', () => {
    const ep: EstadoPartida = {
      partidaId: 'p1',
      salaId: 's1',
      jogadores: [],
      monteCompra: [],
      monteDescarte: [],
      vezDe: j1,
      sentido: 1,
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false },
      historico: [],
      finalizada: false,
      vencedor: j2,
    };
    const t = inferirEstadoTurno(ep);
    expect(t.tipo).toBe('VITORIA');
    if (t.tipo === 'VITORIA') {
      expect(t.vencedorId).toBe(j2);
    }
  });
});
