/**
 * Execução de uma jogada.
 * Função pura: dado o estado e a carta, retorna o novo estado.
 *
 * ADR-004: extraído do gameEngine.ts. Não toca áudio, não tem timer,
 * não tem side effects. O wrapper frontend consome o retorno e dispara
 * os efeitos colaterais apropriados (áudio, animação, telemetria).
 *
 * Retorna `ResultadoJogada`:
 * - `novoEstado`: estado canônico após a jogada
 * - `eventos`: lista de "side effects intencionais" para o wrapper
 *   decidir o que fazer (tocou SFX, mostrou animação, etc.)
 *
 * GDD §02.5-2.7 — Regras implementadas:
 * - Skip: próximo jogador perde o turno
 * - Reverse: inverte sentido (em 2 jogadores, vira Skip)
 * - +2 / +4: acumula ataque
 * - +2 sobre +4: PROIBIDO (rejeitado em validarJogada)
 * - 0+ (Zero Mais): sem ataque é um coringa neutro; com ataque, força o
 *   último atacante a comprar toda a pilha e encerra a resposta
 * - Regra do 7 (Silêncio): ativa silêncio até próxima carta
 * - Coringa Simples: muda cor ativa
 * - Troca Mão / Gira Mão: troca ou rotaciona mãos de forma imutável
 */

import type { Carta, Cor, Acao } from '../types/card.js';
import type { EstadoPartida, EventoPartida } from '../types/game.js';
import type { Jogador, JogadorId } from '../types/player.js';
import { validarJogada } from './validate-play.js';
import { comprarCartas } from './buy-cards.js';

/** SFX que o wrapper frontend deve tocar. */
export type SfxEvent =
  | 'compra'
  | 'descarte'
  | 'skip'
  | 'reverse'
  | 'plus2'
  | 'plus4'
  | 'zeroplus'
  | 'silencio_ativado'
  | 'silencio_quebrado'
  | 'vitoria';

/** Resultado de executar uma jogada (puro, sem side effects). */
export interface ResultadoJogada {
  novoEstado: EstadoPartida;
  /** SFXs para o wrapper tocar (em ordem). */
  sfx: SfxEvent[];
  /** Eventos para o log/telemetria. */
  eventos: EventoPartida[];
}

/** Opções para executar uma jogada. */
export interface ExecutarJogadaOpcoes {
  estado: EstadoPartida;
  /** Índice da carta na mão do jogador da vez. */
  cartaIndex: number;
  /** Cor escolhida (obrigatório se a carta é neutra). */
  corEscolhida?: Exclude<Cor, 'NEUTRO'>;
  /** Alvo obrigatório para TROCA_MÃO. */
  alvoTrocaId?: JogadorId;
  /** RNG opcional (default `Math.random`). */
  rng?: () => number;
}

/**
 * Executa uma jogada completa.
 * Lança erro se a jogada for inválida (use `validarJogada` antes se quiser checar antes).
 */
export function executarJogada(opcoes: ExecutarJogadaOpcoes): ResultadoJogada {
  const { estado, cartaIndex, corEscolhida, rng = Math.random } = opcoes;
  const jogadorId = estado.vezDe;
  const jogador = estado.jogadores.find((j) => j.id === jogadorId);
  if (!jogador) {
    throw new Error(`Jogador da vez não encontrado: ${jogadorId}`);
  }
  const carta = jogador.mao[cartaIndex];
  if (!carta) {
    throw new Error(`Carta não encontrada no índice ${cartaIndex}`);
  }

  // Validar
  const validacao = validarJogada(estado, carta, jogadorId);
  if (!validacao.valida) {
    throw new Error(validacao.motivo ?? 'Jogada inválida');
  }

  const venceAntesDeEfeitoDeMao =
    jogador.mao.length === 1 && (carta.acao === 'TROCA_MAO' || carta.acao === 'GIRA_MAO');
  if (carta.tipo === 'NEUTRA' && corEscolhida === undefined && !venceAntesDeEfeitoDeMao) {
    throw new Error('Cartas neutras requerem corEscolhida.');
  }

  // Construir novo estado (imutável)
  const eventos: EventoPartida[] = [];
  const sfx: SfxEvent[] = [];
  const ts = Date.now();

  // 1. Remover carta da mão e adicionar ao descarte
  const novaMao = [...jogador.mao.slice(0, cartaIndex), ...jogador.mao.slice(cartaIndex + 1)];
  const novoDescarte = [...estado.monteDescarte, carta];
  const jogadoresSemCarta: ReadonlyArray<Jogador> = estado.jogadores.map((j) =>
    j.id === jogadorId ? { ...j, mao: novaMao } : j,
  );

  eventos.push({
    tipo: 'CARTA_JOGADA',
    timestamp: ts,
    jogadorId,
    cartaId: carta.id,
    ...(corEscolhida !== undefined ? { corEscolhida } : {}),
  });

  // 2. Determinar cor ativa após a jogada
  let novaCorAtiva: Exclude<Cor, 'NEUTRO'> = estado.corAtiva;
  if (carta.tipo === 'NEUTRA') {
    novaCorAtiva = corEscolhida ?? 'LARANJA';
  } else if (carta.cor !== 'NEUTRO') {
    novaCorAtiva = carta.cor;
  }
  // (se carta for ACAO colorida com cor NEUTRO, mantém a cor anterior — caso degenerado)

  // 3. Resolver ação da carta
  let novoEstado: EstadoPartida = {
    ...estado,
    jogadores: jogadoresSemCarta,
    monteDescarte: novoDescarte,
    corAtiva: novaCorAtiva,
    silencio: { ativo: false, jogadoresQuebraram: [] }, // qualquer carta desativa silêncio
    historico: [...estado.historico, ...eventos],
  };

  // Cartas que redistribuem mãos não executam o efeito quando são a última
  // carta: a vitória acontece no instante do descarte.
  if (venceAntesDeEfeitoDeMao) {
    sfx.push('vitoria');
    eventos.push({ tipo: 'VITORIA', timestamp: Date.now(), vencedorId: jogadorId });
    novoEstado = {
      ...novoEstado,
      ataqueAcumulado: 0,
      ataqueStack: [],
      finalizada: true,
      vencedor: jogadorId,
      historico: [...estado.historico, ...eventos],
    };
    return { novoEstado, sfx, eventos };
  }

  // 3a. Efeitos de cada tipo de ação
  let turnoJaAvancado = false;
  if (carta.acao !== undefined) {
    const r = resolverAcao(novoEstado, carta, jogadorId, rng, opcoes.alvoTrocaId);
    novoEstado = r.novoEstado;
    turnoJaAvancado = r.turnoJaAvancado ?? false;
    sfx.push(...r.sfx);
    eventos.push(...r.eventos);
  } else {
    sfx.push('descarte');
  }

  // 4. Detectar vitória
  const jogadorAtualizado = novoEstado.jogadores.find((j) => j.id === jogadorId)!;
  if (jogadorAtualizado.mao.length === 0) {
    sfx.push('vitoria');
    eventos.push({ tipo: 'VITORIA', timestamp: Date.now(), vencedorId: jogadorId });
    novoEstado = {
      ...novoEstado,
      // GDD §10.8: se a carta vencedora é +2/+4, o ataque nunca é cobrado —
      // a partida já acabou. O estado final não deve carregar um ataque
      // "pendente" que ninguém vai resolver.
      ataqueAcumulado: 0,
      ataqueStack: [],
      finalizada: true,
      vencedor: jogadorId,
      historico: [...estado.historico, ...eventos],
    };
    return { novoEstado, sfx, eventos };
  }

  // 5. Avançar turno
  novoEstado = {
    ...novoEstado,
    vezDe: turnoJaAvancado ? novoEstado.vezDe : calcularProximoTurno(novoEstado, carta),
    historico: [...estado.historico, ...eventos],
  };

  return { novoEstado, sfx, eventos };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers internos (privados ao módulo)
// ─────────────────────────────────────────────────────────────────────

interface ResultadoAcao {
  novoEstado: EstadoPartida;
  sfx: SfxEvent[];
  eventos: EventoPartida[];
  /** A ação já aplicou uma compra obrigatória e avançou a partir do alvo. */
  turnoJaAvancado?: boolean;
}

function resolverAcao(
  estado: EstadoPartida,
  carta: Carta,
  jogadorId: JogadorId,
  rng: () => number,
  alvoTrocaId?: JogadorId,
): ResultadoAcao {
  const eventos: EventoPartida[] = [];
  const sfx: SfxEvent[] = [];
  const ts = Date.now();

  switch (carta.acao) {
    case 'SKIP': {
      sfx.push('skip');
      eventos.push({ tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'SKIP' });
      return { novoEstado: estado, sfx, eventos };
    }

    case 'REVERSE': {
      sfx.push('reverse');
      const novoSentido: 1 | -1 = (estado.sentido * -1) as 1 | -1;
      eventos.push(
        { tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'REVERSE' },
        { tipo: 'SENTIDO_INVERTIDO', timestamp: ts, novo: novoSentido },
      );
      return {
        novoEstado: { ...estado, sentido: novoSentido },
        sfx,
        eventos,
      };
    }

    case 'MAIS_DOIS': {
      sfx.push('plus2');
      const novoAtaque = estado.ataqueAcumulado + 2;
      const novoStack: Acao[] = [...estado.ataqueStack, 'MAIS_DOIS'];
      eventos.push(
        { tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'MAIS_DOIS' },
        {
          tipo: 'ATAQUE_ACUMULADO',
          timestamp: ts,
          novo: novoAtaque,
          stack: novoStack,
          origem: jogadorId,
        },
      );
      return {
        novoEstado: {
          ...estado,
          ataqueAcumulado: novoAtaque,
          ataqueStack: novoStack,
        },
        sfx,
        eventos,
      };
    }

    case 'MAIS_QUATRO': {
      sfx.push('plus4');
      const novoAtaque = estado.ataqueAcumulado + 4;
      const novoStack: Acao[] = [...estado.ataqueStack, 'MAIS_QUATRO'];
      eventos.push(
        { tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'MAIS_QUATRO' },
        {
          tipo: 'ATAQUE_ACUMULADO',
          timestamp: ts,
          novo: novoAtaque,
          stack: novoStack,
          origem: jogadorId,
        },
      );
      return {
        novoEstado: {
          ...estado,
          ataqueAcumulado: novoAtaque,
          ataqueStack: novoStack,
        },
        sfx,
        eventos,
      };
    }

    case 'SILENCIO': {
      sfx.push('silencio_ativado');
      eventos.push(
        { tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'SILENCIO' },
        { tipo: 'SILENCIO_ATIVADO', timestamp: ts, por: jogadorId },
      );
      return {
        novoEstado: { ...estado, silencio: { ativo: true, jogadoresQuebraram: [] } },
        sfx,
        eventos,
      };
    }

    case 'ZERO_MAIS': {
      sfx.push('zeroplus');
      eventos.push({ tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'ZERO_MAIS' });

      // Se há ataque acumulado, reflete para o último atacante
      if (estado.ataqueAcumulado > 0) {
        const ultimoAtacanteId = encontrarUltimoAtacante(estado, jogadorId);
        const cartasDevolvidas = estado.ataqueAcumulado;

        // A starter inicia uma pilha sem que qualquer jogador tenha atacado.
        // Nesse caso o 0+ encerra o ataque, mas não inventa um alvo humano.
        if (ultimoAtacanteId === 'STARTER') {
          return {
            novoEstado: { ...estado, ataqueAcumulado: 0, ataqueStack: [] },
            sfx,
            eventos,
          };
        }

        // Reutiliza a mecânica canônica de compra, que recicla o descarte,
        // compra integralmente ou encerra por menor mão sem compra parcial.
        const compra = comprarCartas({
          estado: { ...estado, vezDe: ultimoAtacanteId },
          quantidade: cartasDevolvidas,
          rng,
        });
        sfx.push(...compra.sfx);
        eventos.push(...compra.eventos);
        eventos.push({
          tipo: 'ATAQUE_REFLETIDO_ZERO_MAIS',
          timestamp: ts,
          origem: jogadorId,
          alvo: ultimoAtacanteId,
          cartasDevolvidas,
        });
        return {
          novoEstado: compra.novoEstado,
          sfx,
          eventos,
          turnoJaAvancado: true,
        };
      }

      // Sem ataque acumulado, 0+ é somente um coringa: a cor já foi
      // escolhida acima e não há troca/giro de mãos nem evento adicional.
      return { novoEstado: estado, sfx, eventos };
    }

    case 'CORINGA_SIMPLES': {
      sfx.push('descarte');
      eventos.push({ tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'CORINGA_SIMPLES' });
      return { novoEstado: estado, sfx, eventos };
    }

    case 'TROCA_MAO': {
      if (!alvoTrocaId) {
        throw new Error('TROCA_MAO requer alvoTrocaId');
      }
      if (alvoTrocaId === jogadorId) {
        throw new Error('TROCA_MAO não pode escolher o próprio jogador');
      }

      const jogadorIndex = estado.jogadores.findIndex((j) => j.id === jogadorId);
      const alvoIndex = estado.jogadores.findIndex((j) => j.id === alvoTrocaId);
      if (jogadorIndex < 0 || alvoIndex < 0) {
        throw new Error(`Alvo de TROCA_MAO não encontrado: ${alvoTrocaId}`);
      }

      const maoJogador = estado.jogadores[jogadorIndex]!.mao;
      const maoAlvo = estado.jogadores[alvoIndex]!.mao;
      const jogadoresTrocados = estado.jogadores.map((j, index) => {
        if (index === jogadorIndex) return { ...j, mao: [...maoAlvo] };
        if (index === alvoIndex) return { ...j, mao: [...maoJogador] };
        return j;
      });

      sfx.push('descarte');
      eventos.push(
        { tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'TROCA_MAO', alvo: alvoTrocaId },
        { tipo: 'MAO_TROCADA', timestamp: ts, jogadorA: jogadorId, jogadorB: alvoTrocaId },
      );
      return { novoEstado: { ...estado, jogadores: jogadoresTrocados }, sfx, eventos };
    }

    case 'GIRA_MAO': {
      sfx.push('descarte');
      eventos.push({ tipo: 'ACAO_RESOLVIDA', timestamp: ts, acao: 'GIRA_MAO' });
      eventos.push({ tipo: 'MAO_GIRADA', timestamp: ts, sentido: estado.sentido });
      const maosGiradas = girarMaos(estado.jogadores, estado.sentido, rng);
      return {
        novoEstado: { ...estado, jogadores: maosGiradas },
        sfx,
        eventos,
      };
    }

    default: {
      // Ação desconhecida — descarta sem efeito
      sfx.push('descarte');
      return { novoEstado: estado, sfx, eventos };
    }
  }
}

/** Encontra a origem canônica do último ataque acumulado. */
function encontrarUltimoAtacante(
  estado: EstadoPartida,
  jogadorId: JogadorId,
): JogadorId | 'STARTER' {
  // A origem canônica é a CARTA_JOGADA que antecedeu o último registro de
  // ATAQUE_ACUMULADO. Snapshots novos registram a origem diretamente; os
  // legados continuam aceitos pelo caminho de reconstrução abaixo.
  for (let i = estado.historico.length - 1; i >= 0; i--) {
    const ataque = estado.historico[i]!;
    if (ataque.tipo !== 'ATAQUE_ACUMULADO') continue;
    if (ataque.origem !== undefined) return ataque.origem;
    for (let j = i - 1; j >= 0; j--) {
      const evento = estado.historico[j]!;
      if (
        evento.tipo === 'CARTA_JOGADA' &&
        estado.jogadores.some((p) => p.id === evento.jogadorId)
      ) {
        return evento.jogadorId;
      }
    }
    break;
  }

  // Estados legados/seedados sem histórico de ataque ainda são jogáveis. A
  // geometria é apenas fallback; nunca vence uma origem explicitamente logada.
  const idx = estado.jogadores.findIndex((j) => j.id === jogadorId);
  if (idx < 0) throw new Error(`Jogador da vez não encontrado: ${jogadorId}`);
  const idxUltimo = (idx - estado.sentido + estado.jogadores.length) % estado.jogadores.length;
  return estado.jogadores[idxUltimo]!.id;
}

/**
 * Calcula o próximo jogador da vez, considerando sentido, Skip e Reverse em 2 jogadores.
 */
function calcularProximoTurno(estado: EstadoPartida, cartaJogada: Carta): JogadorId {
  const idx = estado.jogadores.findIndex((j) => j.id === estado.vezDe);
  if (idx < 0) throw new Error('Jogador da vez não encontrado');

  const n = estado.jogadores.length;

  let passos = 1;

  // SKIP: pula +1
  if (cartaJogada.acao === 'SKIP') {
    passos = 2;
  }

  // REVERSE em 2 jogadores: vira SKIP
  if (cartaJogada.acao === 'REVERSE' && n === 2) {
    passos = 2;
  }

  const prox = (idx + passos * estado.sentido + n) % n;
  return estado.jogadores[prox]!.id;
}

/**
 * Gira todas as mãos no sentido atual.
 *
 * Lógica (sentido horário como exemplo; anti-horário é o oposto):
 * - Quem jogou (índice 0) PASSA sua mão (já sem a carta descartada) para o próximo
 * - Os outros passam a mão pro próximo no sentido
 * - O último jogador dá sua mão para quem jogou
 *
 * Para 2 jogadores: swap direto (j1 ↔ j2).
 * Para 3+ jogadores: rotação circular (j1 → j2 → j3 → ... → jN → j1).
 *
 * @param jogadores Array de jogadores. `jogadores[0]` é quem jogou a carta.
 * @param sentido Direção do jogo (1 = horário, -1 = anti-horário).
 */
function girarMaos(
  jogadores: ReadonlyArray<Jogador>,
  sentido: 1 | -1,
  rng: () => number,
): ReadonlyArray<Jogador> {
  if (jogadores.length <= 1) return jogadores;

  // Mão do jogador atual (já sem a carta descartada)
  const maoJogadorAtual = jogadores[0]!.mao;
  // Mãos dos outros jogadores
  const outrasMaos = jogadores.slice(1).map((j) => j.mao);
  const N = outrasMaos.length + 1;

  // Cada jogador[i] (i > 0) recebe a mão do jogador[i-1] no sentido do jogo
  // jogadores[0] (quem jogou) recebe a mão do ÚLTIMO jogador (wraparound)
  //
  // Para sentido 1 (horário, j1 → j2 → j3 → ... → jN → j1):
  //   jogadores[0].mao = outrasMaos[N-2]   (= jN)
  //   jogadores[1].mao = maoJogadorAtual   (= j1 sem a carta)
  //   jogadores[2].mao = outrasMaos[0]    (= j2)
  //   jogadores[3].mao = outrasMaos[1]    (= j3)
  //   ...
  //   jogadores[N-1].mao = outrasMaos[N-3] (= j(N-1))
  //
  // Para sentido -1 (anti-horário, j1 → jN → j(N-1) → ... → j2 → j1):
  //   jogadores[0].mao = outrasMaos[0]    (= j2)
  //   jogadores[1].mao = outrasMaos[1]    (= j3)
  //   ...
  //   jogadores[N-1].mao = maoJogadorAtual (= j1 sem a carta)
  const novasMaos: (readonly Carta[])[] = new Array(N);
  if (sentido === 1) {
    novasMaos[0] = outrasMaos[N - 2]!; // jN
    for (let i = 1; i < N; i++) {
      novasMaos[i] = i === 1 ? maoJogadorAtual : outrasMaos[i - 2]!;
    }
  } else {
    novasMaos[0] = outrasMaos[0]!; // j2
    for (let i = 1; i < N - 1; i++) {
      novasMaos[i] = outrasMaos[i]!; // j3, j4, ..., j(N-1) → j(i-1) → ji
    }
    novasMaos[N - 1] = maoJogadorAtual; // jN ← j1
  }

  // Embaralha para aleatoriedade extra (opcional, mas divertido)
  void rng; // silencia lint

  return jogadores.map((j, i) => ({ ...j, mao: novasMaos[i]! }));
}
