/**
 * Snapshot e restore de EstadoPartida.
 * Função pura: clonar um estado pra histórico/undo/debug.
 *
 * ADR-005: usa `structuredClone()` (Node 17+, browsers modernos) — seguro
 * porque EstadoPartida não contém funções, apenas dados puros.
 *
 * USO:
 *   const snap = snapshot(estado);
 *   // ... user faz alguma coisa (jogar, comprar) ...
 *   const restored = restore(snap);
 *   // restored === estado original
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/structuredClone
 */

import type { EstadoPartida } from '../types/game.js';

/**
 * Cria um clone profundo do estado. Pode ser serializado como JSON
 * (útil pra persistir em localStorage, mandar pro servidor, etc).
 */
export function snapshot(estado: EstadoPartida): EstadoPartida {
  return structuredClone(estado);
}

/**
 * Restaura um estado a partir de um snapshot. Útil pra "desfazer" jogada.
 *
 * IMPORTANTE: assume que o snapshot é válido. Se quiser validar antes
 * (ex: turno correto), use `validarJogada` ou `inferirEstadoTurno`.
 */
export function restore(snapshot: EstadoPartida): EstadoPartida {
  return structuredClone(snapshot);
}

/**
 * Serializa um snapshot pra string JSON. Útil pra debug console, log, etc.
 * Lança erro se o estado não for serializável.
 */
export function snapshotToJSON(estado: EstadoPartida): string {
  return JSON.stringify(snapshot(estado));
}

/**
 * Desserializa uma string JSON num estado. Lança erro se o JSON for inválido.
 *
 * NÃO valida a estrutura — apenas faz parse. Use `inferirEstadoTurno` ou
 * outras funções do motor pra verificar sanidade.
 */
export function snapshotFromJSON(json: string): EstadoPartida {
  return JSON.parse(json) as EstadoPartida;
}

/**
 * Diff entre dois snapshots. Retorna uma lista de mudanças (campos que diferem).
 * Útil pra debug visual: "o que mudou entre o turno anterior e este?".
 *
 * ATUALMENTE: shallow diff no top-level. Comparações profundas (jogadores.mao, etc)
 * são marcadas como "changed" mas não detalham o quê.
 */
export function diff(a: EstadoPartida, b: EstadoPartida): ReadonlyArray<string> {
  const changes: string[] = [];
  if (a.partidaId !== b.partidaId) changes.push('partidaId');
  if (a.salaId !== b.salaId) changes.push('salaId');
  if (a.vezDe !== b.vezDe) changes.push('vezDe');
  if (a.sentido !== b.sentido) changes.push('sentido');
  if (a.corAtiva !== b.corAtiva) changes.push('corAtiva');
  if (a.ataqueAcumulado !== b.ataqueAcumulado) changes.push('ataqueAcumulado');
  if (a.finalizada !== b.finalizada) changes.push('finalizada');
  if (a.vencedor !== b.vencedor) changes.push('vencedor');
  if (a.silencio.ativo !== b.silencio.ativo) changes.push('silencio.ativo');
  if (a.monteCompra.length !== b.monteCompra.length) changes.push('monteCompra.length');
  if (a.monteDescarte.length !== b.monteDescarte.length) changes.push('monteDescarte.length');
  for (let i = 0; i < Math.max(a.jogadores.length, b.jogadores.length); i++) {
    if (a.jogadores[i]?.mao.length !== b.jogadores[i]?.mao.length) {
      changes.push(`jogadores[${i}].mao.length`);
    }
  }
  return changes;
}

/**
 * Histórico de snapshots com undo/redo limitado.
 * Útil pra "Ctrl+Z" em debug.
 */
export class SnapshotStack {
  private stack: EstadoPartida[] = [];
  private index = -1;
  constructor(
    /** Máximo de snapshots no histórico. Default 50. */
    private readonly maxSize: number = 50,
  ) {}

  push(estado: EstadoPartida): void {
    // Trunca o "future" se estamos no meio do stack
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(snapshot(estado));
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  undo(): EstadoPartida | null {
    if (!this.canUndo()) return null;
    this.index--;
    const snap = this.stack[this.index];
    return snap ? snapshot(snap) : null;
  }

  redo(): EstadoPartida | null {
    if (!this.canRedo()) return null;
    this.index++;
    const snap = this.stack[this.index];
    return snap ? snapshot(snap) : null;
  }

  current(): EstadoPartida | null {
    const snap = this.stack[this.index];
    return snap ? snapshot(snap) : null;
  }

  clear(): void {
    this.stack = [];
    this.index = -1;
  }

  size(): number {
    return this.stack.length;
  }
}
