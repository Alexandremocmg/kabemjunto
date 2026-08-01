/**
 * Modelo puro da fase "Corta-Frente" (interceptação fora da vez).
 *
 * Estas funções não decidem QUANDO abrir uma janela (isso é responsabilidade
 * do orquestrador — RoomStore/servidor, Task 5) nem usam relógio próprio:
 * `fechaEm` e `proximaVezId` são sempre fornecidos por quem chama, calculados
 * a partir do turno normal que ocorreria se ninguém interceptasse.
 *
 * Regras (Fase 2 — Corta-Frente V1, ver .hermes/plans/2026-07-29_083500-combos-e-corta-frente.md):
 * - Elegível: cartas coloridas (números sem ação, +2, Skip, Reverse). Neutras
 *   (+4, +2 Para Todos, Coringa Simples) ficam fora da V1.
 * - Interceptação exige carta 100% idêntica: mesma cor E mesmo número/ação.
 * - O jogador que descartou a carta alvo não pode interceptar a própria carta.
 * - Primeiro pedido válido recebido antes de `fechaEm` vence; sem compensação
 *   de latência.
 * - Interceptação bem-sucedida cancela a vez do jogador atual e o jogo segue
 *   a partir do interceptador, respeitando `sentido` (a carta interceptadora
 *   aplica seu próprio efeito normalmente: +2 acumula, Skip pula, Reverse
 *   inverte).
 * - Se a janela expira sem interceptação, o turno segue para `proximaVezId`.
 * - `revisao` protege contra resolução de estado obsoleto.
 */

import type { Carta, Acao } from '../types/card.js';
import type { EstadoPartida, EventoPartida, JanelaInterceptacao } from '../types/game.js';
import type { Jogador, JogadorId } from '../types/player.js';

const ACOES_ELEGIVEIS_INTERCEPTACAO = new Set<Acao>(['MAIS_DOIS', 'SKIP', 'REVERSE']);

/** V1: só números (sem ação) e as ações coloridas +2/Skip/Reverse podem ser interceptados/usados para interceptar. */
export function isEligibleForInterception(carta: Carta): boolean {
  return (
    (carta.tipo === 'NUMERADA' && carta.acao === undefined) ||
    (carta.tipo === 'ACAO' &&
      carta.acao !== undefined &&
      ACOES_ELEGIVEIS_INTERCEPTACAO.has(carta.acao))
  );
}

/** Duas cartas são idênticas para Corta-Frente: mesma cor E mesmo número/ação (não basta "mesma face"). */
export function saoCartasIdenticas(a: Carta, b: Carta): boolean {
  if (a.cor !== b.cor) return false;
  if (a.tipo === 'NUMERADA' && b.tipo === 'NUMERADA') return a.valor === b.valor;
  if (a.tipo === 'ACAO' && b.tipo === 'ACAO') return a.acao === b.acao;
  return false;
}

export interface AbrirJanelaOpcoes {
  estado: EstadoPartida;
  /** Carta recém-descartada, já no topo de `estado.monteDescarte`. */
  cartaAlvoId: string;
  jogadorOrigemId: JogadorId;
  janelaId: string;
  /** Timestamp absoluto do servidor em que a janela fecha. */
  fechaEm: number;
  /** Próximo turno calculado normalmente, caso ninguém intercepte. */
  proximaVezId: JogadorId;
}

/** Abre uma janela de interceptação. Não avança o turno — isso só acontece na resolução. */
export function abrirJanelaInterceptacao(opcoes: AbrirJanelaOpcoes): EstadoPartida {
  const { estado, cartaAlvoId, jogadorOrigemId, janelaId, fechaEm, proximaVezId } = opcoes;
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  if (!topo || topo.id !== cartaAlvoId) {
    throw new Error('cartaAlvoId deve ser a carta atualmente no topo do descarte.');
  }
  if (!estado.jogadores.some((j) => j.id === jogadorOrigemId)) {
    throw new Error(`Jogador de origem não encontrado: ${jogadorOrigemId}`);
  }

  const janela: JanelaInterceptacao = {
    janelaId,
    cartaAlvoId,
    jogadorOrigemId,
    fechaEm,
    proximaVezId,
    revisao: (estado.interceptacao?.revisao ?? 0) + 1,
  };

  const eventos: EventoPartida[] = [
    { tipo: 'INTERCEPTACAO_ABERTA', timestamp: Date.now(), janelaId, cartaAlvoId, jogadorOrigemId },
  ];

  return {
    ...estado,
    interceptacao: janela,
    historico: [...estado.historico, ...eventos],
  };
}

export interface InterceptarOpcoes {
  estado: EstadoPartida;
  janelaId: string;
  cartaId: string;
  jogadorId: JogadorId;
}

export interface ResultadoInterceptacao {
  novoEstado: EstadoPartida;
  eventos: EventoPartida[];
}

/**
 * Um jogador tenta interceptar a janela ativa jogando `cartaId` da própria
 * mão. Lança erro se a janela não existir/não bater, se o jogador for o
 * próprio remetente da carta alvo, se a carta não existir na mão, ou se ela
 * não for 100% idêntica à carta alvo.
 *
 * NOTA PARA O ORQUESTRADOR (Task 5 — RoomStore/servidor): esta função fecha
 * a janela (`interceptacao: undefined`) e resolve o turno imediatamente.
 * Encadeamento de interceptações (decisão de regra #6 do plano: "uma
 * interceptação válida cria nova janela para a nova carta de topo") é
 * responsabilidade do CHAMADOR — se a nova carta no topo (a carta usada
 * para interceptar) também for elegível, o orquestrador deve chamar
 * `abrirJanelaInterceptacao` novamente com `proximaVezId: novoEstado.vezDe`
 * e `jogadorOrigemId` = o próprio interceptador. Esta função não faz isso
 * sozinha, nem deveria (ela é pura e não decide política de encadeamento).
 *
 * NOTA SOBRE `revisao`: esta função só valida `janelaId`, não `revisao`.
 * A defesa contra estado obsoleto por `revisao` (CAS) é responsabilidade do
 * orquestrador (Task 5), que deve comparar a revisão que ele mesmo observou
 * antes de despachar a intercepção contra `estado.interceptacao.revisao`
 * atual antes de chamar esta função.
 */
export function interceptar(opcoes: InterceptarOpcoes): ResultadoInterceptacao {
  const { estado, janelaId, cartaId, jogadorId } = opcoes;
  const janela = estado.interceptacao;
  if (!janela || janela.janelaId !== janelaId) {
    throw new Error('Janela de interceptação inexistente ou já resolvida.');
  }
  if (janela.jogadorOrigemId === jogadorId) {
    throw new Error('Você não pode interceptar a própria carta.');
  }

  const jogador = estado.jogadores.find((j) => j.id === jogadorId);
  if (!jogador) {
    throw new Error(`Jogador não encontrado: ${jogadorId}`);
  }
  const cartaIndex = jogador.mao.findIndex((c) => c.id === cartaId);
  const carta = jogador.mao[cartaIndex];
  if (!carta) {
    throw new Error(`Carta não encontrada na mão do jogador: ${cartaId}`);
  }
  if (!isEligibleForInterception(carta)) {
    throw new Error('Carta não é elegível para Corta-Frente.');
  }

  const cartaAlvo = estado.monteDescarte[estado.monteDescarte.length - 1];
  if (!cartaAlvo || cartaAlvo.id !== janela.cartaAlvoId) {
    throw new Error('Carta alvo da janela não está mais no topo do descarte (estado obsoleto).');
  }
  if (!saoCartasIdenticas(carta, cartaAlvo)) {
    throw new Error('A carta precisa ser idêntica (mesma cor e mesmo número/ação) à carta alvo.');
  }

  const ts = Date.now();
  const novaMao = [...jogador.mao.slice(0, cartaIndex), ...jogador.mao.slice(cartaIndex + 1)];
  const novoDescarte = [...estado.monteDescarte, carta];
  const jogadoresAtualizados: ReadonlyArray<Jogador> = estado.jogadores.map((j) =>
    j.id === jogadorId ? { ...j, mao: novaMao } : j,
  );

  const eventos: EventoPartida[] = [
    { tipo: 'INTERCEPTACAO_ACEITA', timestamp: ts, janelaId, interceptadorId: jogadorId, cartaId },
    { tipo: 'CARTA_JOGADA', timestamp: ts, jogadorId, cartaId },
  ];

  let novoSentido = estado.sentido;
  let novoAtaqueAcumulado = estado.ataqueAcumulado;
  let novoAtaqueStack = estado.ataqueStack;
  let passosAvanco = 1;

  if (carta.acao === 'SKIP') {
    passosAvanco = 2;
    eventos.push({ tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'SKIP' });
  } else if (carta.acao === 'REVERSE') {
    novoSentido = (estado.sentido * -1) as 1 | -1;
    if (jogadoresAtualizados.length === 2) passosAvanco = 2;
    eventos.push(
      { tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'REVERSE' },
      { tipo: 'SENTIDO_INVERTIDO', timestamp: ts, novo: novoSentido },
    );
  } else if (carta.acao === 'MAIS_DOIS') {
    novoAtaqueAcumulado = estado.ataqueAcumulado + 2;
    novoAtaqueStack = [...estado.ataqueStack, 'MAIS_DOIS'];
    eventos.push(
      { tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'MAIS_DOIS' },
      {
        tipo: 'ATAQUE_ACUMULADO',
        timestamp: ts,
        novo: novoAtaqueAcumulado,
        stack: novoAtaqueStack,
        origem: jogadorId,
      },
    );
  }

  const idxInterceptador = jogadoresAtualizados.findIndex((j) => j.id === jogadorId);
  const n = jogadoresAtualizados.length;
  const proxIdx = (idxInterceptador + passosAvanco * novoSentido + n) % n;
  const proximoJogador = jogadoresAtualizados[proxIdx]!.id;

  const jogadorAtualizado = jogadoresAtualizados.find((j) => j.id === jogadorId)!;
  if (jogadorAtualizado.mao.length === 0) {
    eventos.push({ tipo: 'VITORIA', timestamp: ts, vencedorId: jogadorId });
    const novoEstado: EstadoPartida = {
      ...estado,
      jogadores: jogadoresAtualizados,
      monteDescarte: novoDescarte,
      corAtiva: carta.cor !== 'NEUTRO' ? carta.cor : estado.corAtiva,
      sentido: novoSentido,
      // GDD §10.8: se a carta vencedora é de ataque, o ataque nunca é
      // cobrado — a partida já acabou (mesmo critério de execute-play.ts).
      ataqueAcumulado: 0,
      ataqueStack: [],
      silencio: { ativo: false, jogadoresQuebraram: [] },
      vezDe: jogadorId,
      finalizada: true,
      vencedor: jogadorId,
      interceptacao: undefined,
      historico: [...estado.historico, ...eventos],
    };
    return { novoEstado, eventos };
  }

  const novoEstado: EstadoPartida = {
    ...estado,
    jogadores: jogadoresAtualizados,
    monteDescarte: novoDescarte,
    corAtiva: carta.cor !== 'NEUTRO' ? carta.cor : estado.corAtiva,
    sentido: novoSentido,
    ataqueAcumulado: novoAtaqueAcumulado,
    ataqueStack: novoAtaqueStack,
    // Qualquer carta nova no topo do descarte desativa o Silêncio (mesma
    // regra de execute-play.ts e multiple-discard.ts).
    silencio: { ativo: false, jogadoresQuebraram: [] },
    vezDe: proximoJogador,
    interceptacao: undefined,
    historico: [...estado.historico, ...eventos],
  };

  return { novoEstado, eventos };
}

export interface ResolverJanelaExpiradaOpcoes {
  estado: EstadoPartida;
  janelaId: string;
}

/** A janela expirou sem interceptação: turno segue para `proximaVezId`. */
export function resolverJanelaExpirada(opcoes: ResolverJanelaExpiradaOpcoes): EstadoPartida {
  const { estado, janelaId } = opcoes;
  const janela = estado.interceptacao;
  if (!janela || janela.janelaId !== janelaId) {
    throw new Error('Janela de interceptação inexistente ou já resolvida.');
  }

  const eventos: EventoPartida[] = [
    {
      tipo: 'INTERCEPTACAO_EXPIRADA',
      timestamp: Date.now(),
      janelaId,
      proximaVezId: janela.proximaVezId,
    },
  ];

  return {
    ...estado,
    vezDe: janela.proximaVezId,
    interceptacao: undefined,
    historico: [...estado.historico, ...eventos],
  };
}
