/** Barrel das estatísticas e prêmios de fim de partida (módulo puro). */

export {
  calcularEstatisticas,
  type ComprasJogador,
  type EstatisticasJogador,
} from './estatisticas.js';
export { escolherPremios, MAX_PREMIOS, type Premio, type PremioId } from './premios.js';
export { resumirPartida, type ResumoPartida } from './resumo.js';
