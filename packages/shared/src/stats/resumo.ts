/**
 * Resumo público de fim de partida: só contagens e ids de jogadores. Nunca
 * carrega cartas, mãos ou ids de carta, então pode ir a todos os clientes.
 */

import type { EstadoPartida, PartidaId } from '../types/game.js';
import type { JogadorId } from '../types/player.js';
import { calcularEstatisticas, type EstatisticasJogador } from './estatisticas.js';
import { escolherPremios, type Premio } from './premios.js';

/** JSON puro: sem `undefined`, datas ou classes. */
export interface ResumoPartida {
  versao: 1;
  partidaId: PartidaId;
  /** `null` se a partida não terminou ou o estado não diz por quê. */
  motivo: 'VITORIA' | 'ABANDONO' | 'TIMEOUT' | null;
  vencedorId: JogadorId | null;
  jogadores: EstatisticasJogador[];
  /** Vazio enquanto a partida não terminou ou se ninguém teve mérito. */
  premios: Premio[];
}

export function resumirPartida(estado: EstadoPartida): ResumoPartida {
  const jogadores = calcularEstatisticas(estado);
  return {
    versao: 1,
    partidaId: estado.partidaId,
    motivo: deduzirMotivo(estado),
    vencedorId: estado.vencedor ?? null,
    jogadores,
    premios: estado.finalizada ? escolherPremios(estado.jogadores, jogadores) : [],
  };
}

/**
 * O servidor só grava `PARTIDA_FINALIZADA` no abandono; a vitória aparece no
 * próprio estado (`vencedor`).
 */
function deduzirMotivo(estado: EstadoPartida): ResumoPartida['motivo'] {
  if (!estado.finalizada) return null;
  for (let i = estado.historico.length - 1; i >= 0; i--) {
    const evento = estado.historico[i]!;
    if (evento.tipo === 'PARTIDA_FINALIZADA') return evento.motivo;
  }
  return estado.vencedor !== undefined ? 'VITORIA' : null;
}
