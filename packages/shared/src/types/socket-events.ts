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
  /** Obrigatório ao jogar TROCA_MAO. */
  alvoTrocaId?: JogadorId;
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

/** Jogador entrou/saiu da sala. */
export interface ServerSalaAtualizadaEvent {
  /** Identidade estável do jogador que criou a sala. */
  hostId: JogadorId;
  jogadores: ReadonlyArray<JogadorPublico>;
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
  'server:mao:atualizada': ServerMaoAtualizadaEvent;
  'server:erro': ServerErroEvent;
}

/**
 * Re-export de tipos auxiliares usados nos eventos.
 * Evita que o cliente precise importar `Carta` diretamente.
 */
export type { Carta, Cor, Acao };
