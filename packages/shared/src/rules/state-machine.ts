/**
 * State machine de turno do Kabemjunto.
 * Fonte canônica: GDD §02.5 (loop de turno).
 *
 * POR QUE STATE MACHINE EXPLÍCITA:
 * - Permite testar cada transição isoladamente
 * - Impossibilita estados inválidos (TypeScript enforce)
 * - Facilita debug visual (UI mostra "ESTADO: ESPERANDO CARTA")
 * - Facilita telemetria (cada transição vira evento)
 *
 * ESTADOS (8 do GDD):
 *
 *   INICIO_TURNO
 *      ↓
 *   ESPERANDO_CARTA ─────┐
 *      ↓                  │
 *   VALIDANDO            │
 *      ↓                  │
 *   REJEITADA ───────────┘
 *      ↓
 *   RESOLVENDO_ACAO
 *      ↓
 *   PASSANDO_TURNO
 *      ↓
 *   INICIO_TURNO (próximo jogador)
 *
 *   ESTADO_ALTERNATIVO: COMPRANDO (quando não tem carta válida)
 *      ↓
 *   PASSANDO_TURNO
 *
 *   ESTADO_FINAL: VITORIA / FINALIZADA
 */

import type { Carta, Acao, Cor } from '../types/card.js';
import type { EstadoPartida, EventoPartida } from '../types/game.js';
import type { JogadorId } from '../types/player.js';

/** Estado atual do turno. */
export type EstadoTurno =
  | { tipo: 'INICIO_TURNO'; timestamp: number }
  | { tipo: 'ESPERANDO_CARTA'; timestamp: number; jogadorId: JogadorId }
  | { tipo: 'VALIDANDO'; timestamp: number; jogadorId: JogadorId; carta: Carta }
  | { tipo: 'REJEITADA'; timestamp: number; jogadorId: JogadorId; carta: Carta; motivo: string }
  | { tipo: 'RESOLVENDO_ACAO'; timestamp: number; jogadorId: JogadorId; carta: Carta; acao?: Acao }
  | { tipo: 'COMPRANDO'; timestamp: number; jogadorId: JogadorId; quantidade: number }
  | { tipo: 'PASSANDO_TURNO'; timestamp: number; jogadorAnterior: JogadorId; jogadorProximo: JogadorId }
  | { tipo: 'VITORIA'; timestamp: number; vencedorId: JogadorId }
  | { tipo: 'FINALIZADA'; timestamp: number; motivo: 'VITORIA' | 'ABANDONO' | 'TIMEOUT' };

/** Evento que dispara uma transição. */
export type EventoTurno =
  | { tipo: 'TURNO_INICIADO'; jogadorId: JogadorId }
  | { tipo: 'CARTA_SELECIONADA'; jogadorId: JogadorId; carta: Carta; corEscolhida?: Exclude<Cor, 'NEUTRO'> }
  | { tipo: 'CARTA_REJEITADA'; jogadorId: JogadorId; carta: Carta; motivo: string }
  | { tipo: 'CARTA_COMPRADA'; jogadorId: JogadorId; quantidade: number }
  | { tipo: 'ACAO_RESOLVIDA'; jogadorId: JogadorId; carta: Carta }
  | { tipo: 'VITORIA_DETECTADA'; vencedorId: JogadorId }
  | { tipo: 'PARTIDA_ABANDONADA' | 'TURNO_TIMEOUT' };

/** Resultado de uma transição. */
export type ResultadoTransicao =
  | { ok: true; novoEstado: EstadoTurno; eventosEmitidos: EventoPartida[] }
  | { ok: false; motivo: string };

/** Tabela de transições válidas (declarativa, type-checked). */
const TRANSICOES_VALIDAS: Readonly<Record<EstadoTurno['tipo'], ReadonlyArray<EventoTurno['tipo']>>> = {
  INICIO_TURNO: ['TURNO_INICIADO'],
  ESPERANDO_CARTA: ['CARTA_SELECIONADA', 'CARTA_COMPRADA', 'PARTIDA_ABANDONADA', 'TURNO_TIMEOUT'],
  VALIDANDO: ['CARTA_REJEITADA', 'ACAO_RESOLVIDA', 'PARTIDA_ABANDONADA', 'TURNO_TIMEOUT'],
  REJEITADA: ['CARTA_SELECIONADA', 'CARTA_COMPRADA', 'PARTIDA_ABANDONADA', 'TURNO_TIMEOUT'],
  RESOLVENDO_ACAO: ['ACAO_RESOLVIDA', 'VITORIA_DETECTADA', 'PARTIDA_ABANDONADA', 'TURNO_TIMEOUT'],
  COMPRANDO: ['CARTA_SELECIONADA', 'ACAO_RESOLVIDA', 'PARTIDA_ABANDONADA', 'TURNO_TIMEOUT'],
  PASSANDO_TURNO: ['TURNO_INICIADO', 'VITORIA_DETECTADA'],
  VITORIA: ['PARTIDA_ABANDONADA'], // uma vez em VITORIA, só pode ser abandonada
  FINALIZADA: [], // estado terminal
};

/**
 * Verifica se uma transição é válida.
 */
export function podeTransicionar(de: EstadoTurno['tipo'], evento: EventoTurno['tipo']): boolean {
  return TRANSICOES_VALIDAS[de].includes(evento);
}

/**
 * Aplica uma transição ao estado atual.
 * Lança erro se a transição for inválida (use `podeTransicionar` antes se quiser checar).
 *
 * @returns o novo EstadoTurno + eventos de log para o histórico da partida
 */
export function transicionar(estadoAtual: EstadoTurno, evento: EventoTurno): ResultadoTransicao {
  if (!podeTransicionar(estadoAtual.tipo, evento.tipo)) {
    return {
      ok: false,
      motivo: `Transição inválida: ${estadoAtual.tipo} → ${evento.tipo}`,
    };
  }

  const ts = Date.now();
  const eventosEmitidos: EventoPartida[] = [];

  switch (evento.tipo) {
    case 'TURNO_INICIADO':
      eventosEmitidos.push({
        tipo: 'PARTIDA_INICIADA',
        timestamp: ts,
        jogadores: [evento.jogadorId],
      });
      return {
        ok: true,
        novoEstado: { tipo: 'ESPERANDO_CARTA', timestamp: ts, jogadorId: evento.jogadorId },
        eventosEmitidos,
      };

    case 'CARTA_SELECIONADA':
      if (estadoAtual.tipo !== 'ESPERANDO_CARTA' && estadoAtual.tipo !== 'REJEITADA' && estadoAtual.tipo !== 'COMPRANDO') {
        return { ok: false, motivo: `Não pode selecionar carta em ${estadoAtual.tipo}` };
      }
      return {
        ok: true,
        novoEstado: {
          tipo: 'VALIDANDO',
          timestamp: ts,
          jogadorId: evento.jogadorId,
          carta: evento.carta,
        },
        eventosEmitidos,
      };

    case 'CARTA_REJEITADA':
      if (estadoAtual.tipo !== 'VALIDANDO') {
        return { ok: false, motivo: `Não pode rejeitar em ${estadoAtual.tipo}` };
      }
      return {
        ok: true,
        novoEstado: {
          tipo: 'REJEITADA',
          timestamp: ts,
          jogadorId: evento.jogadorId,
          carta: evento.carta,
          motivo: evento.motivo,
        },
        eventosEmitidos,
      };

    case 'CARTA_COMPRADA':
      if (estadoAtual.tipo !== 'ESPERANDO_CARTA' && estadoAtual.tipo !== 'REJEITADA') {
        return { ok: false, motivo: `Não pode comprar em ${estadoAtual.tipo}` };
      }
      eventosEmitidos.push({
        tipo: 'CARTA_COMPRADA',
        timestamp: ts,
        jogadorId: evento.jogadorId,
        cartaId: '', // preenchido pelo motor
        origem: 'NORMAL',
      });
      return {
        ok: true,
        novoEstado: {
          tipo: 'COMPRANDO',
          timestamp: ts,
          jogadorId: evento.jogadorId,
          quantidade: evento.quantidade,
        },
        eventosEmitidos,
      };

    case 'ACAO_RESOLVIDA':
      if (estadoAtual.tipo === 'VALIDANDO' || estadoAtual.tipo === 'COMPRANDO') {
        eventosEmitidos.push({
          tipo: 'ACAO_RESOLVIDA',
          timestamp: ts,
          acao: evento.carta.acao ?? 'SKIP', // fallback, mas idealmente acao é obrigatório
        });
        return {
          ok: true,
          novoEstado: {
            tipo: 'RESOLVENDO_ACAO',
            timestamp: ts,
            jogadorId: evento.jogadorId,
            carta: evento.carta,
            ...(evento.carta.acao !== undefined ? { acao: evento.carta.acao } : {}),
          },
          eventosEmitidos,
        };
      }
      return { ok: false, motivo: `Não pode resolver ação em ${estadoAtual.tipo}` };

    case 'VITORIA_DETECTADA':
      eventosEmitidos.push({
        tipo: 'VITORIA',
        timestamp: ts,
        vencedorId: evento.vencedorId,
      });
      return {
        ok: true,
        novoEstado: { tipo: 'VITORIA', timestamp: ts, vencedorId: evento.vencedorId },
        eventosEmitidos,
      };

    case 'PARTIDA_ABANDONADA':
      eventosEmitidos.push({
        tipo: 'PARTIDA_FINALIZADA',
        timestamp: ts,
        motivo: 'ABANDONO',
      });
      return {
        ok: true,
        novoEstado: { tipo: 'FINALIZADA', timestamp: ts, motivo: 'ABANDONO' },
        eventosEmitidos,
      };

    case 'TURNO_TIMEOUT':
      eventosEmitidos.push({
        tipo: 'PARTIDA_FINALIZADA',
        timestamp: ts,
        motivo: 'TIMEOUT',
      });
      return {
        ok: true,
        novoEstado: { tipo: 'FINALIZADA', timestamp: ts, motivo: 'TIMEOUT' },
        eventosEmitidos,
      };
  }
}

/**
 * Inicializa a state machine no começo de uma partida.
 */
export function iniciarStateMachine(jogadores: ReadonlyArray<{ id: JogadorId }>): EstadoTurno {
  const primeiro = jogadores[0];
  if (!primeiro) throw new Error('Partida sem jogadores');
  return {
    tipo: 'INICIO_TURNO',
    timestamp: Date.now(),
  };
}

/**
 * Integração com a partida: dado o EstadoPartida, qual o EstadoTurno equivalente?
 * Útil para UI mostrar o estado atual, debug, telemetria.
 */
export function inferirEstadoTurno(estado: EstadoPartida): EstadoTurno {
  if (estado.finalizada) {
    return {
      tipo: 'FINALIZADA',
      timestamp: Date.now(),
      motivo: 'VITORIA', // simplificação
    };
  }
  if (estado.vencedor) {
    return {
      tipo: 'VITORIA',
      timestamp: Date.now(),
      vencedorId: estado.vencedor,
    };
  }
  if (estado.ataqueAcumulado > 0) {
    return {
      tipo: 'COMPRANDO',
      timestamp: Date.now(),
      jogadorId: estado.vezDe,
      quantidade: estado.ataqueAcumulado,
    };
  }
  return {
    tipo: 'ESPERANDO_CARTA',
    timestamp: Date.now(),
    jogadorId: estado.vezDe,
  };
}
