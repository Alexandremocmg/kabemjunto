/**
 * Prêmios amigáveis de fim de partida. Escolha pura e determinística.
 *
 * Regras:
 * 1. Cada prêmio tem mérito mínimo e vai para quem lidera a sua contagem. Se
 *    algum humano tem o mérito, só humanos concorrem; senão, concorrem bots.
 * 2. Empate na contagem: primeiro quem ainda não tem prêmio, depois a ordem
 *    de assento (`jogadores`).
 * 3. Rodadas, sempre na ordem do `CATALOGO`: (a) humanos ainda sem prêmio,
 *    (b) bots ainda sem prêmio, ambas até `MAX_PREMIOS`; (c) repetição de
 *    jogador, só para chegar a `MINIMO_DESEJADO`.
 * 4. Ninguém recebe dois prêmios de zoeira. Sem mérito, não há prêmio.
 */

import type { Jogador, JogadorId } from '../types/player.js';
import type { EstatisticasJogador } from './estatisticas.js';

export type PremioId =
  | 'ESPELHO'
  | 'SNIPER_CORTA_FRENTE'
  | 'LINGUA_SOLTA'
  | 'SACO_DE_PANCADA'
  | 'TROCA_TROCA'
  | 'MESTRE_DO_SILENCIO'
  | 'MAO_LIGEIRA';

export interface Premio {
  id: PremioId;
  titulo: string;
  /** Frase pronta para exibir, com o número que justificou o prêmio. */
  detalhe: string;
  /** O mesmo número do detalhe, para quem quiser formatar por conta própria. */
  valor: number;
  jogadorId: JogadorId;
}

export const MAX_PREMIOS = 3;
const MINIMO_DESEJADO = 2;

interface Categoria {
  id: PremioId;
  titulo: string;
  /** Brinca com o jogador em vez de elogiar. */
  zoeira: boolean;
  minimo: number;
  medir: (e: EstatisticasJogador) => number;
  detalhar: (valor: number) => string;
}

const contar = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

const CATALOGO: readonly Categoria[] = [
  {
    id: 'ESPELHO',
    titulo: 'Espelho',
    zoeira: false,
    minimo: 2,
    medir: (e) => e.cartasDevolvidas,
    detalhar: (n) => `Devolveu ${contar(n, 'carta', 'cartas')} com o 0+.`,
  },
  {
    id: 'SNIPER_CORTA_FRENTE',
    titulo: 'Sniper do Corta-Frente',
    zoeira: false,
    minimo: 1,
    medir: (e) => e.cortaFrentes,
    detalhar: (n) => `Acertou ${contar(n, 'Corta-Frente', 'Corta-Frentes')}.`,
  },
  {
    id: 'LINGUA_SOLTA',
    titulo: 'Língua solta',
    zoeira: true,
    minimo: 1,
    medir: (e) => e.silenciosQuebrados,
    detalhar: (n) => `Não resistiu e quebrou ${contar(n, 'Silêncio', 'Silêncios')}.`,
  },
  {
    id: 'SACO_DE_PANCADA',
    titulo: 'Saco de pancada',
    zoeira: true,
    minimo: 6,
    medir: (e) => e.compras.ataque.total,
    detalhar: (n) => `Aguentou firme ${contar(n, 'carta', 'cartas')} de ataque.`,
  },
  {
    id: 'TROCA_TROCA',
    titulo: 'Troca-troca',
    zoeira: false,
    minimo: 1,
    medir: (e) => e.trocasDeMaoFeitas + e.girosDeMaoFeitos,
    detalhar: (n) => `Mexeu nas mãos da mesa ${contar(n, 'vez', 'vezes')}.`,
  },
  {
    id: 'MESTRE_DO_SILENCIO',
    titulo: 'Mestre do Silêncio',
    zoeira: false,
    minimo: 2,
    medir: (e) => e.silenciosAtivados,
    detalhar: (n) => `Calou a mesa ${contar(n, 'vez', 'vezes')}.`,
  },
  {
    id: 'MAO_LIGEIRA',
    titulo: 'Mão ligeira',
    zoeira: false,
    minimo: 8,
    medir: (e) => e.cartasJogadas,
    detalhar: (n) => `Jogou ${contar(n, 'carta', 'cartas')}.`,
  },
];

const ehZoeira = (id: PremioId): boolean => CATALOGO.some((c) => c.id === id && c.zoeira);

/** Escolhe de 0 a `MAX_PREMIOS` prêmios, na ordem em que foram concedidos. */
export function escolherPremios(
  jogadores: ReadonlyArray<Pick<Jogador, 'id' | 'isBot'>>,
  estatisticas: ReadonlyArray<EstatisticasJogador>,
): Premio[] {
  const bots = new Set(jogadores.filter((j) => j.isBot).map((j) => j.id));
  const concorrentes = jogadores.flatMap((j) => estatisticas.filter((e) => e.jogadorId === j.id));

  const premios: Premio[] = [];
  const temPremio = (id: JogadorId): boolean => premios.some((p) => p.jogadorId === id);

  const rodada = (limite: number, pode: (id: JogadorId) => boolean): void => {
    for (const categoria of CATALOGO) {
      if (premios.length >= limite) return;
      if (premios.some((p) => p.id === categoria.id)) continue;
      const comMerito = concorrentes.filter((e) => categoria.medir(e) >= categoria.minimo);
      const humanos = comMerito.filter((e) => !bots.has(e.jogadorId));
      const elegiveis = humanos.length > 0 ? humanos : comMerito;
      const maximo = Math.max(...elegiveis.map(categoria.medir));
      const lideres = elegiveis.filter((e) => categoria.medir(e) === maximo);
      const escolhido = lideres.find((e) => !temPremio(e.jogadorId)) ?? lideres[0];
      if (!escolhido || !pode(escolhido.jogadorId)) continue;
      const { jogadorId } = escolhido;
      if (categoria.zoeira && premios.some((p) => p.jogadorId === jogadorId && ehZoeira(p.id))) {
        continue;
      }
      premios.push({
        id: categoria.id,
        titulo: categoria.titulo,
        detalhe: categoria.detalhar(maximo),
        valor: maximo,
        jogadorId,
      });
    }
  };

  rodada(MAX_PREMIOS, (id) => !bots.has(id) && !temPremio(id));
  rodada(MAX_PREMIOS, (id) => !temPremio(id));
  rodada(MINIMO_DESEJADO, () => true);
  return premios;
}
