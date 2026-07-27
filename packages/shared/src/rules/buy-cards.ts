/**
 * Compra de cartas.
 * Função pura: dado o estado, retorna o novo estado com cartas compradas.
 *
 * Regras (GDD §02.5):
 * - Se há ataque acumulado (> 0), compra exatamente N cartas
 *   e reseta o ataque, depois passa o turno
 * - Se não há ataque, compra 1 carta
 * - Se o Monte de Compra esgota, reembaralha o Descarte (mantendo o topo)
 *
 * ADR-004: extraído do gameEngine.ts. Sem áudio — o wrapper toca `compra`.
 */

import type { Carta } from '../types/card.js';
import type { EstadoPartida, EventoPartida } from '../types/game.js';
import { embaralhar } from './shuffle.js';
import type { SfxEvent } from './execute-play.js';

export interface ResultadoCompra {
  novoEstado: EstadoPartida;
  /** IDs das cartas compradas (para o wrapper notificar cada cliente). */
  cartasCompradasIds: string[];
  sfx: SfxEvent[];
  eventos: EventoPartida[];
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

  const qtdDesejada = opcoes.quantidade ?? Math.max(estado.ataqueAcumulado, 1);

  let monteCompra = [...estado.monteCompra];
  let monteDescarte = [...estado.monteDescarte];
  const mao = [...jogador.mao];

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

  // Calcular próximo turno
  const idx = estado.jogadores.findIndex((j) => j.id === jogadorId);
  const n = estado.jogadores.length;
  const proxIdx = (idx + estado.sentido + n) % n;
  const proximoJogador = estado.jogadores[proxIdx]!.id;

  const novoEstado: EstadoPartida = {
    ...estado,
    jogadores: novosJogadores,
    monteCompra,
    monteDescarte,
    ataqueAcumulado: 0,
    ataqueStack: [],
    vezDe: proximoJogador,
    historico: [...estado.historico, ...eventos],
  };

  return { novoEstado, cartasCompradasIds, sfx, eventos };
}
