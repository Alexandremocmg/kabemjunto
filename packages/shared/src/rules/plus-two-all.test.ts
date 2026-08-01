/**
 * MAIS_DOIS_TODOS ("+2 Para Todos") — ADR-013.
 *
 * Ataque global/AoE: todos os adversários compram 2 cartas imediatamente;
 * quem jogou não compra nada. Sem acúmulo, sem janela de defesa/repasse —
 * é uma transição pura atômica, fora do sistema de ataqueAcumulado/stack.
 */
import { describe, expect, it } from 'vitest';
import type { Carta, Cor } from '../types/card.js';
import type { EstadoPartida } from '../types/game.js';
import { executarJogada, validarJogada } from './index.js';

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

function plus2All(id = 'plus2all'): Carta {
  return {
    id,
    cor: 'NEUTRO',
    tipo: 'NEUTRA',
    acao: 'MAIS_DOIS_TODOS',
    raridade: 'RARA',
    colecao: 'test',
    efeito_texto_curto: '+2 Para Todos',
    efeito_texto_longo: '+2 Para Todos',
  };
}

function jogador(id: string, mao: readonly Carta[]) {
  return {
    id,
    nome: id,
    avatar: '⭐',
    mao,
    isBot: false,
    conectado: true,
    disseUno: false,
    pontos: 0,
  };
}

function monteCom(quantidade: number, cor: Exclude<Cor, 'NEUTRO'> = 'PRETO'): Carta[] {
  return Array.from({ length: quantidade }, (_, i) => numero(`monte-${i}`, cor, i % 10));
}

function estadoBase(overrides: Partial<EstadoPartida> = {}): EstadoPartida {
  return {
    partidaId: 'partida',
    salaId: 'sala',
    jogadores: [
      jogador('j1', [plus2All(), numero('j1-carta', 'VERDE', 9)]),
      jogador('j2', [numero('j2-carta', 'AZUL', 3)]),
      jogador('j3', [numero('j3-carta', 'PRETO', 4)]),
    ],
    monteCompra: monteCom(20),
    monteDescarte: [numero('topo', 'AZUL', 5)],
    vezDe: 'j1',
    sentido: 1,
    corAtiva: 'AZUL',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    historico: [],
    finalizada: false,
    ...overrides,
  };
}

describe('MAIS_DOIS_TODOS — distribuição global (ADR-013)', () => {
  it('distribui exatamente 2 cartas para cada adversário, em ordem de turno, e nenhuma para quem jogou', () => {
    const estado = estadoBase();

    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' });

    const j1 = resultado.novoEstado.jogadores.find((j) => j.id === 'j1')!;
    const j2 = resultado.novoEstado.jogadores.find((j) => j.id === 'j2')!;
    const j3 = resultado.novoEstado.jogadores.find((j) => j.id === 'j3')!;
    expect(j1.mao).toHaveLength(1); // só perdeu a carta jogada, não ganhou nada
    expect(j2.mao).toHaveLength(3); // 1 original + 2
    expect(j3.mao).toHaveLength(3); // 1 original + 2
  });

  it('quem jogou escolhe a nova cor ativa (fluxo de coringa)', () => {
    const estado = estadoBase();
    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'PRETO' });
    expect(resultado.novoEstado.corAtiva).toBe('PRETO');
  });

  it('não acumula ataque nem altera a pilha de ataque', () => {
    const estado = estadoBase();
    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' });
    expect(resultado.novoEstado.ataqueAcumulado).toBe(0);
    expect(resultado.novoEstado.ataqueStack).toEqual([]);
  });

  it('a vez passa para o próximo jogador da sequência natural (sentido respeitado)', () => {
    const estado = estadoBase({ sentido: -1 });
    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' });
    // sentido -1 a partir de j1 (índice 0) em 3 jogadores → j3 (índice 2)
    expect(resultado.novoEstado.vezDe).toBe('j3');
  });

  it('em partida de 2 jogadores, o único adversário recebe as 2 cartas e a vez volta pra ele', () => {
    const estado = estadoBase({
      jogadores: [
        jogador('j1', [plus2All(), numero('j1-carta', 'VERDE', 9)]),
        jogador('j2', [numero('j2-carta', 'AZUL', 3)]),
      ],
    });
    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' });
    const j2 = resultado.novoEstado.jogadores.find((j) => j.id === 'j2')!;
    expect(j2.mao).toHaveLength(3);
    expect(resultado.novoEstado.vezDe).toBe('j2');
  });

  it('recicla o descarte quando o monte de compra esgota durante a distribuição', () => {
    const estado = estadoBase({
      monteCompra: monteCom(2), // só dá pra um adversário sem reciclar
      monteDescarte: [
        numero('descarte-1', 'LARANJA', 1),
        numero('descarte-2', 'LARANJA', 2),
        numero('topo', 'AZUL', 5), // preservado como topo após reciclagem
      ],
    });

    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' });

    const j2 = resultado.novoEstado.jogadores.find((j) => j.id === 'j2')!;
    const j3 = resultado.novoEstado.jogadores.find((j) => j.id === 'j3')!;
    expect(j2.mao).toHaveLength(3);
    expect(j3.mao).toHaveLength(3);
    // O topo do descarte após a jogada é sempre a própria carta jogada; a
    // reciclagem (preservar o topo anterior como pivô) acontece por baixo,
    // dentro de cada chamada de comprarCartas — já coberto pelos testes de
    // buy-cards.ts. Aqui só confirmamos que ninguém ficou sem cartas.
    expect(resultado.novoEstado.monteDescarte.at(-1)?.id).toBe('plus2all');
    expect(resultado.novoEstado.finalizada).toBe(false);
  });

  it('esgotamento total durante a distribuição encerra a partida pelo critério de menor mão (all-or-nothing)', () => {
    const estado = estadoBase({
      monteCompra: [], // nada pra dar a ninguém, nem reciclando
      monteDescarte: [numero('topo', 'AZUL', 5)], // só o topo, não reciclável
      jogadores: [
        jogador('j1', [plus2All(), numero('j1-carta', 'VERDE', 9)]),
        jogador('j2', [numero('j2-carta', 'AZUL', 3)]),
        jogador('j3', [numero('j3-carta-1', 'PRETO', 4), numero('j3-carta-2', 'PRETO', 6)]),
      ],
    });

    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' });

    expect(resultado.novoEstado.finalizada).toBe(true);
    // j1 fica com 1 carta (perdeu a jogada) — a menor mão entre os três.
    expect(resultado.novoEstado.vencedor).toBe('j1');
  });

  it('não pode ser jogada como resposta a um ataque acumulado', () => {
    const estado = estadoBase({
      ataqueAcumulado: 2,
      ataqueStack: ['MAIS_DOIS'],
      monteDescarte: [
        { ...numero('mais-dois-topo', 'AZUL', 0), acao: 'MAIS_DOIS', tipo: 'ACAO' as const },
      ],
    });

    const validacao = validarJogada(estado, estado.jogadores[0]!.mao[0]!, 'j1');
    expect(validacao.valida).toBe(false);
    expect(() => executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' })).toThrow();
  });

  it('como última carta da mão, vence imediatamente e cancela a distribuição', () => {
    const estado = estadoBase({
      jogadores: [
        jogador('j1', [plus2All()]),
        jogador('j2', [numero('j2-carta', 'AZUL', 3)]),
        jogador('j3', [numero('j3-carta', 'PRETO', 4)]),
      ],
    });

    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' });

    expect(resultado.novoEstado.finalizada).toBe(true);
    expect(resultado.novoEstado.vencedor).toBe('j1');
    const j2 = resultado.novoEstado.jogadores.find((j) => j.id === 'j2')!;
    const j3 = resultado.novoEstado.jogadores.find((j) => j.id === 'j3')!;
    expect(j2.mao).toHaveLength(1); // não recebeu nada
    expect(j3.mao).toHaveLength(1); // não recebeu nada
    expect(resultado.eventos.some((evento) => evento.tipo === 'CARTA_COMPRADA')).toBe(false);
  });
});
