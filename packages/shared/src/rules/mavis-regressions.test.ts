import { describe, expect, it } from 'vitest';
import type { Carta, Cor, Acao } from '../types/card.js';
import type { EstadoPartida } from '../types/game.js';
import { comprarCartas, criarPartidaInicial, executarJogada, executarTurnoBot } from './index.js';

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

function acao(id: string, acaoCarta: Acao, cor: Cor = 'NEUTRO'): Carta {
  return {
    id,
    cor,
    tipo: cor === 'NEUTRO' ? 'NEUTRA' : 'ACAO',
    acao: acaoCarta,
    raridade: 'UNICA',
    colecao: 'test',
    efeito_texto_curto: acaoCarta,
    efeito_texto_longo: acaoCarta,
  };
}

function jogador(id: string, mao: readonly Carta[], isBot = false) {
  return {
    id,
    nome: id,
    avatar: '⭐',
    mao,
    isBot,
    conectado: true,
    disseUno: false,
    pontos: 0,
  };
}

function estadoBase(overrides: Partial<EstadoPartida> = {}): EstadoPartida {
  return {
    partidaId: 'partida',
    salaId: 'sala',
    jogadores: [
      jogador('j1', [numero('j1-carta', 'VERDE', 9)]),
      jogador('j2', [numero('j2-carta', 'AZUL', 3)]),
    ],
    monteCompra: [numero('compra-1', 'PRETO', 1)],
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

describe('regressões Mavis — efeitos terminais de mão', () => {
  it('TROCA_MAO como última carta vence antes de trocar as mãos', () => {
    const troca = acao('troca', 'TROCA_MAO');
    const maoAlvo = [numero('alvo-1', 'AZUL', 1), numero('alvo-2', 'VERDE', 2)];
    const estado = estadoBase({ jogadores: [jogador('j1', [troca]), jogador('j2', maoAlvo)] });

    const resultado = executarJogada({
      estado,
      cartaIndex: 0,
      corEscolhida: 'PRETO',
      alvoTrocaId: 'j2',
    });

    expect(resultado.novoEstado.finalizada).toBe(true);
    expect(resultado.novoEstado.vencedor).toBe('j1');
    expect(resultado.novoEstado.jogadores[0]!.mao).toEqual([]);
    expect(resultado.novoEstado.jogadores[1]!.mao).toEqual(maoAlvo);
    expect(resultado.eventos.some((evento) => evento.tipo === 'MAO_TROCADA')).toBe(false);
  });

  it('GIRA_MAO como última carta vence antes de girar qualquer mão', () => {
    const gira = acao('gira', 'GIRA_MAO');
    const maoJ2 = [numero('j2-1', 'AZUL', 1)];
    const maoJ3 = [numero('j3-1', 'VERDE', 2), numero('j3-2', 'PRETO', 3)];
    const estado = estadoBase({
      jogadores: [jogador('j1', [gira]), jogador('j2', maoJ2), jogador('j3', maoJ3)],
    });

    const resultado = executarJogada({
      estado,
      cartaIndex: 0,
      corEscolhida: 'LARANJA',
    });

    expect(resultado.novoEstado.finalizada).toBe(true);
    expect(resultado.novoEstado.vencedor).toBe('j1');
    expect(resultado.novoEstado.jogadores.map((item) => item.mao)).toEqual([[], maoJ2, maoJ3]);
    expect(resultado.eventos.some((evento) => evento.tipo === 'MAO_GIRADA')).toBe(false);
  });
});

describe('regressões Mavis — pagamento atômico de ataque', () => {
  it('compra o ataque integralmente após reciclar o descarte', () => {
    const estado = estadoBase({
      jogadores: [jogador('j1', [numero('mao-j1', 'VERDE', 9)]), jogador('j2', [])],
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
      monteCompra: [numero('compra-direta', 'PRETO', 1)],
      monteDescarte: [
        numero('recicla-1', 'LARANJA', 1),
        numero('recicla-2', 'VERDE', 2),
        numero('recicla-3', 'PRETO', 3),
        numero('topo-ataque', 'AZUL', 4),
      ],
    });

    const resultado = comprarCartas({ estado, rng: () => 0 });

    expect(resultado.cartasCompradasIds).toHaveLength(4);
    expect(resultado.novoEstado.jogadores[0]!.mao).toHaveLength(5);
    expect(resultado.novoEstado.monteDescarte.map((carta) => carta.id)).toEqual(['topo-ataque']);
    expect(resultado.novoEstado.ataqueAcumulado).toBe(0);
    expect(resultado.novoEstado.vezDe).toBe('j2');
  });

  it('encerra por menor mão sem compra parcial quando o baralho inteiro não paga o ataque', () => {
    const maoJ1 = [
      numero('j1-1', 'VERDE', 9),
      numero('j1-2', 'PRETO', 8),
      numero('j1-3', 'LARANJA', 7),
    ];
    const maoJ2 = [numero('j2-1', 'VERDE', 2)];
    const maoJ3 = [numero('j3-1', 'PRETO', 3)];
    const estado = estadoBase({
      jogadores: [jogador('j1', maoJ1), jogador('j2', maoJ2), jogador('j3', maoJ3)],
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
      monteCompra: [numero('unica-disponivel', 'AZUL', 1)],
      monteDescarte: [numero('topo-ataque', 'AZUL', 4)],
    });
    const antes = structuredClone(estado);

    const resultado = comprarCartas({ estado });

    expect(estado).toEqual(antes);
    expect(resultado.novoEstado.finalizada).toBe(true);
    expect(resultado.novoEstado.vencedor).toBe('j2');
    expect(resultado.novoEstado.jogadores.map((item) => item.mao)).toEqual([maoJ1, maoJ2, maoJ3]);
    expect(resultado.cartasCompradasIds).toEqual([]);
    expect(resultado.novoEstado.ataqueAcumulado).toBe(4);
    expect(resultado.novoEstado.ataqueStack).toEqual(['MAIS_QUATRO']);
    expect(resultado.eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'MONTE_ESGOTADO',
        jogadorId: 'j1',
        cartasSolicitadas: 4,
        cartasObtidas: 0,
      }),
    );
  });
});

describe('regressões Mavis — origem canônica do ataque starter', () => {
  it('0+ encerra por menor mão sem compra parcial quando o baralho inteiro não paga o reflexo', () => {
    const zero = acao('zero-reflexo-esgotado', 'ZERO_MAIS');
    const estado = estadoBase({
      jogadores: [
        jogador('j1', [zero, numero('j1-restante', 'VERDE', 9)]),
        jogador('j2', [numero('j2-unica', 'PRETO', 3)]),
      ],
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
      monteCompra: [numero('unica-disponivel-reflexo', 'AZUL', 1)],
      monteDescarte: [numero('topo-reflexo', 'AZUL', 4)],
      historico: [
        {
          tipo: 'ATAQUE_ACUMULADO',
          timestamp: 1,
          novo: 4,
          stack: ['MAIS_QUATRO'],
          origem: 'j2',
        },
      ],
    });

    const resultado = executarJogada({ estado, cartaIndex: 0, corEscolhida: 'VERDE' });

    expect(resultado.novoEstado.finalizada).toBe(true);
    expect(resultado.novoEstado.vencedor).toBe('j1');
    expect(resultado.novoEstado.jogadores[1]!.mao).toHaveLength(1);
    expect(resultado.novoEstado.ataqueAcumulado).toBe(4);
    expect(resultado.eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'MONTE_ESGOTADO',
        jogadorId: 'j2',
        cartasSolicitadas: 4,
        cartasObtidas: 0,
      }),
    );
  });

  it('0+ cancela ataque de starter sem punir um jogador que não atacou', () => {
    const baralho = Array.from({ length: 20 }, (_, index) =>
      acao(`starter-mais-dois-${index}`, 'MAIS_DOIS', 'AZUL'),
    );
    const inicial = criarPartidaInicial({
      baralho,
      modo: 'HOTSEAT',
      totalJogadores: 2,
      idsCustomizados: ['j1', 'j2'],
      rng: () => 0,
    });
    const zero = acao('zero-starter', 'ZERO_MAIS');
    const estado: EstadoPartida = {
      ...inicial,
      jogadores: inicial.jogadores.map((item) =>
        item.id === 'j1' ? { ...item, mao: [zero, ...item.mao.slice(1)] } : item,
      ),
    };
    const maosAntes = estado.jogadores.map((item) => item.mao.length);

    expect(estado.historico).toContainEqual(
      expect.objectContaining({ tipo: 'ATAQUE_ACUMULADO', origem: 'STARTER' }),
    );

    const resultado = executarJogada({
      estado,
      cartaIndex: 0,
      corEscolhida: 'VERDE',
    });

    expect(resultado.novoEstado.ataqueAcumulado).toBe(0);
    expect(resultado.novoEstado.ataqueStack).toEqual([]);
    expect(resultado.novoEstado.jogadores.map((item) => item.mao.length)).toEqual([
      maosAntes[0]! - 1,
      maosAntes[1],
    ]);
    expect(resultado.novoEstado.vezDe).toBe('j2');
    expect(resultado.eventos.some((evento) => evento.tipo === 'CARTA_COMPRADA')).toBe(false);
  });
});

describe('regressões Mavis — alvo de TROCA_MAO do bot', () => {
  it('escolhe deterministicamente o primeiro outro jogador na ordem canônica', () => {
    const troca = acao('troca-bot', 'TROCA_MAO');
    const restoBot = numero('resto-bot', 'VERDE', 9);
    const maoJ2 = [numero('mao-j2', 'AZUL', 2)];
    const maoJ3 = [numero('mao-j3', 'PRETO', 3)];
    const estado = estadoBase({
      jogadores: [
        jogador('bot', [troca, restoBot], true),
        jogador('j2', maoJ2),
        jogador('j3', maoJ3),
      ],
      vezDe: 'bot',
    });

    const resultado = executarTurnoBot({ estado, nivel: 'FACIL' });

    expect(resultado.acao).toBe('JOGOU');
    expect(resultado.novoEstado.jogadores[0]!.mao).toEqual(maoJ2);
    expect(resultado.novoEstado.jogadores[1]!.mao).toEqual([restoBot]);
    expect(resultado.novoEstado.jogadores[2]!.mao).toEqual(maoJ3);
    expect(resultado.eventos).toContainEqual(
      expect.objectContaining({ tipo: 'MAO_TROCADA', jogadorA: 'bot', jogadorB: 'j2' }),
    );
  });
});

describe('regressões Mavis — contrato de quantidade da compra', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejeita quantidade que não seja inteiro positivo: %s',
    (quantidade) => {
      const estado = estadoBase();
      const antes = structuredClone(estado);

      expect(() => comprarCartas({ estado, quantidade })).toThrow(/inteiro positivo/i);
      expect(estado).toEqual(antes);
    },
  );

  it('fora de ataque rejeita quantidade diferente de uma carta', () => {
    const estado = estadoBase({
      jogadores: [jogador('j1', []), jogador('j2', [numero('j2-carta-voluntaria', 'AZUL', 3)])],
      monteCompra: Array.from({ length: 4 }, (_, i) => numero(`voluntaria-${i}`, 'PRETO', i % 10)),
    });
    const antes = structuredClone(estado);

    expect(() => comprarCartas({ estado, quantidade: 3 })).toThrow(/exatamente 1/i);
    expect(estado).toEqual(antes);
  });

  it('sob ataque rejeita quantidade diferente do total acumulado', () => {
    const estado = estadoBase({
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO'],
      monteCompra: Array.from({ length: 8 }, (_, i) => numero(`compra-${i}`, 'PRETO', i % 10)),
    });
    const antes = structuredClone(estado);

    expect(() => comprarCartas({ estado, quantidade: 2 })).toThrow(/ataque acumulado/i);
    expect(() => comprarCartas({ estado, quantidade: 6 })).toThrow(/ataque acumulado/i);
    expect(estado).toEqual(antes);
  });
});

describe('regressões Mavis — pré-condições canônicas', () => {
  it('rejeita carta neutra sem cor escolhida sem mutar o estado', () => {
    const coringa = acao('coringa-sem-cor', 'CORINGA');
    const estado = estadoBase({
      jogadores: [
        jogador('j1', [coringa, numero('restante', 'VERDE', 9)]),
        jogador('j2', [numero('j2-carta', 'AZUL', 3)]),
      ],
    });
    const antes = structuredClone(estado);

    expect(() => executarJogada({ estado, cartaIndex: 0 })).toThrow(/corEscolhida/i);
    expect(estado).toEqual(antes);
  });

  it('rejeita setup sem starter colorida elegível', () => {
    const baralho = Array.from({ length: 15 }, (_, index) => acao(`neutra-${index}`, 'CORINGA'));

    expect(() =>
      criarPartidaInicial({
        baralho,
        modo: 'HOTSEAT',
        totalJogadores: 2,
        rng: () => 0,
      }),
    ).toThrow(/starter colorida/i);
  });
});
