import { describe, expect, it } from 'vitest';
import { executarDescarteMultiplo } from './index.js';
import type { Acao, Carta, Cor } from '../types/card.js';
import type { EstadoPartida } from '../types/game.js';
import type { Jogador } from '../types/player.js';

function numero(id: string, cor: Exclude<Cor, 'NEUTRO'>, valor: number): Carta {
  return {
    id,
    cor,
    tipo: 'NUMERADA',
    valor,
    raridade: 'COMUM',
    colecao: 'test',
    efeito_texto_curto: String(valor),
    efeito_texto_longo: String(valor),
  };
}

function acao(id: string, cor: Exclude<Cor, 'NEUTRO'>, tipo: Acao): Carta {
  return {
    id,
    cor,
    tipo: 'ACAO',
    acao: tipo,
    raridade: 'INCOMUM',
    colecao: 'test',
    efeito_texto_curto: tipo,
    efeito_texto_longo: tipo,
  };
}

function neutra(id: string, tipo: Acao): Carta {
  return { ...acao(id, 'LARANJA', tipo), cor: 'NEUTRO', tipo: 'NEUTRA' };
}

function jogador(id: string, mao: ReadonlyArray<Carta>): Jogador {
  return {
    id,
    nome: id,
    mao,
    isBot: false,
    conectado: true,
    disseUno: false,
    avatar: '',
    pontos: 0,
  };
}

function estadoCom(mao: ReadonlyArray<Carta>, topo = numero('topo', 'LARANJA', 5)): EstadoPartida {
  return {
    partidaId: 'p',
    salaId: 's',
    jogadores: [jogador('j1', mao), jogador('j2', []), jogador('j3', []), jogador('j4', [])],
    monteCompra: [],
    monteDescarte: [topo],
    vezDe: 'j1',
    sentido: 1,
    corAtiva: 'LARANJA',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: true, jogadoresQuebraram: ['j2'] },
    historico: [],
    finalizada: false,
  };
}

describe('executarDescarteMultiplo', () => {
  it('descarta números de mesmo valor na ordem selecionada e usa a cor da última carta', () => {
    const seteAzul = numero('sete-azul', 'AZUL', 5);
    const seteVerde = numero('sete-verde', 'VERDE', 5);
    const sobra = numero('sobra', 'PRETO', 2);
    const resultado = executarDescarteMultiplo({
      estado: estadoCom([seteAzul, sobra, seteVerde]),
      cartaIndices: [2, 0],
    });

    expect(resultado.novoEstado.monteDescarte.map((c) => c.id)).toEqual([
      'topo',
      'sete-verde',
      'sete-azul',
    ]);
    expect(resultado.novoEstado.jogadores[0]!.mao.map((c) => c.id)).toEqual(['sobra']);
    expect(resultado.novoEstado.corAtiva).toBe('AZUL');
    expect(resultado.novoEstado.vezDe).toBe('j2');
    expect(resultado.novoEstado.silencio.ativo).toBe(false);
  });

  it('acumula +2 de todo o lote e avança apenas uma vez', () => {
    const mais2Azul = acao('mais2-azul', 'AZUL', 'MAIS_DOIS');
    const mais2Verde = acao('mais2-verde', 'VERDE', 'MAIS_DOIS');
    const estado = {
      ...estadoCom([mais2Azul, mais2Verde, numero('sobra', 'PRETO', 1)]),
      ataqueAcumulado: 2,
      ataqueStack: ['MAIS_DOIS' as const],
      monteDescarte: [acao('topo+2', 'LARANJA', 'MAIS_DOIS')],
    };
    const resultado = executarDescarteMultiplo({ estado, cartaIndices: [0, 1] });

    expect(resultado.novoEstado.ataqueAcumulado).toBe(6);
    expect(resultado.novoEstado.ataqueStack).toEqual(['MAIS_DOIS', 'MAIS_DOIS', 'MAIS_DOIS']);
    expect(resultado.novoEstado.vezDe).toBe('j2');
  });

  it('aplica Skip N vezes em um único avanço de turno', () => {
    const skipAzul = acao('skip-azul', 'AZUL', 'SKIP');
    const skipVerde = acao('skip-verde', 'VERDE', 'SKIP');
    const resultado = executarDescarteMultiplo({
      estado: estadoCom(
        [skipAzul, skipVerde, numero('sobra', 'PRETO', 1)],
        acao('topo-skip', 'LARANJA', 'SKIP'),
      ),
      cartaIndices: [0, 1],
    });

    expect(resultado.novoEstado.vezDe).toBe('j4');
  });

  it('mantém a vez do jogador em dois jogadores mesmo com Reverse múltiplo par', () => {
    const reverseAzul = acao('reverse-azul-2p', 'AZUL', 'REVERSE');
    const reverseVerde = acao('reverse-verde-2p', 'VERDE', 'REVERSE');
    const base = estadoCom([reverseAzul, reverseVerde], acao('topo-reverse', 'LARANJA', 'REVERSE'));
    const resultado = executarDescarteMultiplo({
      estado: { ...base, jogadores: base.jogadores.slice(0, 2) },
      cartaIndices: [0, 1],
    });

    expect(resultado.novoEstado.sentido).toBe(1);
    expect(resultado.novoEstado.vezDe).toBe('j1');
  });
  it('inverte o sentido somente quando a quantidade de Reverse é ímpar', () => {
    const reverseAzul = acao('reverse-azul', 'AZUL', 'REVERSE');
    const reverseVerde = acao('reverse-verde', 'VERDE', 'REVERSE');
    const resultado = executarDescarteMultiplo({
      estado: estadoCom(
        [reverseAzul, reverseVerde, numero('sobra', 'PRETO', 1)],
        acao('topo-reverse', 'LARANJA', 'REVERSE'),
      ),
      cartaIndices: [0, 1],
    });

    expect(resultado.novoEstado.sentido).toBe(1);
    expect(resultado.novoEstado.vezDe).toBe('j2');
  });

  it('inverte o sentido uma vez para um lote ímpar de Reverse', () => {
    const reverses = [
      acao('reverse-azul', 'AZUL', 'REVERSE'),
      acao('reverse-verde', 'VERDE', 'REVERSE'),
      acao('reverse-preto', 'PRETO', 'REVERSE'),
      numero('sobra', 'PRETO', 1),
    ];
    const resultado = executarDescarteMultiplo({
      estado: estadoCom(reverses, acao('topo-reverse', 'LARANJA', 'REVERSE')),
      cartaIndices: [0, 1, 2],
    });

    expect(resultado.novoEstado.sentido).toBe(-1);
    expect(resultado.novoEstado.vezDe).toBe('j4');
  });

  it('finaliza a partida somente após remover todo o lote', () => {
    const cincoAzul = numero('cinco-azul', 'AZUL', 5);
    const cincoVerde = numero('cinco-verde', 'VERDE', 5);
    const resultado = executarDescarteMultiplo({
      estado: estadoCom([cincoAzul, cincoVerde]),
      cartaIndices: [0, 1],
    });

    expect(resultado.novoEstado).toMatchObject({ finalizada: true, vencedor: 'j1', vezDe: 'j1' });
  });

  it.each([
    ['faces diferentes', [numero('cinco', 'AZUL', 5), numero('seis', 'AZUL', 6)]],
    ...(['MAIS_QUATRO', 'MAIS_DOIS_TODOS', 'ZERO_MAIS', 'TROCA_MAO', 'GIRA_MAO'] as const).map(
      (acaoComplexa) => [
        `a neutra ${acaoComplexa}`,
        [neutra(`${acaoComplexa}-1`, acaoComplexa), neutra(`${acaoComplexa}-2`, acaoComplexa)],
      ],
    ),
    [
      'uma ação complexa',
      [
        { ...numero('sete', 'LARANJA', 7), acao: 'SILENCIO' as const },
        { ...numero('silencio', 'VERDE', 7), acao: 'SILENCIO' as const },
      ],
    ],
  ])('rejeita lote com %s sem mutar o estado', (_motivo, mao) => {
    const estado = estadoCom(mao);
    const antes = structuredClone(estado);

    expect(() => executarDescarteMultiplo({ estado, cartaIndices: [0, 1] })).toThrow();
    expect(estado).toEqual(antes);
  });

  it('rejeita quando a primeira carta não é válida na mesa sem descarte parcial', () => {
    const cincoAzul = numero('cinco-azul', 'AZUL', 5);
    const cincoVerde = numero('cinco-verde', 'VERDE', 5);
    const estado = estadoCom([cincoAzul, cincoVerde], numero('topo-invalido', 'LARANJA', 8));
    const antes = structuredClone(estado);

    expect(() => executarDescarteMultiplo({ estado, cartaIndices: [0, 1] })).toThrow(
      /cor ativa|valor|ação/i,
    );
    expect(estado).toEqual(antes);
  });
});
