/** Atomic execution for a same-face multiple discard. */
import type { Acao, Carta, Cor } from '../types/card.js';
import type { EstadoPartida, EventoPartida } from '../types/game.js';
import type { JogadorId } from '../types/player.js';
import { validarJogada } from './validate-play.js';
import type { ResultadoJogada, SfxEvent } from './execute-play.js';

export interface ExecutarDescarteMultiploOpcoes {
  estado: EstadoPartida;
  /** Indices from the current player's hand, in the chosen discard order. */
  cartaIndices: ReadonlyArray<number>;
}

const ACOES_PERMITIDAS = new Set<Acao>(['MAIS_DOIS', 'SKIP', 'REVERSE']);

/**
 * Discards two or more cards as one atomic play.
 *
 * The first selected card obeys the normal table validation. Every following
 * card must have the exact same allowed face; this function never delegates to
 * `executarJogada`, so intermediate cards cannot create intermediate turns.
 */
export function executarDescarteMultiplo(opcoes: ExecutarDescarteMultiploOpcoes): ResultadoJogada {
  const { estado, cartaIndices } = opcoes;
  const jogadorId = estado.vezDe;
  const jogador = estado.jogadores.find((item) => item.id === jogadorId);
  if (!jogador) throw new Error(`Jogador da vez não encontrado: ${jogadorId}`);
  if (cartaIndices.length < 2) throw new Error('Descarte múltiplo requer ao menos duas cartas.');
  if (new Set(cartaIndices).size !== cartaIndices.length) {
    throw new Error('Uma carta não pode ser selecionada mais de uma vez.');
  }

  // Validate every precondition before constructing any new state (atomicity).
  const cartas = cartaIndices.map((index) => {
    const carta = jogador.mao[index];
    if (!carta) throw new Error(`Carta não encontrada no índice ${index}`);
    return carta;
  });
  const primeira = cartas[0]!;
  if (!podeParticiparDoLote(primeira) || !cartas.every((carta) => mesmaFace(primeira, carta))) {
    throw new Error('Descarte múltiplo aceita apenas cartas da mesma face permitida.');
  }
  const validacao = validarJogada(estado, primeira, jogadorId);
  if (!validacao.valida) throw new Error(validacao.motivo ?? 'Jogada inválida');

  const timestamp = Date.now();
  const indicesSelecionados = new Set(cartaIndices);
  const novaMao = jogador.mao.filter((_, index) => !indicesSelecionados.has(index));
  const ultima = cartas.at(-1)!;
  const novaCorAtiva = corDaCarta(ultima, estado.corAtiva);
  const eventos: EventoPartida[] = cartas.map((carta) => ({
    tipo: 'CARTA_JOGADA',
    timestamp,
    jogadorId,
    cartaId: carta.id,
  }));
  const sfx: SfxEvent[] = [];

  let ataqueAcumulado = estado.ataqueAcumulado;
  let ataqueStack = estado.ataqueStack;
  let sentido = estado.sentido;
  const acao = primeira.acao;

  if (acao === 'MAIS_DOIS') {
    ataqueAcumulado += 2 * cartas.length;
    ataqueStack = [...ataqueStack, ...cartas.map(() => 'MAIS_DOIS' as const)];
    sfx.push('plus2');
    eventos.push(
      { tipo: 'ACAO_RESOLVIDA', timestamp, acao: 'MAIS_DOIS' },
      { tipo: 'ATAQUE_ACUMULADO', timestamp, novo: ataqueAcumulado, stack: ataqueStack },
    );
  } else if (acao === 'SKIP') {
    sfx.push('skip');
    eventos.push({ tipo: 'ACAO_RESOLVIDA', timestamp, acao: 'SKIP' });
  } else if (acao === 'REVERSE') {
    if (cartas.length % 2 === 1) {
      sentido = (sentido * -1) as 1 | -1;
      eventos.push({ tipo: 'SENTIDO_INVERTIDO', timestamp, novo: sentido });
    }
    sfx.push('reverse');
    eventos.push({ tipo: 'ACAO_RESOLVIDA', timestamp, acao: 'REVERSE' });
  } else {
    sfx.push('descarte');
  }

  let novoEstado: EstadoPartida = {
    ...estado,
    jogadores: estado.jogadores.map((item) =>
      item.id === jogadorId ? { ...item, mao: novaMao } : item,
    ),
    monteDescarte: [...estado.monteDescarte, ...cartas],
    corAtiva: novaCorAtiva,
    ataqueAcumulado,
    ataqueStack,
    sentido,
    silencio: { ativo: false, jogadoresQuebraram: [] },
  };

  if (novaMao.length === 0) {
    sfx.push('vitoria');
    eventos.push({ tipo: 'VITORIA', timestamp, vencedorId: jogadorId });
    novoEstado = {
      ...novoEstado,
      finalizada: true,
      vencedor: jogadorId,
      historico: [...estado.historico, ...eventos],
    };
    return { novoEstado, sfx, eventos };
  }

  novoEstado = {
    ...novoEstado,
    vezDe: proximoJogador(novoEstado, jogadorId, acao, cartas.length),
    historico: [...estado.historico, ...eventos],
  };
  return { novoEstado, sfx, eventos };
}

function podeParticiparDoLote(carta: Carta): boolean {
  if (carta.tipo === 'NUMERADA') return carta.acao === undefined;
  return carta.tipo === 'ACAO' && carta.acao !== undefined && ACOES_PERMITIDAS.has(carta.acao);
}

function mesmaFace(referencia: Carta, candidata: Carta): boolean {
  if (!podeParticiparDoLote(candidata)) return false;
  if (referencia.tipo === 'NUMERADA') {
    return (
      candidata.tipo === 'NUMERADA' &&
      candidata.acao === undefined &&
      candidata.valor === referencia.valor
    );
  }
  return candidata.tipo === 'ACAO' && candidata.acao === referencia.acao;
}

function corDaCarta(carta: Carta, corAnterior: Exclude<Cor, 'NEUTRO'>): Exclude<Cor, 'NEUTRO'> {
  return carta.cor === 'NEUTRO' ? corAnterior : carta.cor;
}

function proximoJogador(
  estado: EstadoPartida,
  jogadorId: JogadorId,
  acao: Acao | undefined,
  quantidade: number,
): JogadorId {
  const indiceAtual = estado.jogadores.findIndex((jogador) => jogador.id === jogadorId);
  if (indiceAtual < 0) throw new Error('Jogador da vez não encontrado');
  const total = estado.jogadores.length;
  let passos = 1;
  if (acao === 'SKIP') passos += quantidade;
  if (acao === 'REVERSE' && total === 2) passos = 2;
  return estado.jogadores[(indiceAtual + passos * estado.sentido + total) % total]!.id;
}
