import { describe, expect, it } from 'vitest';
import type { Carta } from '@kabemjunto/shared';
import { escolherDica, TODAS_AS_DICAS, type ContextoDica, type TipoDica } from './dicas';

function numerada(id: string, cor: Exclude<Carta['cor'], 'NEUTRO'>, valor: number): Carta {
  return {
    id,
    tipo: 'NUMERADA',
    cor,
    valor,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: `${valor}`,
    efeito_texto_longo: `Carta ${valor}`,
  };
}

const zeroMais: Carta = {
  id: 'zero',
  tipo: 'NEUTRA',
  cor: 'NEUTRO',
  acao: 'ZERO_MAIS',
  raridade: 'UNICA',
  colecao: 'base-v1',
  efeito_texto_curto: '0+',
  efeito_texto_longo: '0+',
};

const azul = (carta: Carta) => carta.cor === 'AZUL';

function contexto(parcial: Partial<ContextoDica> = {}): ContextoDica {
  return {
    minhaVez: true,
    silencioAtivo: false,
    ataqueAcumulado: 0,
    podeComprar: false,
    ocupada: false,
    mao: [numerada('a', 'AZUL', 3), numerada('v', 'VERDE', 8)],
    ehJogavel: azul,
    ...parcial,
  };
}

const nenhuma: ReadonlySet<TipoDica> = new Set();

describe('escolherDica', () => {
  it('na primeira vez com carta jogável, ensina a arrastar', () => {
    expect(escolherDica(contexto(), nenhuma)).toBe('arrastar');
  });

  it('cada dica aparece uma vez só', () => {
    expect(escolherDica(contexto(), new Set<TipoDica>(['arrastar']))).toBeUndefined();
    expect(escolherDica(contexto(), TODAS_AS_DICAS)).toBeUndefined();
  });

  it('silêncio e ataque têm prioridade sobre o resto', () => {
    expect(escolherDica(contexto({ silencioAtivo: true }), nenhuma)).toBe('silencio');
    expect(escolherDica(contexto({ ataqueAcumulado: 4 }), nenhuma)).toBe('ataque');
  });

  it('cartas de mesma face jogáveis pedem a dica de grupo', () => {
    const mao = [numerada('6a', 'AZUL', 6), numerada('6v', 'VERDE', 6)];
    expect(escolherDica(contexto({ mao }), new Set<TipoDica>(['arrastar']))).toBe('grupo');
  });

  it('ter o 0+ na mão explica o reflexo, mesmo fora da vez', () => {
    const mao = [numerada('v', 'VERDE', 8), zeroMais];
    expect(escolherDica(contexto({ minhaVez: false, mao }), nenhuma)).toBe('zero-mais');
  });

  it('sem carta que sirva, ensina a comprar', () => {
    const mao = [numerada('v', 'VERDE', 8)];
    expect(escolherDica(contexto({ mao, podeComprar: true }), nenhuma)).toBe('monte');
  });

  it('não interrompe uma escolha em andamento (cor, alvo, envio, Corta-Frente)', () => {
    expect(escolherDica(contexto({ ocupada: true, silencioAtivo: true }), nenhuma)).toBeUndefined();
  });

  it('fora da vez, só silêncio e 0+ podem aparecer', () => {
    expect(escolherDica(contexto({ minhaVez: false }), nenhuma)).toBeUndefined();
    expect(escolherDica(contexto({ minhaVez: false, silencioAtivo: true }), nenhuma)).toBe(
      'silencio',
    );
  });
});
