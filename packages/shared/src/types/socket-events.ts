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

import type { Carta, Cor, Acao } from './card.js';
import type { JogadorId, JogadorPublico } from './player.js';
import type { EstadoPartidaPublico } from './game.js';

// ─── Cliente → Servidor ────────────────────────────────────────────

/** Jogador quer descartar uma carta. Servidor valida e responde. */
export interface ClientJogarEvent {
  cartaId: string;
  /** Obrigatório se a carta jogada é neutra (coringa). */
  corEscolhida?: Cor;
  /** Se true, jogador está gritando "UNO!" ao ficar com 1 carta. */
  gritandoUno?: boolean;
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

/** Jogador está entrando em uma sala. */
export interface ClientEntrarSalaEvent {
  salaId: string;
  nome: string;
}

/** Host quer iniciar a partida. */
export type ClientIniciarPartidaEvent = Record<string, never>;

// ─── Servidor → Cliente ────────────────────────────────────────────

/** Servidor envia o estado canônico atualizado. SEMPRE escutar este evento. */
export interface ServerEstadoAtualizadoEvent {
  estado: EstadoPartidaPublico;
}

/** Servidor confirma que a jogada do cliente foi aceita (efeito visual). */
export interface ServerJogadaAceitaEvent {
  cartaId: string;
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

/** Jogador entrou/saiu da sala. */
export interface ServerSalaAtualizadaEvent {
  jogadores: ReadonlyArray<JogadorPublico>;
}

/** Erro genérico (auth, sala cheia, etc.). */
export interface ServerErroEvent {
  codigo:
    | 'SALA_INEXISTENTE'
    | 'SALA_CHEIA'
    | 'JOGADA_INVALIDA'
    | 'NAO_SUA_VEZ'
    | 'AUTH_REQUIRED'
    | 'INTERNAL';
  mensagem: string;
}

/** Mapa de tipos de evento para o Socket.IO. */
export interface SocketEventMap {
  // client → server
  'client:jogar': ClientJogarEvent;
  'client:comprar': ClientComprarEvent;
  'client:escolher:cor': ClientEscolherCorEvent;
  'client:silencio:quebrar': ClientSilencioQuebrarEvent;
  'client:chat:msg': ClientChatEvent;
  'client:entrar:sala': ClientEntrarSalaEvent;
  'client:iniciar:partida': ClientIniciarPartidaEvent;
  // server → client
  'server:estado:atualizado': ServerEstadoAtualizadoEvent;
  'server:jogada:aceita': ServerJogadaAceitaEvent;
  'server:jogada:rejeitada': ServerJogadaRejeitadaEvent;
  'server:uno:declarado': ServerUnoDeclaradoEvent;
  'server:cor:trocada': ServerCorTrocadaEvent;
  'server:silencio:quebrado': ServerSilencioQuebradoEvent;
  'server:chat:msg': ServerChatEvent;
  'server:sala:atualizada': ServerSalaAtualizadaEvent;
  'server:erro': ServerErroEvent;
}

/**
 * Re-export de tipos auxiliares usados nos eventos.
 * Evita que o cliente precise importar `Carta` diretamente.
 */
export type { Carta, Cor, Acao };
