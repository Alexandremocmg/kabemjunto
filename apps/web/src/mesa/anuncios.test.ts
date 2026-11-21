import { describe, expect, it } from 'vitest';
import type { Carta, EstadoPartidaPublico, JogadorPublico } from '@kabemjunto/shared';
import { derivarAnuncios, inferirQuemJogou } from './anuncios';

function carta(id: string, parcial: Partial<Carta> = {}): Carta {
  return {
    id,
    tipo: 'NUMERADA',
    cor: 'AZUL',
    valor: 4,
    raridade: 'COMUM',
    colecao: 'base-v1',
    efeito_texto_curto: id,
    efeito_texto_longo: id,
    ...parcial,
  };
}

/** Carta de ação ou neutra: sem `valor`. */
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

function jogadores(cartas: Record<string, number>): JogadorPublico[] {
  return Object.entries(cartas).map(([id, quantidadeCartas]) => ({
    id,
    nome: id === 'eu' ? 'Ana' : id.toUpperCase(),
    quantidadeCartas,
    isBot: id !== 'eu',
    conectado: true,
    disseUno: false,
    avatar: '',
    pontos: 0,
  }));
}

function estado(parcial: Partial<EstadoPartidaPublico>): EstadoPartidaPublico {
  return {
    partidaId: 'p',
    salaId: 's',
    jogadores: jogadores({ eu: 5, b1: 5, b2: 5 }),
    topo: carta('topo'),
    quantidadeMonteCompra: 30,
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

const tipos = (lista: ReturnType<typeof derivarAnuncios>) => lista.map((item) => item.tipo);

describe('derivarAnuncios', () => {
  it('nada a anunciar sem estado anterior ou em outra partida', () => {
    expect(derivarAnuncios(undefined, estado({}), 'eu')).toEqual([]);
    expect(derivarAnuncios(estado({ partidaId: 'x' }), estado({}), 'eu')).toEqual([]);
  });

  it('ataque acumulado avisa quem precisa cobrir', () => {
    const antes = estado({ vezDe: 'b1' });
    const depois = estado({
      vezDe: 'eu',
      topo: especial('mais2', 'MAIS_DOIS', 'AZUL'),
      ataqueAcumulado: 2,
      jogadores: jogadores({ eu: 5, b1: 4, b2: 5 }),
    });
    const anuncios = derivarAnuncios(antes, depois, 'eu');
    expect(tipos(anuncios)).toEqual(['ATAQUE', 'SUA_VEZ']);
    expect(anuncios[0]!.detalhe).toMatch(/Cubra com/);
    expect(anuncios[1]!.detalhe).toMatch(/Ataque \+2/);
  });

  it('0+ refletido e compras de quem recebeu o reflexo', () => {
    const antes = estado({ vezDe: 'eu', ataqueAcumulado: 4 });
    const depois = estado({
      vezDe: 'b2',
      topo: especial('zero', 'ZERO_MAIS'),
      ataqueAcumulado: 0,
      jogadores: jogadores({ eu: 4, b1: 9, b2: 5 }),
    });
    const anuncios = derivarAnuncios(antes, depois, 'eu');
    expect(tipos(anuncios)).toEqual(['REFLEXO', 'COMPRA']);
    expect(anuncios[0]!.detalhe).toBe('Você devolveu +4 para o último atacante.');
    expect(anuncios[1]!.detalhe).toBe('B1 comprou 4 cartas.');
  });

  it('silêncio quebrado aparece uma vez por jogador', () => {
    const antes = estado({ silencio: { ativo: true, jogadoresQuebraram: [] } });
    const depois = estado({
      silencio: { ativo: true, jogadoresQuebraram: ['b2'] },
      jogadores: jogadores({ eu: 5, b1: 5, b2: 7 }),
    });
    expect(tipos(derivarAnuncios(antes, depois, 'eu'))).toEqual(['SILENCIO_QUEBRADO', 'COMPRA']);
    expect(derivarAnuncios(depois, depois, 'eu')).toEqual([]);
  });

  it('Troca Mão não vira "compra" de quem ganhou cartas na troca', () => {
    const antes = estado({ vezDe: 'b1', jogadores: jogadores({ eu: 2, b1: 6, b2: 5 }) });
    const depois = estado({
      vezDe: 'b2',
      topo: especial('troca', 'TROCA_MAO'),
      corAtiva: 'VERDE',
      jogadores: jogadores({ eu: 5, b1: 2, b2: 5 }),
    });
    const anuncios = tipos(derivarAnuncios(antes, depois, 'eu'));
    expect(anuncios).toContain('TROCA_MAO');
    expect(anuncios).toContain('COR');
    expect(anuncios).not.toContain('COMPRA');
  });

  it('vitória substitui o aviso de vez', () => {
    const antes = estado({ vezDe: 'b1', jogadores: jogadores({ eu: 3, b1: 1, b2: 5 }) });
    const depois = estado({
      vezDe: 'eu',
      topo: carta('ultima'),
      finalizada: true,
      vencedor: 'b1',
      jogadores: jogadores({ eu: 3, b1: 0, b2: 5 }),
    });
    const anuncios = derivarAnuncios(antes, depois, 'eu');
    expect(tipos(anuncios)).toEqual(['VITORIA']);
    expect(anuncios[0]!.titulo).toBe('B1 venceu!');
  });
});

describe('inferirQuemJogou', () => {
  it('é quem estava na vez e perdeu carta', () => {
    const antes = estado({ vezDe: 'b1' });
    const depois = estado({ topo: carta('nova'), jogadores: jogadores({ eu: 5, b1: 4, b2: 5 }) });
    expect(inferirQuemJogou(antes, depois)).toBe('b1');
  });

  it('no Corta-Frente, é quem perdeu carta fora da vez', () => {
    const janela = {
      janelaId: 'j',
      cartaAlvoId: 'topo',
      jogadorOrigemId: 'b1',
      fechaEm: 0,
      proximaVezId: 'b2',
      revisao: 1,
    };
    const antes = estado({ vezDe: 'b2', interceptacao: janela });
    const depois = estado({
      vezDe: 'b1',
      topo: carta('identica'),
      jogadores: jogadores({ eu: 4, b1: 5, b2: 5 }),
    });
    expect(inferirQuemJogou(antes, depois)).toBe('eu');
  });

  it('sem carta nova no topo, ninguém jogou', () => {
    expect(inferirQuemJogou(estado({}), estado({ vezDe: 'b1' }))).toBeUndefined();
  });
});
