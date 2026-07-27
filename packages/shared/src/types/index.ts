/**
 * Barrel export — todos os tipos canônicos do Kabemjunto.
 * Este é o ÚNICO ponto de entrada que o front e o back devem importar.
 *
 * Regra de ouro (do PLANO §8.3):
 *   "Contratos em packages/shared/types/ são a 2ª fonte da verdade,
 *    perdendo apenas para as regras canônicas do GDD."
 *
 * Se o GDD diz X e o type diz Y, o GDD vence — mas o type precisa ser
 * atualizado para refletir X no próximo PR.
 */

export * from './card.js';
export * from './player.js';
export * from './game.js';
export * from './socket-events.js';
