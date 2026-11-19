import { describe, expect, it } from 'vitest';
import type { Carta, EstadoPartidaPublico, JogadorPublico } from '@kabemjunto/shared';
import {
  alternarSelecao,
  calcularLeque,
  cartasDaJogada,
  classificarGesto,
  diagnosticarCarta,
  diagnosticarCompra,
  estaNaZonaDeSoltura,
  EXTENSAO_CARTA_INCLINADA,
  janelaInterceptavel,
  MOTIVO_CORTA_FRENTE,
  ordenarAdversarios,
  posicoesAssentos,
  precisaEscolherCor,
  RAIO_ZONA_DE_SOLTURA,
  reconciliarSelecao,
  rotuloDaCarta,
} from './interacao';

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

function acao(id: string, cor: Carta['cor'], nome: NonNullable<Carta['acao']>): Carta {
  return {
    id,
    tipo: cor === 'NEUTRO' ? 'NEUTRA' : 'ACAO',
    cor,
    acao: nome,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: nome,
    efeito_texto_longo: nome,
  };
}

function jogador(id: string, quantidadeCartas = 5): JogadorPublico {
  return {
    id,
    nome: id,
    quantidadeCartas,
    isBot: id !== 'eu',
    conectado: true,
    disseUno: false,
    avatar: '🦊',
    pontos: 0,
  };
}

function estado(parcial: Partial<EstadoPartidaPublico> = {}): EstadoPartidaPublico {
  return {
    partidaId: 'p',
    salaId: 's',
    jogadores: [jogador('eu'), jogador('b1'), jogador('b2')],
    topo: numerada('topo', 'AZUL', 4),
    quantidadeMonteCompra: 40,
    vezDe: 'eu',
    sentido: 1,
    corAtiva: 'AZUL',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    finalizada: false,
    ...parcial,
  };
}

describe('calcularLeque', () => {
  const opcoes = { larguraDisponivel: 10, larguraCarta: 2 };

  it('nunca passa da largura disponível, nem com a carta inclinada', () => {
    for (const total of [1, 2, 5, 7, 12, 25]) {
      const leque = calcularLeque(total, opcoes);
      expect(leque).toHaveLength(total);
      for (const slot of leque) {
        const meiaLarguraOcupada = (opcoes.larguraCarta * EXTENSAO_CARTA_INCLINADA) / 2;
        expect(Math.abs(slot.x) + meiaLarguraOcupada).toBeLessThanOrEqual(
          opcoes.larguraDisponivel / 2 + 1e-9,
        );
      }
    }
  });

  it('é simétrico e as pontas giram para fora e caem', () => {
    const leque = calcularLeque(5, opcoes);
    expect(leque[0]!.x).toBeCloseTo(-leque[4]!.x);
    expect(leque[0]!.rotacao).toBeGreaterThan(0);
    expect(leque[4]!.rotacao).toBeLessThan(0);
    expect(leque[2]!.y).toBeCloseTo(0);
    expect(leque[0]!.y).toBeLessThan(0);
  });

  it('uma carta fica centrada e reta', () => {
    expect(calcularLeque(1, opcoes)).toEqual([{ x: 0, y: -0, rotacao: -0, camada: 0 }]);
  });

  it('em mão apertada, as vizinhas abrem espaço para a carta em foco', () => {
    const semFoco = calcularLeque(12, opcoes);
    const comFoco = calcularLeque(12, { ...opcoes, indiceEmFoco: 6 });
    expect(comFoco[5]!.x).toBeLessThan(semFoco[5]!.x);
    expect(comFoco[7]!.x).toBeGreaterThan(semFoco[7]!.x);
    expect(comFoco[6]!.x).toBe(semFoco[6]!.x);
  });

  it('camadas crescem da esquerda para a direita', () => {
    expect(calcularLeque(4, opcoes).map((slot) => slot.camada)).toEqual([0, 1, 2, 3]);
  });
});

describe('assentos', () => {
  it('distribui adversários em volta da mesa, longe do jogador local', () => {
    const assentos = posicoesAssentos(3);
    expect(assentos).toHaveLength(3);
    // Quem joga depois de mim fica à minha esquerda; o do meio, à frente.
    expect(assentos[0]!.x).toBeLessThan(0);
    expect(assentos[1]!.z).toBeCloseTo(-1);
    expect(assentos[2]!.x).toBeGreaterThan(0);
    for (const assento of assentos) expect(Math.hypot(assento.x, assento.z)).toBeCloseTo(1);
  });

  it('ordena adversários a partir de quem joga depois do jogador local', () => {
    const jogadores = ['a', 'b', 'eu', 'c'].map((id) => jogador(id));
    expect(ordenarAdversarios(jogadores, 'eu').map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('gesto e zona de soltura', () => {
  it('toque dentro do limiar, mouse arrasta logo depois', () => {
    expect(classificarGesto('mouse', 3, 2, 200)).toBe('toque');
    expect(classificarGesto('mouse', 10, 0, 200)).toBe('arrastar');
  });

  it('com o dedo, deslizar de lado varre a mão e puxar para cima tira a carta', () => {
    expect(classificarGesto('touch', 8, 6, 200)).toBe('toque');
    expect(classificarGesto('touch', 60, -10, 200)).toBe('varrer');
    expect(classificarGesto('touch', 10, -70, 200)).toBe('arrastar');
    expect(classificarGesto('touch', 0, 60, 200)).toBe('varrer');
  });

  it('zona de soltura é o círculo central da mesa', () => {
    expect(estaNaZonaDeSoltura({ x: 0.5, z: 0.5 })).toBe(true);
    expect(estaNaZonaDeSoltura({ x: RAIO_ZONA_DE_SOLTURA + 0.1, z: 0 })).toBe(false);
    expect(estaNaZonaDeSoltura(null)).toBe(false);
  });
});

describe('diagnosticarCarta', () => {
  it('marca jogável, bloqueada (com motivo) e fora da vez', () => {
    expect(diagnosticarCarta(estado(), numerada('a', 'AZUL', 9), 'eu').situacao).toBe('jogavel');
    const bloqueada = diagnosticarCarta(estado(), numerada('b', 'VERDE', 9), 'eu');
    expect(bloqueada.situacao).toBe('bloqueada');
    expect(bloqueada.motivo).toMatch(/cor ativa/);
    expect(diagnosticarCarta(estado({ vezDe: 'b1' }), numerada('a', 'AZUL', 9), 'eu')).toEqual({
      situacao: 'aguardando',
      motivo: 'Aguarde a sua vez.',
    });
  });

  it('respeita o ataque acumulado: +2 sobre +4 é proibido', () => {
    const sobQuatro = estado({ ataqueAcumulado: 4, topo: acao('t', 'NEUTRO', 'MAIS_QUATRO') });
    expect(diagnosticarCarta(sobQuatro, acao('d', 'AZUL', 'MAIS_DOIS'), 'eu').situacao).toBe(
      'bloqueada',
    );
    expect(diagnosticarCarta(sobQuatro, acao('z', 'NEUTRO', 'ZERO_MAIS'), 'eu').situacao).toBe(
      'jogavel',
    );
  });

  it('Corta-Frente: carta idêntica fica interceptável; o resto espera a janela fechar', () => {
    const janela = {
      janelaId: 'j1',
      cartaAlvoId: 'topo',
      jogadorOrigemId: 'b1',
      fechaEm: Date.now() + 4000,
      proximaVezId: 'eu',
      revisao: 1,
    };
    const comJanela = estado({ interceptacao: janela, topo: numerada('topo', 'AZUL', 5) });
    expect(diagnosticarCarta(comJanela, numerada('x', 'AZUL', 5), 'eu').situacao).toBe(
      'interceptavel',
    );
    expect(diagnosticarCarta(comJanela, numerada('y', 'AZUL', 9), 'eu')).toEqual({
      situacao: 'aguardando',
      motivo: MOTIVO_CORTA_FRENTE,
    });
    // Quem descartou não intercepta a própria carta.
    expect(janelaInterceptavel(comJanela, 'b1')).toBeUndefined();
    expect(diagnosticarCarta(comJanela, numerada('x', 'AZUL', 5), 'b1').situacao).toBe(
      'aguardando',
    );
  });
});

describe('diagnosticarCompra', () => {
  it('só compra quem não tem carta válida (Troca Mão não obriga)', () => {
    expect(diagnosticarCompra(estado(), [numerada('a', 'AZUL', 1)], 'eu').permitido).toBe(false);
    expect(diagnosticarCompra(estado(), [numerada('a', 'VERDE', 1)], 'eu')).toEqual({
      permitido: true,
      quantidade: 1,
    });
    expect(diagnosticarCompra(estado(), [acao('t', 'NEUTRO', 'TROCA_MAO')], 'eu').permitido).toBe(
      true,
    );
  });

  it('sob ataque, comprar entrega o ataque inteiro', () => {
    const sobAtaque = estado({ ataqueAcumulado: 6, topo: acao('t', 'AZUL', 'MAIS_DOIS') });
    expect(diagnosticarCompra(sobAtaque, [numerada('a', 'AZUL', 1)], 'eu')).toEqual({
      permitido: true,
      quantidade: 6,
    });
  });

  it('fora da vez ou com Corta-Frente aberto, não compra', () => {
    expect(diagnosticarCompra(estado({ vezDe: 'b1' }), [], 'eu').permitido).toBe(false);
    const janela = {
      janelaId: 'j',
      cartaAlvoId: 'topo',
      jogadorOrigemId: 'b1',
      fechaEm: 0,
      proximaVezId: 'eu',
      revisao: 1,
    };
    expect(diagnosticarCompra(estado({ interceptacao: janela }), [], 'eu').motivo).toBe(
      MOTIVO_CORTA_FRENTE,
    );
  });
});

describe('seleção para descarte múltiplo', () => {
  const seisAzul = numerada('6a', 'AZUL', 6);
  const seisVerde = numerada('6v', 'VERDE', 6);
  const noveAzul = numerada('9a', 'AZUL', 9);
  const coringa = acao('c', 'NEUTRO', 'CORINGA_SIMPLES');
  const mao = [seisAzul, seisVerde, noveAzul, coringa];

  it('junta cartas de mesma face e recomeça com face diferente', () => {
    let selecao = alternarSelecao([], seisVerde, mao);
    selecao = alternarSelecao(selecao, seisAzul, mao);
    expect(selecao).toEqual(['6v', '6a']);
    expect(alternarSelecao(selecao, noveAzul, mao)).toEqual(['9a']);
    expect(alternarSelecao(selecao, seisAzul, mao)).toEqual(['6v']);
  });

  it('neutras não entram em grupo', () => {
    expect(alternarSelecao(['6a'], coringa, mao)).toEqual(['c']);
  });

  it('o grupo sai inteiro, começando por uma carta válida contra a mesa', () => {
    const valida = (carta: Carta) => carta.cor === 'AZUL';
    expect(cartasDaJogada('6v', ['6v', '6a'], mao, valida)).toEqual(['6a', '6v']);
    expect(cartasDaJogada('9a', ['6v', '6a'], mao, valida)).toEqual(['9a']);
    expect(cartasDaJogada('6a', ['6a'], mao, valida)).toEqual(['6a']);
  });

  it('reconciliar remove o que saiu da mão e mantém a referência sem mudança', () => {
    const selecao = ['6a', '6v'];
    expect(reconciliarSelecao(selecao, mao)).toBe(selecao);
    expect(reconciliarSelecao(selecao, [seisAzul])).toEqual(['6a']);
  });
});

describe('rótulos', () => {
  it('a carta 7 é falada como numérica comum (ADR-010)', () => {
    const sete: Carta = { ...numerada('7', 'VERDE', 7), acao: 'SILENCIO' };
    expect(rotuloDaCarta(sete)).toBe('7 Verde');
    expect(rotuloDaCarta(acao('s', 'AZUL', 'SKIP'))).toBe('Pula Azul');
    expect(rotuloDaCarta(acao('c', 'NEUTRO', 'CORINGA_SIMPLES'))).toBe('Coringa');
  });

  it('neutras pedem cor, Troca Mão pede alvo primeiro', () => {
    expect(precisaEscolherCor(acao('c', 'NEUTRO', 'MAIS_QUATRO'))).toBe(true);
    expect(precisaEscolherCor(acao('t', 'NEUTRO', 'TROCA_MAO'))).toBe(false);
    expect(precisaEscolherCor(numerada('n', 'AZUL', 1))).toBe(false);
  });
});
