import type { Carta, EstadoPartidaPublico } from '@kabemjunto/shared';

export interface ResultadoValidacaoPublica {
  valida: boolean;
  motivo?: string;
}

/**
 * Valida uma intenção usando somente o estado público que o cliente online pode conhecer.
 * Mantém a mão dos adversários e a ordem do monte fora da representação web.
 */
export function validarJogadaPublica(
  estado: EstadoPartidaPublico,
  carta: Carta,
  jogadorId: string,
): ResultadoValidacaoPublica {
  if (estado.vezDe !== jogadorId) return { valida: false, motivo: 'Não é o seu turno!' };
  if (estado.finalizada) return { valida: false, motivo: 'A partida já acabou.' };

  if (estado.ataqueAcumulado > 0) {
    if (carta.acao === 'ZERO_MAIS') return { valida: true };
    if (estado.topo.acao === 'MAIS_QUATRO' && carta.acao === 'MAIS_DOIS') {
      return {
        valida: false,
        motivo: 'Proibido jogar +2 sobre um +4! Defenda com +4, 0+ ou compre as cartas.',
      };
    }
    if (carta.acao === 'MAIS_DOIS' || carta.acao === 'MAIS_QUATRO') return { valida: true };
    return {
      valida: false,
      motivo: 'Há um ataque acumulado! Defenda com +2, +4, 0+ ou compre.',
    };
  }

  if (carta.tipo === 'NEUTRA' || carta.cor === estado.corAtiva) return { valida: true };
  if (
    carta.tipo === 'NUMERADA' &&
    estado.topo.tipo === 'NUMERADA' &&
    carta.valor === estado.topo.valor
  ) {
    return { valida: true };
  }
  if (
    carta.tipo === 'ACAO' &&
    carta.acao !== undefined &&
    estado.topo.tipo === 'ACAO' &&
    carta.acao === estado.topo.acao
  ) {
    return { valida: true };
  }
  return {
    valida: false,
    motivo: 'Sua carta deve corresponder à cor ativa ou ao valor/ação no topo.',
  };
}
