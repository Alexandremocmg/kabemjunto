/**
 * Criação de uma partida inicial.
 * Função pura: dado o baralho e a config, produz o EstadoPartida inicial.
 *
 * ADR-004: extraído do gameEngine.ts para isolar lógica pura de side effects.
 */

import type { Carta, Cor, Acao } from '../types/card.js';
import type { Jogador, JogadorId } from '../types/player.js';
import type { EstadoPartida, ModoJogo, PartidaId, SalaId } from '../types/game.js';
import { embaralhar } from './shuffle.js';

/** Avatares padrão (emoji) — atribuídos ciclicamente se não fornecidos. */
export const AVATARES_DEFAULT: readonly string[] = [
  '🦊',
  '🐻',
  '🐼',
  '🦁',
  '🐯',
  '🐸',
  '🤖',
  '👾',
  '🚀',
  '⭐',
] as const;

/** Opções para criar uma partida inicial. */
export interface CriarPartidaOpcoes {
  /** Baralho completo (já gerado por `gerarBaralho108()` ou similar). */
  baralho: ReadonlyArray<Carta>;
  /** Modo de jogo. Define se os outros jogadores são bots. */
  modo: ModoJogo;
  /** Quantidade de jogadores. 2-10. */
  totalJogadores: number;
  /** Nomes customizados opcionais. */
  nomesCustomizados?: ReadonlyArray<string>;
  /** Avatares opcionais. Se vazio, atribui ciclicamente. */
  avatares?: ReadonlyArray<string>;
  /** IDs customizados opcionais. Se vazio, gera `p_1`, `p_2`... */
  idsCustomizados?: ReadonlyArray<JogadorId>;
  /** ID da sala. */
  salaId?: SalaId;
  /** ID da partida. */
  partidaId?: PartidaId;
  /** RNG opcional (default `Math.random`). Use seed em testes. */
  rng?: () => number;
}

/**
 * Cria o estado inicial de uma partida.
 * - Embaralha o baralho
 * - Distribui 7 cartas por jogador
 * - Vira a primeira carta do descarte (se for neutra, vira a próxima colorida)
 * - Define o primeiro jogador (índice 0)
 *
 * @throws Error se o baralho tiver menos cartas que o necessário
 *         (7 × jogadores + 1 starter)
 */
export function criarPartidaInicial(opcoes: CriarPartidaOpcoes): EstadoPartida {
  const { baralho, modo, totalJogadores, rng = Math.random } = opcoes;
  const nomes = opcoes.nomesCustomizados ?? [];
  const avatares = opcoes.avatares ?? AVATARES_DEFAULT;
  const ids = opcoes.idsCustomizados ?? [];

  if (totalJogadores < 2 || totalJogadores > 10) {
    throw new Error(`Total de jogadores inválido: ${totalJogadores} (esperado 2-10)`);
  }
  const minimoCartas = 7 * totalJogadores + 1;
  if (baralho.length < minimoCartas) {
    throw new Error(
      `Baralho insuficiente: ${baralho.length} cartas para ${totalJogadores} jogadores (mínimo ${minimoCartas})`,
    );
  }

  // 1. Criar jogadores
  const jogadores: Jogador[] = [];
  for (let i = 0; i < totalJogadores; i++) {
    const isBot = modo === 'BOTS' && i > 0;
    const nomePadrao = isBot ? `Bot ${i}` : `Jogador ${i + 1}`;
    jogadores.push({
      id: ids[i] ?? `p_${i + 1}`,
      nome: nomes[i] ?? nomePadrao,
      avatar: avatares[i % avatares.length] ?? '⭐',
      mao: [],
      isBot,
      conectado: true,
      disseUno: false,
      pontos: 0,
    });
  }

  // 2. Embaralhar baralho
  let monteCompra = embaralhar(baralho, rng);

  // 3. Distribuir 7 cartas por jogador
  const jogadoresComMao: Jogador[] = jogadores.map((j) => {
    const mao = monteCompra.slice(0, 7);
    monteCompra = monteCompra.slice(7);
    return { ...j, mao };
  });

  // 4. Vira primeira carta do descarte (não pode ser neutra)
  let starterIndex = -1;
  for (let i = monteCompra.length - 1; i >= 0; i--) {
    const carta = monteCompra[i];
    if (carta && carta.tipo !== 'NEUTRA') {
      starterIndex = i;
      break;
    }
  }
  // Fallback improvável: se todas as restantes forem neutras (só acontece em baralhos degenerados)
  const starter: Carta =
    starterIndex >= 0
      ? (monteCompra[starterIndex] as Carta)
      : (monteCompra[monteCompra.length - 1] as Carta);
  const monteCompraSemStarter =
    starterIndex >= 0
      ? [...monteCompra.slice(0, starterIndex), ...monteCompra.slice(starterIndex + 1)]
      : monteCompra.slice(0, -1);

  // 5. Definir cor ativa
  const corAtiva: Exclude<Cor, 'NEUTRO'> = starter.cor !== 'NEUTRO' ? starter.cor : 'LARANJA'; // fallback (não deve acontecer com o filtro acima)

  // 6. Calcular ataque inicial se starter for +2 ou +4
  const ataqueInicial = calcularAtaqueInicial(starter);

  return {
    partidaId: opcoes.partidaId ?? `game_${Date.now()}`,
    salaId: opcoes.salaId ?? 'sala_local',
    jogadores: jogadoresComMao,
    monteCompra: monteCompraSemStarter,
    monteDescarte: [starter],
    vezDe: jogadoresComMao[0]!.id,
    sentido: 1,
    corAtiva,
    ataqueAcumulado: ataqueInicial.valor,
    ataqueStack: ataqueInicial.stack,
    silencio: {
      ativo: starter.valor === 7 || starter.acao === 'SILENCIO',
      jogadoresQuebraram: [],
    },
    historico: [],
    finalizada: false,
  };
}

/**
 * Calcula o ataque inicial baseado na carta starter.
 * Se a starter já é um +2 ou +4, a pilha começa com esse valor.
 * GDD §02.5: "Vira a primeira carta... se for +2 ou +4, próximo tem que cobrir ou comprar."
 */
function calcularAtaqueInicial(starter: Carta): { valor: number; stack: Acao[] } {
  if (starter.acao === 'MAIS_DOIS') return { valor: 2, stack: ['MAIS_DOIS'] };
  if (starter.acao === 'MAIS_QUATRO') return { valor: 4, stack: ['MAIS_QUATRO'] };
  return { valor: 0, stack: [] };
}
