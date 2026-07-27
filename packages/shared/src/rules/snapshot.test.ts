/**
 * Testes do snapshot/restore (M12).
 * Garante que:
 * - snapshot é clone profundo (modificar um não afeta o outro)
 * - restore devolve estado idêntico
 * - JSON serialize/deserialize round-trip funciona
 * - SnapshotStack tem undo/redo
 * - diff retorna mudanças corretas
 */

import { describe, it, expect } from 'vitest';
import {
  snapshot,
  restore,
  snapshotToJSON,
  snapshotFromJSON,
  diff,
  SnapshotStack,
} from './snapshot.js';
import { criarPartidaInicial, comprarCartas } from './index.js';
import type { EstadoPartida } from '../types/game.js';
import { BARALHO_COMPLETO_108 } from '../constants/index.js';

function criarEstadoBase(): EstadoPartida {
  return criarPartidaInicial({
    baralho: BARALHO_COMPLETO_108,
    modo: 'HOTSEAT',
    totalJogadores: 2,
    idsCustomizados: ['j1', 'j2'],
  });
}

describe('snapshot()', () => {
  it('clona o estado de forma profunda', () => {
    const original = criarEstadoBase();
    const clone = snapshot(original);
    expect(clone).not.toBe(original);
    expect(clone.jogadores).not.toBe(original.jogadores);
    expect(clone.monteCompra).not.toBe(original.monteCompra);
  });

  it('clone tem os mesmos valores que o original', () => {
    const original = criarEstadoBase();
    const clone = snapshot(original);
    expect(clone.vezDe).toBe(original.vezDe);
    expect(clone.ataqueAcumulado).toBe(original.ataqueAcumulado);
    expect(clone.monteCompra.length).toBe(original.monteCompra.length);
    expect(clone.jogadores[0]?.mao.length).toBe(original.jogadores[0]?.mao.length);
  });

  it('modificar o clone não afeta o original', () => {
    const original = criarEstadoBase();
    const clone = snapshot(original);
    // Modificar o clone
    const novoEstado = comprarCartas({ estado: clone }).novoEstado;
    expect(novoEstado.jogadores[0]?.mao.length).toBe(8); // clone modificado
    expect(original.jogadores[0]?.mao.length).toBe(7); // original intacto
  });
});

describe('restore()', () => {
  it('devolve estado idêntico ao snapshot', () => {
    const original = criarEstadoBase();
    const snap = snapshot(original);
    const restaurado = restore(snap);
    expect(restaurado.vezDe).toBe(original.vezDe);
    expect(restaurado.ataqueAcumulado).toBe(original.ataqueAcumulado);
  });

  it('restore de snapshot é independente do snapshot', () => {
    const original = criarEstadoBase();
    const snap = snapshot(original);
    const restaurado = restore(snap);
    // Modificar restaurado
    if (restaurado.jogadores[0]) {
      restaurado.jogadores[0].mao.pop();
    }
    // Snapshot original intacto
    expect(snap.jogadores[0]?.mao.length).toBe(7);
  });
});

describe('snapshotToJSON() / snapshotFromJSON()', () => {
  it('round-trip preserva dados', () => {
    const original = criarEstadoBase();
    const json = snapshotToJSON(original);
    const restaurado = snapshotFromJSON(json);
    expect(restaurado.vezDe).toBe(original.vezDe);
    expect(restaurado.jogadores[0]?.mao.length).toBe(original.jogadores[0]?.mao.length);
  });

  it('JSON é uma string válida', () => {
    const original = criarEstadoBase();
    const json = snapshotToJSON(original);
    expect(typeof json).toBe('string');
    expect(json.length).toBeGreaterThan(0);
  });

  it('lança erro em JSON inválido', () => {
    expect(() => snapshotFromJSON('invalid json {{{')).toThrow();
  });
});

describe('diff()', () => {
  it('detecta mudança em vezDe', () => {
    const a = criarEstadoBase();
    const b = comprarCartas({ estado: a }).novoEstado;
    const changes = diff(a, b);
    expect(changes).toContain('vezDe');
  });

  it('detecta mudança em ataqueAcumulado', () => {
    const a = criarEstadoBase();
    // Força um estado com ataque
    const b: EstadoPartida = { ...a, ataqueAcumulado: 4, ataqueStack: ['MAIS_QUATRO'] };
    const changes = diff(a, b);
    expect(changes).toContain('ataqueAcumulado');
  });

  it('detecta mudança em monteDescarte.length', () => {
    const a = criarEstadoBase();
    const b: EstadoPartida = { ...a, monteDescarte: [...a.monteDescarte, a.monteCompra[0]!] };
    const changes = diff(a, b);
    expect(changes).toContain('monteDescarte.length');
  });

  it('retorna array vazio pra estados idênticos', () => {
    const a = criarEstadoBase();
    const b = snapshot(a);
    const changes = diff(a, b);
    expect(changes).toEqual([]);
  });
});

describe('SnapshotStack (undo/redo)', () => {
  it('inicia vazio', () => {
    const stack = new SnapshotStack();
    expect(stack.size()).toBe(0);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
    expect(stack.current()).toBeNull();
  });

  it('push adiciona snapshot', () => {
    const stack = new SnapshotStack();
    const estado = criarEstadoBase();
    stack.push(estado);
    expect(stack.size()).toBe(1);
    expect(stack.canUndo()).toBe(false); // só 1 snapshot
    expect(stack.current()).not.toBeNull();
  });

  it('push de 2 snapshots permite undo', () => {
    const stack = new SnapshotStack();
    const a = criarEstadoBase();
    const b = comprarCartas({ estado: a }).novoEstado;
    stack.push(a);
    stack.push(b);
    expect(stack.canUndo()).toBe(true);
    const anterior = stack.undo();
    expect(anterior?.jogadores[0]?.mao.length).toBe(7); // voltou pra 'a'
  });

  it('undo e redo navegam no histórico', () => {
    const stack = new SnapshotStack();
    const a = criarEstadoBase();
    const b = comprarCartas({ estado: a }).novoEstado;
    const c = comprarCartas({ estado: b }).novoEstado;
    stack.push(a);
    stack.push(b);
    stack.push(c);
    expect(stack.current()?.jogadores[0]?.mao.length).toBe(8); // c: j1=8, j2=8
    const back1 = stack.undo();
    expect(back1?.jogadores[0]?.mao.length).toBe(8); // b: mao=8
    const back2 = stack.undo();
    expect(back2?.jogadores[0]?.mao.length).toBe(7); // a: mao=7
    const forward = stack.redo();
    expect(forward?.jogadores[0]?.mao.length).toBe(8); // b: mao=8
  });

  it('push após undo trunca o future', () => {
    const stack = new SnapshotStack();
    const a = criarEstadoBase();
    const b = comprarCartas({ estado: a }).novoEstado;
    const c = criarEstadoBase(); // diferente
    stack.push(a);
    stack.push(b);
    stack.undo(); // volta pra a
    stack.push(c); // deveria truncar o 'b'
    expect(stack.canRedo()).toBe(false); // 'b' foi truncado
  });

  it('respeita maxSize', () => {
    const stack = new SnapshotStack(3);
    const a = criarEstadoBase();
    stack.push(a);
    stack.push(comprarCartas({ estado: a }).novoEstado);
    stack.push(comprarCartas({ estado: a }).novoEstado);
    stack.push(comprarCartas({ estado: a }).novoEstado); // 4º push, deveria evict o 1º
    expect(stack.size()).toBe(3);
  });

  it('clear limpa tudo', () => {
    const stack = new SnapshotStack();
    stack.push(criarEstadoBase());
    stack.clear();
    expect(stack.size()).toBe(0);
    expect(stack.current()).toBeNull();
  });
});
