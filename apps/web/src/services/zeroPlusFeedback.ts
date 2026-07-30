import type { EventoPartida } from '@kabemjunto/shared';

interface EstadoComHistorico {
  historico: readonly EventoPartida[];
}

interface FeedbackZeroMais {
  titulo: string;
  detalhe: string;
}

export function descreverZeroMais(estadoAntes: EstadoComHistorico, nome: string): FeedbackZeroMais {
  const ultimoAtaque = [...estadoAntes.historico]
    .reverse()
    .find((evento) => evento.tipo === 'ATAQUE_ACUMULADO');

  if (ultimoAtaque?.tipo === 'ATAQUE_ACUMULADO' && ultimoAtaque.origem === 'STARTER') {
    return {
      titulo: '0+! Ataque neutralizado!',
      detalhe: `${nome} encerrou o ataque iniciado pela carta da mesa.`,
    };
  }

  return {
    titulo: '0+! Ataque refletido!',
    detalhe: `${nome} devolveu o ataque para o último atacante.`,
  };
}
