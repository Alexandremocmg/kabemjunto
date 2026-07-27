import {
  Constants,
  comprarCartas,
  criarPartidaInicial,
  executarJogada,
  type EstadoPartida,
  type EstadoPartidaPublico,
  type JogadorId,
  type JogadorPublico,
  type ModoJogo,
  type Sala,
  type SalaId,
} from '@kabemjunto/shared';

export interface RoomSession {
  sala: Sala;
  estado?: EstadoPartida;
  socketByPlayer: ReadonlyMap<JogadorId, string>;
}

export interface JoinRoomInput {
  salaId: string;
  nome: string;
  socketId: string;
}

export interface JoinRoomResult {
  session: RoomSession;
  jogadorId: JogadorId;
}

export class RoomError extends Error {
  constructor(
    public readonly code:
      'SALA_INEXISTENTE' | 'SALA_CHEIA' | 'NAO_SUA_VEZ' | 'JOGADA_INVALIDA' | 'INTERNAL',
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

function sanitizeName(name: string): string {
  const normalized = name.replace(/[<>]/g, '').trim().slice(0, 24);
  return normalized || 'Jogador';
}

function publicPlayer(jogador: EstadoPartida['jogadores'][number]): JogadorPublico {
  return {
    id: jogador.id,
    nome: jogador.nome,
    quantidadeCartas: jogador.mao.length,
    isBot: jogador.isBot,
    conectado: jogador.conectado,
    disseUno: jogador.disseUno,
    avatar: jogador.avatar,
    pontos: jogador.pontos,
  };
}

export function toPublicState(estado: EstadoPartida): EstadoPartidaPublico {
  const topo = estado.monteDescarte[estado.monteDescarte.length - 1];
  if (!topo) {
    throw new RoomError('INTERNAL', 'A partida não possui carta no descarte.');
  }

  return {
    partidaId: estado.partidaId,
    salaId: estado.salaId,
    jogadores: estado.jogadores.map(publicPlayer),
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
  };
}

export class RoomStore {
  private readonly rooms = new Map<SalaId, RoomSession>();

  join(input: JoinRoomInput): JoinRoomResult {
    const salaId = input.salaId.trim().toUpperCase();
    if (!salaId) throw new RoomError('SALA_INEXISTENTE', 'Informe o código da sala.');

    let session = this.rooms.get(salaId);
    if (!session) {
      const sala: Sala = {
        id: salaId,
        codigo: salaId,
        nome: `Sala ${salaId}`,
        hostId: input.socketId,
        jogadores: [],
        maxJogadores: 10,
        modo: 'ONLINE_PRIVADA',
        status: 'AGUARDANDO',
      };
      session = { sala, socketByPlayer: new Map() };
      this.rooms.set(salaId, session);
    }

    if (session.sala.status !== 'AGUARDANDO') {
      throw new RoomError('SALA_CHEIA', 'A partida desta sala já começou.');
    }
    if (session.sala.jogadores.length >= session.sala.maxJogadores) {
      throw new RoomError('SALA_CHEIA', 'A sala atingiu o limite de jogadores.');
    }

    const jogadorId = input.socketId;
    const jogador: JogadorPublico = {
      id: jogadorId,
      nome: sanitizeName(input.nome),
      quantidadeCartas: 0,
      isBot: false,
      conectado: true,
      disseUno: false,
      avatar: '⭐',
      pontos: 0,
    };
    const socketByPlayer = new Map(session.socketByPlayer);
    socketByPlayer.set(jogadorId, input.socketId);
    session = {
      ...session,
      sala: { ...session.sala, jogadores: [...session.sala.jogadores, jogador] },
      socketByPlayer,
    };
    this.rooms.set(salaId, session);
    return { session, jogadorId };
  }

  get(salaId: string): RoomSession | undefined {
    return this.rooms.get(salaId.trim().toUpperCase());
  }

  start(salaId: string, requesterId: JogadorId): RoomSession {
    const session = this.require(salaId);
    if (session.sala.hostId !== requesterId) {
      throw new RoomError('INTERNAL', 'Apenas o host pode iniciar a partida.');
    }
    if (session.sala.jogadores.length < 2) {
      throw new RoomError('INTERNAL', 'A sala precisa de pelo menos 2 jogadores.');
    }

    const estado = criarPartidaInicial({
      baralho: Constants.BARALHO_COMPLETO_108,
      modo: session.sala.modo as ModoJogo,
      totalJogadores: session.sala.jogadores.length,
      nomesCustomizados: session.sala.jogadores.map((jogador) => jogador.nome),
      idsCustomizados: session.sala.jogadores.map((jogador) => jogador.id),
      salaId: session.sala.id,
      partidaId: `game_${Date.now()}_${session.sala.id}`,
    });
    const next: RoomSession = {
      ...session,
      sala: { ...session.sala, status: 'EM_PARTIDA', partidaId: estado.partidaId },
      estado,
    };
    this.rooms.set(session.sala.id, next);
    return next;
  }

  play(
    salaId: string,
    jogadorId: JogadorId,
    cartaId: string,
    corEscolhida?: Parameters<typeof executarJogada>[0]['corEscolhida'],
  ): RoomSession {
    const session = this.requireActive(salaId);
    if (session.estado.vezDe !== jogadorId) {
      throw new RoomError('NAO_SUA_VEZ', 'Não é o seu turno.');
    }
    const jogador = session.estado.jogadores.find((item) => item.id === jogadorId);
    const cartaIndex = jogador?.mao.findIndex((carta) => carta.id === cartaId) ?? -1;
    if (cartaIndex < 0) {
      throw new RoomError('JOGADA_INVALIDA', 'Essa carta não está na sua mão.');
    }

    try {
      const resultado = executarJogada({
        estado: session.estado,
        cartaIndex,
        ...(corEscolhida !== undefined ? { corEscolhida } : {}),
      });
      return this.saveState(session, resultado.novoEstado);
    } catch (error) {
      throw new RoomError(
        'JOGADA_INVALIDA',
        error instanceof Error ? error.message : 'Jogada inválida.',
      );
    }
  }

  buy(salaId: string, jogadorId: JogadorId): RoomSession {
    const session = this.requireActive(salaId);
    if (session.estado.vezDe !== jogadorId) {
      throw new RoomError('NAO_SUA_VEZ', 'Não é o seu turno.');
    }
    const resultado = comprarCartas({ estado: session.estado });
    return this.saveState(session, resultado.novoEstado);
  }

  disconnect(socketId: string): RoomSession | undefined {
    for (const session of this.rooms.values()) {
      const jogador = session.sala.jogadores.find((item) => item.id === socketId);
      if (!jogador) continue;
      const jogadores = session.sala.jogadores.map((item) =>
        item.id === socketId ? { ...item, conectado: false } : item,
      );
      const next = { ...session, sala: { ...session.sala, jogadores } };
      this.rooms.set(session.sala.id, next);
      return next;
    }
    return undefined;
  }

  private require(salaId: string): RoomSession {
    const session = this.get(salaId);
    if (!session) throw new RoomError('SALA_INEXISTENTE', 'Sala não encontrada.');
    return session;
  }

  private requireActive(salaId: string): RoomSession & { estado: EstadoPartida } {
    const session = this.require(salaId);
    if (!session.estado) throw new RoomError('INTERNAL', 'A partida ainda não foi iniciada.');
    return session as RoomSession & { estado: EstadoPartida };
  }

  private saveState(session: RoomSession, estado: EstadoPartida): RoomSession {
    const next = { ...session, estado };
    this.rooms.set(session.sala.id, next);
    return next;
  }
}
