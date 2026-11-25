import type { Server, Socket } from 'socket.io';
import type {
  ClientAbandonarPartidaEvent,
  ClientChatEvent,
  ClientComprarEvent,
  ClientDescarteMultiploEvent,
  ClientEntrarSalaEvent,
  ClientEscolherCorEvent,
  ClientIniciarPartidaEvent,
  ClientInterceptarEvent,
  ClientJogarEvent,
  ClientJogarRapidoEvent,
  ClientListarSalasEvent,
  ClientSairSalaEvent,
  ServerChatEvent,
  ServerCorTrocadaEvent,
  ServerDescarteMultiploAceitoEvent,
  ServerErroEvent,
  ServerEstadoAtualizadoEvent,
  ServerInterceptacaoAbertaEvent,
  ServerInterceptacaoResolvidaEvent,
  ServerJogadaAceitaEvent,
  ServerJogadaRejeitadaEvent,
  ServerMaoAtualizadaEvent,
  ServerSalaAtualizadaEvent,
  ServerSalasDisponiveisEvent,
  ServerSessaoEmitidaEvent,
  ServerSilencioQuebradoEvent,
} from '@kabemjunto/shared';

/** Eventos que o cliente envia e que o servidor envia, e os tipos do servidor/socket tipados com eles. */
export type ClientEvents = {
  'client:entrar:sala': (payload: ClientEntrarSalaEvent) => void;
  'client:jogar:rapido': (payload: ClientJogarRapidoEvent) => void;
  'client:listar:salas': (payload: ClientListarSalasEvent) => void;
  'client:sair:sala': (payload: ClientSairSalaEvent) => void;
  'client:abandonar:partida': (payload: ClientAbandonarPartidaEvent) => void;
  'client:iniciar:partida': (payload: ClientIniciarPartidaEvent) => void;
  'client:jogar': (payload: ClientJogarEvent) => void;
  'client:descarte:multiplo': (payload: ClientDescarteMultiploEvent) => void;
  'client:comprar': (payload: ClientComprarEvent) => void;
  'client:escolher:cor': (payload: ClientEscolherCorEvent) => void;
  'client:interceptar': (payload: ClientInterceptarEvent) => void;
  'client:chat:msg': (payload: ClientChatEvent) => void;
};

export type ServerEvents = {
  'server:estado:atualizado': (payload: ServerEstadoAtualizadoEvent) => void;
  'server:sessao:emitida': (payload: ServerSessaoEmitidaEvent) => void;
  'server:jogada:aceita': (payload: ServerJogadaAceitaEvent) => void;
  'server:descarte:multiplo:aceito': (payload: ServerDescarteMultiploAceitoEvent) => void;
  'server:jogada:rejeitada': (payload: ServerJogadaRejeitadaEvent) => void;
  'server:sala:atualizada': (payload: ServerSalaAtualizadaEvent) => void;
  'server:salas:disponiveis': (payload: ServerSalasDisponiveisEvent) => void;
  'server:cor:trocada': (payload: ServerCorTrocadaEvent) => void;
  'server:silencio:quebrado': (payload: ServerSilencioQuebradoEvent) => void;
  'server:chat:msg': (payload: ServerChatEvent) => void;
  'server:mao:atualizada': (payload: ServerMaoAtualizadaEvent) => void;
  'server:interceptacao:aberta': (payload: ServerInterceptacaoAbertaEvent) => void;
  'server:interceptacao:resolvida': (payload: ServerInterceptacaoResolvidaEvent) => void;
  'server:erro': (payload: ServerErroEvent) => void;
};

export type GameServer = Server<ClientEvents, ServerEvents>;
export type GameSocket = Socket<ClientEvents, ServerEvents>;
