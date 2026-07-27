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
  /** Mapeia `jogadorId` (identidade estável) → `socketId` atual. */
  socketByPlayer: ReadonlyMap<JogadorId, string>;
}

export interface JoinRoomInput {
  /** Identidade estável do jogador (UUID v4). Veio do cliente. */
  jogadorId: string;
  salaId: string;
  nome: string;
  socketId: string;
  criar?: boolean;
}

export interface JoinRoomResult {
  session: RoomSession;
  jogadorId: JogadorId;
  /** True se o jogador já existia (reconexão). False se foi criado agora. */
  reconectado: boolean;
}

export class RoomError extends Error {
  constructor(
    public readonly code:
      | 'SALA_INEXISTENTE'
      | 'SALA_CHEIA'
      | 'NAO_SUA_VEZ'
      | 'JOGADA_INVALIDA'
      | 'JOGADOR_EM_OUTRA_SALA'
      | 'INTERNAL',
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

  /**
   * Adiciona ou restaura um jogador na sala.
   *
   * Identidade estável (Sprint 3 — M14):
   * - `jogadorId` novo → cria jogador na sala
   * - `jogadorId` existente NESTA sala → atualiza socket, marca `conectado: true`
   *   (usado em reconexão)
   * - `jogadorId` existente em OUTRA sala → throw `JOGADOR_EM_OUTRA_SALA`
   *   (anti-impersonation: jogador não pode estar em 2 salas ao mesmo tempo)
   */
  join(input: JoinRoomInput): JoinRoomResult {
    const salaId = input.salaId.trim().toUpperCase();
    if (!salaId) throw new RoomError('SALA_INEXISTENTE', 'Informe o código da sala.');

    if (!input.jogadorId) {
      throw new RoomError('INTERNAL', 'Jogador precisa de um jogadorId (UUID v4).');
    }

    // Verifica se o jogador já existe em OUTRA sala.
    for (const [outraSalaId, outraSession] of this.rooms) {
      if (outraSalaId === salaId) continue;
      if (outraSession.sala.jogadores.some((j) => j.id === input.jogadorId)) {
        throw new RoomError(
          'JOGADOR_EM_OUTRA_SALA',
          `Jogador ${input.jogadorId} já está na sala ${outraSalaId}. Saia dela primeiro.`,
        );
      }
    }

    let session = this.rooms.get(salaId);
    if (!session && input.criar === false) {
      throw new RoomError('SALA_INEXISTENTE', 'Sala não encontrada.');
    }
    if (!session) {
      const sala: Sala = {
        id: salaId,
        codigo: salaId,
        nome: `Sala ${salaId}`,
        // hostId é o jogadorId do primeiro jogador (identidade estável).
        // O socketId muda a cada reconexão, mas o jogadorId não.
        hostId: input.jogadorId,
        jogadores: [],
        maxJogadores: 10,
        modo: 'ONLINE_PRIVADA',
        status: 'AGUARDANDO',
      };
      session = { sala, socketByPlayer: new Map() };
      this.rooms.set(salaId, session);
    }

    // Tenta encontrar o jogador existente nesta sala (caso de reconexão).
    const jogadorExistente = session.sala.jogadores.find((j) => j.id === input.jogadorId);

    if (jogadorExistente) {
      // Reconexão: atualiza o socket, marca como conectado.
      const jogadores = session.sala.jogadores.map((j) =>
        j.id === input.jogadorId ? { ...j, conectado: true } : j,
      );
      const socketByPlayer = new Map(session.socketByPlayer);
      socketByPlayer.set(input.jogadorId, input.socketId);
      const next: RoomSession = {
        ...session,
        sala: { ...session.sala, jogadores },
        socketByPlayer,
      };
      this.rooms.set(salaId, next);
      return { session: next, jogadorId: input.jogadorId, reconectado: true };
    }

    if (session.sala.status !== 'AGUARDANDO') {
      throw new RoomError('SALA_CHEIA', 'A partida desta sala já começou.');
    }

    // Jogador novo: cria.
    if (session.sala.jogadores.length >= session.sala.maxJogadores) {
      throw new RoomError('SALA_CHEIA', 'A sala atingiu o limite de jogadores.');
    }

    const jogadorId = input.jogadorId;
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
    const next: RoomSession = {
      ...session,
      sala: { ...session.sala, jogadores: [...session.sala.jogadores, jogador] },
      socketByPlayer,
    };
    this.rooms.set(salaId, next);
    return { session: next, jogadorId, reconectado: false };
  }

  get(salaId: string): RoomSession | undefined {
    return this.rooms.get(salaId.trim().toUpperCase());
  }

  /**
   * Encontra a sala em que um socket está conectado. Helper pra `disconnect`.
   */
  findBySocketId(socketId: string): { salaId: SalaId; session: RoomSession } | undefined {
    for (const [salaId, session] of this.rooms) {
      for (const socket of session.socketByPlayer.values()) {
        if (socket === socketId) {
          return { salaId, session };
        }
      }
    }
    return undefined;
  }

  start(salaId: string, requesterSocketId: string): RoomSession {
    const session = this.require(salaId);
    // Encontra o jogadorId do requester via socket → jogadorId
    const requesterEntry = [...session.socketByPlayer.entries()].find(
      ([, socket]) => socket === requesterSocketId,
    );
    const requesterJogadorId = requesterEntry?.[0];

    if (!requesterJogadorId || session.sala.hostId !== requesterJogadorId) {
      // Em caso de reconexão do host, o hostId original (jogadorId do 1º jogador)
      // deve bater. Verificamos pelo socketByPlayer.
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
    alvoTrocaId?: Parameters<typeof executarJogada>[0]['alvoTrocaId'],
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
        ...(alvoTrocaId !== undefined ? { alvoTrocaId } : {}),
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

  /**
   * Marca jogador como desconectado, mas NÃO remove ele da sala.
   * M14 (identidade estável): o jogador pode reconectar com o mesmo
   * `jogadorId` e voltar a jogar.
   */
  disconnect(socketId: string): RoomSession | undefined {
    const found = this.findBySocketId(socketId);
    if (!found) return undefined;
    const { salaId, session } = found;

    // Encontra o jogadorId deste socket
    const jogadorEntry = [...session.socketByPlayer.entries()].find(
      ([, sock]) => sock === socketId,
    );
    const jogadorId = jogadorEntry?.[0];
    if (!jogadorId) return undefined;

    const jogadores = session.sala.jogadores.map((j) =>
      j.id === jogadorId ? { ...j, conectado: false } : j,
    );
    const next = { ...session, sala: { ...session.sala, jogadores } };
    this.rooms.set(salaId, next);
    return next;
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
