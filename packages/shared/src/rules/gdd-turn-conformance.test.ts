/**
 * Conformidade com as regras canônicas de turno do GDD.
 *
 * Fontes:
 * - `GDD-Kabemjunto.md` §7 "Fluxo de turno": "Sem carta válida: comprar 1 do
 *   Monte de Compra. Se a carta comprada puder ser jogada, pode descartar
 *   imediatamente. Senão, mantém na mão e passa o turno."
 * - `02-game-design.md` §5.1/§5.2: `COMPRAR (1 carta) → ESPERAR_CARTA`
 *   ("devolve a carta comprada ao mesmo jogador; ele pode jogá-la se válida"),
 *   enquanto `COMPRAR (defesa) → FIM_TURNO` ("jogador que pagou perde o turno").
 * - `02-game-design.md` §10.5: monte esgotado → passa o turno sem jogar.
 * - `02-game-design.md` §10.7: starter Skip/Reverse tem efeito sobre o
 *   primeiro jogador.
 */

import { describe, it, expect } from 'vitest';
import { criarPartidaInicial, comprarCartas, executarJogada } from './index.js';
import type { Carta, Cor } from '../types/card.js';
import type { EstadoPartida } from '../types/game.js';

function cartaNum(cor: Cor, valor: number, sufixo = ''): Carta {
  return {
    id: `${valor}-${cor}${sufixo}`,
    cor,
    tipo: 'NUMERADA',
    valor,
    raridade: 'COMUM',
    colecao: 'test',
    efeito_texto_curto: `${valor}`,
    efeito_texto_longo: `${valor} ${cor}`,
  };
}

function cartaAcao(cor: Cor, acao: Carta['acao'], sufixo = ''): Carta {
  return {
    id: `${acao}-${cor}${sufixo}`,
    cor,
    tipo: cor === 'NEUTRO' ? 'NEUTRA' : 'ACAO',
    acao,
    raridade: 'INCOMUM',
    colecao: 'test',
    efeito_texto_curto: `${acao}`,
    efeito_texto_longo: `${acao} ${cor}`,
  };
}

/**
 * Estado de 2 jogadores totalmente controlado: `j1` é a vez, o topo do
 * descarte é 5 AZUL e a mão de `j1` não tem nenhuma carta jogável.
 */
function estadoBase(overrides: Partial<EstadoPartida> = {}): EstadoPartida {
  return {
    partidaId: 'p-conformance',
    salaId: 'sala-conformance',
    jogadores: [
      {
        id: 'j1',
        nome: 'J1',
        mao: [cartaNum('VERDE', 9)],
        isBot: false,
        conectado: true,
        disseUno: false,
        avatar: '⭐',
        pontos: 0,
      },
      {
        id: 'j2',
        nome: 'J2',
        mao: [cartaNum('VERDE', 3)],
        isBot: false,
        conectado: true,
        disseUno: false,
        avatar: '⭐',
        pontos: 0,
      },
    ],
    monteCompra: [cartaNum('LARANJA', 1)],
    monteDescarte: [cartaNum('AZUL', 5)],
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

describe('GDD §7 / §5.2 — compra de 1 carta e posse do turno', () => {
  it('rejeita compra voluntária quando o jogador já tem carta válida na mão', () => {
    // Topo 5 AZUL / corAtiva AZUL. j1 tem uma carta AZUL válida na mão —
    // a compra deveria ser desnecessária e o motor deve recusar.
    const estado = estadoBase({
      jogadores: [
        {
          id: 'j1',
          nome: 'J1',
          mao: [cartaNum('AZUL', 5, '-mao')],
          isBot: false,
          conectado: true,
          disseUno: false,
          avatar: '⭐',
          pontos: 0,
        },
        {
          id: 'j2',
          nome: 'J2',
          mao: [cartaNum('VERDE', 3)],
          isBot: false,
          conectado: true,
          disseUno: false,
          avatar: '⭐',
          pontos: 0,
        },
      ],
    });

    expect(() => comprarCartas({ estado })).toThrow(
      'Você tem uma carta válida na mão — jogue-a em vez de comprar.',
    );
  });

  it('permite compra voluntária quando a única carta "jogável" na mão é TROCA_MAO (decisão de produto)', () => {
    // Jogador não é obrigado a trocar de mão: TROCA_MAO não bloqueia a
    // compra, mesmo sendo tecnicamente uma carta neutra sempre jogável.
    const trocaMao = {
      id: 'troca-mao-teste',
      tipo: 'NEUTRA' as const,
      cor: 'NEUTRO' as const,
      acao: 'TROCA_MAO' as const,
      raridade: 'RARA' as const,
      colecao: 'base-v1',
      efeito_texto_curto: 'Troca Mão',
      efeito_texto_longo: 'Escolha um jogador e troque toda a sua mão com a dele!',
    };
    const estado = estadoBase({
      jogadores: [
        {
          id: 'j1',
          nome: 'J1',
          mao: [trocaMao],
          isBot: false,
          conectado: true,
          disseUno: false,
          avatar: '⭐',
          pontos: 0,
        },
        {
          id: 'j2',
          nome: 'J2',
          mao: [cartaNum('VERDE', 3)],
          isBot: false,
          conectado: true,
          disseUno: false,
          avatar: '⭐',
          pontos: 0,
        },
      ],
    });

    const r = comprarCartas({ estado });
    expect(r.cartasCompradasIds).toHaveLength(1);
    // TROCA_MAO permanece na mão — apenas não bloqueia o botão de compra.
    const jogadorAtualizado = r.novoEstado.jogadores.find((j) => j.id === 'j1');
    expect(jogadorAtualizado?.mao.some((c) => c.id === 'troca-mao-teste')).toBe(true);
  });

  it('permite pagar ataque mesmo com carta válida na mão (pagar é diferente de comprar voluntário)', () => {
    const estado = estadoBase({
      jogadores: [
        {
          id: 'j1',
          nome: 'J1',
          mao: [cartaAcao('AZUL', 'MAIS_DOIS', '-mao')],
          isBot: false,
          conectado: true,
          disseUno: false,
          avatar: '⭐',
          pontos: 0,
        },
        {
          id: 'j2',
          nome: 'J2',
          mao: [cartaNum('VERDE', 3)],
          isBot: false,
          conectado: true,
          disseUno: false,
          avatar: '⭐',
          pontos: 0,
        },
      ],
      ataqueAcumulado: 2,
      ataqueStack: ['MAIS_DOIS'],
      monteCompra: [cartaNum('LARANJA', 1), cartaNum('LARANJA', 2)],
    });

    const r = comprarCartas({ estado });

    expect(r.cartasCompradasIds).toHaveLength(2);
    expect(r.novoEstado.vezDe).toBe('j2');
  });

  it('mantém o turno quando a carta comprada é jogável', () => {
    // Topo 5 AZUL / corAtiva AZUL. A carta do monte é 5 VERDE → jogável
    // por número. O jogador deve poder descartá-la imediatamente.
    const estado = estadoBase({ monteCompra: [cartaNum('VERDE', 5)] });

    const r = comprarCartas({ estado });

    expect(r.novoEstado.vezDe).toBe('j1');
    expect(r.turnoMantido).toBe(true);
    expect(r.novoEstado.jogadores[0]!.mao).toHaveLength(2);
  });

  it('passa o turno quando a carta comprada não é jogável', () => {
    // Topo 5 AZUL / corAtiva AZUL. A carta do monte é 1 LARANJA → não
    // combina cor nem número, então o turno passa.
    const estado = estadoBase({ monteCompra: [cartaNum('LARANJA', 1)] });

    const r = comprarCartas({ estado });

    expect(r.novoEstado.vezDe).toBe('j2');
    expect(r.turnoMantido).toBe(false);
  });

  it('mantém o turno quando a carta comprada é uma neutra (sempre jogável)', () => {
    const estado = estadoBase({ monteCompra: [cartaAcao('NEUTRO', 'CORINGA_SIMPLES')] });

    const r = comprarCartas({ estado });

    expect(r.novoEstado.vezDe).toBe('j1');
    expect(r.turnoMantido).toBe(true);
  });

  it('pagar ataque sempre perde o turno, mesmo comprando carta jogável', () => {
    // GDD §5.2: `COMPRAR (defesa) → FIM_TURNO`. Aqui as duas cartas
    // compradas seriam jogáveis, e ainda assim o turno deve passar.
    const estado = estadoBase({
      monteCompra: [cartaNum('AZUL', 2), cartaNum('AZUL', 4)],
      ataqueAcumulado: 2,
      ataqueStack: ['MAIS_DOIS'],
    });

    const r = comprarCartas({ estado });

    expect(r.novoEstado.jogadores[0]!.mao).toHaveLength(3);
    expect(r.novoEstado.ataqueAcumulado).toBe(0);
    expect(r.novoEstado.vezDe).toBe('j2');
    expect(r.turnoMantido).toBe(false);
  });

  it('passa o turno quando monte e descarte estão esgotados (GDD §10.5)', () => {
    // Sem carta comprável: não há como jogar, então o turno passa.
    const estado = estadoBase({ monteCompra: [], monteDescarte: [cartaNum('AZUL', 5)] });

    const r = comprarCartas({ estado });

    expect(r.cartasCompradasIds).toHaveLength(0);
    expect(r.novoEstado.vezDe).toBe('j2');
    expect(r.turnoMantido).toBe(false);
    expect(r.eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'MONTE_ESGOTADO',
        jogadorId: 'j1',
        cartasSolicitadas: 1,
        cartasObtidas: 0,
      }),
    );
  });

  it('encerra por menor mão sem compra parcial quando o ataque não pode ser pago integralmente', () => {
    // Ataque de 4, mas só 1 carta disponível no total (monte + descarte reciclável).
    const estado = estadoBase({
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
      monteCompra: [cartaNum('VERDE', 1)],
      monteDescarte: [cartaNum('AZUL', 5)],
    });

    const r = comprarCartas({ estado });

    expect(r.cartasCompradasIds).toEqual([]);
    expect(r.novoEstado.finalizada).toBe(true);
    expect(r.novoEstado.vencedor).toBe('j1');
    expect(r.novoEstado.ataqueAcumulado).toBe(4);
    expect(r.eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'MONTE_ESGOTADO',
        jogadorId: 'j1',
        cartasSolicitadas: 4,
        cartasObtidas: 0,
      }),
    );
  });

  it('não deixa o jogador travado: se o turno é mantido, existe jogada válida', () => {
    const estado = estadoBase({ monteCompra: [cartaNum('VERDE', 5)] });

    const r = comprarCartas({ estado });

    expect(r.turnoMantido).toBe(true);
    // A carta comprada realmente pode ser descartada em seguida.
    const mao = r.novoEstado.jogadores[0]!.mao;
    const indice = mao.findIndex((carta) => carta.id === 'VERDE-5' || carta.id === '5-VERDE');
    expect(indice).toBeGreaterThanOrEqual(0);
    const depois = executarJogada({ estado: r.novoEstado, cartaIndex: indice });
    expect(depois.novoEstado.vezDe).toBe('j2');
  });
});

describe('GDD §10.7 — starter Skip/Reverse age sobre o primeiro jogador', () => {
  /** Baralho onde toda carta é a mesma ação: o starter é sempre essa ação. */
  function baralhoDe(acao: Carta['acao'], total = 24): Carta[] {
    return Array.from({ length: total }, (_, i) => cartaAcao('AZUL', acao, `-${i}`));
  }

  it('starter Skip pula o primeiro jogador', () => {
    const estado = criarPartidaInicial({
      baralho: baralhoDe('SKIP'),
      modo: 'HOTSEAT',
      totalJogadores: 2,
      idsCustomizados: ['j1', 'j2'],
      rng: () => 0.5,
    });

    expect(estado.monteDescarte.at(-1)!.acao).toBe('SKIP');
    expect(estado.vezDe).toBe('j2');
  });

  it('starter Reverse com 3+ jogadores inverte o sentido e começa no último', () => {
    const estado = criarPartidaInicial({
      baralho: baralhoDe('REVERSE', 40),
      modo: 'HOTSEAT',
      totalJogadores: 4,
      idsCustomizados: ['j1', 'j2', 'j3', 'j4'],
      rng: () => 0.5,
    });

    expect(estado.monteDescarte.at(-1)!.acao).toBe('REVERSE');
    expect(estado.sentido).toBe(-1);
    expect(estado.vezDe).toBe('j4');
  });

  it('starter Reverse com 2 jogadores age como Skip e mantém o primeiro', () => {
    const estado = criarPartidaInicial({
      baralho: baralhoDe('REVERSE'),
      modo: 'HOTSEAT',
      totalJogadores: 2,
      idsCustomizados: ['j1', 'j2'],
      rng: () => 0.5,
    });

    expect(estado.monteDescarte.at(-1)!.acao).toBe('REVERSE');
    expect(estado.vezDe).toBe('j1');
  });
});

describe('GDD §10.8 — +2/+4 como carta vencedora não deixa ataque pendente', () => {
  it('executarJogada: zera ataqueAcumulado/ataqueStack ao vencer com +2', () => {
    const estado = estadoBase({
      jogadores: [
        {
          id: 'j1',
          nome: 'J1',
          mao: [cartaAcao('AZUL', 'MAIS_DOIS')],
          isBot: false,
          conectado: true,
          disseUno: false,
          avatar: '⭐',
          pontos: 0,
        },
        {
          id: 'j2',
          nome: 'J2',
          mao: [cartaNum('VERDE', 3)],
          isBot: false,
          conectado: true,
          disseUno: false,
          avatar: '⭐',
          pontos: 0,
        },
      ],
      monteDescarte: [cartaAcao('AZUL', 'MAIS_DOIS', '-topo')],
      corAtiva: 'AZUL',
    });

    const r = executarJogada({ estado, cartaIndex: 0 });

    expect(r.novoEstado.finalizada).toBe(true);
    expect(r.novoEstado.vencedor).toBe('j1');
    expect(r.novoEstado.ataqueAcumulado).toBe(0);
    expect(r.novoEstado.ataqueStack).toEqual([]);
  });
});
