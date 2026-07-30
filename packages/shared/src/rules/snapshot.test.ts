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
import { criarPartidaInicial } from './index.js';
import type { EstadoPartida } from '../types/game.js';
import { BARALHO_COMPLETO_108 } from '../constants/index.js';

function criarEstadoBase(): EstadoPartida {
  return criarPartidaInicial({
    baralho: BARALHO_COMPLETO_108,
    modo: 'HOTSEAT',
    totalJogadores: 2,
    idsCustomizados: ['j1', 'j2'],
    // Sem rng explícito o setup usaria Math.random e o baralho resultante
    // mudaria a cada execução, tornando flaky qualquer asserção sobre a
    // carta comprada.
    rng: () => 0.5,
  });
}

/** Adiciona `quantidade` cartas do monte à mão de `j1`, sem depender das regras de turno. */
function comprarParaJogador1(estado: EstadoPartida, quantidade: number): EstadoPartida {
  const compradas = estado.monteCompra.slice(-quantidade);
  return {
    ...estado,
    monteCompra: estado.monteCompra.slice(0, -quantidade),
    jogadores: estado.jogadores.map((jogador, index) =>
      index === 0 ? { ...jogador, mao: [...jogador.mao, ...compradas] } : jogador,
    ),
  };
}

function criarEstadoBaseSemAtaque(): EstadoPartida {
  const estado = criarEstadoBase();
  return { ...estado, ataqueAcumulado: 0, ataqueStack: [] };
}

describe('snapshot()', () => {
  it('clona o estado de forma profunda', () => {
    const original = criarEstadoBaseSemAtaque();
    const clone = snapshot(original);
    expect(clone).not.toBe(original);
    expect(clone.jogadores).not.toBe(original.jogadores);
    expect(clone.monteCompra).not.toBe(original.monteCompra);
  });

  it('clone tem os mesmos valores que o original', () => {
    const original = criarEstadoBaseSemAtaque();
    const clone = snapshot(original);
    expect(clone.vezDe).toBe(original.vezDe);
    expect(clone.ataqueAcumulado).toBe(original.ataqueAcumulado);
    expect(clone.monteCompra.length).toBe(original.monteCompra.length);
    expect(clone.jogadores[0]?.mao.length).toBe(original.jogadores[0]?.mao.length);
  });

  it('modificar o clone não afeta o original', () => {
    const original = criarEstadoBaseSemAtaque();
    const clone = snapshot(original);
    // Modificar o clone
    const novoEstado = comprarParaJogador1(clone, 1);
    expect(novoEstado.jogadores[0]?.mao.length).toBe(8); // clone modificado
    expect(original.jogadores[0]?.mao.length).toBe(7); // original intacto
  });
});

describe('restore()', () => {
  it('devolve estado idêntico ao snapshot', () => {
    const original = criarEstadoBaseSemAtaque();
    const snap = snapshot(original);
    const restaurado = restore(snap);
    expect(restaurado.vezDe).toBe(original.vezDe);
    expect(restaurado.ataqueAcumulado).toBe(original.ataqueAcumulado);
  });

  it('restore de snapshot é independente do snapshot', () => {
    const original = criarEstadoBaseSemAtaque();
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
    const original = criarEstadoBaseSemAtaque();
    const json = snapshotToJSON(original);
    const restaurado = snapshotFromJSON(json);
    expect(restaurado.vezDe).toBe(original.vezDe);
    expect(restaurado.jogadores[0]?.mao.length).toBe(original.jogadores[0]?.mao.length);
  });

  it('JSON é uma string válida', () => {
    const original = criarEstadoBaseSemAtaque();
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
    const a = criarEstadoBaseSemAtaque();
    const b: EstadoPartida = { ...a, vezDe: 'j2' };
    const changes = diff(a, b);
    expect(changes).toContain('vezDe');
  });

  it('detecta mudança em ataqueAcumulado', () => {
    const a = criarEstadoBaseSemAtaque();
    // Força um estado com ataque
    const b: EstadoPartida = { ...a, ataqueAcumulado: 4, ataqueStack: ['MAIS_QUATRO'] };
    const changes = diff(a, b);
    expect(changes).toContain('ataqueAcumulado');
  });

  it('detecta mudança em monteDescarte.length', () => {
    const a = criarEstadoBaseSemAtaque();
    const b: EstadoPartida = { ...a, monteDescarte: [...a.monteDescarte, a.monteCompra[0]!] };
    const changes = diff(a, b);
    expect(changes).toContain('monteDescarte.length');
  });

  it('retorna array vazio pra estados idênticos', () => {
    const a = criarEstadoBaseSemAtaque();
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
    const estado = criarEstadoBaseSemAtaque();
    stack.push(estado);
    expect(stack.size()).toBe(1);
    expect(stack.canUndo()).toBe(false); // só 1 snapshot
    expect(stack.current()).not.toBeNull();
  });

  it('push de 2 snapshots permite undo', () => {
    const stack = new SnapshotStack();
    const a = criarEstadoBaseSemAtaque();
    const b = comprarParaJogador1(a, 1);
    stack.push(a);
    stack.push(b);
    expect(stack.canUndo()).toBe(true);
    const anterior = stack.undo();
    expect(anterior?.jogadores[0]?.mao.length).toBe(7); // voltou pra 'a'
  });

  it('undo e redo navegam no histórico', () => {
    const stack = new SnapshotStack();
    const a = criarEstadoBaseSemAtaque(); // j1 = 7 cartas
    const b = comprarParaJogador1(a, 1); // j1 = 8 cartas
    const c = comprarParaJogador1(b, 1); // j1 = 9 cartas
    stack.push(a);
    stack.push(b);
    stack.push(c);
    expect(stack.current()?.jogadores[0]?.mao.length).toBe(9);
    const back1 = stack.undo();
    expect(back1?.jogadores[0]?.mao.length).toBe(8);
    const back2 = stack.undo();
    expect(back2?.jogadores[0]?.mao.length).toBe(7);
    const forward = stack.redo();
    expect(forward?.jogadores[0]?.mao.length).toBe(8);
  });

  it('push após undo trunca o future', () => {
    const stack = new SnapshotStack();
    const a = criarEstadoBaseSemAtaque();
    const b = comprarParaJogador1(a, 1);
    const c = criarEstadoBaseSemAtaque(); // diferente
    stack.push(a);
    stack.push(b);
    stack.undo(); // volta pra a
    stack.push(c); // deveria truncar o 'b'
    expect(stack.canRedo()).toBe(false); // 'b' foi truncado
  });

  it('respeita maxSize', () => {
    const stack = new SnapshotStack(3);
    const a = criarEstadoBaseSemAtaque();
    stack.push(a);
    stack.push(comprarParaJogador1(a, 1));
    stack.push(comprarParaJogador1(a, 2));
    stack.push(comprarParaJogador1(a, 3)); // 4º push, deveria evict o 1º
    expect(stack.size()).toBe(3);
  });

  it('clear limpa tudo', () => {
    const stack = new SnapshotStack();
    stack.push(criarEstadoBaseSemAtaque());
    stack.clear();
    expect(stack.size()).toBe(0);
    expect(stack.current()).toBeNull();
  });
});
