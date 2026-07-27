import { describe, it, expect } from 'vitest';
import deck108 from './deck108.json';

describe('Fixture determinística deck108.json', () => {
  it('contém exatamente 108 cartas', () => {
    expect(deck108).toHaveLength(108);
  });

  it('todas as cartas possuem ID único', () => {
    const ids = deck108.map((c) => c.id);
    const conjuntoUnico = new Set(ids);
    expect(conjuntoUnico.size).toBe(108);
  });

  it('possui exatamente 100 cartas coloridas e 8 cartas neutras', () => {
    const coloridas = deck108.filter((c) => c.tipo !== 'NEUTRA');
    const neutras = deck108.filter((c) => c.tipo === 'NEUTRA');

    expect(coloridas).toHaveLength(100);
    expect(neutras).toHaveLength(8);
  });

  it('possui 25 cartas por cor (Laranja, Azul, Verde, Preto)', () => {
    const cores = ['LARANJA', 'AZUL', 'VERDE', 'PRETO'];
    cores.forEach((cor) => {
      const doCor = deck108.filter((c) => c.cor === cor);
      expect(doCor).toHaveLength(25);
    });
  });

  it('contém a carta lendária 0+ (Zero Mais / ZEROPLUS)', () => {
    const zeroPlus = deck108.find((c) => c.id === 'NEUTRA_ZEROPLUS_1');
    expect(zeroPlus).toBeDefined();
    expect(zeroPlus?.raridade).toBe('UNICA');
  });
});
