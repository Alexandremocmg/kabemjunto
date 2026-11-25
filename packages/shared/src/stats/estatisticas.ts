/**
 * Estatísticas por jogador, deduzidas apenas do `historico` da partida.
 * Funções puras. Só conta o que o motor realmente registra: o que o log não
 * permite deduzir com segurança fica de fora (ver `naoClassificadas`).
 */

import type { EstadoPartida } from '../types/game.js';
import type { JogadorId } from '../types/player.js';

/** Compras de um jogador. `total = comuns + silencio + outras + ataque.total`. */
export interface ComprasJogador {
  total: number;
  /** Compra voluntária de 1 carta no próprio turno. */
  comuns: number;
  /** Penalidade por falar durante o Silêncio (Regra do 7). */
  silencio: number;
  /** Origens previstas no tipo mas ainda não emitidas pelo motor (STALEMATE). */
  outras: number;
  ataque: {
    total: number;
    /** Pilha de +2/+4 paga em vez de coberta (inclui a da carta de abertura). */
    pilha: number;
    paraTodos: number;
    /** Ataque devolvido a este jogador por um 0+. */
    reflexo: number;
    /** Ataque sem marcador no log (só em históricos legados ou truncados). */
    naoClassificadas: number;
  };
}

export interface EstatisticasJogador {
  jogadorId: JogadorId;
  cartasJogadas: number;
  compras: ComprasJogador;
  reflexosFeitos: number;
  reflexosSofridos: number;
  /** Cartas que os reflexos deste jogador de fato fizeram comprar. */
  cartasDevolvidas: number;
  silenciosAtivados: number;
  silenciosQuebrados: number;
  cortaFrentes: number;
  trocasDeMaoFeitas: number;
  trocasDeMaoSofridas: number;
  /** Cartas Gira Mão jogadas com efeito. */
  girosDeMaoFeitos: number;
}

type CausaAtaque = 'pilha' | 'paraTodos' | 'reflexo' | 'naoClassificadas';

function vazia(jogadorId: JogadorId): EstatisticasJogador {
  return {
    jogadorId,
    cartasJogadas: 0,
    compras: {
      total: 0,
      comuns: 0,
      silencio: 0,
      outras: 0,
      ataque: { total: 0, pilha: 0, paraTodos: 0, reflexo: 0, naoClassificadas: 0 },
    },
    reflexosFeitos: 0,
    reflexosSofridos: 0,
    cartasDevolvidas: 0,
    silenciosAtivados: 0,
    silenciosQuebrados: 0,
    cortaFrentes: 0,
    trocasDeMaoFeitas: 0,
    trocasDeMaoSofridas: 0,
    girosDeMaoFeitos: 0,
  };
}

/**
 * Uma entrada por jogador, na ordem de `estado.jogadores`. Eventos de ids que
 * não estão na partida são ignorados.
 *
 * Causa de uma compra de ataque: o motor grava `ATAQUE` para tudo, mas as
 * compras de +2 Para Todos e de reflexo saem na mesma jogada, logo após a
 * respectiva `ACAO_RESOLVIDA`; a pilha comum segue um `ATAQUE_ACUMULADO`.
 */
export function calcularEstatisticas(
  estado: Pick<EstadoPartida, 'jogadores' | 'historico'>,
): EstatisticasJogador[] {
  const porId = new Map<JogadorId, EstatisticasJogador>(
    estado.jogadores.map((j) => [j.id, vazia(j.id)]),
  );
  let causa: CausaAtaque = 'naoClassificadas';
  let ultimoAJogar: JogadorId | undefined;
  let compradasPorReflexo = 0;

  for (const evento of estado.historico) {
    switch (evento.tipo) {
      case 'CARTA_JOGADA': {
        causa = 'naoClassificadas';
        ultimoAJogar = evento.jogadorId;
        const e = porId.get(evento.jogadorId);
        if (e) e.cartasJogadas += 1;
        break;
      }
      case 'ATAQUE_ACUMULADO':
        causa = 'pilha';
        break;
      case 'ACAO_RESOLVIDA':
        if (evento.acao === 'MAIS_DOIS_TODOS') causa = 'paraTodos';
        if (evento.acao === 'ZERO_MAIS') {
          causa = 'reflexo';
          compradasPorReflexo = 0;
        }
        break;
      case 'CARTA_COMPRADA': {
        if (evento.origem === 'ATAQUE' && causa === 'reflexo') compradasPorReflexo += 1;
        const e = porId.get(evento.jogadorId);
        if (!e) break;
        e.compras.total += 1;
        if (evento.origem === 'ATAQUE') {
          e.compras.ataque.total += 1;
          e.compras.ataque[causa] += 1;
        } else if (evento.origem === 'NORMAL') e.compras.comuns += 1;
        else if (evento.origem === 'REGRA_DO_7') e.compras.silencio += 1;
        else e.compras.outras += 1;
        break;
      }
      case 'ATAQUE_REFLETIDO_ZERO_MAIS': {
        const autor = porId.get(evento.origem);
        const alvo = porId.get(evento.alvo);
        if (alvo) alvo.reflexosSofridos += 1;
        if (autor) {
          autor.reflexosFeitos += 1;
          // `cartasDevolvidas` do evento é a pilha pedida; com o monte
          // esgotado ninguém compra, então valem só as compras registradas.
          autor.cartasDevolvidas += compradasPorReflexo;
        }
        break;
      }
      case 'SILENCIO_ATIVADO': {
        const e = porId.get(evento.por);
        if (e) e.silenciosAtivados += 1;
        break;
      }
      case 'SILENCIO_QUEBRADO': {
        const e = porId.get(evento.por);
        if (e) e.silenciosQuebrados += 1;
        break;
      }
      case 'INTERCEPTACAO_ACEITA': {
        const e = porId.get(evento.interceptadorId);
        if (e) e.cortaFrentes += 1;
        break;
      }
      case 'MAO_TROCADA': {
        const autor = porId.get(evento.jogadorA);
        const alvo = porId.get(evento.jogadorB);
        if (autor) autor.trocasDeMaoFeitas += 1;
        if (alvo) alvo.trocasDeMaoSofridas += 1;
        break;
      }
      case 'MAO_GIRADA': {
        // O evento não traz autor, mas sai na mesma jogada da CARTA_JOGADA.
        const e = ultimoAJogar === undefined ? undefined : porId.get(ultimoAJogar);
        if (e) e.girosDeMaoFeitos += 1;
        break;
      }
      default:
        break;
    }
  }
  return [...porId.values()];
}
