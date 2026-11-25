/**
 * Impactos: o que acabou de acontecer COM um jogador (e não na mesa toda).
 *
 * Função pura no estilo de `anuncios.ts`: compara dois estados PÚBLICOS
 * consecutivos, então vale no modo local e no online. Alimenta os selos curtos
 * sobre o jogador afetado e o tremor da plaqueta; nunca decide nada do jogo.
 */
import type { EstadoPartidaPublico } from '@kabemjunto/shared';
import { inferirQuemJogou } from './anuncios';

export type TipoImpacto =
  /** Ataque acumulado agora mira este jogador (ele ainda pode cobrir). */
  | 'ATAQUE'
  /** Pagou o ataque: comprou as cartas. */
  | 'COMPRA_ATAQUE'
  /** O 0+ devolveu o ataque para este jogador. */
  | 'REFLETIDO'
  | 'MAIS_DOIS_TODOS'
  | 'PULOU'
  | 'SILENCIO_QUEBRADO';

export interface Impacto {
  tipo: TipoImpacto;
  jogadorId: string;
  /** Cartas em jogo (0 quando não se aplica, como em PULOU). */
  quantidade: number;
  /** O afetado é o jogador deste aparelho. */
  local: boolean;
}

/** Quem perdeu a vez. Espelha o próximo turno do motor (jogada, descarte múltiplo e Corta-Frente). */
function jogadoresPulados(antes: EstadoPartidaPublico, depois: EstadoPartidaPublico): string[] {
  const { acao } = depois.topo;
  const total = depois.jogadores.length;
  const quemJogou = inferirQuemJogou(antes, depois);
  const origem = depois.jogadores.findIndex((jogador) => jogador.id === quemJogou);
  if (origem < 0) return [];

  let quantos = 0;
  if (acao === 'SKIP') {
    // Descarte múltiplo de Skips pula uma pessoa por carta.
    const cartasAntes = antes.jogadores.find((j) => j.id === quemJogou)?.quantidadeCartas ?? 0;
    quantos = Math.max(1, cartasAntes - depois.jogadores[origem]!.quantidadeCartas);
  } else if (acao === 'REVERSE' && total === 2) {
    quantos = 1;
  }

  const pulados = new Set<string>();
  for (let passo = 1; passo <= Math.min(quantos, total - 1); passo += 1) {
    const indice = (origem + passo * depois.sentido + total) % total;
    const id = depois.jogadores[indice]!.id;
    // Quem ficou com a vez não foi pulado (ex.: dois Skips com 2 jogadores).
    if (id !== depois.vezDe) pulados.add(id);
  }
  return [...pulados];
}

export function derivarImpactos(
  antes: EstadoPartidaPublico | undefined,
  depois: EstadoPartidaPublico,
  jogadorLocalId: string,
): Impacto[] {
  if (!antes || antes.partidaId !== depois.partidaId) return [];
  // Um impacto por jogador por passo: o primeiro registrado vale.
  const impactos = new Map<string, Impacto>();
  const registrar = (tipo: TipoImpacto, jogadorId: string, quantidade: number): void => {
    if (impactos.has(jogadorId)) return;
    impactos.set(jogadorId, { tipo, jogadorId, quantidade, local: jogadorId === jogadorLocalId });
  };

  const topoMudou = antes.topo.id !== depois.topo.id;
  const acao = topoMudou ? depois.topo.acao : undefined;
  const cartasAntes = new Map(antes.jogadores.map((j) => [j.id, j.quantidadeCartas]));
  const ganhos = depois.jogadores
    .map(({ id, quantidadeCartas }) => ({
      id,
      ganho: quantidadeCartas - (cartasAntes.get(id) ?? quantidadeCartas),
    }))
    .filter(({ ganho }) => ganho > 0);

  for (const id of depois.silencio.jogadoresQuebraram) {
    if (!antes.silencio.jogadoresQuebraram.includes(id)) registrar('SILENCIO_QUEBRADO', id, 2);
  }

  // Em Troca Mão e Gira Mão a contagem muda sem ninguém comprar.
  if (acao !== 'TROCA_MAO' && acao !== 'GIRA_MAO') {
    if (antes.ataqueAcumulado > 0 && depois.ataqueAcumulado === 0) {
      const pendente = antes.ataqueAcumulado;
      for (const { id, ganho } of ganhos) {
        if (ganho < pendente) continue;
        // O 0+ devolve ao último atacante, que o estado público não nomeia: é
        // quem comprou a pilha. Ataque da carta inicial não tem dono (ninguém compra).
        if (id === antes.vezDe) registrar('COMPRA_ATAQUE', id, pendente);
        else if (acao === 'ZERO_MAIS') registrar('REFLETIDO', id, pendente);
      }
    }
    if (acao === 'MAIS_DOIS_TODOS') {
      for (const { id, ganho } of ganhos) if (ganho >= 2) registrar('MAIS_DOIS_TODOS', id, 2);
    }
  }

  if (topoMudou && !depois.finalizada) {
    for (const id of jogadoresPulados(antes, depois)) registrar('PULOU', id, 0);
    if (depois.ataqueAcumulado > antes.ataqueAcumulado) {
      registrar('ATAQUE', depois.vezDe, depois.ataqueAcumulado);
    }
  }

  return [...impactos.values()];
}

/** Texto e símbolo do selo: o símbolo distingue os tipos sem depender da cor. */
export function rotuloDoImpacto(impacto: Pick<Impacto, 'tipo' | 'quantidade'>): {
  simbolo: string;
  texto: string;
} {
  const mais = `+${impacto.quantidade}`;
  switch (impacto.tipo) {
    case 'ATAQUE':
      return { simbolo: '🎯', texto: mais };
    case 'COMPRA_ATAQUE':
    case 'MAIS_DOIS_TODOS':
      return { simbolo: '🃏', texto: mais };
    case 'REFLETIDO':
      return { simbolo: '↩', texto: `REFLETIDO! ${mais}` };
    case 'SILENCIO_QUEBRADO':
      return { simbolo: '🤫', texto: mais };
    case 'PULOU':
      return { simbolo: '⊘', texto: 'PULOU' };
  }
}
