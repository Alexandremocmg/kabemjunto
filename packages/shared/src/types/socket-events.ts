/**
 * Eventos de Socket.IO (cliente ↔ servidor).
 * Fonte canônica: GDD Kabemjunto §03.4.5.
 *
 * Convenção de nomes:
 * - `client:*` = emitido pelo cliente, escutado pelo servidor
 * - `server:*` = emitido pelo servidor, escutado pelo cliente
 * - `broadcast:*` = emitido pelo servidor para todos EXCETO o originador
 *
 * O servidor é a única fonte de verdade. Clientes só emitem **intenções**;
 * o servidor valida e devolve `server:estado:atualizado` com o estado canônico.
 */

import type { ResumoPartida } from '../stats/index.js';
import type { Carta, Cor, Acao } from './card.js';
import type { JogadorId, JogadorPublico } from './player.js';
import type {
  EstadoPartidaPublico,
  SalaId,
  SalaRapida,
  VisibilidadeSala,
  JanelaInterceptacao,
} from './game.js';

// ─── Cliente → Servidor ────────────────────────────────────────────

/** Jogador quer descartar uma carta. Servidor valida e responde. */
export interface ClientJogarEvent {
  cartaId: string;
  /** Obrigatório se a carta jogada é neutra (coringa). */
  corEscolhida?: Cor;
  /** Obrigatório ao jogar TROCA_MAO. */
  alvoTrocaId?: JogadorId;
  /** Se true, jogador está gritando "UNO!" ao ficar com 1 carta. */
  gritandoUno?: boolean;
}

/** Jogador quer descartar um lote ordenado de duas ou mais cartas da mesma face. */
export interface ClientDescarteMultiploEvent {
  cartaIds: ReadonlyArray<string>;
}

/** Jogador quer comprar 1 carta do Monte de Compra. */
export interface ClientComprarEvent {
  quantidade?: 1; // default 1; expansível para ataques no futuro
}

/** Jogador escolheu uma cor ao jogar coringa (separado para UX de modal). */
export interface ClientEscolherCorEvent {
  novaCor: Exclude<Cor, 'NEUTRO'>;
}

/** Jogador reporta que alguém quebrou o silêncio (regra do 7). */
export interface ClientSilencioQuebrarEvent {
  /** ID de quem falou. Pode ser auto-report ("eu falei"). */
  jogadorId: JogadorId;
}

/** Jogador envia mensagem no chat. */
export interface ClientChatEvent {
  texto: string;
}

/**
 * Jogador está entrando em uma sala (ou reconectando).
 *
 * Sprint 3 (M14): `jogadorId` é gerado pelo cliente na primeira entrada
 * (UUID v4 via `crypto.randomUUID()`) e persistido no sessionStorage. Em
 * reconexões, o cliente reenvia o mesmo `jogadorId` para o servidor
 * restaurar o jogador (mão, pontos, posição).
 */
export interface ClientEntrarSalaEvent {
  jogadorId: string;
  salaId: string;
  nome: string;
  /** Nome público da sala, aplicado somente quando a criação é autorizada. */
  nomeSala?: string;
  /** Token opaco emitido pelo servidor para retomar uma identidade existente. */
  resumeToken?: string;
  /** `true` cria a sala; `false` exige que a sala já exista. */
  criar?: boolean;
  /** Só é usada na criação; omitida cria uma sala privada. */
  visibilidade?: VisibilidadeSala;
  /** Avatar escolhido, de '01' a '12'. Ausente ou inválido usa o padrão. */
  avatarId?: string;
}

/**
 * "Jogar agora": entra numa sala pública que ainda espera gente (ou cria uma).
 * Se faltar gente até o fim da espera, o servidor completa a mesa com bots.
 */
export interface ClientJogarRapidoEvent {
  jogadorId: string;
  nome: string;
  /** Tamanho da mesa quando começar (humanos + bots), 2 a 10. */
  tamanho: number;
  /** Avatar escolhido, de '01' a '12'. Ausente ou inválido usa o padrão. */
  avatarId?: string;
  /** Token opaco emitido pelo servidor para retomar uma identidade existente. */
  resumeToken?: string;
}

/** Solicita a lista sanitizada de salas públicas disponíveis. */
export type ClientListarSalasEvent = Record<string, never>;

/** Sai explicitamente de uma sala antes de a partida iniciar. */
export type ClientSairSalaEvent = Record<string, never>;

/**
 * Abandona explicitamente a partida em andamento, sem possibilidade de retomada.
 * Um bot assume o assento se ainda sobrar alguma pessoa; senão a partida acaba.
 */
export type ClientAbandonarPartidaEvent = Record<string, never>;

/**
 * A pessoa avisa que voltou e quer jogar de novo, depois que um bot assumiu por
 * inatividade. Qualquer ação de jogo ou mensagem de chat tem o mesmo efeito.
 */
export type ClientRetomarControleEvent = Record<string, never>;

/** Depois do fim, a pessoa quer jogar de novo com a mesma mesa. */
export type ClientPedirRevancheEvent = Record<string, never>;

/** Host quer iniciar a partida. */
export type ClientIniciarPartidaEvent = Record<string, never>;

/**
 * Jogador quer interceptar a carta alvo de uma janela de Corta-Frente
 * ativa, jogando uma carta idêntica (mesma cor e mesmo número/símbolo)
 * fora da própria vez.
 */
export interface ClientInterceptarEvent {
  janelaId: string;
  revisao: number;
  cartaId: string;
}

// ─── Servidor → Cliente ────────────────────────────────────────────

/** Servidor envia o estado canônico atualizado. SEMPRE escutar este evento. */
export interface ServerEstadoAtualizadoEvent {
  estado: EstadoPartidaPublico;
}

/** Credenciais rotativas emitidas somente ao socket autenticado. */
export interface ServerSessaoEmitidaEvent {
  jogadorId: JogadorId;
  salaId: string;
  resumeToken: string;
}

/** Servidor confirma que a jogada do cliente foi aceita (efeito visual). */
export interface ServerJogadaAceitaEvent {
  cartaId: string;
  jogadorId: JogadorId;
}

/** Servidor confirma um lote inteiro aceito, preservando a ordem canônica. */
export interface ServerDescarteMultiploAceitoEvent {
  cartaIds: ReadonlyArray<string>;
  jogadorId: JogadorId;
}

/** Servidor rejeita a jogada do cliente (carta inválida). */
export interface ServerJogadaRejeitadaEvent {
  cartaId: string;
  motivo: string;
  /** Shake animation. Nunca expor detalhes do servidor ao adversário. */
}

/** Alguém gritou UNO. */
export interface ServerUnoDeclaradoEvent {
  jogadorId: JogadorId;
  /** Timestamp do "UNO!" — anti-spam. */
  timestamp: number;
}

/** Cor ativa mudou (coringa jogado). */
export interface ServerCorTrocadaEvent {
  novaCor: Cor;
  /** Quem escolheu (geralmente o jogador que jogou o coringa). */
  por: JogadorId;
}

/** Alguém quebrou o silêncio. */
export interface ServerSilencioQuebradoEvent {
  jogadorId: JogadorId;
  cartasCompradas: 2;
}

/** Chat message distribuída. */
export interface ServerChatEvent {
  jogadorId: JogadorId;
  texto: string;
  timestamp: number;
}

/**
 * Servidor envia a mão PRIVADA de um jogador para o socket dele.
 *
 * Importante: este evento NUNCA é broadcast. Vai apenas pro socket do
 * próprio jogador, porque revelar a mão de outros jogadores é trapaça.
 *
 * Ganhamos um canal de mão privada em cima do broadcast público
 * (`server:estado:atualizado`) — o cliente usa o estado público pra
 * UI e este evento pra renderizar a mão dele.
 */
export interface ServerMaoAtualizadaEvent {
  mao: ReadonlyArray<Carta>;
}

/** Salas públicas visíveis no lobby, deliberadamente sem código, tokens ou estado de jogo. */
export interface ServerSalaDisponivel {
  id: SalaId;
  nome: string;
  hostNome: string;
  quantidadeJogadores: number;
  maxJogadores: number;
}

export interface ServerSalasDisponiveisEvent {
  salas: ReadonlyArray<ServerSalaDisponivel>;
}

/** Jogador entrou/saiu da sala. */
export interface ServerSalaAtualizadaEvent {
  /** Identidade estável do jogador que criou a sala. */
  hostId: JogadorId;
  jogadores: ReadonlyArray<JogadorPublico>;
  visibilidade?: VisibilidadeSala;
  /** Presente nas salas "Jogar agora": tamanho da mesa e quando a partida começa. */
  rapida?: SalaRapida;
}

/** Vitórias de cada assento desde que a sala foi criada. */
export interface PlacarSessao {
  partidas: number;
  vitorias: ReadonlyArray<{ jogadorId: JogadorId; vitorias: number }>;
}

/** A partida terminou: números e prêmios, sem nenhuma carta. Reenviado a quem reconecta. */
export interface ServerPartidaEncerradaEvent {
  resumo: ResumoPartida;
  placar: PlacarSessao;
}

/** Andamento da revanche. `prontos` vazio e sem `restanteMs` = ninguém pediu ainda. */
export interface ServerRevancheAtualizadaEvent {
  partidaId: string;
  prontos: ReadonlyArray<JogadorId>;
  /** Pessoas conectadas que ainda podem aceitar, incluindo as prontas. */
  possiveis: ReadonlyArray<JogadorId>;
  /** Tempo até começar com quem aceitou (bots nas outras vagas), calculado no envio. */
  restanteMs?: number;
}

/** Erro genérico (auth, sala cheia, etc.). */
export interface ServerErroEvent {
  codigo:
    | 'SALA_INEXISTENTE'
    | 'SALA_CHEIA'
    | 'JOGADA_INVALIDA'
    | 'NAO_SUA_VEZ'
    | 'JOGADOR_EM_OUTRA_SALA'
    | 'AUTH_REQUIRED'
    | 'INTERCEPTACAO_INVALIDA'
    | 'INTERNAL';
  mensagem: string;
}

/** Servidor abre uma janela de Corta-Frente após uma carta ser descartada. */
export interface ServerInterceptacaoAbertaEvent {
  janela: JanelaInterceptacao;
}

/**
 * Servidor resolveu uma janela de Corta-Frente — seja por interceptação
 * bem-sucedida, seja por expiração do prazo. `interceptadorId` só existe
 * quando `resultado === 'INTERCEPTADA'`.
 */
export interface ServerInterceptacaoResolvidaEvent {
  janelaId: string;
  resultado: 'INTERCEPTADA' | 'EXPIRADA';
  interceptadorId?: JogadorId;
  proximaVezId: JogadorId;
}

/** Mapa de tipos de evento para o Socket.IO. */
export interface SocketEventMap {
  // client → server
  'client:jogar': ClientJogarEvent;
  'client:descarte:multiplo': ClientDescarteMultiploEvent;
  'client:comprar': ClientComprarEvent;
  'client:escolher:cor': ClientEscolherCorEvent;
  'client:silencio:quebrar': ClientSilencioQuebrarEvent;
  'client:chat:msg': ClientChatEvent;
  'client:entrar:sala': ClientEntrarSalaEvent;
  'client:jogar:rapido': ClientJogarRapidoEvent;
  'client:listar:salas': ClientListarSalasEvent;
  'client:sair:sala': ClientSairSalaEvent;
  'client:abandonar:partida': ClientAbandonarPartidaEvent;
  'client:retomar:controle': ClientRetomarControleEvent;
  'client:iniciar:partida': ClientIniciarPartidaEvent;
  'client:revanche:pedir': ClientPedirRevancheEvent;
  'client:interceptar': ClientInterceptarEvent;
  // server → client
  'server:estado:atualizado': ServerEstadoAtualizadoEvent;
  'server:sessao:emitida': ServerSessaoEmitidaEvent;
  'server:jogada:aceita': ServerJogadaAceitaEvent;
  'server:descarte:multiplo:aceito': ServerDescarteMultiploAceitoEvent;
  'server:jogada:rejeitada': ServerJogadaRejeitadaEvent;
  'server:uno:declarado': ServerUnoDeclaradoEvent;
  'server:cor:trocada': ServerCorTrocadaEvent;
  'server:silencio:quebrado': ServerSilencioQuebradoEvent;
  'server:chat:msg': ServerChatEvent;
  'server:salas:disponiveis': ServerSalasDisponiveisEvent;
  'server:sala:atualizada': ServerSalaAtualizadaEvent;
  'server:partida:encerrada': ServerPartidaEncerradaEvent;
  'server:revanche:atualizada': ServerRevancheAtualizadaEvent;
  'server:mao:atualizada': ServerMaoAtualizadaEvent;
  'server:erro': ServerErroEvent;
  'server:interceptacao:aberta': ServerInterceptacaoAbertaEvent;
  'server:interceptacao:resolvida': ServerInterceptacaoResolvidaEvent;
}

/**
 * Re-export de tipos auxiliares usados nos eventos.
 * Evita que o cliente precise importar `Carta` diretamente.
 */
export type { Carta, Cor, Acao };
