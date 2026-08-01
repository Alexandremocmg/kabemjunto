import { describe, expect, it } from 'vitest';
import {
  abrirJanelaInterceptacao,
  interceptar,
  resolverJanelaExpirada,
  isEligibleForInterception,
  saoCartasIdenticas,
} from './interception.js';
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

function estadoCom(
  jogadores: ReadonlyArray<Jogador>,
  topo: Carta,
  vezDe = jogadores[0]!.id,
): EstadoPartida {
  return {
    partidaId: 'p',
    salaId: 's',
    jogadores,
    monteCompra: [],
    monteDescarte: [topo],
    vezDe,
    sentido: 1,
    corAtiva: topo.cor !== 'NEUTRO' ? topo.cor : 'LARANJA',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    historico: [],
    finalizada: false,
  };
}

describe('isEligibleForInterception / saoCartasIdenticas', () => {
  it('aceita números, +2, Skip, Reverse; rejeita neutras', () => {
    expect(isEligibleForInterception(numero('n1', 'AZUL', 5))).toBe(true);
    expect(isEligibleForInterception(acao('a1', 'AZUL', 'MAIS_DOIS'))).toBe(true);
    expect(isEligibleForInterception(acao('a2', 'AZUL', 'SKIP'))).toBe(true);
    expect(isEligibleForInterception(acao('a3', 'AZUL', 'REVERSE'))).toBe(true);
    expect(isEligibleForInterception(neutra('n2', 'MAIS_QUATRO'))).toBe(false);
    expect(isEligibleForInterception(neutra('n3', 'ZERO_MAIS'))).toBe(false);
    expect(isEligibleForInterception({ ...acao('a4', 'AZUL', 'SILENCIO') })).toBe(false);
    // ADR-013: +2 Para Todos é NEUTRA — fora da V1 por construção.
    expect(isEligibleForInterception(neutra('n4', 'MAIS_DOIS_TODOS'))).toBe(false);
  });

  it('exige mesma cor E mesmo número/ação — não basta a mesma face', () => {
    const azul5 = numero('azul5', 'AZUL', 5);
    const verde5 = numero('verde5', 'VERDE', 5);
    const azul6 = numero('azul6', 'AZUL', 6);
    expect(saoCartasIdenticas(azul5, verde5)).toBe(false);
    expect(saoCartasIdenticas(azul5, azul6)).toBe(false);
    expect(saoCartasIdenticas(azul5, numero('azul5-outra', 'AZUL', 5))).toBe(true);
  });
});

describe('abrirJanelaInterceptacao', () => {
  it('abre janela com fechaEm fornecido pelo orquestrador', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const estado = estadoCom([jogador('j1', []), jogador('j2', [])], topo);
    const novoEstado = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j2',
    });

    expect(novoEstado.interceptacao).toEqual({
      janelaId: 'janela-1',
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      fechaEm: 1000,
      proximaVezId: 'j2',
      revisao: 1,
    });
  });

  it('rejeita se cartaAlvoId não é o topo atual do descarte', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const estado = estadoCom([jogador('j1', []), jogador('j2', [])], topo);
    expect(() =>
      abrirJanelaInterceptacao({
        estado,
        cartaAlvoId: 'outra-carta',
        jogadorOrigemId: 'j1',
        janelaId: 'janela-1',
        fechaEm: 1000,
        proximaVezId: 'j2',
      }),
    ).toThrow();
  });
});

describe('interceptar', () => {
  it('carta idêntica de outro jogador aceita e avança turno a partir do interceptador', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const cartaIdentica = numero('cinco-azul-2', 'AZUL', 5);
    const cartaSobra = numero('sobra-j2', 'PRETO', 1);
    const estado = estadoCom(
      [jogador('j1', []), jogador('j2', [cartaIdentica, cartaSobra]), jogador('j3', [])],
      topo,
    );
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j3',
    });

    const { novoEstado, eventos } = interceptar({
      estado: comJanela,
      janelaId: 'janela-1',
      cartaId: cartaIdentica.id,
      jogadorId: 'j2',
    });

    expect(novoEstado.interceptacao).toBeUndefined();
    expect(novoEstado.monteDescarte.at(-1)?.id).toBe(cartaIdentica.id);
    expect(novoEstado.jogadores.find((j) => j.id === 'j2')?.mao).toEqual([cartaSobra]);
    // interceptador é j2 (índice 1); próximo no sentido 1 é j3 (índice 2)
    expect(novoEstado.vezDe).toBe('j3');
    expect(eventos.map((e) => e.tipo)).toContain('INTERCEPTACAO_ACEITA');
  });

  it('mesma face mas cor diferente rejeita (Corta-Frente exige 100% idêntica)', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const cartaMesmaFace = numero('cinco-verde', 'VERDE', 5);
    const estado = estadoCom([jogador('j1', []), jogador('j2', [cartaMesmaFace])], topo);
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j2',
    });

    expect(() =>
      interceptar({
        estado: comJanela,
        janelaId: 'janela-1',
        cartaId: cartaMesmaFace.id,
        jogadorId: 'j2',
      }),
    ).toThrow(/idêntica/i);
  });

  it('remetente original não pode interceptar a própria carta', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const outraIdentica = numero('cinco-azul-2', 'AZUL', 5);
    const estado = estadoCom([jogador('j1', [outraIdentica]), jogador('j2', [])], topo);
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j2',
    });

    expect(() =>
      interceptar({
        estado: comJanela,
        janelaId: 'janela-1',
        cartaId: outraIdentica.id,
        jogadorId: 'j1',
      }),
    ).toThrow(/própria carta/i);
  });

  it('janelaId diferente (estado obsoleto) não pode resolver a janela ativa', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const cartaIdentica = numero('cinco-azul-2', 'AZUL', 5);
    const estado = estadoCom([jogador('j1', []), jogador('j2', [cartaIdentica])], topo);
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j2',
    });

    expect(() =>
      interceptar({
        estado: comJanela,
        janelaId: 'janela-antiga-obsoleta',
        cartaId: cartaIdentica.id,
        jogadorId: 'j2',
      }),
    ).toThrow();
  });

  it('acumula MAIS_DOIS ao interceptar com +2 idêntico', () => {
    const topo = acao('topo-mais2', 'AZUL', 'MAIS_DOIS');
    const interceptador = acao('mais2-azul-2', 'AZUL', 'MAIS_DOIS');
    const cartaSobra = numero('sobra-j2', 'PRETO', 1);
    const estado = {
      ...estadoCom(
        [jogador('j1', []), jogador('j2', [interceptador, cartaSobra]), jogador('j3', [])],
        topo,
      ),
      ataqueAcumulado: 2,
      ataqueStack: ['MAIS_DOIS' as const],
    };
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j3',
    });

    const { novoEstado } = interceptar({
      estado: comJanela,
      janelaId: 'janela-1',
      cartaId: interceptador.id,
      jogadorId: 'j2',
    });

    expect(novoEstado.ataqueAcumulado).toBe(4);
    expect(novoEstado.ataqueStack).toEqual(['MAIS_DOIS', 'MAIS_DOIS']);
  });

  it('declara vitória quando a interceptação esvazia a mão do interceptador', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const ultimaCarta = numero('cinco-azul-2', 'AZUL', 5);
    const estado = estadoCom(
      [jogador('j1', []), jogador('j2', [ultimaCarta]), jogador('j3', [])],
      topo,
    );
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j3',
    });

    const { novoEstado, eventos } = interceptar({
      estado: comJanela,
      janelaId: 'janela-1',
      cartaId: ultimaCarta.id,
      jogadorId: 'j2',
    });

    expect(novoEstado.finalizada).toBe(true);
    expect(novoEstado.vencedor).toBe('j2');
    expect(eventos.map((e) => e.tipo)).toContain('VITORIA');
  });

  it('reseta silencio.ativo ao interceptar (qualquer carta no topo desativa o silêncio)', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const cartaIdentica = numero('cinco-azul-2', 'AZUL', 5);
    const estadoBase = estadoCom(
      [jogador('j1', []), jogador('j2', [cartaIdentica]), jogador('j3', [])],
      topo,
    );
    const estado = {
      ...estadoBase,
      silencio: { ativo: true, jogadoresQuebraram: ['j3'] },
    };
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j3',
    });

    const { novoEstado } = interceptar({
      estado: comJanela,
      janelaId: 'janela-1',
      cartaId: cartaIdentica.id,
      jogadorId: 'j2',
    });

    expect(novoEstado.silencio).toEqual({ ativo: false, jogadoresQuebraram: [] });
  });
});

describe('resolverJanelaExpirada', () => {
  it('timeout avança para proximaVezId previamente calculada', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const estado = estadoCom([jogador('j1', []), jogador('j2', [])], topo);
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j2',
    });

    const resolvido = resolverJanelaExpirada({ estado: comJanela, janelaId: 'janela-1' });

    expect(resolvido.interceptacao).toBeUndefined();
    expect(resolvido.vezDe).toBe('j2');
  });

  it('rejeita resolver com janelaId que não bate (estado obsoleto)', () => {
    const topo = numero('cinco-azul', 'AZUL', 5);
    const estado = estadoCom([jogador('j1', []), jogador('j2', [])], topo);
    const comJanela = abrirJanelaInterceptacao({
      estado,
      cartaAlvoId: topo.id,
      jogadorOrigemId: 'j1',
      janelaId: 'janela-1',
      fechaEm: 1000,
      proximaVezId: 'j2',
    });

    expect(() =>
      resolverJanelaExpirada({ estado: comJanela, janelaId: 'janela-obsoleta' }),
    ).toThrow();
  });
});
