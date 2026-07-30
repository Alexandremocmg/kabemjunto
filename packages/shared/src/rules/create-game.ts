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
  if (starterIndex < 0) {
    throw new Error('Baralho inválido: não há starter colorida elegível após a distribuição.');
  }
  const starter = monteCompra[starterIndex] as Carta;
  const monteCompraSemStarter = [
    ...monteCompra.slice(0, starterIndex),
    ...monteCompra.slice(starterIndex + 1),
  ];

  // 5. Definir cor ativa
  const corAtiva = starter.cor as Exclude<Cor, 'NEUTRO'>;

  // 6. Calcular ataque inicial se starter for +2 ou +4
  const ataqueInicial = calcularAtaqueInicial(starter);

  // 7. Starter Skip/Reverse age sobre o primeiro jogador (GDD §10.7)
  const abertura = calcularAbertura(starter, jogadoresComMao.length);

  return {
    partidaId: opcoes.partidaId ?? `game_${Date.now()}`,
    salaId: opcoes.salaId ?? 'sala_local',
    jogadores: jogadoresComMao,
    monteCompra: monteCompraSemStarter,
    monteDescarte: [starter],
    vezDe: jogadoresComMao[abertura.indiceInicial]!.id,
    sentido: abertura.sentido,
    corAtiva,
    ataqueAcumulado: ataqueInicial.valor,
    ataqueStack: ataqueInicial.stack,
    silencio: {
      ativo: starter.valor === 7 || starter.acao === 'SILENCIO',
      jogadoresQuebraram: [],
    },
    historico:
      ataqueInicial.valor > 0
        ? [
            {
              tipo: 'ATAQUE_ACUMULADO' as const,
              timestamp: Date.now(),
              novo: ataqueInicial.valor,
              stack: ataqueInicial.stack,
              origem: 'STARTER',
            },
          ]
        : [],
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

/**
 * Quem abre a partida e em que sentido, considerando o efeito da starter.
 * GDD §10.7: o efeito da primeira carta virada recai sobre o primeiro
 * jogador.
 *
 * - `SKIP`: o primeiro jogador perde a vez, começa o segundo.
 * - `REVERSE` com 3+ jogadores: inverte o sentido, então o "primeiro" passa
 *   a ser o último da lista.
 * - `REVERSE` com 2 jogadores: equivale a Skip e devolve a vez ao primeiro
 *   (com 2 jogadores o sentido é indiferente para a ordem de turno).
 * - `+2` mantém a vez no primeiro jogador, que precisa cobrir ou comprar
 *   (o ataque inicial é calculado em `calcularAtaqueInicial`).
 */
function calcularAbertura(
  starter: Carta,
  totalJogadores: number,
): { indiceInicial: number; sentido: 1 | -1 } {
  if (starter.acao === 'SKIP') {
    return { indiceInicial: 1 % totalJogadores, sentido: 1 };
  }
  if (starter.acao === 'REVERSE') {
    return totalJogadores === 2
      ? { indiceInicial: 0, sentido: 1 }
      : { indiceInicial: totalJogadores - 1, sentido: -1 };
  }
  return { indiceInicial: 0, sentido: 1 };
}
