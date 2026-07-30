import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import type { Carta, EstadoPartida, Jogador, JogadorPublico, Sala } from '@kabemjunto/shared';

export const ROOM_SNAPSHOT_VERSION = 3 as const;
const LEGACY_ROOM_SNAPSHOT_VERSION = 2 as const;
type ReadableRoomSnapshotVersion =
  typeof LEGACY_ROOM_SNAPSHOT_VERSION | typeof ROOM_SNAPSHOT_VERSION;

export interface PersistedRoomSession {
  sala: Sala;
  estado?: EstadoPartida;
  /** SHA-256 hexadecimal do token de retomada por jogador. */
  resumeTokenHashes: Record<string, string>;
}

interface RoomSnapshot {
  version: typeof ROOM_SNAPSHOT_VERSION;
  rooms: PersistedRoomSession[];
}

export interface RoomPersistence {
  load(): PersistedRoomSession[];
  save(rooms: readonly PersistedRoomSession[]): void;
  /** Probe não destrutivo: confirma que o volume ainda aceita escrita (usado por `/ready`). */
  probeWritable?(): boolean;
}

export class RoomSnapshotError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RoomSnapshotError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isOneOf<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

const COLORS = ['LARANJA', 'AZUL', 'VERDE', 'PRETO', 'NEUTRO'] as const;
const ACTIVE_COLORS = ['LARANJA', 'AZUL', 'VERDE', 'PRETO'] as const;
const CARD_TYPES = ['NUMERADA', 'ACAO', 'NEUTRA'] as const;
const ACTIONS = [
  'SKIP',
  'REVERSE',
  'MAIS_DOIS',
  'MAIS_QUATRO',
  'TROCA_MAO',
  'GIRA_MAO',
  'ZERO_MAIS',
  'CORINGA_SIMPLES',
  'SILENCIO',
] as const;
const RARITIES = ['COMUM', 'INCOMUM', 'RARA', 'UNICA'] as const;
const MODES = ['HOTSEAT', 'BOTS', 'ONLINE_PRIVADA', 'ONLINE_PUBLICA'] as const;
const ROOM_STATUSES = ['AGUARDANDO', 'EM_PARTIDA', 'FINALIZADA'] as const;
const EVENT_TYPES = [
  'PARTIDA_INICIADA',
  'CARTA_DISTRIBUIDA',
  'CARTA_JOGADA',
  'CARTA_COMPRADA',
  'CARTA_DESCARTADA_SEM_EFEITO',
  'ACAO_RESOLVIDA',
  'ATAQUE_ACUMULADO',
  'ATAQUE_REFLETIDO_ZERO_MAIS',
  'SILENCIO_ATIVADO',
  'SILENCIO_QUEBRADO',
  'UNO_GRITADO',
  'JOGADOR_PULADO',
  'SENTIDO_INVERTIDO',
  'MAO_GIRADA',
  'MAO_TROCADA',
  'VITORIA',
  'PARTIDA_FINALIZADA',
  'MONTE_ESGOTADO',
] as const;

function hasOptionalString(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isString(record[key]);
}

function isCard(value: unknown): value is Carta {
  if (!isRecord(value)) return false;
  if (
    !isString(value['id']) ||
    !isOneOf(value['cor'], COLORS) ||
    !isOneOf(value['tipo'], CARD_TYPES) ||
    !isOneOf(value['raridade'], RARITIES) ||
    !isString(value['colecao']) ||
    !isString(value['efeito_texto_curto']) ||
    !isString(value['efeito_texto_longo'])
  ) {
    return false;
  }
  if (value['valor'] !== undefined && !isInteger(value['valor'])) return false;
  if (value['acao'] !== undefined && !isOneOf(value['acao'], ACTIONS)) return false;
  if (value['tipo'] === 'NUMERADA') {
    return (
      value['cor'] !== 'NEUTRO' &&
      isInteger(value['valor']) &&
      value['valor'] >= 0 &&
      value['valor'] <= 9
    );
  }
  return (
    value['acao'] !== undefined && (value['tipo'] === 'NEUTRA') === (value['cor'] === 'NEUTRO')
  );
}

function isPublicPlayer(value: unknown): value is JogadorPublico {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['nome']) &&
    isInteger(value['quantidadeCartas']) &&
    value['quantidadeCartas'] >= 0 &&
    isBoolean(value['isBot']) &&
    isBoolean(value['conectado']) &&
    isBoolean(value['disseUno']) &&
    isString(value['avatar']) &&
    isFiniteNumber(value['pontos'])
  );
}

function isPlayer(value: unknown): value is Jogador {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['nome']) &&
    Array.isArray(value['mao']) &&
    value['mao'].every(isCard) &&
    isBoolean(value['isBot']) &&
    isBoolean(value['conectado']) &&
    isBoolean(value['disseUno']) &&
    isString(value['avatar']) &&
    isFiniteNumber(value['pontos'])
  );
}

function isRoom(value: unknown): value is Sala {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['codigo']) &&
    isString(value['nome']) &&
    isString(value['hostId']) &&
    Array.isArray(value['jogadores']) &&
    value['jogadores'].every(isPublicPlayer) &&
    isInteger(value['maxJogadores']) &&
    value['maxJogadores'] >= 2 &&
    value['maxJogadores'] <= 10 &&
    isOneOf(value['modo'], MODES) &&
    (value['visibilidade'] === undefined ||
      isOneOf(value['visibilidade'], ['PRIVADA', 'PUBLICA'] as const)) &&
    isOneOf(value['status'], ROOM_STATUSES) &&
    hasOptionalString(value, 'partidaId')
  );
}

function isResumeTokenHashes(value: unknown, sala: Sala): value is Record<string, string> {
  if (!isRecord(value)) return false;
  const playerIds = new Set(sala.jogadores.map((player) => player.id));
  const entries = Object.entries(value);
  return entries.every(
    ([playerId, hash]) =>
      playerIds.has(playerId) && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
  );
}

function isGameEvent(
  value: unknown,
  snapshotVersion: ReadableRoomSnapshotVersion,
  playerIds: ReadonlySet<string>,
): boolean {
  if (
    !isRecord(value) ||
    !isOneOf(value['tipo'], EVENT_TYPES) ||
    !isFiniteNumber(value['timestamp'])
  ) {
    return false;
  }

  switch (value['tipo']) {
    case 'PARTIDA_INICIADA':
      return Array.isArray(value['jogadores']) && value['jogadores'].every(isString);
    case 'CARTA_DISTRIBUIDA':
    case 'CARTA_DESCARTADA_SEM_EFEITO':
      return isString(value['jogadorId']) && isString(value['cartaId']);
    case 'CARTA_JOGADA':
      return (
        isString(value['jogadorId']) &&
        isString(value['cartaId']) &&
        (value['corEscolhida'] === undefined || isOneOf(value['corEscolhida'], COLORS))
      );
    case 'CARTA_COMPRADA':
      return (
        isString(value['jogadorId']) &&
        isString(value['cartaId']) &&
        isOneOf(value['origem'], ['NORMAL', 'ATAQUE', 'REGRA_DO_7', 'STALEMATE'] as const)
      );
    case 'ACAO_RESOLVIDA':
      return isOneOf(value['acao'], ACTIONS) && hasOptionalString(value, 'alvo');
    case 'ATAQUE_ACUMULADO': {
      const origem = value['origem'];
      return (
        isFiniteNumber(value['novo']) &&
        value['novo'] >= 0 &&
        Array.isArray(value['stack']) &&
        value['stack'].every((action) => isOneOf(action, ACTIONS)) &&
        (origem === undefined ||
          origem === 'STARTER' ||
          (isString(origem) && playerIds.has(origem)))
      );
    }
    case 'ATAQUE_REFLETIDO_ZERO_MAIS':
      return (
        isString(value['origem']) &&
        isString(value['alvo']) &&
        isFiniteNumber(value['cartasDevolvidas'])
      );
    case 'SILENCIO_ATIVADO':
    case 'UNO_GRITADO':
      return isString(value['por']);
    case 'SILENCIO_QUEBRADO':
      return isString(value['por']) && value['cartasCompradas'] === 2;
    case 'JOGADOR_PULADO':
      return (
        isString(value['jogadorId']) &&
        isOneOf(value['motivo'], ['SKIP', 'ATAQUE_NAO_COBERTO'] as const)
      );
    case 'SENTIDO_INVERTIDO':
      return value['novo'] === 1 || value['novo'] === -1;
    case 'MAO_GIRADA':
      return value['sentido'] === 1 || value['sentido'] === -1;
    case 'MAO_TROCADA':
      return isString(value['jogadorA']) && isString(value['jogadorB']);
    case 'VITORIA':
      return isString(value['vencedorId']);
    case 'PARTIDA_FINALIZADA':
      return isOneOf(value['motivo'], ['VITORIA', 'ABANDONO', 'TIMEOUT'] as const);
    case 'MONTE_ESGOTADO':
      return (
        snapshotVersion >= 3 &&
        isString(value['jogadorId']) &&
        isInteger(value['cartasSolicitadas']) &&
        value['cartasSolicitadas'] >= 1 &&
        isInteger(value['cartasObtidas']) &&
        value['cartasObtidas'] >= 0 &&
        value['cartasObtidas'] < value['cartasSolicitadas']
      );
  }
}

function isGameState(
  value: unknown,
  snapshotVersion: ReadableRoomSnapshotVersion,
): value is EstadoPartida {
  if (!isRecord(value)) return false;
  const jogadores = value['jogadores'];
  if (!Array.isArray(jogadores) || !jogadores.every(isPlayer)) return false;
  const playerIds = new Set(jogadores.map((jogador) => jogador.id));
  const silence = value['silencio'];
  return (
    isString(value['partidaId']) &&
    isString(value['salaId']) &&
    Array.isArray(value['monteCompra']) &&
    value['monteCompra'].every(isCard) &&
    Array.isArray(value['monteDescarte']) &&
    value['monteDescarte'].length > 0 &&
    value['monteDescarte'].every(isCard) &&
    isString(value['vezDe']) &&
    (value['sentido'] === 1 || value['sentido'] === -1) &&
    isOneOf(value['corAtiva'], ACTIVE_COLORS) &&
    isFiniteNumber(value['ataqueAcumulado']) &&
    value['ataqueAcumulado'] >= 0 &&
    Array.isArray(value['ataqueStack']) &&
    value['ataqueStack'].every((action) => isOneOf(action, ACTIONS)) &&
    isRecord(silence) &&
    isBoolean(silence['ativo']) &&
    (silence['jogadoresQuebraram'] === undefined
      ? hasOptionalString(silence, 'jogadorQuebrou')
      : Array.isArray(silence['jogadoresQuebraram']) &&
        silence['jogadoresQuebraram'].every(isString)) &&
    Array.isArray(value['historico']) &&
    value['historico'].every((event) => isGameEvent(event, snapshotVersion, playerIds)) &&
    isBoolean(value['finalizada']) &&
    hasOptionalString(value, 'vencedor')
  );
}

function validateSnapshot(value: unknown): RoomSnapshot {
  if (!isRecord(value)) {
    throw new RoomSnapshotError('Snapshot de salas inválido: raiz deve ser um objeto.');
  }
  const version = value['version'];
  if (version !== ROOM_SNAPSHOT_VERSION && version !== LEGACY_ROOM_SNAPSHOT_VERSION) {
    if (value['version'] === 1) {
      throw new RoomSnapshotError(
        'Snapshot v1 não pode ser migrado com segurança: credenciais de retomada ausentes.',
      );
    }
    throw new RoomSnapshotError(
      `Versão de snapshot desconhecida: ${String(value['version'])}. Esperada: ${ROOM_SNAPSHOT_VERSION}.`,
    );
  }
  if (!Array.isArray(value['rooms'])) {
    throw new RoomSnapshotError('Snapshot de salas inválido: rooms deve ser um array.');
  }

  const rooms: PersistedRoomSession[] = [];
  const roomIds = new Set<string>();
  for (const candidate of value['rooms']) {
    if (!isRecord(candidate) || !isRoom(candidate['sala'])) {
      throw new RoomSnapshotError('Snapshot de salas inválido: sala malformada.');
    }
    if (!isResumeTokenHashes(candidate['resumeTokenHashes'], candidate['sala'])) {
      throw new RoomSnapshotError('Snapshot de salas inválido: hashes de retomada malformados.');
    }
    const state = candidate['estado'];
    if (state !== undefined && !isGameState(state, version)) {
      throw new RoomSnapshotError(
        `Snapshot de salas inválido: partida da sala ${candidate['sala'].id} malformada.`,
      );
    }
    if (roomIds.has(candidate['sala'].id)) {
      throw new RoomSnapshotError(
        `Snapshot de salas inválido: sala duplicada ${candidate['sala'].id}.`,
      );
    }
    if (state && state.salaId !== candidate['sala'].id) {
      throw new RoomSnapshotError(
        `Snapshot de salas inválido: partida não pertence à sala ${candidate['sala'].id}.`,
      );
    }
    const normalizedState =
      state === undefined
        ? undefined
        : {
            ...state,
            silencio: {
              ativo: state.silencio.ativo,
              jogadoresQuebraram: Array.isArray(state.silencio.jogadoresQuebraram)
                ? state.silencio.jogadoresQuebraram
                : [],
            },
          };
    if (candidate['sala'].status === 'EM_PARTIDA' && normalizedState === undefined) {
      throw new RoomSnapshotError(
        `Snapshot de salas inválido: sala ${candidate['sala'].id} sem partida ativa.`,
      );
    }
    roomIds.add(candidate['sala'].id);
    rooms.push(
      normalizedState === undefined
        ? { sala: candidate['sala'], resumeTokenHashes: candidate['resumeTokenHashes'] }
        : {
            sala: candidate['sala'],
            estado: normalizedState,
            resumeTokenHashes: candidate['resumeTokenHashes'],
          },
    );
  }

  return { version: ROOM_SNAPSHOT_VERSION, rooms };
}

function bestEffortChmod(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch (error) {
    const code = isRecord(error) && isString(error['code']) ? error['code'] : undefined;
    if (!['ENOSYS', 'EPERM', 'EINVAL'].includes(code ?? '')) throw error;
  }
}

export class JsonRoomPersistence implements RoomPersistence {
  constructor(private readonly filePath: string) {
    if (!filePath.trim()) throw new RoomSnapshotError('ROOM_STORAGE_FILE não pode ser vazio.');
  }

  load(): PersistedRoomSession[] {
    if (!existsSync(this.filePath)) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown;
    } catch (error) {
      throw new RoomSnapshotError(`Não foi possível ler o snapshot de salas em ${this.filePath}.`, {
        cause: error,
      });
    }
    return validateSnapshot(parsed).rooms;
  }

  save(rooms: readonly PersistedRoomSession[]): void {
    const snapshot = validateSnapshot({ version: ROOM_SNAPSHOT_VERSION, rooms: [...rooms] });
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    bestEffortChmod(directory, 0o700);

    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporaryPath, 'wx', 0o600);
      writeFileSync(descriptor, `${JSON.stringify(snapshot)}\n`, 'utf8');
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      bestEffortChmod(temporaryPath, 0o600);
      renameSync(temporaryPath, this.filePath);
      bestEffortChmod(this.filePath, 0o600);
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      rmSync(temporaryPath, { force: true });
      throw new RoomSnapshotError(
        `Não foi possível persistir o snapshot de salas em ${this.filePath}.`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Escreve e remove um arquivo-sonda no mesmo diretório do snapshot, sem
   * tocar no snapshot real. Usado pelo `/ready` pra provar que o volume
   * montado continua gravável, não só que carregou no boot.
   */
  probeWritable(): boolean {
    const directory = dirname(this.filePath);
    const probePath = `${this.filePath}.${process.pid}.${randomUUID()}.probe`;
    const cleanup = (): void => {
      // `force: true` só suprime ENOENT (caminho ausente) — se um segmento
      // do caminho não é diretório (ENOTDIR), ainda lança. Isso é só
      // limpeza best-effort de uma sonda, nunca deve derrubar o probe.
      try {
        rmSync(probePath, { force: true });
      } catch {
        // ignorado de propósito
      }
    };
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const descriptor = openSync(probePath, 'wx', 0o600);
      writeFileSync(descriptor, 'probe', 'utf8');
      fsyncSync(descriptor);
      closeSync(descriptor);
      cleanup();
      return true;
    } catch {
      cleanup();
      return false;
    }
  }
}
