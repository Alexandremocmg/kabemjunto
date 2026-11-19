import type { EstadoPartida, EstadoPartidaPublico } from '@kabemjunto/shared';

/**
 * Projeção pública do estado local, com o mesmo formato que o servidor envia
 * em `server:estado:atualizado`. É o que permite a mesa usar um componente só
 * para Local e Online: ela nunca enxerga a mão dos adversários nem a ordem do
 * monte, mesmo quando o motor roda no próprio navegador.
 */
export function paraEstadoPublico(estado: EstadoPartida): EstadoPartidaPublico | undefined {
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  if (!topo) return undefined;
  return {
    partidaId: estado.partidaId,
    salaId: estado.salaId,
    jogadores: estado.jogadores.map((jogador) => ({
      id: jogador.id,
      nome: jogador.nome,
      quantidadeCartas: jogador.mao.length,
      isBot: jogador.isBot,
      conectado: jogador.conectado,
      disseUno: jogador.disseUno,
      avatar: jogador.avatar,
      pontos: jogador.pontos,
    })),
    topo,
    quantidadeMonteCompra: estado.monteCompra.length,
    vezDe: estado.vezDe,
    sentido: estado.sentido,
    corAtiva: estado.corAtiva,
    ataqueAcumulado: estado.ataqueAcumulado,
    ataqueStack: estado.ataqueStack,
    silencio: estado.silencio,
    finalizada: estado.finalizada,
    ...(estado.vencedor !== undefined ? { vencedor: estado.vencedor } : {}),
    ...(estado.interceptacao !== undefined ? { interceptacao: estado.interceptacao } : {}),
  };
}
