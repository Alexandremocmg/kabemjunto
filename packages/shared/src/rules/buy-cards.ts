/**
 * Compra de cartas.
 * Função pura: dado o estado, retorna o novo estado com cartas compradas.
 *
 * Regras (GDD §7 "Fluxo de turno" + §02.5 state machine):
 * - Pagando ataque (`ataqueAcumulado > 0`): compra exatamente N cartas,
 *   reseta a pilha e **perde o turno** (`COMPRAR (defesa) → FIM_TURNO`).
 * - Compra voluntária de 1 carta: se a carta comprada for jogável, o
 *   jogador **mantém o turno** e pode descartá-la imediatamente
 *   (`COMPRAR (1 carta) → ESPERAR_CARTA`); se não for jogável, mantém na
 *   mão e passa o turno.
 * - Monte esgotado sem descarte reciclável: passa o turno sem jogar
 *   (GDD §10.5).
 * - Se o Monte de Compra esgota, reembaralha o Descarte (mantendo o topo).
 *
 * ADR-004: extraído do gameEngine.ts. Sem áudio — o wrapper toca `compra`.
 */

import type { Carta } from '../types/card.js';
import type { EstadoPartida, EventoPartida } from '../types/game.js';
import { embaralhar } from './shuffle.js';
import { validarJogada } from './validate-play.js';
import type { SfxEvent } from './execute-play.js';

export interface ResultadoCompra {
  novoEstado: EstadoPartida;
  /** IDs das cartas compradas (para o wrapper notificar cada cliente). */
  cartasCompradasIds: string[];
  sfx: SfxEvent[];
  eventos: EventoPartida[];
  /**
   * `true` quando o jogador conserva o turno porque comprou uma única
   * carta jogável. A UI usa isso para manter a mão ativa em vez de
   * anunciar a passagem de turno.
   */
  turnoMantido: boolean;
}

export interface ComprarOpcoes {
  estado: EstadoPartida;
  /** Quantidade (default = max(1, ataqueAcumulado)). */
  quantidade?: number;
  /** RNG opcional. */
  rng?: () => number;
}

export function comprarCartas(opcoes: ComprarOpcoes): ResultadoCompra {
  const { estado, rng = Math.random } = opcoes;
  const jogadorId = estado.vezDe;
  const jogador = estado.jogadores.find((j) => j.id === jogadorId);
  if (!jogador) {
    throw new Error(`Jogador da vez não encontrado: ${jogadorId}`);
  }
  if (estado.finalizada) {
    throw new Error('A partida já acabou.');
  }

  const eventos: EventoPartida[] = [];
  const sfx: SfxEvent[] = ['compra'];
  const cartasCompradasIds: string[] = [];

  const pagandoAtaque = estado.ataqueAcumulado > 0;
  const qtdDesejada = opcoes.quantidade ?? Math.max(estado.ataqueAcumulado, 1);

  let monteCompra = [...estado.monteCompra];
  let monteDescarte = [...estado.monteDescarte];
  const mao = [...jogador.mao];
  const cartasCompradas: Carta[] = [];

  for (let i = 0; i < qtdDesejada; i++) {
    // Reembaralhar se o monte esvaziou
    if (monteCompra.length === 0) {
      if (monteDescarte.length > 1) {
        const topo = monteDescarte[monteDescarte.length - 1] as Carta;
        const restoDescarte = monteDescarte.slice(0, -1);
        monteCompra = embaralhar(restoDescarte, rng);
        monteDescarte = [topo];
      } else {
        // Monte de compra e descarte (só topo) esgotaram. Stalemate.
        break;
      }
    }
    const carta = monteCompra.pop();
    if (carta) {
      mao.push(carta);
      cartasCompradas.push(carta);
      cartasCompradasIds.push(carta.id);
      eventos.push({
        tipo: 'CARTA_COMPRADA',
        timestamp: Date.now(),
        jogadorId,
        cartaId: carta.id,
        origem: estado.ataqueAcumulado > 0 ? 'ATAQUE' : 'NORMAL',
      });
    }
  }

  // Atualizar jogador com a nova mão
  const novoJogador = { ...jogador, mao };
  const novosJogadores = estado.jogadores.map((j) => (j.id === jogadorId ? novoJogador : j));

  // Estado após a compra, ainda com o turno no comprador. Serve de base
  // tanto para checar jogabilidade quanto para o retorno final.
  const estadoPosCompra: EstadoPartida = {
    ...estado,
    jogadores: novosJogadores,
    monteCompra,
    monteDescarte,
    ataqueAcumulado: 0,
    ataqueStack: [],
  };

  // GDD §7/§5.2: só a compra voluntária de UMA carta jogável conserva o
  // turno. Pagar ataque sempre perde, e monte esgotado passa a vez.
  const unicaCarta = cartasCompradas.length === 1 ? cartasCompradas[0] : undefined;
  const turnoMantido =
    !pagandoAtaque &&
    unicaCarta !== undefined &&
    validarJogada(estadoPosCompra, unicaCarta, jogadorId).valida;

  // Calcular próximo turno
  const idx = estado.jogadores.findIndex((j) => j.id === jogadorId);
  const n = estado.jogadores.length;
  const proxIdx = (idx + estado.sentido + n) % n;
  const proximoJogador = estado.jogadores[proxIdx]!.id;

  const novoEstado: EstadoPartida = {
    ...estadoPosCompra,
    vezDe: turnoMantido ? jogadorId : proximoJogador,
    historico: [...estado.historico, ...eventos],
  };

  return { novoEstado, cartasCompradasIds, sfx, eventos, turnoMantido };
}
