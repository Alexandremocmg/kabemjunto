/**
 * Lógica de interação da mesa, separada do render 3D.
 *
 * Tudo aqui é função pura: geometria do leque, assentos, zona de soltura,
 * classificação de gesto e situação de cada carta. Nada toca WebGL nem DOM,
 * então roda em teste unitário sem navegador.
 *
 * Nenhuma destas funções decide resultado de jogo: elas só dizem o que a
 * interface deve OFERECER. Quem aceita ou recusa a jogada é o motor (local)
 * ou o servidor (online).
 */
import type { Carta, EstadoPartidaPublico, JogadorPublico } from '@kabemjunto/shared';
import { saoCartasIdenticas } from '@kabemjunto/shared';
import { PALETA_CORES } from '@kabemjunto/shared/constants/cards';
import { validarJogadaPublica } from '../services/validarJogadaPublica';
import {
  findFirstValidInStack,
  isEligibleForMultipleDiscard,
  temMesmaFace,
} from '../components/multipleDiscard';

/** Altura / largura de uma carta (mesma proporção 130×185 da mesa 2D). */
export const PROPORCAO_CARTA = 185 / 130;

// ─── Rótulos ────────────────────────────────────────────────────────────────

const ROTULO_ACAO: Record<string, string> = {
  SKIP: 'Pula',
  REVERSE: 'Inverte',
  MAIS_DOIS: '+2',
  MAIS_QUATRO: '+4 Coringa',
  MAIS_DOIS_TODOS: '+2 Para Todos',
  ZERO_MAIS: '0+ Zero Mais',
  TROCA_MAO: 'Troca Mão',
  GIRA_MAO: 'Gira Mão',
  CORINGA_SIMPLES: 'Coringa',
};

/** Nome falado da carta: "7 Azul", "+2 Verde", "Coringa". */
export function rotuloDaCarta(carta: Carta): string {
  const cor = carta.cor === 'NEUTRO' ? '' : PALETA_CORES[carta.cor].nomePt;
  // A carta 7 é visualmente secreta (ADR-010): o rótulo é o de uma numérica comum.
  if (carta.valor !== undefined) return `${carta.valor} ${cor}`.trim();
  const acao = ROTULO_ACAO[carta.acao ?? ''] ?? carta.efeito_texto_curto;
  return `${acao} ${cor}`.trim();
}

/** Texto curto impresso na face da carta. */
export function simboloDaCarta(carta: Carta): string {
  if (carta.valor !== undefined) return `${carta.valor}`;
  switch (carta.acao) {
    case 'SKIP':
      return '⊘';
    case 'REVERSE':
      return '⇄';
    case 'MAIS_DOIS':
      return '+2';
    case 'MAIS_QUATRO':
      return '+4';
    case 'MAIS_DOIS_TODOS':
      return '+2';
    case 'ZERO_MAIS':
      return '0+';
    case 'TROCA_MAO':
      return '⇌';
    case 'GIRA_MAO':
      return '↻';
    case 'CORINGA_SIMPLES':
      return '✦';
    default:
      return '?';
  }
}

/** Chave da face: cartas com a mesma chave compartilham a mesma textura. */
export function chaveDaFace(carta: Carta): string {
  return `${carta.cor}:${carta.valor ?? carta.acao ?? '?'}`;
}

export function precisaEscolherCor(carta: Carta): boolean {
  return carta.tipo === 'NEUTRA' && carta.acao !== 'TROCA_MAO';
}

// ─── Leque da mão ───────────────────────────────────────────────────────────

export interface SlotLeque {
  /** Deslocamento horizontal a partir do centro do leque. */
  x: number;
  /** Queda vertical (as pontas do leque ficam mais baixas). */
  y: number;
  /** Rotação em radianos; positiva = anti-horária. */
  rotacao: number;
  /** Ordem de empilhamento: quanto maior, mais perto da câmera. */
  camada: number;
}

export interface OpcoesLeque {
  larguraDisponivel: number;
  larguraCarta: number;
  /** Carta em destaque (hover/foco/varredura): as vizinhas abrem espaço. */
  indiceEmFoco?: number | undefined;
}

const ABERTURA_MAXIMA = (16 * Math.PI) / 180;
/** Largura horizontal de uma carta girada ABERTURA_MAXIMA, em larguras de carta. */
export const EXTENSAO_CARTA_INCLINADA =
  Math.cos(ABERTURA_MAXIMA) + PROPORCAO_CARTA * Math.sin(ABERTURA_MAXIMA);

/**
 * Distribui `total` cartas em leque dentro da largura disponível.
 * Com poucas cartas o leque fica solto; com muitas elas se sobrepõem, mas a
 * mão nunca passa da largura disponível.
 */
export function calcularLeque(total: number, opcoes: OpcoesLeque): SlotLeque[] {
  if (total <= 0) return [];
  const { larguraDisponivel, larguraCarta, indiceEmFoco } = opcoes;
  // A carta inclinada nas pontas do leque ocupa mais que a própria largura.
  const larguraOcupada = larguraCarta * EXTENSAO_CARTA_INCLINADA;
  const espacamentoIdeal = larguraCarta * 0.66;
  const espacamentoMaximo =
    total > 1 ? Math.max(0, (larguraDisponivel - larguraOcupada) / (total - 1)) : 0;
  const espacamento = Math.min(espacamentoIdeal, espacamentoMaximo);
  const meiaExtensao = ((total - 1) * espacamento) / 2;
  const apertado = espacamento < espacamentoIdeal * 0.75;
  const folga = apertado ? Math.min(larguraCarta * 0.34, espacamentoIdeal - espacamento) : 0;
  const limite = Math.max(0, (larguraDisponivel - larguraOcupada) / 2);

  return Array.from({ length: total }, (_, indice) => {
    let x = indice * espacamento - meiaExtensao;
    if (indiceEmFoco !== undefined && indice !== indiceEmFoco && folga > 0) {
      x += Math.sign(indice - indiceEmFoco) * folga;
    }
    x = Math.max(-limite, Math.min(limite, x));
    const normal = meiaExtensao > 0 ? (indice * espacamento - meiaExtensao) / meiaExtensao : 0;
    // Mãos pequenas abrem menos: 2 cartas quase retas, 7+ no arco completo.
    const abertura = ABERTURA_MAXIMA * Math.min(1, (total - 1) / 6);
    return {
      x,
      y: -(normal * normal) * larguraCarta * 0.16,
      rotacao: -normal * abertura,
      camada: indice,
    };
  });
}

// ─── Assentos ───────────────────────────────────────────────────────────────

export interface Assento {
  /** Posição normalizada em [-1, 1]: x = direita, z = perto do jogador local. */
  x: number;
  z: number;
  /** Ângulo em radianos a partir do jogador local, no sentido horário visto de cima. */
  angulo: number;
}

/**
 * Posiciona os adversários em volta da mesa, na ordem de turno: o primeiro
 * fica à esquerda do jogador local e os seguintes seguem no sentido horário.
 * O jogador local ocupa o ângulo 0 (parte de baixo da tela).
 */
export function posicoesAssentos(totalAdversarios: number): Assento[] {
  if (totalAdversarios <= 0) return [];
  const passo = (2 * Math.PI) / (totalAdversarios + 1);
  return Array.from({ length: totalAdversarios }, (_, indice) => {
    const angulo = passo * (indice + 1);
    return { x: -Math.sin(angulo), z: Math.cos(angulo), angulo };
  });
}

/** Adversários na ordem de turno, começando por quem joga depois do jogador local. */
export function ordenarAdversarios(
  jogadores: ReadonlyArray<JogadorPublico>,
  jogadorLocalId: string,
): JogadorPublico[] {
  const indiceLocal = jogadores.findIndex((jogador) => jogador.id === jogadorLocalId);
  if (indiceLocal < 0) return [...jogadores];
  return [...jogadores.slice(indiceLocal + 1), ...jogadores.slice(0, indiceLocal)];
}

// ─── Gesto e zona de soltura ────────────────────────────────────────────────

/** Raio (em unidades de mesa) da área central onde soltar uma carta a joga. */
export const RAIO_ZONA_DE_SOLTURA = 2.9;

export function estaNaZonaDeSoltura(
  ponto: { x: number; z: number } | null | undefined,
  raio: number = RAIO_ZONA_DE_SOLTURA,
): boolean {
  if (!ponto) return false;
  return Math.hypot(ponto.x, ponto.z) <= raio;
}

/**
 * Distância mínima (px) para um gesto deixar de ser toque.
 * Dedo treme: o limiar de toque é maior que o de mouse.
 */
export function limiarDeArrasto(tipoPonteiro: string): number {
  return tipoPonteiro === 'touch' ? 14 : 6;
}

export type Gesto = 'toque' | 'varrer' | 'arrastar';

/**
 * Classifica o movimento do ponteiro desde o `pointerdown`.
 *
 * - mouse/caneta: qualquer movimento além do limiar já puxa a carta;
 * - toque: deslizar de lado dentro da mão só "varre" as cartas (troca o
 *   destaque, útil em mãos grandes); puxar para cima tira a carta da mão.
 *
 * `dy` segue a convenção de tela: negativo = para cima.
 */
export function classificarGesto(
  tipoPonteiro: string,
  dx: number,
  dy: number,
  alturaCartaPx: number,
): Gesto {
  const limiar = limiarDeArrasto(tipoPonteiro);
  if (Math.hypot(dx, dy) <= limiar) return 'toque';
  if (tipoPonteiro !== 'touch') return 'arrastar';
  const subida = -dy;
  if (subida > Math.max(limiar, alturaCartaPx * 0.22) && subida > Math.abs(dx) * 0.6) {
    return 'arrastar';
  }
  return 'varrer';
}

// ─── Situação das cartas ────────────────────────────────────────────────────

export type SituacaoCarta = 'jogavel' | 'bloqueada' | 'aguardando' | 'interceptavel';

export const MOTIVO_CORTA_FRENTE = 'Corta-Frente em andamento: aguarde a janela fechar.';

export interface DiagnosticoCarta {
  situacao: SituacaoCarta;
  /** Por que a carta não pode ser jogada agora (para leitor de tela e dica). */
  motivo?: string;
}

/** Janela de Corta-Frente em que o jogador local pode agir (nunca na própria carta). */
export function janelaInterceptavel(
  estado: EstadoPartidaPublico,
  jogadorId: string,
): EstadoPartidaPublico['interceptacao'] {
  const janela = estado.interceptacao;
  if (!janela || janela.jogadorOrigemId === jogadorId) return undefined;
  return janela;
}

export function diagnosticarCarta(
  estado: EstadoPartidaPublico,
  carta: Carta,
  jogadorId: string,
): DiagnosticoCarta {
  if (estado.finalizada) return { situacao: 'aguardando', motivo: 'A partida já acabou.' };
  if (janelaInterceptavel(estado, jogadorId) && saoCartasIdenticas(carta, estado.topo)) {
    return { situacao: 'interceptavel' };
  }
  // Com a janela aberta, a vez ainda não foi confirmada: jogar ou comprar agora
  // faria a janela expirar por cima da jogada. Só a interceptação vale.
  if (estado.interceptacao) {
    return { situacao: 'aguardando', motivo: MOTIVO_CORTA_FRENTE };
  }
  if (estado.vezDe !== jogadorId) {
    return { situacao: 'aguardando', motivo: 'Aguarde a sua vez.' };
  }
  const validacao = validarJogadaPublica(estado, carta, jogadorId);
  return validacao.valida
    ? { situacao: 'jogavel' }
    : { situacao: 'bloqueada', motivo: validacao.motivo ?? 'Jogada inválida.' };
}

export interface DiagnosticoCompra {
  permitido: boolean;
  motivo?: string;
  /** Quantas cartas o monte entrega agora (1 ou o ataque acumulado). */
  quantidade: number;
}

/**
 * GDD §7: comprar só existe para quem não tem carta válida na mão. A Troca
 * Mão nunca bloqueia a compra (ninguém é obrigado a trocar de mão).
 */
export function diagnosticarCompra(
  estado: EstadoPartidaPublico,
  mao: ReadonlyArray<Carta>,
  jogadorId: string,
): DiagnosticoCompra {
  const quantidade = estado.ataqueAcumulado > 0 ? estado.ataqueAcumulado : 1;
  if (estado.finalizada) return { permitido: false, motivo: 'A partida já acabou.', quantidade };
  if (estado.interceptacao) return { permitido: false, motivo: MOTIVO_CORTA_FRENTE, quantidade };
  if (estado.vezDe !== jogadorId) {
    return { permitido: false, motivo: 'Aguarde a sua vez.', quantidade };
  }
  const temCartaValida =
    estado.ataqueAcumulado === 0 &&
    mao.some(
      (carta) =>
        carta.acao !== 'TROCA_MAO' && validarJogadaPublica(estado, carta, jogadorId).valida,
    );
  if (temCartaValida) {
    return { permitido: false, motivo: 'Você tem carta válida na mão: jogue-a.', quantidade };
  }
  return { permitido: true, quantidade };
}

// ─── Seleção para descarte múltiplo ─────────────────────────────────────────

/**
 * Toque numa carta: entra ou sai do grupo de descarte múltiplo.
 * Só cartas da mesma face ficam juntas; tocar numa face diferente recomeça o
 * grupo por ela.
 */
export function alternarSelecao(
  selecao: ReadonlyArray<string>,
  carta: Carta,
  mao: ReadonlyArray<Carta>,
): ReadonlyArray<string> {
  if (selecao.includes(carta.id)) return selecao.filter((id) => id !== carta.id);
  const primeira = mao.find((item) => item.id === selecao[0]);
  if (
    primeira &&
    isEligibleForMultipleDiscard(primeira) &&
    isEligibleForMultipleDiscard(carta) &&
    temMesmaFace(primeira, carta)
  ) {
    return [...selecao, carta.id];
  }
  return [carta.id];
}

/** Remove da seleção as cartas que já não estão na mão. */
export function reconciliarSelecao(
  selecao: ReadonlyArray<string>,
  mao: ReadonlyArray<Carta>,
): ReadonlyArray<string> {
  const ids = new Set(mao.map((carta) => carta.id));
  const restantes = selecao.filter((id) => ids.has(id));
  return restantes.length === selecao.length ? selecao : restantes;
}

/**
 * Cartas que saem juntas quando o jogador puxa `cartaId` para o centro.
 * Se a carta faz parte de um grupo selecionado (2+), sai o grupo inteiro,
 * começando por uma carta válida contra a mesa; senão, só ela.
 */
export function cartasDaJogada(
  cartaId: string,
  selecao: ReadonlyArray<string>,
  mao: ReadonlyArray<Carta>,
  ehValida: (carta: Carta) => boolean,
): ReadonlyArray<string> {
  if (selecao.length < 2 || !selecao.includes(cartaId)) return [cartaId];
  return findFirstValidInStack(selecao, mao, ehValida);
}
