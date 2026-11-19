import { describe, expect, it } from 'vitest';
import type { Carta, EstadoPartida, EventoPartida } from '@kabemjunto/shared';
import { descarteInterceptavel, idDoJogadorLocal } from './useMesaLocal';
import { paraEstadoPublico } from './estadoPublico';

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

const jogada = (jogadorId: string, cartaId: string): EventoPartida => ({
  tipo: 'CARTA_JOGADA',
  timestamp: 1,
  jogadorId,
  cartaId,
});

function estado(maoEu: Carta[], historico: EventoPartida[], topo: Carta): EstadoPartida {
  const base = {
    conectado: true,
    disseUno: false,
    avatar: '🦊',
    pontos: 0,
  };
  return {
    partidaId: 'p',
    salaId: 's',
    jogadores: [
      { ...base, id: 'eu', nome: 'Eu', mao: maoEu, isBot: false },
      { ...base, id: 'bot', nome: 'Bot', mao: [numerada('x', 'VERDE', 1)], isBot: true },
    ],
    monteCompra: [numerada('m1', 'PRETO', 3)],
    monteDescarte: [numerada('antes', 'AZUL', 2), topo],
    vezDe: 'eu',
    sentido: 1,
    corAtiva: 'AZUL',
    ataqueAcumulado: 0,
    ataqueStack: [],
    silencio: { ativo: false, jogadoresQuebraram: [] },
    historico,
    finalizada: false,
  };
}

describe('descarteInterceptavel (Corta-Frente no modo local)', () => {
  const topo = numerada('cinco-bot', 'AZUL', 5);
  const identica = numerada('cinco-eu', 'AZUL', 5);

  it('abre quando o bot acabou de jogar e eu tenho a carta idêntica', () => {
    expect(
      descarteInterceptavel(estado([identica], [jogada('bot', 'cinco-bot')], topo), 'eu'),
    ).toEqual({ cartaAlvoId: 'cinco-bot', jogadorOrigemId: 'bot' });
  });

  it('não abre sem carta idêntica (mesma face em outra cor não serve)', () => {
    const outraCor = numerada('cinco-verde', 'VERDE', 5);
    expect(
      descarteInterceptavel(estado([outraCor], [jogada('bot', 'cinco-bot')], topo), 'eu'),
    ).toBeUndefined();
  });

  it('não abre para a minha própria carta, nem duas vezes, nem depois de uma compra', () => {
    expect(
      descarteInterceptavel(estado([identica], [jogada('eu', 'cinco-bot')], topo), 'eu'),
    ).toBeUndefined();
    const jaAberta: EventoPartida = {
      tipo: 'INTERCEPTACAO_ABERTA',
      timestamp: 2,
      janelaId: 'j',
      cartaAlvoId: 'cinco-bot',
      jogadorOrigemId: 'bot',
    };
    expect(
      descarteInterceptavel(estado([identica], [jogada('bot', 'cinco-bot'), jaAberta], topo), 'eu'),
    ).toBeUndefined();
    const compra: EventoPartida = {
      tipo: 'CARTA_COMPRADA',
      timestamp: 3,
      jogadorId: 'eu',
      cartaId: 'm1',
      origem: 'NORMAL',
    };
    expect(
      descarteInterceptavel(estado([identica], [jogada('bot', 'cinco-bot'), compra], topo), 'eu'),
    ).toBeUndefined();
  });

  it('cartas fora da V1 (neutras) nunca abrem janela', () => {
    const coringa: Carta = {
      id: 'c',
      tipo: 'NEUTRA',
      cor: 'NEUTRO',
      acao: 'CORINGA_SIMPLES',
      raridade: 'INCOMUM',
      colecao: 'base-v1',
      efeito_texto_curto: 'Coringa',
      efeito_texto_longo: 'Coringa',
    };
    expect(
      descarteInterceptavel(estado([coringa], [jogada('bot', 'c')], coringa), 'eu'),
    ).toBeUndefined();
  });
});

describe('estado local para a mesa', () => {
  it('o jogador local é o primeiro humano', () => {
    expect(idDoJogadorLocal(estado([], [], numerada('t', 'AZUL', 1)))).toBe('eu');
  });

  it('a projeção pública esconde as mãos e a ordem do monte', () => {
    const publico = paraEstadoPublico(
      estado([numerada('a', 'AZUL', 1)], [], numerada('t', 'AZUL', 1)),
    );
    expect(publico?.topo.id).toBe('t');
    expect(publico?.quantidadeMonteCompra).toBe(1);
    expect(publico?.jogadores.map((jogador) => jogador.quantidadeCartas)).toEqual([1, 1]);
    expect(JSON.stringify(publico)).not.toContain('"mao"');
    expect(JSON.stringify(publico)).not.toContain('m1');
  });
});
