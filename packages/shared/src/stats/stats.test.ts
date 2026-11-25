import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  abrirJanelaInterceptacao,
  calcularEstatisticas,
  comprarCartas,
  criarPartidaInicial,
  escolherPremios,
  executarDescarteMultiplo,
  executarJogada,
  executarTurnoBot,
  interceptar,
  isEligibleForInterception,
  penalizarQuebraSilencio,
  resolverJanelaExpirada,
  resumirPartida,
  saoCartasIdenticas,
  MAX_PREMIOS,
  type Carta,
  type EstadoPartida,
  type EstatisticasJogador,
  type NivelBot,
} from '../index.js';
import { BARALHO_COMPLETO_108 } from '../constants/index.js';

const carta = (id: string): Carta => {
  const achada = BARALHO_COMPLETO_108.find((c) => c.id === id);
  if (!achada) throw new Error(`Carta inexistente: ${id}`);
  return achada;
};

function rngComSemente(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mesa montada à mão; o monte recebe todas as cartas restantes do baralho. */
function mesa(maos: string[][], topo = 'AZUL_NUM_5_1', bots: boolean[] = []): EstadoPartida {
  const usadas = new Set([...maos.flat(), topo]);
  return {
    partidaId: 'partida',
    salaId: 'sala',
    jogadores: maos.map((mao, i) => ({
      id: `j${i + 1}`,
      nome: `Jogador ${i + 1}`,
      avatar: '',
      mao: mao.map(carta),
      isBot: bots[i] ?? false,
      conectado: true,
      disseUno: false,
      pontos: 0,
    })),
    monteCompra: BARALHO_COMPLETO_108.filter((c) => !usadas.has(c.id)),
    monteDescarte: [carta(topo)],
    vezDe: 'j1',
    sentido: 1,
    corAtiva: 'AZUL',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    historico: [],
    finalizada: false,
  };
}

const jogar = (estado: EstadoPartida, id: string, alvoTrocaId?: string): EstadoPartida => {
  const mao = estado.jogadores.find((j) => j.id === estado.vezDe)!.mao;
  return executarJogada({
    estado,
    cartaIndex: mao.findIndex((c) => c.id === id),
    corEscolhida: 'AZUL',
    ...(alvoTrocaId !== undefined ? { alvoTrocaId } : {}),
  }).novoEstado;
};

const stat = (estado: EstadoPartida, id: string): EstatisticasJogador =>
  calcularEstatisticas(estado).find((e) => e.jogadorId === id)!;

const soma = (es: EstatisticasJogador[], f: (e: EstatisticasJogador) => number): number =>
  es.reduce((total, e) => total + f(e), 0);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('estatísticas com jogadas reais do motor', () => {
  it('histórico vazio dá tudo zero e nenhum prêmio, mesmo finalizada', () => {
    const estado = { ...mesa([['AZUL_NUM_1_1'], ['AZUL_NUM_2_1']]), finalizada: true };
    const r = resumirPartida(estado);
    expect(r).toMatchObject({ motivo: null, vencedorId: null, premios: [] });
    expect(soma(r.jogadores, (e) => e.cartasJogadas + e.compras.total)).toBe(0);
  });

  it('pilha de +2 e +4 é cobrada de quem não cobriu; compra comum fica separada', () => {
    let e = mesa([
      ['AZUL_PLUS2_1', 'AZUL_NUM_1_1'],
      ['NEUTRA_WILD4_1', 'VERDE_NUM_1_1'],
      ['VERDE_NUM_2_1'],
    ]);
    e = jogar(e, 'AZUL_PLUS2_1');
    e = jogar(e, 'NEUTRA_WILD4_1');
    e = comprarCartas({ estado: e }).novoEstado;
    expect(stat(e, 'j3').compras).toEqual({
      total: 6,
      comuns: 0,
      silencio: 0,
      outras: 0,
      ataque: { total: 6, pilha: 6, paraTodos: 0, reflexo: 0, naoClassificadas: 0 },
    });
    const comum = comprarCartas({
      estado: mesa([['VERDE_NUM_1_1'], ['VERDE_NUM_2_1']]),
    }).novoEstado;
    expect(stat(comum, 'j1').compras).toMatchObject({ total: 1, comuns: 1 });
  });

  it('+2 Para Todos: 2 para cada adversário, nada para quem jogou', () => {
    const e = jogar(
      mesa([['NEUTRA_PLUS2ALL_1', 'AZUL_NUM_1_1'], ['VERDE_NUM_1_1'], ['VERDE_NUM_2_1']]),
      'NEUTRA_PLUS2ALL_1',
    );
    expect(calcularEstatisticas(e).map((s) => s.compras.ataque.paraTodos)).toEqual([0, 2, 2]);
    expect(soma(calcularEstatisticas(e), (s) => s.compras.total)).toBe(4);
  });

  it('reflexo 0+ conta autor, alvo e cartas devolvidas', () => {
    let e = mesa([
      ['AZUL_PLUS2_1', 'AZUL_NUM_1_1'],
      ['NEUTRA_ZEROPLUS_1', 'VERDE_NUM_1_1'],
    ]);
    e = jogar(jogar(e, 'AZUL_PLUS2_1'), 'NEUTRA_ZEROPLUS_1');
    expect(stat(e, 'j2')).toMatchObject({ reflexosFeitos: 1, cartasDevolvidas: 2 });
    expect(stat(e, 'j1')).toMatchObject({ reflexosSofridos: 1, compras: { total: 2 } });
    expect(stat(e, 'j1').compras.ataque.reflexo).toBe(2);
  });

  it('reflexo com monte esgotado não inventa cartas devolvidas', () => {
    let e = mesa([
      ['NEUTRA_WILD4_1', 'AZUL_NUM_1_1'],
      ['NEUTRA_ZEROPLUS_1', 'VERDE_NUM_1_1'],
    ]);
    e = jogar({ ...e, monteCompra: [] }, 'NEUTRA_WILD4_1');
    e = jogar(e, 'NEUTRA_ZEROPLUS_1');
    expect(e.finalizada).toBe(true);
    expect(stat(e, 'j2')).toMatchObject({ reflexosFeitos: 1, cartasDevolvidas: 0 });
    expect(resumirPartida(e).premios).toEqual([]);
  });

  it('0+ contra a carta de abertura, ou sem ataque, não é reflexo', () => {
    const base = mesa([['NEUTRA_ZEROPLUS_1', 'AZUL_NUM_1_1'], ['VERDE_NUM_1_1']], 'AZUL_PLUS2_1');
    const abertura: EstadoPartida = {
      ...base,
      ataqueAcumulado: 2,
      ataqueStack: ['MAIS_DOIS'],
      historico: [
        {
          tipo: 'ATAQUE_ACUMULADO',
          timestamp: 0,
          novo: 2,
          stack: ['MAIS_DOIS'],
          origem: 'STARTER',
        },
      ],
    };
    for (const inicio of [base, abertura]) {
      const e = jogar(inicio, 'NEUTRA_ZEROPLUS_1');
      expect(stat(e, 'j1')).toMatchObject({ reflexosFeitos: 0, cartasDevolvidas: 0 });
    }
    const paga = comprarCartas({ estado: abertura }).novoEstado;
    expect(stat(paga, 'j1').compras.ataque.pilha).toBe(2);
  });

  it('Silêncio ativado e quebrado, com as 2 cartas fora da conta de ataque', () => {
    let e = jogar(mesa([['AZUL_7_1', 'AZUL_NUM_1_1'], ['VERDE_NUM_1_1']]), 'AZUL_7_1');
    e = penalizarQuebraSilencio(e, 'j2').novoEstado;
    e = penalizarQuebraSilencio(e, 'j2').novoEstado; // segunda fala não pune de novo
    expect(stat(e, 'j1').silenciosAtivados).toBe(1);
    expect(stat(e, 'j2')).toMatchObject({
      silenciosQuebrados: 1,
      compras: { total: 2, silencio: 2, ataque: { total: 0 } },
    });
    expect(resumirPartida({ ...e, finalizada: true }).premios).toEqual([
      {
        id: 'LINGUA_SOLTA',
        titulo: 'Língua solta',
        detalhe: 'Não resistiu e quebrou 1 Silêncio.',
        valor: 1,
        jogadorId: 'j2',
      },
    ]);
  });

  it('Corta-Frente conta uma carta jogada só; janela expirada não conta', () => {
    const inicio = jogar(
      mesa([
        ['AZUL_NUM_1_1', 'AZUL_NUM_2_1'],
        ['VERDE_NUM_1_1'],
        ['AZUL_NUM_1_2', 'VERDE_NUM_2_1'],
      ]),
      'AZUL_NUM_1_1',
    );
    const aberta = abrirJanelaInterceptacao({
      estado: inicio,
      cartaAlvoId: 'AZUL_NUM_1_1',
      jogadorOrigemId: 'j1',
      janelaId: 'w',
      fechaEm: 1,
      proximaVezId: inicio.vezDe,
    });
    const e = interceptar({
      estado: aberta,
      janelaId: 'w',
      cartaId: 'AZUL_NUM_1_2',
      jogadorId: 'j3',
    }).novoEstado;
    expect(stat(e, 'j3')).toMatchObject({ cortaFrentes: 1, cartasJogadas: 1 });
    const expirada = resolverJanelaExpirada({ estado: aberta, janelaId: 'w' });
    expect(soma(calcularEstatisticas(expirada), (s) => s.cortaFrentes)).toBe(0);
  });

  it('troca e giro de mão têm autor e alvo corretos', () => {
    let e = mesa([
      ['NEUTRA_SWAPHAND_1', 'AZUL_NUM_1_1'],
      ['NEUTRA_HANDSPIN_1', 'AZUL_NUM_3_1'],
      ['VERDE_NUM_1_1'],
    ]);
    e = jogar(e, 'NEUTRA_SWAPHAND_1', 'j3');
    e = jogar(e, 'NEUTRA_HANDSPIN_1');
    expect(stat(e, 'j1')).toMatchObject({ trocasDeMaoFeitas: 1, trocasDeMaoSofridas: 0 });
    expect(stat(e, 'j3')).toMatchObject({ trocasDeMaoFeitas: 0, trocasDeMaoSofridas: 1 });
    expect(stat(e, 'j2').girosDeMaoFeitos).toBe(1);
  });

  it('descarte múltiplo conta cada carta e a pilha resultante', () => {
    let e = executarDescarteMultiplo({
      estado: mesa([['AZUL_PLUS2_1', 'AZUL_PLUS2_2', 'AZUL_NUM_1_1'], ['VERDE_NUM_1_1']]),
      cartaIndices: [0, 1],
    }).novoEstado;
    e = comprarCartas({ estado: e }).novoEstado;
    expect(stat(e, 'j1').cartasJogadas).toBe(2);
    expect(stat(e, 'j2').compras.ataque.pilha).toBe(4);
  });

  it('log truncado cai em naoClassificadas em vez de adivinhar', () => {
    let e = jogar(mesa([['AZUL_PLUS2_1', 'AZUL_NUM_1_1'], ['VERDE_NUM_1_1']]), 'AZUL_PLUS2_1');
    e = comprarCartas({ estado: { ...e, historico: [] } }).novoEstado;
    expect(stat(e, 'j2').compras.ataque).toMatchObject({ total: 2, pilha: 0, naoClassificadas: 2 });
  });

  it('abandono: motivo certo, sem vencedor, e conta o que já aconteceu', () => {
    const jogada = jogar(
      mesa([['AZUL_NUM_1_1', 'AZUL_NUM_2_1'], ['VERDE_NUM_1_1']]),
      'AZUL_NUM_1_1',
    );
    expect(resumirPartida(jogada)).toMatchObject({ motivo: null, premios: [] });
    const r = resumirPartida({
      ...jogada,
      finalizada: true,
      historico: [
        ...jogada.historico,
        { tipo: 'PARTIDA_FINALIZADA', timestamp: 1, motivo: 'ABANDONO' },
      ],
    });
    expect(r).toMatchObject({ motivo: 'ABANDONO', vencedorId: null });
    expect(r.jogadores[0]!.cartasJogadas).toBe(1);
  });
});

describe('escolha dos prêmios', () => {
  type Ajuste = { jogadas?: number; ataque?: number; quebras?: number; cortes?: number };
  function premiar(ajustes: Ajuste[], bots: boolean[] = []) {
    const base = mesa(
      ajustes.map(() => []),
      undefined,
      bots,
    );
    const es = calcularEstatisticas(base).map((e, i) => ({
      ...e,
      cartasJogadas: ajustes[i]!.jogadas ?? 0,
      silenciosQuebrados: ajustes[i]!.quebras ?? 0,
      cortaFrentes: ajustes[i]!.cortes ?? 0,
      compras: {
        ...e.compras,
        ataque: { ...e.compras.ataque, total: ajustes[i]!.ataque ?? 0 },
      },
    }));
    return escolherPremios(base.jogadores, es).map((p) => `${p.id}:${p.jogadorId}`);
  }

  it('exige mérito mínimo', () => {
    expect(premiar([{ ataque: 5, jogadas: 7 }, {}])).toEqual([]);
  });

  it('empate vai para quem não tem prêmio e, entre iguais, para o primeiro assento', () => {
    expect(premiar([{ cortes: 1, quebras: 1 }, { quebras: 1 }])).toEqual([
      'SNIPER_CORTA_FRENTE:j1',
      'LINGUA_SOLTA:j2',
    ]);
    expect(premiar([{}, { cortes: 1 }, { cortes: 1 }])).toEqual(['SNIPER_CORTA_FRENTE:j2']);
  });

  it('humano com mérito vence bot com número maior; bot só leva o que sobra', () => {
    expect(
      premiar([{ ataque: 6 }, { ataque: 30, cortes: 2 }, { jogadas: 9 }], [false, true, false]),
    ).toEqual(['SACO_DE_PANCADA:j1', 'MAO_LIGEIRA:j3', 'SNIPER_CORTA_FRENTE:j2']);
  });

  it('um só jogador com mérito leva no máximo 2, e nunca duas zoeiras', () => {
    expect(premiar([{ quebras: 1, ataque: 10, cortes: 1, jogadas: 20 }, {}])).toEqual([
      'SNIPER_CORTA_FRENTE:j1',
      'LINGUA_SOLTA:j1',
    ]);
    expect(premiar([{ quebras: 1, ataque: 10 }, {}])).toEqual(['LINGUA_SOLTA:j1']);
  });

  it('com 10 jogadores não passa do limite nem repete jogador', () => {
    const r = premiar(
      Array.from({ length: 10 }, (_, i) => ({ jogadas: 20 - i, cortes: i, quebras: 1, ataque: 8 })),
    );
    expect(r).toEqual(['SNIPER_CORTA_FRENTE:j10', 'LINGUA_SOLTA:j1', 'SACO_DE_PANCADA:j2']);
  });
});

/** Partida completa entre bots, com Silêncios quebrados e Corta-Frentes. */
function simular(semente: number, total: number) {
  const rng = rngComSemente(semente);
  // O turno do bot não repassa o rng a executarJogada; fixa também o global.
  vi.spyOn(Math, 'random').mockImplementation(rng);
  let estado = criarPartidaInicial({
    baralho: BARALHO_COMPLETO_108,
    modo: 'ONLINE_PRIVADA',
    totalJogadores: total,
    bots: Array.from({ length: total }, () => true),
    partidaId: `s${semente}`,
    rng,
  });
  const niveis: NivelBot[] = ['FACIL', 'MEDIO', 'DIFICIL'];
  const esperado = new Map(
    estado.jogadores.map((j) => [j.id, { jogadas: 0, pilha: 0, quebras: 0, cortes: 0 }]),
  );
  let paraTodos = 0;
  let reflexo = 0;

  for (let passo = 0; passo < 2000 && !estado.finalizada; passo++) {
    const antes = estado;
    const r = executarTurnoBot({ estado, nivel: niveis[passo % 3]!, rng });
    estado = r.novoEstado;
    const conta = esperado.get(antes.vezDe)!;
    const esgotou = r.eventos.some((ev) => ev.tipo === 'MONTE_ESGOTADO');
    if (r.acao === 'JOGOU') conta.jogadas += 1;
    if (r.acao === 'COMPROU' && antes.ataqueAcumulado > 0 && !esgotou) {
      conta.pilha += antes.ataqueAcumulado;
    }
    // Referência independente do histórico: quanto o conjunto das mãos cresceu na
    // jogada, descontada a compra comum que o bot faz antes de jogar.
    const cartas = (e: EstadoPartida) => e.jogadores.reduce((n, j) => n + j.mao.length, 0);
    const comprouAntes = r.eventos.filter(
      (ev) => ev.tipo === 'CARTA_COMPRADA' && ev.origem === 'NORMAL',
    ).length;
    const compradasNoEfeito = cartas(estado) - cartas(antes) + 1 - comprouAntes;
    if (r.cartaJogadaId === 'NEUTRA_ZEROPLUS_1') reflexo += compradasNoEfeito;
    if (r.cartaJogadaId === 'NEUTRA_PLUS2ALL_1') paraTodos += compradasNoEfeito;
    if (estado.finalizada) break;

    if (estado.silencio.ativo && estado.monteCompra.length >= 2 && rng() < 0.5) {
      const falador = estado.jogadores[Math.floor(rng() * total)]!.id;
      const q = penalizarQuebraSilencio(estado, falador, rng);
      if (q.penalizado) esperado.get(falador)!.quebras += 1;
      estado = q.novoEstado;
    }
    const topo = estado.monteDescarte.at(-1)!;
    if (r.acao === 'JOGOU' && isEligibleForInterception(topo)) {
      const janelaId = `w${passo}`;
      estado = abrirJanelaInterceptacao({
        estado,
        cartaAlvoId: topo.id,
        jogadorOrigemId: antes.vezDe,
        janelaId,
        fechaEm: 1,
        proximaVezId: estado.vezDe,
      });
      const rival = estado.jogadores.find(
        (j) => j.id !== antes.vezDe && j.mao.some((c) => saoCartasIdenticas(c, topo)),
      );
      if (rival) {
        const cartaId = rival.mao.find((c) => saoCartasIdenticas(c, topo))!.id;
        estado = interceptar({ estado, janelaId, cartaId, jogadorId: rival.id }).novoEstado;
        esperado.get(rival.id)!.cortes += 1;
        esperado.get(rival.id)!.jogadas += 1;
      } else {
        estado = resolverJanelaExpirada({ estado, janelaId });
      }
    }
  }
  return { estado, esperado, paraTodos, reflexo };
}

describe('partidas completas bot contra bot', () => {
  it('invariantes valem em 180 partidas de 2 a 10 jogadores', () => {
    const cobertura = { paraTodos: 0, reflexo: 0, quebras: 0, cortes: 0, giros: 0, trocas: 0 };
    let finalizadas = 0;
    for (let total = 2; total <= 10; total++) {
      for (let s = 1; s <= 20; s++) {
        const { estado, esperado, paraTodos, reflexo } = simular(s * 100 + total, total);
        const es = calcularEstatisticas(estado);
        if (estado.finalizada) finalizadas += 1;

        // Conservação: mãos iniciais + compras - jogadas = mãos finais.
        expect(
          7 * total + soma(es, (e) => e.compras.total) - soma(es, (e) => e.cartasJogadas),
        ).toBe(estado.jogadores.reduce((n, j) => n + j.mao.length, 0));
        for (const e of es) {
          const { ataque, ...c } = e.compras;
          expect(c.total).toBe(c.comuns + c.silencio + c.outras + ataque.total);
          expect(ataque.total).toBe(ataque.pilha + ataque.paraTodos + ataque.reflexo);
          expect(ataque.naoClassificadas).toBe(0);
          expect(c.silencio).toBe(2 * e.silenciosQuebrados);
          expect({
            jogadas: e.cartasJogadas,
            pilha: ataque.pilha,
            quebras: e.silenciosQuebrados,
            cortes: e.cortaFrentes,
          }).toEqual(esperado.get(e.jogadorId));
        }
        expect(soma(es, (e) => e.compras.ataque.paraTodos)).toBe(paraTodos);
        expect(soma(es, (e) => e.compras.ataque.reflexo)).toBe(reflexo);
        expect(soma(es, (e) => e.cartasDevolvidas)).toBe(reflexo);
        expect(soma(es, (e) => e.trocasDeMaoFeitas)).toBe(soma(es, (e) => e.trocasDeMaoSofridas));

        const resumo = resumirPartida(estado);
        expect(resumo.premios.length).toBeLessThanOrEqual(MAX_PREMIOS);
        expect(new Set(resumo.premios.map((p) => p.id)).size).toBe(resumo.premios.length);
        for (const p of resumo.premios) expect(p.detalhe).toContain(String(p.valor));
        // Serializável, determinístico e sem nenhum id de carta.
        const json = JSON.stringify(resumo);
        expect(JSON.parse(json)).toEqual(resumo);
        expect(resumirPartida(estado)).toEqual(resumo);
        expect(BARALHO_COMPLETO_108.filter((c) => json.includes(c.id))).toEqual([]);

        cobertura.paraTodos += paraTodos;
        cobertura.reflexo += reflexo;
        cobertura.quebras += soma(es, (e) => e.silenciosQuebrados);
        cobertura.cortes += soma(es, (e) => e.cortaFrentes);
        cobertura.giros += soma(es, (e) => e.girosDeMaoFeitos);
        cobertura.trocas += soma(es, (e) => e.trocasDeMaoFeitas);
      }
    }
    // Sem isto as invariantes acima poderiam passar por falta de eventos.
    for (const [nome, n] of Object.entries(cobertura)) expect(n, nome).toBeGreaterThan(0);
    expect(finalizadas).toBe(180);
  });

  it('a mesma semente gera o mesmo resumo', () => {
    expect(resumirPartida(simular(42, 10).estado)).toEqual(resumirPartida(simular(42, 10).estado));
  });
});
