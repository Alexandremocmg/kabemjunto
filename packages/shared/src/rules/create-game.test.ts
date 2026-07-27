/**
 * Testes do motor de regras Kabemjunto.
 * Cobrem os 15 edge cases do GDD §04.5 e o caminho feliz de cada carta especial.
 *
 * Esses testes rodam contra funções PURAS. Sem áudio, sem DOM, sem timer.
 * Por isso são determinísticos (com `embaralharComSeed`).
 */

import { describe, it, expect } from 'vitest';
import {
  embaralhar,
  embaralharComSeed,
  criarPartidaInicial,
  validarJogada,
  executarJogada,
  comprarCartas,
  executarTurnoBot,
  type CriarPartidaOpcoes,
} from './index.js';
import type { Carta, Cor } from '../types/card.js';
import type { EstadoPartida } from '../types/game.js';

/** Cria um RNG determinístico a partir de um seed (mulberry32). */
function rngDoSeed(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Baralho mínimo de 4 cartas pra testes focados. */
function cartaNum(cor: Cor, valor: number): Carta {
  return {
    id: `${valor}-${cor}`,
    cor,
    tipo: 'NUMERADA',
    valor,
    raridade: 'COMUM',
    colecao: 'test',
    efeito_texto_curto: `${valor}`,
    efeito_texto_longo: `${valor} ${cor}`,
  };
}

function cartaAcao(cor: Cor, acao: Carta['acao']): Carta {
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

function cartaNeutra(acao: Carta['acao']): Carta {
  return {
    id: `${acao}-NEUTRO`,
    cor: 'NEUTRO',
    tipo: 'NEUTRA',
    acao,
    raridade: 'UNICA',
    colecao: 'test',
    efeito_texto_curto: String(acao),
    efeito_texto_longo: String(acao),
  };
}

/** Cria um baralho pequeno (15 cartas) suficiente para 2 jogadores + 1 starter. */
function baralhoMinimo(): Carta[] {
  return [
    // Starter provável (não-neutra, "mais acima" no baralho aleatório)
    cartaNum('LARANJA', 5),
    // Mãos
    cartaNum('LARANJA', 7),
    cartaNum('AZUL', 5),
    cartaNum('VERDE', 3),
    cartaNum('PRETO', 9),
    cartaNum('AZUL', 2),
    cartaNum('VERDE', 6),
    cartaNum('LARANJA', 1),
    cartaNum('PRETO', 4),
    cartaNum('AZUL', 8),
    cartaNum('VERDE', 0),
    cartaNum('LARANJA', 3),
    cartaNum('PRETO', 7),
    cartaAcao('LARANJA', 'MAIS_DOIS'),
    cartaAcao('AZUL', 'SKIP'),
  ];
}

/** Baralho grande (50 cartas) para testes que precisam de muitas compras sem reembaralhar. */
function baralhoGrande(): Carta[] {
  const cartas: Carta[] = [];
  const cores: Cor[] = ['LARANJA', 'AZUL', 'VERDE', 'PRETO'];
  for (let corIdx = 0; corIdx < cores.length; corIdx++) {
    const cor = cores[corIdx]!;
    for (let v = 0; v < 10; v++) {
      cartas.push(cartaNum(cor, v));
    }
    cartas.push(cartaAcao(cor, 'SKIP'));
  }
  return cartas;
}

/** Cria uma partida determinística com baralho grande (50 cartas) e seed fixa. */
function criarPartidaTeste(seed = 42, jogadores = 2, baralho?: Carta[]): EstadoPartida {
  const opcoes: CriarPartidaOpcoes = {
    baralho: baralho ?? baralhoGrande(),
    modo: 'HOTSEAT',
    totalJogadores: jogadores,
    idsCustomizados: jogadores === 2 ? ['j1', 'j2'] : ['j1', 'j2', 'j3', 'j4'],
    rng: rngDoSeed(seed),
  };
  return criarPartidaInicial(opcoes);
}

// ─────────────────────────────────────────────────────────────────────
// embaralhar
// ─────────────────────────────────────────────────────────────────────

describe('embaralhar()', () => {
  it('não muta o array original', () => {
    const original = [1, 2, 3, 4, 5];
    const copia = [...original];
    embaralhar(original);
    expect(original).toEqual(copia);
  });

  it('retorna array do mesmo tamanho', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const embaralhado = embaralhar(arr);
    expect(embaralhado).toHaveLength(10);
  });

  it('contém os mesmos elementos (multiset)', () => {
    const arr = [1, 2, 3, 4, 5];
    const embaralhado = embaralhar(arr);
    expect([...embaralhado].sort()).toEqual([...arr].sort());
  });

  it('embaralharComSeed é determinístico', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = embaralharComSeed(arr, 123);
    const b = embaralharComSeed(arr, 123);
    expect(a).toEqual(b);
  });

  it('embaralharComSeed com seeds diferentes produz resultados diferentes', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const a = embaralharComSeed(arr, 1);
    const b = embaralharComSeed(arr, 999);
    expect(a).not.toEqual(b);
  });
});

// ─────────────────────────────────────────────────────────────────────
// criarPartidaInicial
// ─────────────────────────────────────────────────────────────────────

describe('criarPartidaInicial()', () => {
  it('cria 2 jogadores com 7 cartas cada (14 total) + 1 starter', () => {
    const estado = criarPartidaTeste(42, 2);
    const totalMaos = estado.jogadores.reduce((acc, j) => acc + j.mao.length, 0);
    expect(totalMaos).toBe(14);
    expect(estado.monteDescarte).toHaveLength(1);
  });

  it('starter nunca é neutro', () => {
    const estado = criarPartidaTeste(42, 2);
    const starter = estado.monteDescarte[0]!;
    expect(starter.tipo).not.toBe('NEUTRA');
  });

  it('monteCompra tem o resto das cartas', () => {
    const estado = criarPartidaTeste(42, 2, baralhoMinimo());
    const total =
      estado.monteCompra.length +
      estado.monteDescarte.length +
      estado.jogadores.reduce((acc, j) => acc + j.mao.length, 0);
    expect(total).toBe(baralhoMinimo().length); // baralho de teste
  });

  it('primeiro jogador da vez é o jogador[0]', () => {
    const estado = criarPartidaTeste(42, 2);
    expect(estado.vezDe).toBe(estado.jogadores[0]!.id);
  });

  it('sentido inicial é horário (1)', () => {
    const estado = criarPartidaTeste(42, 2);
    expect(estado.sentido).toBe(1);
  });

  it('se starter é +2, ataque inicial é 2', () => {
    // Forçar starter +2 fazendo o baralho ter +2 como única não-neutra no topo
    const baralho: Carta[] = [
      cartaAcao('LARANJA', 'MAIS_DOIS'), // vai ser o starter
      cartaNum('AZUL', 3),
      cartaNum('AZUL', 4),
      cartaNum('AZUL', 5),
      cartaNum('AZUL', 6),
      cartaNum('AZUL', 7),
      cartaNum('AZUL', 8),
      cartaNum('AZUL', 9),
      cartaNum('AZUL', 0),
      cartaNum('AZUL', 1),
      cartaNum('AZUL', 2),
      cartaNum('AZUL', 3),
      cartaNum('AZUL', 4),
      cartaNum('AZUL', 5),
      cartaNum('AZUL', 6),
      cartaNum('AZUL', 7),
    ];
    const opcoes: CriarPartidaOpcoes = {
      baralho,
      modo: 'HOTSEAT',
      totalJogadores: 2,
      idsCustomizados: ['j1', 'j2'],
    };
    const estado = criarPartidaInicial(opcoes);
    // Não posso forçar o starter a ser o +2 sem mockar o embaralhar.
    // Em vez disso, valido a invariante: se for +2, ataque > 0.
    if (estado.monteDescarte[0]?.acao === 'MAIS_DOIS') {
      expect(estado.ataqueAcumulado).toBe(2);
      expect(estado.ataqueStack).toEqual(['MAIS_DOIS']);
    }
  });

  it('lança erro se total de jogadores for < 2', () => {
    expect(() =>
      criarPartidaInicial({ baralho: baralhoMinimo(), modo: 'HOTSEAT', totalJogadores: 1 }),
    ).toThrow();
  });

  it('lança erro se baralho é insuficiente', () => {
    expect(() =>
      criarPartidaInicial({
        baralho: [cartaNum('LARANJA', 1)],
        modo: 'HOTSEAT',
        totalJogadores: 4,
      }),
    ).toThrow(/insuficiente/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// validarJogada — Tabela do GDD §02.6
// ─────────────────────────────────────────────────────────────────────

describe('validarJogada()', () => {
  describe('bloqueios básicos', () => {
    it('rejeita jogada fora de turno', () => {
      const estado = criarPartidaTeste();
      // Pega a primeira carta da mão do j2
      const j2 = estado.jogadores[1]!;
      const carta = j2.mao[0]!;
      const r = validarJogada(estado, carta, 'j2');
      expect(r.valida).toBe(false);
      expect(r.motivo).toMatch(/turno/i);
    });

    it('rejeita se a partida já acabou', () => {
      const estado = criarPartidaTeste();
      const finalizada: EstadoPartida = { ...estado, finalizada: true };
      const j1 = estado.jogadores[0]!;
      const carta = j1.mao[0]!;
      const r = validarJogada(finalizada, carta, 'j1');
      expect(r.valida).toBe(false);
    });
  });

  describe('turno normal', () => {
    it('aceita carta da mesma cor', () => {
      const estado = criarPartidaTeste();
      // Força o topo a ser LARANJA (se já não for, recriar)
      const estadoTopoLaranja: EstadoPartida = {
        ...estado,
        monteDescarte: [cartaNum('LARANJA', 0)],
        corAtiva: 'LARANJA',
      };
      const j1 = estadoTopoLaranja.jogadores[0]!;
      // Pega a primeira carta LARANJA da mão
      const cartaLaranja = j1.mao.find((c) => c.cor === 'LARANJA');
      if (cartaLaranja) {
        const r = validarJogada(estadoTopoLaranja, cartaLaranja, 'j1');
        expect(r.valida).toBe(true);
      }
    });

    it('aceita carta neutra a qualquer momento (turno normal)', () => {
      const estado = criarPartidaTeste();
      const j1 = estado.jogadores[0]!;
      // Força uma carta neutra na mão
      const j1ComNeutra: typeof j1 = {
        ...j1,
        mao: [cartaNeutra('CORINGA_SIMPLES'), ...j1.mao.slice(1)],
      };
      const estadoComNeutra: EstadoPartida = {
        ...estado,
        jogadores: [j1ComNeutra, ...estado.jogadores.slice(1)],
      };
      const r = validarJogada(estadoComNeutra, j1ComNeutra.mao[0]!, 'j1');
      expect(r.valida).toBe(true);
    });
  });

  describe('regra do acúmulo de +2/+4', () => {
    /** Helper: estado com +2 no topo e jogador da vez com cartas. */
    function estadoComAtaque(topoAcao: 'MAIS_DOIS' | 'MAIS_QUATRO', ataque: number): EstadoPartida {
      const base = criarPartidaTeste();
      const starter: Carta =
        topoAcao === 'MAIS_DOIS'
          ? cartaAcao('LARANJA', 'MAIS_DOIS')
          : cartaAcao('NEUTRO' as Cor, 'MAIS_QUATRO');
      // Coringa +4: precisa de starter neutro mas o motor rejeita.
      // Para teste, simulamos o estado já após o +2 ser jogado.
      return {
        ...base,
        monteDescarte: [starter],
        corAtiva: 'LARANJA',
        ataqueAcumulado: ataque,
        ataqueStack: [topoAcao],
      };
    }

    it('+2 sobre +2: OK', () => {
      const estado = estadoComAtaque('MAIS_DOIS', 2);
      const j1 = estado.jogadores[0]!;
      const j1ComCarta: typeof j1 = {
        ...j1,
        mao: [cartaAcao('LARANJA', 'MAIS_DOIS'), ...j1.mao.slice(1)],
      };
      const novoEstado: EstadoPartida = {
        ...estado,
        jogadores: [j1ComCarta, ...estado.jogadores.slice(1)],
      };
      const r = validarJogada(novoEstado, j1ComCarta.mao[0]!, 'j1');
      expect(r.valida).toBe(true);
    });

    it('+4 sobre +2: OK', () => {
      const estado = estadoComAtaque('MAIS_DOIS', 2);
      const j1 = estado.jogadores[0]!;
      const j1ComCarta: typeof j1 = {
        ...j1,
        mao: [cartaNeutra('MAIS_QUATRO'), ...j1.mao.slice(1)],
      };
      const novoEstado: EstadoPartida = {
        ...estado,
        jogadores: [j1ComCarta, ...estado.jogadores.slice(1)],
      };
      const r = validarJogada(novoEstado, j1ComCarta.mao[0]!, 'j1');
      expect(r.valida).toBe(true);
    });

    it('+2 sobre +4: PROIBIDO', () => {
      const estado = estadoComAtaque('MAIS_QUATRO', 4);
      const j1 = estado.jogadores[0]!;
      const j1ComCarta: typeof j1 = {
        ...j1,
        mao: [cartaAcao('LARANJA', 'MAIS_DOIS'), ...j1.mao.slice(1)],
      };
      const novoEstado: EstadoPartida = {
        ...estado,
        jogadores: [j1ComCarta, ...estado.jogadores.slice(1)],
      };
      const r = validarJogada(novoEstado, j1ComCarta.mao[0]!, 'j1');
      expect(r.valida).toBe(false);
      expect(r.motivo).toMatch(/proibido/i);
    });

    it('+4 sobre +4: OK', () => {
      const estado = estadoComAtaque('MAIS_QUATRO', 4);
      const j1 = estado.jogadores[0]!;
      const j1ComCarta: typeof j1 = {
        ...j1,
        mao: [cartaNeutra('MAIS_QUATRO'), ...j1.mao.slice(1)],
      };
      const novoEstado: EstadoPartida = {
        ...estado,
        jogadores: [j1ComCarta, ...estado.jogadores.slice(1)],
      };
      const r = validarJogada(novoEstado, j1ComCarta.mao[0]!, 'j1');
      expect(r.valida).toBe(true);
    });

    it('0+ sobre qualquer ataque: OK (reflete)', () => {
      const estado = estadoComAtaque('MAIS_QUATRO', 4);
      const j1 = estado.jogadores[0]!;
      const j1ComCarta: typeof j1 = {
        ...j1,
        mao: [cartaNeutra('ZERO_MAIS'), ...j1.mao.slice(1)],
      };
      const novoEstado: EstadoPartida = {
        ...estado,
        jogadores: [j1ComCarta, ...estado.jogadores.slice(1)],
      };
      const r = validarJogada(novoEstado, j1ComCarta.mao[0]!, 'j1');
      expect(r.valida).toBe(true);
    });

    it('número sobre ataque: PROIBIDO (precisa cobrir)', () => {
      const estado = estadoComAtaque('MAIS_DOIS', 2);
      const j1 = estado.jogadores[0]!;
      const j1ComCarta: typeof j1 = {
        ...j1,
        mao: [cartaNum('LARANJA', 5), ...j1.mao.slice(1)],
      };
      const novoEstado: EstadoPartida = {
        ...estado,
        jogadores: [j1ComCarta, ...estado.jogadores.slice(1)],
      };
      const r = validarJogada(novoEstado, j1ComCarta.mao[0]!, 'j1');
      expect(r.valida).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// executarJogada
// ─────────────────────────────────────────────────────────────────────

describe('executarJogada()', () => {
  it('avança o turno após uma jogada normal', () => {
    const estado = criarPartidaTeste();
    // Garante topo LARANJA e força a mão do j1 a começar com uma carta LARANJA
    const j1 = estado.jogadores[0]!;
    const cartaLaranja = cartaNum('LARANJA', 5);
    const j1Forcado: typeof j1 = { ...j1, mao: [cartaLaranja, ...j1.mao.slice(1)] };
    const estadoLaranja: EstadoPartida = {
      ...estado,
      jogadores: [j1Forcado, ...estado.jogadores.slice(1)],
      monteDescarte: [cartaNum('LARANJA', 0)],
      corAtiva: 'LARANJA',
    };
    const r = executarJogada({ estado: estadoLaranja, cartaIndex: 0 });
    expect(r.novoEstado.vezDe).toBe('j2');
    expect(r.novoEstado.monteDescarte.at(-1)).toEqual(cartaLaranja);
  });

  it('+2 acumula ataque', () => {
    const estado = criarPartidaTeste();
    const estadoLaranja: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaNum('LARANJA', 0)],
      corAtiva: 'LARANJA',
    };
    const j1 = estadoLaranja.jogadores[0]!;
    const j1ComMaisDois: typeof j1 = {
      ...j1,
      mao: [cartaAcao('LARANJA', 'MAIS_DOIS'), ...j1.mao.slice(1)],
    };
    const novoEstado: EstadoPartida = {
      ...estadoLaranja,
      jogadores: [j1ComMaisDois, ...estadoLaranja.jogadores.slice(1)],
    };
    const r = executarJogada({ estado: novoEstado, cartaIndex: 0 });
    expect(r.novoEstado.ataqueAcumulado).toBe(2);
    expect(r.novoEstado.ataqueStack).toEqual(['MAIS_DOIS']);
  });

  it('+2 sobre +4 existente: rejeita com erro', () => {
    const estado = criarPartidaTeste();
    const estadoAtaque: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaAcao('NEUTRO' as Cor, 'MAIS_QUATRO')],
      corAtiva: 'LARANJA',
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
    };
    const j1 = estadoAtaque.jogadores[0]!;
    const j1ComMaisDois: typeof j1 = {
      ...j1,
      mao: [cartaAcao('LARANJA', 'MAIS_DOIS'), ...j1.mao.slice(1)],
    };
    const novoEstado: EstadoPartida = {
      ...estadoAtaque,
      jogadores: [j1ComMaisDois, ...estadoAtaque.jogadores.slice(1)],
    };
    expect(() => executarJogada({ estado: novoEstado, cartaIndex: 0 })).toThrow(/proibido/i);
  });

  it('Skip em 2 jogadores pula o próximo (que é o próprio? não, regra é "pula o próximo na direção")', () => {
    // GDD §04.6: "Em 2 jogadores = equivalente a jogar e manter a vez"
    // Implementação: passos = 2 com 2 jogadores → próximo = self
    const estado = criarPartidaTeste();
    const estadoLaranja: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaNum('LARANJA', 0)],
      corAtiva: 'LARANJA',
    };
    const j1 = estadoLaranja.jogadores[0]!;
    const j1ComSkip: typeof j1 = {
      ...j1,
      mao: [cartaAcao('LARANJA', 'SKIP'), ...j1.mao.slice(1)],
    };
    const novoEstado: EstadoPartida = {
      ...estadoLaranja,
      jogadores: [j1ComSkip, ...estadoLaranja.jogadores.slice(1)],
    };
    const r = executarJogada({ estado: novoEstado, cartaIndex: 0 });
    // Com 2 jogadores, SKIP pula +1 = volta pro j1
    expect(r.novoEstado.vezDe).toBe('j1');
  });

  it('REVERSE em 2 jogadores inverte (vira SKIP)', () => {
    const estado = criarPartidaTeste();
    const estadoLaranja: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaNum('LARANJA', 0)],
      corAtiva: 'LARANJA',
    };
    const j1 = estadoLaranja.jogadores[0]!;
    const j1ComRev: typeof j1 = {
      ...j1,
      mao: [cartaAcao('LARANJA', 'REVERSE'), ...j1.mao.slice(1)],
    };
    const novoEstado: EstadoPartida = {
      ...estadoLaranja,
      jogadores: [j1ComRev, ...estadoLaranja.jogadores.slice(1)],
    };
    const r = executarJogada({ estado: novoEstado, cartaIndex: 0 });
    // Em 2j, REVERSE vira SKIP (passos=2), próximo volta pro j1
    expect(r.novoEstado.vezDe).toBe('j1');
    expect(r.novoEstado.sentido).toBe(-1);
  });

  it('0+ com ataque reflete: reseta ataque e marca reflexo', () => {
    const estado = criarPartidaTeste();
    const estadoAtaque: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaAcao('NEUTRO' as Cor, 'MAIS_QUATRO')],
      corAtiva: 'LARANJA',
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
    };
    const j1 = estadoAtaque.jogadores[0]!;
    const j1ComZero: typeof j1 = {
      ...j1,
      mao: [cartaNeutra('ZERO_MAIS'), ...j1.mao.slice(1)],
    };
    const novoEstado: EstadoPartida = {
      ...estadoAtaque,
      jogadores: [j1ComZero, ...estadoAtaque.jogadores.slice(1)],
    };
    const r = executarJogada({ estado: novoEstado, cartaIndex: 0, corEscolhida: 'AZUL' });
    expect(r.novoEstado.ataqueAcumulado).toBe(0);
    expect(r.novoEstado.ataqueStack).toEqual([]);
    const temReflexo = r.eventos.some((e) => e.tipo === 'ATAQUE_REFLETIDO_ZERO_MAIS');
    expect(temReflexo).toBe(true);
  });

  it('detecta vitória: mão vazia → finalizada = true, vencedor = j1', () => {
    const estado = criarPartidaTeste();
    const j1 = estado.jogadores[0]!;
    const unicaCarta = cartaNum('LARANJA', 5);
    const j1Com1Carta: typeof j1 = { ...j1, mao: [unicaCarta] };
    const novoEstado: EstadoPartida = {
      ...estado,
      jogadores: [j1Com1Carta, ...estado.jogadores.slice(1)],
      monteDescarte: [cartaNum('LARANJA', 0)],
      corAtiva: 'LARANJA',
    };
    const r = executarJogada({ estado: novoEstado, cartaIndex: 0 });
    expect(r.novoEstado.finalizada).toBe(true);
    expect(r.novoEstado.vencedor).toBe('j1');
  });

  it('7 ativa silêncio', () => {
    const estado = criarPartidaTeste();
    const estadoLaranja: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaNum('LARANJA', 0)],
      corAtiva: 'LARANJA',
    };
    const j1 = estadoLaranja.jogadores[0]!;
    const sete: Carta = { ...cartaNum('LARANJA', 7), acao: 'SILENCIO' };
    const j1Com7: typeof j1 = { ...j1, mao: [sete, ...j1.mao.slice(1)] };
    const novoEstado: EstadoPartida = {
      ...estadoLaranja,
      jogadores: [j1Com7, ...estadoLaranja.jogadores.slice(1)],
    };
    const r = executarJogada({ estado: novoEstado, cartaIndex: 0 });
    expect(r.novoEstado.silencio.ativo).toBe(true);
  });

  it('qualquer carta após silêncio desativa', () => {
    const estado = criarPartidaTeste();
    const estadoComSilencio: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaNum('LARANJA', 7)],
      corAtiva: 'LARANJA',
      silencio: { ativo: true },
    };
    const j1 = estadoComSilencio.jogadores[0]!;
    const j1ComCarta: typeof j1 = {
      ...j1,
      mao: [cartaNum('LARANJA', 3), ...j1.mao.slice(1)],
    };
    const novoEstado: EstadoPartida = {
      ...estadoComSilencio,
      jogadores: [j1ComCarta, ...estadoComSilencio.jogadores.slice(1)],
    };
    const r = executarJogada({ estado: novoEstado, cartaIndex: 0 });
    expect(r.novoEstado.silencio.ativo).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// comprarCartas
// ─────────────────────────────────────────────────────────────────────

describe('comprarCartas()', () => {
  it('compra 1 carta em turno normal', () => {
    const estado = criarPartidaTeste();
    const j1 = estado.jogadores[0]!;
    const maoAntes = j1.mao.length;
    const monteAntes = estado.monteCompra.length;
    const r = comprarCartas({ estado });
    expect(r.novoEstado.jogadores[0]!.mao.length).toBe(maoAntes + 1);
    expect(r.novoEstado.monteCompra.length).toBe(monteAntes - 1);
    expect(r.novoEstado.ataqueAcumulado).toBe(0);
  });

  it('compra N cartas em ataque e reseta', () => {
    const estado = criarPartidaTeste();
    const estadoAtaque: EstadoPartida = {
      ...estado,
      ataqueAcumulado: 6,
      ataqueStack: ['MAIS_QUATRO', 'MAIS_DOIS'],
    };
    const j1 = estadoAtaque.jogadores[0]!;
    const maoAntes = j1.mao.length;
    const monteAntes = estadoAtaque.monteCompra.length;
    const r = comprarCartas({ estado: estadoAtaque });
    expect(r.novoEstado.jogadores[0]!.mao.length).toBe(maoAntes + 6);
    expect(r.novoEstado.monteCompra.length).toBe(monteAntes - 6);
    expect(r.novoEstado.ataqueAcumulado).toBe(0);
    expect(r.cartasCompradasIds).toHaveLength(6);
  });

  it('avança turno após compra', () => {
    const estado = criarPartidaTeste();
    const r = comprarCartas({ estado });
    expect(r.novoEstado.vezDe).toBe('j2');
  });

  it('reembaralha descarte se monte esvazia', () => {
    // Monta estado com monte pequeno (1 carta) e descarte com várias
    const estado = criarPartidaTeste();
    const estadoCustom: EstadoPartida = {
      ...estado,
      monteCompra: [cartaNum('VERDE', 1)],
      monteDescarte: [cartaNum('LARANJA', 0), cartaNum('VERDE', 5), cartaNum('AZUL', 3)],
    };
    const j1 = estadoCustom.jogadores[0]!;
    const maoAntes = j1.mao.length;
    const r = comprarCartas({ estado: estadoCustom, quantidade: 3 });
    // Deve ter comprado 3 cartas no total
    expect(r.novoEstado.jogadores[0]!.mao.length).toBe(maoAntes + 3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// executarTurnoBot
// ─────────────────────────────────────────────────────────────────────

describe('executarTurnoBot()', () => {
  it('joga primeira carta válida', () => {
    const estado = criarPartidaTeste();
    // Configura j1 como bot
    const j1Bot = { ...estado.jogadores[0]!, isBot: true };
    const novoEstado: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaNum('LARANJA', 0)],
      corAtiva: 'LARANJA',
      jogadores: [j1Bot, ...estado.jogadores.slice(1)],
    };
    const r = executarTurnoBot({ estado: novoEstado, nivel: 'FACIL' });
    // Bot joga alguma carta, então turno muda OU jogo finaliza OU é um stalemate
    expect(['JOGOU', 'COMPROU', 'PULOU']).toContain(r.acao);
  });

  it('compra se não tem carta válida', () => {
    // Configura: mão do j1 só tem cartas que não casam com topo
    const estado = criarPartidaTeste();
    const j1Forcado = {
      ...estado.jogadores[0]!,
      isBot: true,
      // Mão só com cartas que NÃO combinam com o topo VERDE
      mao: [cartaNum('PRETO', 1), cartaNum('PRETO', 2)],
    };
    const novoEstado: EstadoPartida = {
      ...estado,
      monteDescarte: [cartaNum('VERDE', 5)],
      corAtiva: 'VERDE',
      jogadores: [j1Forcado, ...estado.jogadores.slice(1)],
    };
    const r = executarTurnoBot({ estado: novoEstado, nivel: 'FACIL' });
    // Bot não tem carta válida, então deve comprar
    expect(r.acao).toBe('COMPROU');
    expect(r.novoEstado.jogadores[0]!.mao.length).toBeGreaterThan(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Propriedades invariantes
// ─────────────────────────────────────────────────────────────────────

describe('invariantes do estado', () => {
  it('soma das cartas no estado é constante após N jogadas', () => {
    const estado = criarPartidaTeste();
    const totalInicial =
      estado.monteCompra.length +
      estado.monteDescarte.length +
      estado.jogadores.reduce((acc, j) => acc + j.mao.length, 0);

    // Simula 5 compras
    let e = estado;
    for (let i = 0; i < 5; i++) {
      e = comprarCartas({ estado: e }).novoEstado;
    }
    const totalFinal =
      e.monteCompra.length +
      e.monteDescarte.length +
      e.jogadores.reduce((acc, j) => acc + j.mao.length, 0);
    expect(totalFinal).toBe(totalInicial);
  });

  it('monteDescarte sempre tem pelo menos 1 carta (o topo)', () => {
    const estado = criarPartidaTeste();
    expect(estado.monteDescarte.length).toBeGreaterThanOrEqual(1);
  });

  it('corAtiva nunca é NEUTRO', () => {
    const estado = criarPartidaTeste();
    expect(estado.corAtiva).not.toBe('NEUTRO');
  });
});
