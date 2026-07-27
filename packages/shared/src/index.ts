/**
 * @kabemjunto/shared — fonte única de verdade de tipos, regras e constantes.
 *
 * O QUE ESTÁ AQUI:
 * - `types/*`  → tipos canônicos (Carta, EstadoPartida, Jogador, etc.)
 * - `constants/*` → baralho 108 gerado, paleta de cores
 * - `fixtures/*` → JSON determinístico das 108 cartas
 * - `rules/*`  → motor de regras PURO (sem I/O, sem áudio, sem DOM)
 *
 * REGRAS DE USO:
 * - Frontend: importa daqui, mas faça seu próprio wrapper se precisar de
 *   side effects (áudio, animação, telemetria). Veja `src/services/gameEngine.ts`.
 * - Backend (Beta): importa daqui diretamente. O motor é puro, então o
 *   servidor valida jogadas sem precisar de browser.
 * - Testes: importa daqui. É puro, então é determinístico (com seed).
 */

export * from './types/index.js';
export * from './rules/index.js';
export * from './telemetry/index.js';
export * as Constants from './constants/index.js';
