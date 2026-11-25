/**
 * Tipos do domínio Partida / Estado de Jogo.
 * Fonte canônica: GDD Kabemjunto §02.5 (state machine) e §03.4.3.
 *
 * ADR-004: `corAtiva` foi adicionado pelo Antigravity no MVP. Mantido
 * aqui como cache derivado (igual à cor do topo se colorida, ou cor
 * escolhida se o topo é neutro).
 */

import type { Carta, Acao, Cor } from './card.js';
import type { Jogador, JogadorId, JogadorPublico } from './player.js';

/** Identificador opaco de sala (UUID v4 ou código curto de 6 chars). */
export type SalaId = string;

/** Identificador opaco de partida. */
export type PartidaId = string;

/**
 * Modo de jogo. Normalizado em ADR-004:
 * - HOTSEAT    → todos no mesmo aparelho (era "HOT_SEAT" no GDD)
 * - BOTS       → single-player contra IA
 * - ONLINE_PRIVADA → sala online com código
 * - ONLINE_PUBLICA → matchmaking público
 */
export type ModoJogo = 'HOTSEAT' | 'BOTS' | 'ONLINE_PRIVADA' | 'ONLINE_PUBLICA';

/** Uma sala privada só pode ser acessada pelo código; uma pública pode entrar no lobby. */
export type VisibilidadeSala = 'PRIVADA' | 'PUBLICA';

/** Estado de uma sala (antes da partida começar). */
export interface Sala {
  id: SalaId;
  /** Código curto de 6 caracteres, ex: "K4B3MJ". Case-insensitive no input. */
  codigo: string;
  nome: string;
  /** Host é o jogador que criou a sala. Tem permissões de iniciar/expulsar. */
  hostId: JogadorId;
  jogadores: ReadonlyArray<JogadorPublico>;
  /** Limite de jogadores. 2-10. */
  maxJogadores: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  /** Modo de jogo. */
  modo: ModoJogo;
  /** Privada por padrão; somente salas públicas podem aparecer no lobby. */
  visibilidade: VisibilidadeSala;
  status: 'AGUARDANDO' | 'EM_PARTIDA' | 'FINALIZADA';
  /** ID da partida atual (se status === 'EM_PARTIDA'). */
  partidaId?: PartidaId;
  /**
   * Sala criada pelo "Jogar agora": espera pessoas por um tempo e, se faltar
   * gente, completa a mesa com bots. Ausente nas salas criadas à mão.
   */
  rapida?: SalaRapida;
}

/** Parâmetros de uma sala "Jogar agora". */
export interface SalaRapida {
  /** Tamanho da mesa quando a partida começa (humanos + bots), 2 a 10. */
  tamanhoAlvo: number;
  /** Instante (ms desde 1970) em que a partida começa, com bots se faltar gente. */
  iniciaEm: number;
}

/**
 * Estado autoritativo de uma partida.
 *
 * IMPORTANTE: este é o **estado canônico** que vive no servidor. Clientes
 * recebem cópias filtradas (sem ver a mão dos outros) via `getEstadoPublico()`.
 *
 * Invariantes (mantidas pelo motor de regras em `packages/shared/rules/`):
 * - `monteCompra.length + monteDescarte.length === cartasTotais - somaMaos`
 * - `monteDescarte.length >= 1` (sempre tem um topo)
 * - `vezDe` é sempre um ID de jogador presente em `jogadores`
 * - `corAtiva`:
 *   - Se `topo` é colorida: `corAtiva === topo.cor`
 *   - Se `topo` é neutra: `corAtiva` é a cor que o último jogador do coringa escolheu
 * - `ataqueStack` segue a regra do GDD §02.5:
 *   - +2 sobre +2 OK
 *   - +4 sobre +2 OK
 *   - +2 sobre +4 **PROIBIDO**
 *   - +4 sobre +4 OK
 * - `silencio.ativo` é desativado na próxima carta no topo (qualquer).
 */
/** ID opaco de uma janela de interceptação (Corta-Frente). */
export type JanelaInterceptacaoId = string;

/**
 * Fase explícita e persistível de "Corta-Frente" (interceptação fora da
 * vez). Aberta pelo servidor sempre que uma carta é descartada e existe a
 * possibilidade teórica de outro jogador ter uma carta 100% idêntica
 * (mesma cor e mesmo número/símbolo) na mão.
 *
 * Regras (Fase 2 — Corta-Frente V1):
 * - Qualquer jogador (exceto quem acabou de descartar) pode interceptar se
 *   tiver, na própria mão, uma carta idêntica a `cartaAlvoId`.
 * - O primeiro pedido válido que o servidor recebe antes de `fechaEm`
 *   vence ("server-first"); não há compensação de latência de rede.
 * - Interceptação bem-sucedida cancela a vez do jogador atual e o jogo
 *   segue a partir do interceptador, respeitando `sentido`.
 * - Se a janela expira sem interceptação, o turno segue para
 *   `proximaVezId` (calculado no momento da abertura da janela).
 * - `revisao` protege contra resolução de estado obsoleto (uma janela
 *   antiga/já resolvida não pode reabrir ou reprocessar).
 *
 * IMPORTANTE: esta fase não expõe qual jogador tem carta elegível nem o
 * conteúdo de nenhuma mão — apenas metadados públicos (o alvo, o prazo e
 * o próximo turno por timeout). É seguro incluir em `EstadoPartidaPublico`.
 */
export interface JanelaInterceptacao {
  janelaId: JanelaInterceptacaoId;
  /** ID da carta recém-descartada que pode ser interceptada. */
  cartaAlvoId: string;
  /** Jogador que descartou a carta alvo (não pode interceptar a própria carta). */
  jogadorOrigemId: JogadorId;
  /** Timestamp absoluto (autoritativo, do servidor) em que a janela fecha. */
  fechaEm: number;
  /** Próximo turno caso a janela expire sem interceptação. */
  proximaVezId: JogadorId;
  /** Incrementada a cada resolução; usada para descartar respostas obsoletas. */
  revisao: number;
}

export interface EstadoPartida {
  partidaId: PartidaId;
  salaId: SalaId;
  jogadores: ReadonlyArray<Jogador>;
  /**
   * Monte de Compra. Topo = última posição (pop em vez de shift).
   * Se vazio, motor reembaralha o descarte (mantendo o topo).
   */
  monteCompra: ReadonlyArray<Carta>;
  /**
   * Monte de Descarte. Topo = última posição.
   * A carta do topo define a cor/ação que a próxima jogada deve respeitar.
   */
  monteDescarte: ReadonlyArray<Carta>;
  /** ID do jogador da vez. */
  vezDe: JogadorId;
  /** 1 = horário, -1 = anti-horário. Invertido pela carta REVERSE. */
  sentido: 1 | -1;
  /** Cor ativa no momento (mesma do topo se colorida, ou cor escolhida em coringa). */
  corAtiva: Exclude<Cor, 'NEUTRO'>;
  /** Total de cartas que o próximo jogador deve comprar se não cobrir o ataque. */
  ataqueAcumulado: number;
  /**
   * Histórico de cartas de ataque no stack atual. Usado para validar
   * se o próximo +2/+4 pode ser jogado. Esvaziada quando o ataque é
   * coberto, comprado, ou refletido pelo 0+.
   */
  ataqueStack: ReadonlyArray<Acao>;
  /**
   * Estado da regra do 7 (silêncio).
   * `ativo` é desativado assim que a próxima carta é colocada no descarte.
   */
  silencio: {
    ativo: boolean;
    /** Jogadores já penalizados por falar na janela atual de silêncio. */
    jogadoresQuebraram: ReadonlyArray<JogadorId>;
  };
  /** Log de eventos para replay e auditoria (anti-cheat). */
  historico: ReadonlyArray<EventoPartida>;
  finalizada: boolean;
  /** ID do jogador que venceu (último a descartar todas as cartas). */
  vencedor?: JogadorId;
  /**
   * Janela ativa de interceptação (Corta-Frente), se houver. Ausente
   * significa que ninguém pode interceptar no momento.
   */
  interceptacao?: JanelaInterceptacao | undefined;
  /**
   * Prazo da vez atual, só quando o relógio está correndo. Pertence ao
   * servidor (nunca é gravado em disco nem usado pelo motor de regras).
   */
  turno?: PrazoTurno;
}

/** Prazo da vez de um jogador, pelo relógio do servidor. */
export interface PrazoTurno {
  jogadorId: JogadorId;
  /** Instante (ms desde 1970, relógio do servidor) em que a vez estoura. */
  expiraEm: number;
  /** Duração total do limite por vez, em ms (para desenhar a barra). */
  duracaoMs: number;
  /** Muda a cada vez nova, inclusive quando ela volta ao mesmo jogador. */
  revisao: number;
}

/** Prazo como o cliente recebe. */
export interface TurnoPublico extends PrazoTurno {
  /**
   * Quanto falta, em ms, no momento do envio. O cliente deve contar a partir
   * daqui (e não de `expiraEm`), pois o relógio do aparelho pode estar errado.
   */
  restanteMs: number;
}

/**
 * Evento do log da partida. Cada mudança de estado gera um evento.
 * Usado para:
 * - Replay (debug, desputes)
 * - Auditoria (anti-cheat — verificar se o histórico leva ao estado final)
 * - Telemetria (analytics)
 *
 * O `tipo` discrimina o resto. Mantemos o log append-only.
 */
export type EventoPartida =
  | { tipo: 'PARTIDA_INICIADA'; timestamp: number; jogadores: ReadonlyArray<JogadorId> }
  | { tipo: 'CARTA_DISTRIBUIDA'; timestamp: number; jogadorId: JogadorId; cartaId: string }
  | {
      tipo: 'CARTA_JOGADA';
      timestamp: number;
      jogadorId: JogadorId;
      cartaId: string;
      corEscolhida?: Cor;
    }
  | {
      tipo: 'CARTA_COMPRADA';
      timestamp: number;
      jogadorId: JogadorId;
      cartaId: string;
      origem: 'NORMAL' | 'ATAQUE' | 'REGRA_DO_7' | 'STALEMATE';
    }
  | {
      tipo: 'CARTA_DESCARTADA_SEM_EFEITO';
      timestamp: number;
      jogadorId: JogadorId;
      cartaId: string;
    }
  | { tipo: 'ACAO_RESOLVIDA'; timestamp: number; acao: Acao; alvo?: JogadorId }
  | {
      tipo: 'ATAQUE_ACUMULADO';
      timestamp: number;
      novo: number;
      stack: ReadonlyArray<Acao>;
      /** Ausente em snapshots legados; `STARTER` representa ataque da abertura. */
      origem?: JogadorId | 'STARTER';
    }
  | {
      tipo: 'ATAQUE_REFLETIDO_ZERO_MAIS';
      timestamp: number;
      origem: JogadorId;
      alvo: JogadorId;
      cartasDevolvidas: number;
    }
  | { tipo: 'SILENCIO_ATIVADO'; timestamp: number; por: JogadorId }
  | { tipo: 'SILENCIO_QUEBRADO'; timestamp: number; por: JogadorId; cartasCompradas: 2 }
  | { tipo: 'UNO_GRITADO'; timestamp: number; por: JogadorId }
  | {
      tipo: 'JOGADOR_PULADO';
      timestamp: number;
      jogadorId: JogadorId;
      motivo: 'SKIP' | 'ATAQUE_NAO_COBERTO';
    }
  | { tipo: 'SENTIDO_INVERTIDO'; timestamp: number; novo: 1 | -1 }
  | { tipo: 'MAO_GIRADA'; timestamp: number; sentido: 1 | -1 }
  | { tipo: 'MAO_TROCADA'; timestamp: number; jogadorA: JogadorId; jogadorB: JogadorId }
  | { tipo: 'VITORIA'; timestamp: number; vencedorId: JogadorId }
  | { tipo: 'PARTIDA_FINALIZADA'; timestamp: number; motivo: 'VITORIA' | 'ABANDONO' | 'TIMEOUT' }
  | {
      /**
       * Monte de compra e descarte reciclável esgotaram antes de completar
       * uma compra (GDD §10.2/§10.5). `cartasObtidas` pode ser 0.
       */
      tipo: 'MONTE_ESGOTADO';
      timestamp: number;
      jogadorId: JogadorId;
      cartasSolicitadas: number;
      cartasObtidas: number;
    }
  | {
      /** Janela de Corta-Frente aberta após uma carta ser descartada. */
      tipo: 'INTERCEPTACAO_ABERTA';
      timestamp: number;
      janelaId: string;
      cartaAlvoId: string;
      jogadorOrigemId: JogadorId;
    }
  | {
      /** Um jogador interceptou com sucesso a carta alvo da janela. */
      tipo: 'INTERCEPTACAO_ACEITA';
      timestamp: number;
      janelaId: string;
      interceptadorId: JogadorId;
      cartaId: string;
    }
  | {
      /** Janela expirou sem interceptação; turno segue normalmente. */
      tipo: 'INTERCEPTACAO_EXPIRADA';
      timestamp: number;
      janelaId: string;
      proximaVezId: JogadorId;
    };

/**
 * Estado público da partida (filtrado para enviar a cada cliente).
 * O cliente NUNCA recebe o array `mao` dos outros jogadores — só a quantidade.
 */
export interface EstadoPartidaPublico {
  partidaId: PartidaId;
  salaId: SalaId;
  jogadores: ReadonlyArray<JogadorPublico>;
  /** Topo do descarte (última carta). */
  topo: Carta;
  /** Quantidade de cartas no Monte de Compra (não revela ordem). */
  quantidadeMonteCompra: number;
  vezDe: JogadorId;
  sentido: 1 | -1;
  corAtiva: Exclude<Cor, 'NEUTRO'>;
  ataqueAcumulado: number;
  ataqueStack: ReadonlyArray<Acao>;
  silencio: EstadoPartida['silencio'];
  finalizada: boolean;
  vencedor?: JogadorId;
  /**
   * Janela ativa de interceptação (Corta-Frente), se houver. Seguro expor
   * publicamente: não revela qual jogador tem carta elegível nem
   * conteúdo de mão — apenas o alvo, prazo e turno de fallback.
   */
  interceptacao?: JanelaInterceptacao | undefined;
  /**
   * Prazo da vez. Ausente quando não há relógio correndo: limite desligado,
   * Corta-Frente aberta, vez de bot, jogador desconectado ou partida terminada.
   */
  turno?: TurnoPublico;
}
