import type { Carta } from '../types/card.js';
import type { EstadoPartida, EventoPartida } from '../types/game.js';
import type { JogadorId } from '../types/player.js';
import { embaralhar } from './shuffle.js';

export interface ResultadoQuebraSilencio {
  novoEstado: EstadoPartida;
  penalizado: boolean;
  eventos: ReadonlyArray<EventoPartida>;
}

/**
 * Penaliza a primeira mensagem de um jogador durante a janela ativa da Regra do 7.
 * Não é uma compra de turno: preserva turno, direção, ataque e silêncio.
 */
export function penalizarQuebraSilencio(
  estado: EstadoPartida,
  jogadorId: JogadorId,
  rng: () => number = Math.random,
): ResultadoQuebraSilencio {
  if (!estado.silencio.ativo || estado.silencio.jogadoresQuebraram.includes(jogadorId)) {
    return { novoEstado: estado, penalizado: false, eventos: [] };
  }

  const jogador = estado.jogadores.find((item) => item.id === jogadorId);
  if (!jogador) throw new Error(`Jogador não encontrado: ${jogadorId}`);

  let monteCompra = [...estado.monteCompra];
  let monteDescarte = [...estado.monteDescarte];
  const cartasCompradas: Carta[] = [];
  for (let index = 0; index < 2; index++) {
    if (monteCompra.length === 0) {
      if (monteDescarte.length <= 1) {
        throw new Error('Não há cartas suficientes para aplicar a penalidade da Regra do 7.');
      }
      const topo = monteDescarte[monteDescarte.length - 1]!;
      monteCompra = embaralhar(monteDescarte.slice(0, monteDescarte.length - 1), rng);
      monteDescarte = [topo];
    }
    cartasCompradas.push(monteCompra.pop()!);
  }

  const timestamp = Date.now();
  const eventos: EventoPartida[] = [
    { tipo: 'SILENCIO_QUEBRADO', timestamp, por: jogadorId, cartasCompradas: 2 },
    ...cartasCompradas.map((carta) => ({
      tipo: 'CARTA_COMPRADA' as const,
      timestamp,
      jogadorId,
      cartaId: carta.id,
      origem: 'REGRA_DO_7' as const,
    })),
  ];
  return {
    novoEstado: {
      ...estado,
      jogadores: estado.jogadores.map((item) =>
        item.id === jogadorId ? { ...item, mao: [...item.mao, ...cartasCompradas] } : item,
      ),
      monteCompra,
      monteDescarte,
      silencio: {
        ativo: true,
        jogadoresQuebraram: [...estado.silencio.jogadoresQuebraram, jogadorId],
      },
      historico: [...estado.historico, ...eventos],
    },
    penalizado: true,
    eventos,
  };
}
