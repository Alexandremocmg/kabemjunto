import { describe, expect, it } from 'vitest';
import type { Carta, EstadoPartida, EstadoPartidaPublico, EventoPartida } from '@kabemjunto/shared';
import {
  abrirJanelaInterceptacao,
  comprarCartas,
  executarDescarteMultiplo,
  executarJogada,
  interceptar,
  penalizarQuebraSilencio,
} from '@kabemjunto/shared';
import { paraEstadoPublico } from './estadoPublico';
import { derivarImpactos, rotuloDoImpacto, type TipoImpacto } from './impactos';

/** Os cenários passam pelo motor de verdade: o alvo do selo tem de ser o alvo da regra. */
function numerada(id: string, cor: Exclude<Carta['cor'], 'NEUTRO'>, valor: number): Carta {
  return {
    id,
    tipo: 'NUMERADA',
    cor,
    valor,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: id,
    efeito_texto_longo: id,
  };
}

function especial(
  id: string,
  acao: NonNullable<Carta['acao']>,
  cor: Carta['cor'] = 'NEUTRO',
): Carta {
  return {
    id,
    tipo: cor === 'NEUTRO' ? 'NEUTRA' : 'ACAO',
    cor,
    acao,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: id,
    efeito_texto_longo: id,
  };
}

const encher = (id: string, quantas: number): Carta[] =>
  Array.from({ length: quantas }, (_, i) => numerada(`${id}-${i}`, 'VERDE', 8));

/** Mesa com as mãos dadas; o topo é 4 azul e o monte tem folga. */
function mesa(maos: Record<string, Carta[]>, extra: Partial<EstadoPartida> = {}): EstadoPartida {
  return {
    partidaId: 'p',
    salaId: 's',
    jogadores: Object.entries(maos).map(([id, mao]) => ({
      id,
      nome: id,
      mao,
      isBot: id !== 'eu',
      conectado: true,
      disseUno: false,
      avatar: '',
      pontos: 0,
    })),
    monteCompra: encher('monte', 40),
    monteDescarte: [numerada('topo', 'AZUL', 4)],
    vezDe: 'eu',
    sentido: 1,
    corAtiva: 'AZUL',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    historico: [],
    finalizada: false,
    ...extra,
  };
}

const publico = (estado: EstadoPartida): EstadoPartidaPublico => paraEstadoPublico(estado)!;

function resumo(antes: EstadoPartida, depois: EstadoPartida): Array<[TipoImpacto, string, number]> {
  return derivarImpactos(publico(antes), publico(depois), 'eu').map((impacto) => [
    impacto.tipo,
    impacto.jogadorId,
    impacto.quantidade,
  ]);
}

const jogar = (
  estado: EstadoPartida,
  opcoes: { alvoTrocaId?: string; cor?: 'VERDE' } = {},
): EstadoPartida =>
  executarJogada({
    estado,
    cartaIndex: 0,
    ...(opcoes.cor ? { corEscolhida: opcoes.cor } : {}),
    ...(opcoes.alvoTrocaId ? { alvoTrocaId: opcoes.alvoTrocaId } : {}),
  }).novoEstado;

const trio = (carta: Carta): Record<string, Carta[]> => ({
  eu: [carta, ...encher('eu', 4)],
  b1: encher('b1', 5),
  b2: encher('b2', 5),
});

/** Histórico em que `origem` foi o último atacante. */
const ataqueDe = (origem: string): EventoPartida[] => [
  { tipo: 'ATAQUE_ACUMULADO', timestamp: 1, novo: 4, stack: ['MAIS_QUATRO'], origem },
];

describe('derivarImpactos: cada tipo', () => {
  it('ataque mira quem ficou com a vez, com o total acumulado', () => {
    const antes = mesa(trio(especial('m2', 'MAIS_DOIS', 'AZUL')));
    expect(resumo(antes, jogar(antes))).toEqual([['ATAQUE', 'b1', 2]]);

    const coberto = mesa(trio(especial('m4', 'MAIS_QUATRO')), {
      ataqueAcumulado: 2,
      ataqueStack: ['MAIS_DOIS'],
      sentido: -1,
    });
    expect(resumo(coberto, jogar(coberto, { cor: 'VERDE' }))).toEqual([['ATAQUE', 'b2', 6]]);
  });

  it('marca como local o impacto do jogador deste aparelho', () => {
    const antes = mesa(
      { ...trio(numerada('x', 'VERDE', 1)), b2: [especial('m2', 'MAIS_DOIS', 'AZUL')] },
      { vezDe: 'b2' },
    );
    const comSobra = {
      ...antes,
      jogadores: antes.jogadores.map((j) =>
        j.id === 'b2' ? { ...j, mao: [...j.mao, ...encher('b2', 2)] } : j,
      ),
    };
    expect(derivarImpactos(publico(comSobra), publico(jogar(comSobra)), 'eu')).toEqual([
      { tipo: 'ATAQUE', jogadorId: 'eu', quantidade: 2, local: true },
    ]);
  });

  it('compra de ataque efetiva', () => {
    const antes = mesa(trio(numerada('x', 'VERDE', 1)), {
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
    });
    const depois = comprarCartas({ estado: antes }).novoEstado;
    expect(resumo(antes, depois)).toEqual([['COMPRA_ATAQUE', 'eu', 4]]);
  });

  it('0+ reflete no último atacante real, mesmo que não seja o vizinho', () => {
    const antes = mesa(trio(especial('zero', 'ZERO_MAIS')), {
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
      historico: ataqueDe('b1'),
    });
    expect(resumo(antes, jogar(antes, { cor: 'VERDE' }))).toEqual([['REFLETIDO', 'b1', 4]]);
  });

  it('+2 Para Todos: um selo em cada adversário e nenhum em quem jogou', () => {
    const antes = mesa(trio(especial('todos', 'MAIS_DOIS_TODOS')));
    expect(resumo(antes, jogar(antes, { cor: 'VERDE' }))).toEqual([
      ['MAIS_DOIS_TODOS', 'b1', 2],
      ['MAIS_DOIS_TODOS', 'b2', 2],
    ]);
  });

  it.each([
    [1, 'b1'],
    [-1, 'b2'],
  ] as const)('Skip no sentido %i pula %s', (sentido, pulado) => {
    const antes = mesa(trio(especial('skip', 'SKIP', 'AZUL')), { sentido });
    expect(resumo(antes, jogar(antes))).toEqual([['PULOU', pulado, 0]]);
  });

  it('Skips em descarte múltiplo pulam uma pessoa por carta', () => {
    const antes = mesa({
      eu: [
        especial('s1', 'SKIP', 'AZUL'),
        especial('s2', 'SKIP', 'VERDE'),
        numerada('z', 'VERDE', 1),
      ],
      b1: encher('b1', 5),
      b2: encher('b2', 5),
      b3: encher('b3', 5),
    });
    const depois = executarDescarteMultiplo({ estado: antes, cartaIndices: [0, 1] }).novoEstado;
    expect(depois.vezDe).toBe('b3');
    expect(resumo(antes, depois)).toEqual([
      ['PULOU', 'b1', 0],
      ['PULOU', 'b2', 0],
    ]);
  });

  it('dois Skips com 2 jogadores: quem fica com a vez não ganha "PULOU"', () => {
    const antes = mesa({
      eu: [
        especial('s1', 'SKIP', 'AZUL'),
        especial('s2', 'SKIP', 'VERDE'),
        numerada('z', 'VERDE', 1),
      ],
      b1: encher('b1', 5),
    });
    const depois = executarDescarteMultiplo({ estado: antes, cartaIndices: [0, 1] }).novoEstado;
    expect(depois.vezDe).toBe('b1');
    expect(resumo(antes, depois)).toEqual([]);
  });

  it('Reverse com 2 jogadores pula o outro; com 3, ninguém', () => {
    const reverse = especial('rev', 'REVERSE', 'AZUL');
    const dupla = mesa({ eu: [reverse, ...encher('eu', 3)], b1: encher('b1', 5) });
    expect(resumo(dupla, jogar(dupla))).toEqual([['PULOU', 'b1', 0]]);
    const tres = mesa(trio(reverse));
    expect(resumo(tres, jogar(tres))).toEqual([]);
  });

  it('Corta-Frente com Skip pula o seguinte de quem cortou', () => {
    const antes = abrirJanelaInterceptacao({
      estado: mesa(
        {
          eu: [especial('skip-eu', 'SKIP', 'AZUL'), ...encher('eu', 3)],
          b1: encher('b1', 5),
          b2: encher('b2', 5),
          b3: encher('b3', 5),
        },
        { monteDescarte: [especial('skip-b2', 'SKIP', 'AZUL')], vezDe: 'b1' },
      ),
      cartaAlvoId: 'skip-b2',
      jogadorOrigemId: 'b2',
      janelaId: 'j',
      fechaEm: 0,
      proximaVezId: 'b1',
    });
    const depois = interceptar({
      estado: antes,
      janelaId: 'j',
      cartaId: 'skip-eu',
      jogadorId: 'eu',
    }).novoEstado;
    expect(depois.vezDe).toBe('b2');
    expect(resumo(antes, depois)).toEqual([['PULOU', 'b1', 0]]);
  });

  it('Silêncio quebrado: +2 uma vez só', () => {
    const antes = mesa(trio(numerada('x', 'VERDE', 1)), {
      silencio: { ativo: true, jogadoresQuebraram: [] },
    });
    const depois = penalizarQuebraSilencio(antes, 'b2').novoEstado;
    expect(resumo(antes, depois)).toEqual([['SILENCIO_QUEBRADO', 'b2', 2]]);
    expect(resumo(depois, penalizarQuebraSilencio(depois, 'b2').novoEstado)).toEqual([]);
  });
});

describe('derivarImpactos: falsos positivos', () => {
  it('sem estado anterior, outra partida ou mesmo estado: nada', () => {
    const estado = publico(mesa(trio(numerada('x', 'AZUL', 1))));
    expect(derivarImpactos(undefined, estado, 'eu')).toEqual([]);
    expect(derivarImpactos({ ...estado, partidaId: 'outra' }, estado, 'eu')).toEqual([]);
    expect(derivarImpactos(estado, estado, 'eu')).toEqual([]);
  });

  it('compra comum de 1 carta e carta numerada não geram selo', () => {
    const semJogada = mesa(trio(numerada('x', 'VERDE', 1)));
    expect(resumo(semJogada, comprarCartas({ estado: semJogada }).novoEstado)).toEqual([]);
    const numero = mesa(trio(numerada('cinco', 'AZUL', 5)));
    expect(resumo(numero, jogar(numero))).toEqual([]);
  });

  it('Troca Mão e Gira Mão não viram compra', () => {
    const maos = (acao: 'TROCA_MAO' | 'GIRA_MAO') => ({
      eu: [especial('m', acao), numerada('y', 'VERDE', 1)],
      b1: encher('b1', 9),
      b2: encher('b2', 5),
    });
    const troca = mesa(maos('TROCA_MAO'));
    expect(resumo(troca, jogar(troca, { cor: 'VERDE', alvoTrocaId: 'b1' }))).toEqual([]);
    const gira = mesa(maos('GIRA_MAO'));
    expect(resumo(gira, jogar(gira, { cor: 'VERDE' }))).toEqual([]);
  });

  it('0+ sem ataque é só coringa', () => {
    const antes = mesa(trio(especial('zero', 'ZERO_MAIS')));
    expect(resumo(antes, jogar(antes, { cor: 'VERDE' }))).toEqual([]);
  });

  it('0+ sobre ataque da carta inicial não inventa alvo', () => {
    const antes = mesa(trio(especial('zero', 'ZERO_MAIS')), {
      ataqueAcumulado: 2,
      ataqueStack: ['MAIS_DOIS'],
      historico: ataqueDe('STARTER'),
    });
    expect(resumo(antes, jogar(antes, { cor: 'VERDE' }))).toEqual([]);
  });

  it('carta vencedora não mira, não pula e não faz ninguém comprar', () => {
    for (const ultima of [
      especial('m2', 'MAIS_DOIS', 'AZUL'),
      especial('skip', 'SKIP', 'AZUL'),
      especial('todos', 'MAIS_DOIS_TODOS'),
    ]) {
      const antes = mesa({ eu: [ultima], b1: encher('b1', 5), b2: encher('b2', 5) });
      expect(resumo(antes, jogar(antes, { cor: 'VERDE' }))).toEqual([]);
    }
  });

  it('ataque que o monte não paga encerra a partida sem selo de compra', () => {
    const antes = mesa(trio(numerada('x', 'VERDE', 1)), {
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
      monteCompra: encher('monte', 1),
    });
    const depois = comprarCartas({ estado: antes }).novoEstado;
    expect(depois.finalizada).toBe(true);
    expect(resumo(antes, depois)).toEqual([]);
  });

  it('nunca há dois selos para o mesmo jogador no mesmo passo', () => {
    const antes = publico(
      mesa(trio(numerada('x', 'VERDE', 1)), {
        ataqueAcumulado: 2,
        silencio: { ativo: true, jogadoresQuebraram: [] },
      }),
    );
    // Dois eventos do mesmo jogador fundidos num só instantâneo (rede em rajada).
    const depois: EstadoPartidaPublico = {
      ...antes,
      vezDe: 'b1',
      ataqueAcumulado: 0,
      silencio: { ativo: true, jogadoresQuebraram: ['eu'] },
      jogadores: antes.jogadores.map((j) =>
        j.id === 'eu' ? { ...j, quantidadeCartas: j.quantidadeCartas + 4 } : j,
      ),
    };
    const impactos = derivarImpactos(antes, depois, 'eu');
    expect(impactos).toHaveLength(1);
    expect(impactos[0]!.tipo).toBe('SILENCIO_QUEBRADO');
  });
});

describe('rotuloDoImpacto', () => {
  it('cada tipo se distingue por texto ou símbolo, sem depender da cor', () => {
    expect(rotuloDoImpacto({ tipo: 'ATAQUE', quantidade: 6 })).toEqual({
      simbolo: '🎯',
      texto: '+6',
    });
    expect(rotuloDoImpacto({ tipo: 'COMPRA_ATAQUE', quantidade: 6 }).simbolo).not.toBe('🎯');
    expect(rotuloDoImpacto({ tipo: 'SILENCIO_QUEBRADO', quantidade: 2 }).simbolo).toBe('🤫');
    expect(rotuloDoImpacto({ tipo: 'REFLETIDO', quantidade: 4 }).texto).toBe('REFLETIDO! +4');
    expect(rotuloDoImpacto({ tipo: 'PULOU', quantidade: 0 }).texto).toBe('PULOU');
  });
});
