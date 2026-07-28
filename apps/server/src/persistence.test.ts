import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Constants, criarPartidaInicial, type Sala } from '@kabemjunto/shared';
import {
  JsonRoomPersistence,
  RoomSnapshotError,
  type PersistedRoomSession,
} from './persistence.js';

const directories: string[] = [];

function temporaryFile(): { directory: string; file: string } {
  const directory = mkdtempSync(join(tmpdir(), 'kabemjunto-persistence-'));
  directories.push(directory);
  return { directory, file: join(directory, 'nested', 'rooms.json') };
}

function waitingRoom(): PersistedRoomSession {
  const sala: Sala = {
    id: 'ABC123',
    codigo: 'ABC123',
    nome: 'Sala ABC123',
    hostId: 'player-1',
    jogadores: [
      {
        id: 'player-1',
        nome: 'Ana',
        quantidadeCartas: 0,
        isBot: false,
        conectado: true,
        disseUno: false,
        avatar: '⭐',
        pontos: 0,
      },
    ],
    maxJogadores: 10,
    modo: 'ONLINE_PRIVADA',
    status: 'AGUARDANDO',
  };
  return { sala };
}

function activeRoom(roomId = 'ABC123'): PersistedRoomSession {
  const estado = criarPartidaInicial({
    baralho: Constants.BARALHO_COMPLETO_108,
    modo: 'ONLINE_PRIVADA',
    totalJogadores: 2,
    salaId: roomId,
    partidaId: `game-${roomId}`,
    rng: () => 0.5,
  });
  const sala: Sala = {
    ...waitingRoom().sala,
    id: roomId,
    codigo: roomId,
    hostId: estado.jogadores[0]!.id,
    jogadores: estado.jogadores.map((jogador) => ({
      ...jogador,
      quantidadeCartas: jogador.mao.length,
    })),
    status: 'EM_PARTIDA',
    partidaId: estado.partidaId,
  };
  return { sala, estado };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('JsonRoomPersistence', () => {
  it('rejeita caminho de armazenamento vazio', () => {
    expect(() => new JsonRoomPersistence('   ')).toThrow(RoomSnapshotError);
  });

  it('trata arquivo ausente como primeiro boot vazio', () => {
    const { file } = temporaryFile();

    expect(new JsonRoomPersistence(file).load()).toEqual([]);
  });

  it('grava snapshot versionado por substituição atômica e faz round-trip', () => {
    const { directory, file } = temporaryFile();
    const persistence = new JsonRoomPersistence(file);
    const rooms = [waitingRoom()];

    persistence.save(rooms);

    expect(persistence.load()).toEqual(rooms);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 1, rooms });
    expect(readdirSync(join(directory, 'nested'))).toEqual(['rooms.json']);
  });

  it.each([
    ['JSON corrompido', '{nao-json'],
    ['raiz que não é objeto', JSON.stringify([])],
    ['versão desconhecida', JSON.stringify({ version: 999, rooms: [] })],
    ['rooms que não é array', JSON.stringify({ version: 1, rooms: {} })],
    ['estrutura inválida', JSON.stringify({ version: 1, rooms: [{ sala: null }] })],
  ])('falha explicitamente para %s sem sobrescrever o arquivo', (_case, contents) => {
    const { file } = temporaryFile();
    const persistence = new JsonRoomPersistence(file);
    persistence.save([]);
    writeFileSync(file, contents, 'utf8');

    expect(() => persistence.load()).toThrow(RoomSnapshotError);
    expect(readFileSync(file, 'utf8')).toBe(contents);
  });

  it('rejeita IDs de sala duplicados', () => {
    const { file } = temporaryFile();
    const room = waitingRoom();

    expect(() => new JsonRoomPersistence(file).save([room, room])).toThrow(/sala duplicada/);
  });

  it('rejeita partida vinculada a outra sala', () => {
    const { file } = temporaryFile();
    const room = activeRoom();
    const mismatched = { ...room, estado: { ...room.estado!, salaId: 'OUTRA' } };

    expect(() => new JsonRoomPersistence(file).save([mismatched])).toThrow(
      /partida não pertence à sala/,
    );
  });

  it('rejeita sala em partida sem estado autoritativo', () => {
    const { file } = temporaryFile();
    const room = activeRoom();

    expect(() => new JsonRoomPersistence(file).save([{ sala: room.sala }])).toThrow(
      /sem partida ativa/,
    );
  });

  it('encapsula falha de substituição e remove o arquivo temporário', () => {
    const { directory, file } = temporaryFile();
    mkdirSync(file, { recursive: true });

    expect(() => new JsonRoomPersistence(file).save([])).toThrow(RoomSnapshotError);
    expect(readdirSync(join(directory, 'nested'))).toEqual(['rooms.json']);
  });
});
