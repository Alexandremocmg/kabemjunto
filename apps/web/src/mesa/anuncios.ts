/**
 * Deriva os anúncios da partida comparando dois estados PÚBLICOS consecutivos.
 *
 * Como só usa o estado público, funciona igual no modo local e no online (onde
 * o cliente não recebe o histórico do servidor). Os anúncios alimentam o
 * `aria-live` da mesa e a faixa de eventos; nunca decidem nada do jogo.
 */
import type { EstadoPartidaPublico, JogadorPublico } from '@kabemjunto/shared';
import { saoCartasIdenticas } from '@kabemjunto/shared';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';

export type TipoAnuncio =
  | 'SUA_VEZ'
  | 'SILENCIO'
  | 'SILENCIO_QUEBRADO'
  | 'ATAQUE'
  | 'REFLEXO'
  | 'TROCA_MAO'
  | 'GIRA_MAO'
  | 'MAIS_DOIS_TODOS'
  | 'PULA'
  | 'INVERTE'
  | 'COR'
  | 'COMPRA'
  | 'CORTA_FRENTE'
  | 'VITORIA';

export interface Anuncio {
  tipo: TipoAnuncio;
  titulo: string;
  detalhe: string;
  /** Anúncios em destaque aparecem na faixa central; os demais só no registro. */
  destaque: boolean;
}

function plural(quantidade: number, singular: string, pluralizado: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralizado}`;
}

function mapaDeCartas(jogadores: ReadonlyArray<JogadorPublico>): Map<string, number> {
  return new Map(jogadores.map((jogador) => [jogador.id, jogador.quantidadeCartas]));
}

/**
 * Quem colocou a carta nova no descarte. O estado público não diz: deduzimos
 * por quem perdeu carta, preferindo quem estava na vez.
 */
export function inferirQuemJogou(
  antes: EstadoPartidaPublico,
  depois: EstadoPartidaPublico,
): string | undefined {
  if (antes.topo.id === depois.topo.id) return undefined;
  const cartasAntes = mapaDeCartas(antes.jogadores);
  const quemPerdeu = depois.jogadores
    .filter((jogador) => jogador.quantidadeCartas < (cartasAntes.get(jogador.id) ?? 0))
    .map((jogador) => jogador.id);
  // Corta-Frente: durante a janela, `vezDe` já aponta para o próximo jogador,
  // então quem intercepta é quem perdeu carta sem estar na vez.
  if (antes.interceptacao && saoCartasIdenticas(antes.topo, depois.topo)) {
    return quemPerdeu.find((id) => id !== antes.interceptacao?.jogadorOrigemId) ?? quemPerdeu[0];
  }
  if (quemPerdeu.includes(antes.vezDe) || quemPerdeu.length === 0) return antes.vezDe;
  return quemPerdeu[0];
}

export function derivarAnuncios(
  antes: EstadoPartidaPublico | undefined,
  depois: EstadoPartidaPublico,
  jogadorLocalId: string,
): Anuncio[] {
  if (!antes || antes.partidaId !== depois.partidaId) return [];
  const anuncios: Anuncio[] = [];
  const nome = (id: string | undefined): string => {
    if (id === jogadorLocalId) return 'Você';
    return depois.jogadores.find((jogador) => jogador.id === id)?.nome ?? 'Alguém';
  };
  const conjugar = (id: string | undefined, eu: string, outro: string): string =>
    `${nome(id)} ${id === jogadorLocalId ? eu : outro}`;

  const topoMudou = antes.topo.id !== depois.topo.id;
  const quemJogou = inferirQuemJogou(antes, depois);
  const acao = topoMudou ? depois.topo.acao : undefined;
  const maosRedistribuidas =
    acao === 'TROCA_MAO' || acao === 'GIRA_MAO' || acao === 'MAIS_DOIS_TODOS';
  const acabou = depois.finalizada && !antes.finalizada;

  if (topoMudou) {
    if (antes.interceptacao && saoCartasIdenticas(antes.topo, depois.topo)) {
      anuncios.push({
        tipo: 'CORTA_FRENTE',
        titulo: 'Corta-Frente!',
        detalhe: `${conjugar(quemJogou, 'cortou', 'cortou')} a frente com uma carta idêntica.`,
        destaque: true,
      });
    }
    if (acao === 'SILENCIO') {
      anuncios.push({
        tipo: 'SILENCIO',
        titulo: '🤫 Silêncio!',
        detalhe: 'Até a próxima carta, quem falar compra +2.',
        destaque: true,
      });
    }
    if (acao === 'ZERO_MAIS' && antes.ataqueAcumulado > 0) {
      anuncios.push({
        tipo: 'REFLEXO',
        titulo: '0+ refletiu o ataque!',
        detalhe: `${conjugar(quemJogou, 'devolveu', 'devolveu')} +${antes.ataqueAcumulado} para o último atacante.`,
        destaque: true,
      });
    }
    if (depois.ataqueAcumulado > antes.ataqueAcumulado) {
      anuncios.push({
        tipo: 'ATAQUE',
        titulo: `Ataque +${depois.ataqueAcumulado}`,
        detalhe:
          depois.vezDe === jogadorLocalId
            ? 'Cubra com +2, +4 ou 0+, ou compre no monte.'
            : `${nome(depois.vezDe)} precisa cobrir ou comprar.`,
        destaque: true,
      });
    }
    if (!acabou && acao === 'TROCA_MAO') {
      anuncios.push({
        tipo: 'TROCA_MAO',
        titulo: 'Troca Mão!',
        detalhe: `${conjugar(quemJogou, 'trocou', 'trocou')} de mão com outro jogador.`,
        destaque: true,
      });
    }
    if (!acabou && acao === 'GIRA_MAO') {
      anuncios.push({
        tipo: 'GIRA_MAO',
        titulo: 'Gira Mão!',
        detalhe: 'Todas as mãos passaram para o vizinho.',
        destaque: true,
      });
    }
    if (!acabou && acao === 'MAIS_DOIS_TODOS') {
      anuncios.push({
        tipo: 'MAIS_DOIS_TODOS',
        titulo: '+2 Para Todos!',
        detalhe: `${conjugar(quemJogou, 'fez', 'fez')} todos os adversários comprarem 2.`,
        destaque: true,
      });
    }
    if (acao === 'SKIP') {
      anuncios.push({
        tipo: 'PULA',
        titulo: 'Pula!',
        detalhe: 'O próximo jogador perdeu a vez.',
        destaque: false,
      });
    }
    if (acao === 'REVERSE' && antes.sentido !== depois.sentido) {
      anuncios.push({
        tipo: 'INVERTE',
        titulo: 'Sentido invertido',
        detalhe:
          depois.sentido === 1
            ? 'O jogo segue no sentido horário.'
            : 'O jogo segue no sentido anti-horário.',
        destaque: false,
      });
    }
  }

  if (antes.corAtiva !== depois.corAtiva && topoMudou && depois.topo.cor === 'NEUTRO') {
    anuncios.push({
      tipo: 'COR',
      titulo: `Cor ativa: ${PALETA_CORES[depois.corAtiva].nomePt}`,
      detalhe: `${conjugar(quemJogou, 'escolheu', 'escolheu')} ${PALETA_CORES[depois.corAtiva].nomePt}.`,
      destaque: false,
    });
  }

  const quebraramAntes = new Set(antes.silencio.jogadoresQuebraram);
  for (const id of depois.silencio.jogadoresQuebraram) {
    if (quebraramAntes.has(id)) continue;
    anuncios.push({
      tipo: 'SILENCIO_QUEBRADO',
      titulo: 'Silêncio quebrado!',
      detalhe: `${conjugar(id, 'falou', 'falou')} durante o silêncio e comprou +2.`,
      destaque: true,
    });
  }

  if (!maosRedistribuidas) {
    const cartasAntes = mapaDeCartas(antes.jogadores);
    for (const jogador of depois.jogadores) {
      const diferenca = jogador.quantidadeCartas - (cartasAntes.get(jogador.id) ?? 0);
      if (diferenca <= 0) continue;
      anuncios.push({
        tipo: 'COMPRA',
        titulo: `+${diferenca}`,
        detalhe: `${conjugar(jogador.id, 'comprou', 'comprou')} ${plural(diferenca, 'carta', 'cartas')}.`,
        destaque: false,
      });
    }
  }

  if (acabou) {
    anuncios.push({
      tipo: 'VITORIA',
      titulo:
        depois.vencedor === jogadorLocalId ? 'Você venceu!' : `${nome(depois.vencedor)} venceu!`,
      detalhe: 'Fim da partida.',
      destaque: false,
    });
  } else if (
    !depois.finalizada &&
    depois.vezDe === jogadorLocalId &&
    antes.vezDe !== jogadorLocalId
  ) {
    anuncios.push({
      tipo: 'SUA_VEZ',
      titulo: 'Sua vez',
      detalhe:
        depois.ataqueAcumulado > 0
          ? `Ataque +${depois.ataqueAcumulado}: cubra com +2, +4 ou 0+, ou compre no monte.`
          : 'Arraste uma carta até o centro da mesa.',
      destaque: false,
    });
  }

  return anuncios;
}
