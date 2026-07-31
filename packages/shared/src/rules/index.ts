/**
 * Barrel export do motor de regras puro.
 * Este é o ÚNICO ponto de entrada para o motor — tanto o front quanto o
 * back (no Beta) devem importar daqui, NUNCA dos arquivos individuais.
 *
 * REGRA: este módulo é **puro**. Não importa nada de DOM, audio, fs, etc.
 * Se você precisar de side effects (áudio, animação, telemetria),
 * faça no wrapper do consumidor.
 */

export { embaralhar, embaralharComSeed } from './shuffle.js';
export { criarPartidaInicial, AVATARES_DEFAULT, type CriarPartidaOpcoes } from './create-game.js';
export {
  validarJogada,
  cartasAPagar,
  temJogadaQueBloqueiaCompra,
  type ResultadoValidacao,
} from './validate-play.js';
export {
  executarJogada,
  type ExecutarJogadaOpcoes,
  type ResultadoJogada,
  type SfxEvent,
} from './execute-play.js';
export {
  executarDescarteMultiplo,
  type ExecutarDescarteMultiploOpcoes,
} from './multiple-discard.js';
export { comprarCartas, type ComprarOpcoes, type ResultadoCompra } from './buy-cards.js';
export { penalizarQuebraSilencio, type ResultadoQuebraSilencio } from './silence.js';
export { executarTurnoBot, type BotOpcoes, type NivelBot, type ResultadoBot } from './bot-turn.js';
export {
  snapshot,
  restore,
  snapshotToJSON,
  snapshotFromJSON,
  diff,
  SnapshotStack,
} from './snapshot.js';
