/**
 * Dicas contextuais: no lugar de um tutorial longo, cada regra é explicada uma
 * vez, no momento em que ela importa pela primeira vez. Depois de "Entendi",
 * a dica não volta (fica salva no aparelho).
 */
import type { Carta } from '@kabemjunto/shared';
import { isEligibleForMultipleDiscard, temMesmaFace } from '../components/multipleDiscard';

export type TipoDica = 'silencio' | 'ataque' | 'arrastar' | 'grupo' | 'zero-mais' | 'monte';

export const TEXTO_DICA: Record<TipoDica, { titulo: string; texto: string }> = {
  silencio: {
    titulo: 'Carta 7: silêncio!',
    texto: 'Até a próxima carta, quem mandar mensagem no chat compra +2.',
  },
  ataque: {
    titulo: 'Você está sob ataque',
    texto: 'Cubra com +2, +4 ou 0+, ou toque no monte e compre tudo. +2 sobre +4 não vale.',
  },
  arrastar: {
    titulo: 'Sua vez',
    texto: 'As cartas que brilham servem. Arraste uma até o centro (ou toque duas vezes nela).',
  },
  grupo: {
    titulo: 'Cartas iguais?',
    texto: 'Toque nas cartas de mesma face para juntá-las e jogue o grupo de uma vez.',
  },
  'zero-mais': {
    titulo: 'Você tem o 0+',
    texto: 'Quando alguém te atacar, o 0+ devolve o ataque inteiro para quem atacou por último.',
  },
  monte: {
    titulo: 'Nenhuma carta serve',
    texto: 'Toque no monte para comprar. Se a carta comprada servir, você ainda joga.',
  },
};

/** Ordem de prioridade: a primeira que se aplica e ainda não foi vista aparece. */
const PRIORIDADE: ReadonlyArray<TipoDica> = [
  'silencio',
  'ataque',
  'arrastar',
  'grupo',
  'zero-mais',
  'monte',
];

export interface ContextoDica {
  minhaVez: boolean;
  silencioAtivo: boolean;
  ataqueAcumulado: number;
  podeComprar: boolean;
  /** A mesa está esperando outra coisa (cor, alvo, envio, Corta-Frente). */
  ocupada: boolean;
  mao: ReadonlyArray<Carta>;
  ehJogavel: (carta: Carta) => boolean;
}

function temGrupoJogavel(mao: ReadonlyArray<Carta>, ehJogavel: (carta: Carta) => boolean) {
  return mao.some(
    (carta) =>
      ehJogavel(carta) &&
      isEligibleForMultipleDiscard(carta) &&
      mao.some(
        (outra) =>
          outra.id !== carta.id &&
          isEligibleForMultipleDiscard(outra) &&
          temMesmaFace(carta, outra),
      ),
  );
}

function seAplica(tipo: TipoDica, contexto: ContextoDica): boolean {
  const { minhaVez, mao, ehJogavel } = contexto;
  switch (tipo) {
    case 'silencio':
      return contexto.silencioAtivo;
    case 'ataque':
      return minhaVez && contexto.ataqueAcumulado > 0;
    case 'arrastar':
      return minhaVez && contexto.ataqueAcumulado === 0 && mao.some(ehJogavel);
    case 'grupo':
      return minhaVez && temGrupoJogavel(mao, ehJogavel);
    case 'zero-mais':
      return mao.some((carta) => carta.acao === 'ZERO_MAIS');
    case 'monte':
      return minhaVez && contexto.podeComprar && contexto.ataqueAcumulado === 0;
  }
}

export function escolherDica(
  contexto: ContextoDica,
  vistas: ReadonlySet<TipoDica>,
): TipoDica | undefined {
  if (contexto.ocupada) return undefined;
  return PRIORIDADE.find((tipo) => !vistas.has(tipo) && seAplica(tipo, contexto));
}

const CHAVE_DICAS = 'kabemjunto.dicas-vistas';

export function lerDicasVistas(): ReadonlySet<TipoDica> {
  try {
    const salvo: unknown = JSON.parse(window.localStorage.getItem(CHAVE_DICAS) ?? '[]');
    return new Set(
      Array.isArray(salvo) ? salvo.filter((item): item is TipoDica => item in TEXTO_DICA) : [],
    );
  } catch {
    return new Set();
  }
}

export function salvarDicasVistas(vistas: ReadonlySet<TipoDica>): void {
  try {
    window.localStorage.setItem(CHAVE_DICAS, JSON.stringify([...vistas]));
  } catch {
    // Sem armazenamento: as dicas voltam na próxima visita, sem prejuízo ao jogo.
  }
}

export const TODAS_AS_DICAS: ReadonlySet<TipoDica> = new Set(PRIORIDADE);
