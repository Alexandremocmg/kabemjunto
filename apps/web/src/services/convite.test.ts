import { describe, expect, it } from 'vitest';
import { codigoDoConvite, linkDoJogo } from './convite';

describe('convite', () => {
  it('aceita só 4 a 6 letras/números', () => {
    expect(codigoDoConvite('?sala=abc234')).toBe('ABC234');
    expect(codigoDoConvite('?mesa=2d&sala=MOHP')).toBe('MOHP');
    for (const ruim of ['', '?sala=', '?sala=abc', '?sala=ABCDEFG', '?sala=AB-12', '?sala=<b>12'])
      expect(codigoDoConvite(ruim)).toBeUndefined();
  });

  it('monta o link com ou sem o código', () => {
    expect(linkDoJogo('ABC234', 'https://jogo.test/')).toBe('https://jogo.test/?sala=ABC234');
    expect(linkDoJogo(undefined, 'https://jogo.test/')).toBe('https://jogo.test/');
    expect(linkDoJogo('a b', 'https://jogo.test/')).toBe('https://jogo.test/');
  });
});
