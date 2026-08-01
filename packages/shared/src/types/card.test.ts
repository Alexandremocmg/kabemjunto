/**
 * Smoke test do módulo de tipos. Garante que:
 * 1. Os barrels exportam tudo
 * 2. As constantes exportadas têm o tamanho esperado
 * 3. Os tipos podem ser usados (compile-time check via função)
 */

import { describe, it, expect } from 'vitest';
import {
  CORES,
  CORES_COLORIDAS,
  TIPOS_CARTA,
  ACOES,
  RARIDADES,
  type Cor,
  type TipoCarta,
  type Acao,
  type Raridade,
  type Carta,
} from './card.js';
import type { Jogador, JogadorId, JogadorPublico } from './player.js';
import type {
  Sala,
  SalaId,
  PartidaId,
  EstadoPartida,
  EstadoPartidaPublico,
  EventoPartida,
  JanelaInterceptacao,
} from './game.js';
import type {
  SocketEventMap,
  ClientInterceptarEvent,
  ServerInterceptacaoAbertaEvent,
  ServerInterceptacaoResolvidaEvent,
} from './socket-events.js';

describe('constantes de domínio (card.ts)', () => {
  it('CORES tem 5 valores: 4 coloridas + NEUTRO', () => {
    expect(CORES).toHaveLength(5);
    expect(CORES).toContain('NEUTRO');
  });

  it('CORES_COLORIDAS exclui NEUTRO', () => {
    expect(CORES_COLORIDAS).toHaveLength(4);
    expect(CORES_COLORIDAS).not.toContain('NEUTRO');
  });

  it('TIPOS_CARTA tem 3 valores', () => {
    expect(TIPOS_CARTA).toHaveLength(3);
    expect(TIPOS_CARTA).toEqual(['NUMERADA', 'ACAO', 'NEUTRA']);
  });

  it('ACOES contém as 10 ações canônicas do GDD §04.6 (ADR-013 adicionou MAIS_DOIS_TODOS)', () => {
    expect(ACOES).toHaveLength(10);
    expect(ACOES).toContain('SILENCIO');
    expect(ACOES).toContain('ZERO_MAIS');
    expect(ACOES).toContain('MAIS_QUATRO');
    expect(ACOES).toContain('MAIS_DOIS_TODOS');
  });

  it('RARIDADES tem 4 valores', () => {
    expect(RARIDADES).toHaveLength(4);
    expect(RARIDADES).toEqual(['COMUM', 'INCOMUM', 'RARA', 'UNICA']);
  });
});

describe('objetos de exemplo compilam (compile-time type check)', () => {
  it('Carta numerada', () => {
    const c: Carta = {
      id: '7-LARANJA',
      cor: 'LARANJA',
      tipo: 'NUMERADA',
      valor: 7,
      raridade: 'COMUM',
      colecao: 'base-v1',
      efeito_texto_curto: 'Silêncio',
      efeito_texto_longo: 'Quem falar compra +2 cartas',
    };
    expect(c.valor).toBe(7);
    expect(c.tipo).toBe<TipoCarta>('NUMERADA');
  });

  it('Carta de ação colorida', () => {
    const c: Carta = {
      id: 'SKIP-AZUL-1',
      cor: 'AZUL',
      tipo: 'ACAO',
      acao: 'SKIP',
      raridade: 'INCOMUM',
      colecao: 'base-v1',
      efeito_texto_curto: 'Pula',
      efeito_texto_longo: 'Próximo jogador perde o turno',
    };
    expect(c.acao).toBe<Acao>('SKIP');
  });

  it('Carta neutra (0+ lendário)', () => {
    const c: Carta = {
      id: 'ZERO_MAIS-UNICA',
      cor: 'NEUTRO',
      tipo: 'NEUTRA',
      acao: 'ZERO_MAIS',
      raridade: 'UNICA',
      colecao: 'base-v1',
      efeito_texto_curto: 'Reflete',
      efeito_texto_longo: 'Devolve o ataque acumulado para o último atacante',
    };
    expect(c.acao).toBe<Acao>('ZERO_MAIS');
  });

  it('Jogador e JogadorPublico', () => {
    const id: JogadorId = 'jog-1';
    const j: Jogador = {
      id,
      nome: 'Aline',
      mao: [],
      isBot: false,
      conectado: true,
      disseUno: false,
    };
    const jp: JogadorPublico = {
      id: j.id,
      nome: j.nome,
      quantidadeCartas: j.mao.length,
      isBot: j.isBot,
      conectado: j.conectado,
      disseUno: j.disseUno,
    };
    expect(jp.quantidadeCartas).toBe(0);
  });

  it('Sala e EstadoPartida (mínimo viável)', () => {
    const salaId: SalaId = 'sala-1';
    const partidaId: PartidaId = 'part-1';
    const sala: Sala = {
      id: salaId,
      codigo: 'K4B3MJ',
      nome: 'Mesa da sala',
      hostId: 'jog-1',
      jogadores: [],
      maxJogadores: 4,
      modo: 'HOT_SEAT',
      status: 'AGUARDANDO',
    };
    expect(sala.modo).toBe('HOT_SEAT');

    const estado: EstadoPartida = {
      partidaId,
      salaId,
      jogadores: [],
      monteCompra: [],
      monteDescarte: [],
      vezDe: 'jog-1',
      sentido: 1,
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false },
      historico: [],
      finalizada: false,
    };
    expect(estado.sentido).toBe(1);
  });

  it('SocketEventMap é indexável por nomes de evento', () => {
    // Compile-time check: o tipo existe e tem as chaves esperadas
    type EventosChave = keyof SocketEventMap;
    const _check: EventosChave = 'server:estado:atualizado';
    expect(_check).toBe('server:estado:atualizado');
  });

  it('EventoPartida é union discriminada', () => {
    const e: EventoPartida = {
      tipo: 'CARTA_JOGADA',
      timestamp: Date.now(),
      jogadorId: 'jog-1',
      cartaId: '7-LARANJA',
    };
    expect(e.tipo).toBe('CARTA_JOGADA');
  });

  it('JanelaInterceptacao (fase de Corta-Frente) não expõe mãos privadas', () => {
    const janela: JanelaInterceptacao = {
      janelaId: 'janela-1',
      cartaAlvoId: '7-AZUL',
      jogadorOrigemId: 'jog-1',
      fechaEm: Date.now() + 3000,
      proximaVezId: 'jog-2',
      revisao: 1,
    };
    expect(janela.janelaId).toBe('janela-1');
    // Compile-time: EstadoPartida aceita `interceptacao` opcional.
    const estadoComJanela: EstadoPartida = {
      partidaId: 'part-1',
      salaId: 'sala-1',
      jogadores: [],
      monteCompra: [],
      monteDescarte: [],
      vezDe: 'jog-1',
      sentido: 1,
      corAtiva: 'AZUL',
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false, jogadoresQuebraram: [] },
      historico: [],
      finalizada: false,
      interceptacao: janela,
    };
    expect(estadoComJanela.interceptacao?.janelaId).toBe('janela-1');
    // Compile-time: EstadoPartidaPublico também aceita `interceptacao`
    // (sem revelar cartas privadas — só metadados públicos da janela).
    const publico: EstadoPartidaPublico = {
      partidaId: 'part-1',
      salaId: 'sala-1',
      jogadores: [],
      topo: {
        id: '7-AZUL',
        cor: 'AZUL',
        tipo: 'NUMERADA',
        valor: 7,
        raridade: 'COMUM',
        colecao: 'base-v1',
        efeito_texto_curto: '7',
        efeito_texto_longo: 'Carta numérica',
      },
      quantidadeMonteCompra: 10,
      vezDe: 'jog-1',
      sentido: 1,
      corAtiva: 'AZUL',
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false, jogadoresQuebraram: [] },
      finalizada: false,
      interceptacao: janela,
    };
    expect(publico.interceptacao?.proximaVezId).toBe('jog-2');
  });

  it('ClientInterceptarEvent e eventos de servidor de interceptação são indexáveis via SocketEventMap', () => {
    const clientEvt: ClientInterceptarEvent = { janelaId: 'janela-1', cartaId: 'carta-x' };
    expect(clientEvt.janelaId).toBe('janela-1');

    const aberta: ServerInterceptacaoAbertaEvent = {
      janela: {
        janelaId: 'janela-1',
        cartaAlvoId: '7-AZUL',
        jogadorOrigemId: 'jog-1',
        fechaEm: Date.now() + 3000,
        proximaVezId: 'jog-2',
        revisao: 1,
      },
    };
    expect(aberta.janela.janelaId).toBe('janela-1');

    const resolvida: ServerInterceptacaoResolvidaEvent = {
      janelaId: 'janela-1',
      resultado: 'INTERCEPTADA',
      interceptadorId: 'jog-2',
      proximaVezId: 'jog-2',
    };
    expect(resolvida.resultado).toBe('INTERCEPTADA');

    type EventosChave = keyof SocketEventMap;
    const _clientKey: EventosChave = 'client:interceptar';
    const _abertaKey: EventosChave = 'server:interceptacao:aberta';
    const _resolvidaKey: EventosChave = 'server:interceptacao:resolvida';
    expect(_clientKey).toBe('client:interceptar');
    expect(_abertaKey).toBe('server:interceptacao:aberta');
    expect(_resolvidaKey).toBe('server:interceptacao:resolvida');
  });
});

describe('constantes de cor usadas em runtime', () => {
  it('paleta de cores (sanity check do GDD §03.2.1)', () => {
    // Apenas garante que CORES_COLORIDAS pode ser iterada em runtime
    // sem erro de tipo.
    const palette: Cor[] = CORES_COLORIDAS;
    expect(palette).toEqual(['LARANJA', 'AZUL', 'VERDE', 'PRETO']);
  });
});

// Garante que os tipos `Raridade` estão sendo referenciados
// (caso contrário o import seria flagged por noUnusedLocals em alguns configs)
const _refs: Raridade = 'COMUM';
void _refs;

// Apenas para que o Jest/Vitest não reclame de imports não usados em modo strict
export const _smokeRefs = {
  CORES,
  TIPOS_CARTA,
  ACOES,
  RARIDADES,
  hasEstadoPublico: null as EstadoPartidaPublico | null,
};
