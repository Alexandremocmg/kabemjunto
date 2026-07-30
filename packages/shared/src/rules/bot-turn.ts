/**
 * Turno de bot (single-player).
 * Função pura: dada a estratégia, retorna a melhor jogada possível.
 *
 * ADR-004: extraído do gameEngine.ts. Sem timer/UX delay —
 * o wrapper frontend adiciona o delay visual.
 *
 * Estratégia simples (3 níveis configuráveis):
 * - Fácil: joga a primeira carta válida da mão
 * - Médio: prioriza cartas de ataque se acumulável
 * - Difícil: prioriza 0+ se há ataque, senão ataque, senão qualquer
 *
 * Se não tem carta válida, compra 1 carta.
 */

import type { Carta } from '../types/card.js';
import type { EstadoPartida, EventoPartida } from '../types/game.js';
import { validarJogada } from './validate-play.js';
import { executarJogada, type SfxEvent } from './execute-play.js';
import { comprarCartas } from './buy-cards.js';

export type NivelBot = 'FACIL' | 'MEDIO' | 'DIFICIL';

export interface ResultadoBot {
  novoEstado: EstadoPartida;
  acao: 'JOGOU' | 'COMPROU' | 'PULOU';
  cartaJogadaId?: string;
  sfx: SfxEvent[];
  eventos: EventoPartida[];
}

export interface BotOpcoes {
  estado: EstadoPartida;
  nivel?: NivelBot;
  /** Cor a escolher quando o bot joga uma neutra (default: mais comum na mão). */
  rng?: () => number;
}

export function executarTurnoBot(opcoes: BotOpcoes): ResultadoBot {
  const { estado, nivel = 'FACIL', rng = Math.random } = opcoes;
  const eventos: EventoPartida[] = [];

  const idx = estado.jogadores.findIndex((j) => j.id === estado.vezDe);
  if (idx < 0) {
    return { novoEstado: estado, acao: 'PULOU', sfx: [], eventos };
  }
  const bot = estado.jogadores[idx]!;
  if (!bot.isBot || estado.finalizada) {
    return { novoEstado: estado, acao: 'PULOU', sfx: [], eventos };
  }

  // Encontrar cartas válidas
  const validas: Array<{ index: number; carta: Carta }> = [];
  bot.mao.forEach((carta, index) => {
    const v = validarJogada(estado, carta, bot.id);
    if (v.valida) validas.push({ index, carta });
  });

  if (validas.length === 0) {
    const r = comprarCartas({ estado, rng });
    // GDD §7: se a carta comprada é jogável, o turno continua com o bot.
    // Ele precisa jogá-la agora — senão o loop de turno nunca avançaria.
    if (!r.turnoMantido) {
      return {
        novoEstado: r.novoEstado,
        acao: 'COMPROU',
        sfx: r.sfx,
        eventos: [...eventos, ...r.eventos],
      };
    }

    const estadoPosCompra = r.novoEstado;
    const botPosCompra = estadoPosCompra.jogadores.find((j) => j.id === bot.id);
    const validasPosCompra: Array<{ index: number; carta: Carta }> = [];
    botPosCompra?.mao.forEach((carta, index) => {
      if (validarJogada(estadoPosCompra, carta, bot.id).valida) {
        validasPosCompra.push({ index, carta });
      }
    });
    const escolhaPosCompra =
      escolherCartaBot(validasPosCompra, estadoPosCompra, nivel) ?? validasPosCompra[0];
    if (!escolhaPosCompra) {
      // Defensivo: `turnoMantido` implica jogada válida, mas nunca deixamos
      // o bot preso — se algo divergir, apenas encerra como compra.
      return {
        novoEstado: estadoPosCompra,
        acao: 'COMPROU',
        sfx: r.sfx,
        eventos: [...eventos, ...r.eventos],
      };
    }

    const jogada = executarJogadaComoBot(
      estadoPosCompra,
      escolhaPosCompra.index,
      escolhaPosCompra.carta,
      rng,
    );
    return {
      ...jogada,
      sfx: [...r.sfx, ...jogada.sfx],
      eventos: [...eventos, ...r.eventos, ...jogada.eventos],
    };
  }

  // Escolher carta por nível
  const escolhida = escolherCartaBot(validas, estado, nivel);
  if (!escolhida) {
    // fallback: primeira válida
    const primeira = validas[0]!;
    return executarJogadaComoBot(estado, primeira.index, primeira.carta, rng);
  }

  return executarJogadaComoBot(estado, escolhida.index, escolhida.carta, rng);
}

function escolherCartaBot(
  validas: ReadonlyArray<{ index: number; carta: Carta }>,
  estado: EstadoPartida,
  nivel: NivelBot,
): { index: number; carta: Carta } | null {
  if (nivel === 'FACIL') {
    return validas[0] ?? null;
  }

  // Médio/Difícil: prioriza por categoria
  if (nivel === 'MEDIO') {
    // 1. 0+ se há ataque acumulado (reflete)
    const zeroPlus = validas.find((v) => v.carta.acao === 'ZERO_MAIS');
    if (zeroPlus && estado.ataqueAcumulado > 0) return zeroPlus;
    // 2. +4 se há ataque
    const mais4 = validas.find((v) => v.carta.acao === 'MAIS_QUATRO');
    if (mais4 && estado.ataqueAcumulado > 0) return mais4;
    // 3. Qualquer ataque (+2 ou +4)
    const ataque = validas.find(
      (v) => v.carta.acao === 'MAIS_DOIS' || v.carta.acao === 'MAIS_QUATRO',
    );
    if (ataque) return ataque;
    // 4. Skip/Reverse se a cor do topo é diferente
    const corAtiva = estado.corAtiva;
    const temCor = validas.some((v) => v.carta.cor === corAtiva);
    if (!temCor) {
      const skipRev = validas.find((v) => v.carta.acao === 'SKIP' || v.carta.acao === 'REVERSE');
      if (skipRev) return skipRev;
    }
    return validas[0] ?? null;
  }

  // DIFÍCIL: prioriza 0+ se há ataque, senão ataque, senão número
  const zeroPlus = validas.find((v) => v.carta.acao === 'ZERO_MAIS');
  if (zeroPlus && estado.ataqueAcumulado > 0) return zeroPlus;
  const mais4 = validas.find((v) => v.carta.acao === 'MAIS_QUATRO');
  if (mais4) return mais4;
  const mais2 = validas.find((v) => v.carta.acao === 'MAIS_DOIS');
  if (mais2) return mais2;
  // Tenta número da cor ativa
  const corAtiva = estado.corAtiva;
  const numCorAtiva = validas.find((v) => v.carta.tipo === 'NUMERADA' && v.carta.cor === corAtiva);
  if (numCorAtiva) return numCorAtiva;
  return validas[0] ?? null;
}

function executarJogadaComoBot(
  estado: EstadoPartida,
  cartaIndex: number,
  carta: Carta,
  rng: () => number,
): ResultadoBot {
  // Bot escolhe cor quando joga neutra
  let corEscolhida: import('../types/card.js').Cor = 'LARANJA';
  if (carta.tipo === 'NEUTRA') {
    // Estratégia: escolhe a cor mais comum na mão
    const contagem: Record<string, number> = { LARANJA: 0, AZUL: 0, VERDE: 0, PRETO: 0 };
    estado.jogadores
      .find((j) => j.id === estado.vezDe)!
      .mao.forEach((c) => {
        if (c.cor !== 'NEUTRO') contagem[c.cor] = (contagem[c.cor] ?? 0) + 1;
      });
    corEscolhida = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]![0] as
      'LARANJA' | 'AZUL' | 'VERDE' | 'PRETO';
  }
  void rng; // silencia lint

  const alvoTrocaId =
    carta.acao === 'TROCA_MAO'
      ? estado.jogadores.find((jogador) => jogador.id !== estado.vezDe)?.id
      : undefined;
  const r = executarJogada({
    estado,
    cartaIndex,
    corEscolhida,
    ...(alvoTrocaId !== undefined ? { alvoTrocaId } : {}),
  });
  return {
    novoEstado: r.novoEstado,
    acao: 'JOGOU',
    cartaJogadaId: carta.id,
    sfx: r.sfx,
    eventos: r.eventos,
  };
}
