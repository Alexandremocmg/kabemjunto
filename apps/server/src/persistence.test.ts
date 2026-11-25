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
    visibilidade: 'PRIVADA',
    status: 'AGUARDANDO',
  };
  return {
    sala,
    resumeTokenHashes: {
      'player-1': 'a'.repeat(64),
    },
  };
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
  return {
    sala,
    estado,
    resumeTokenHashes: Object.fromEntries(
      sala.jogadores.map((jogador, index) => [jogador.id, String(index + 1).repeat(64)]),
    ),
  };
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

  it('grava snapshot v3 por substituição atômica e faz round-trip com MONTE_ESGOTADO', () => {
    const { directory, file } = temporaryFile();
    const persistence = new JsonRoomPersistence(file);
    const room = activeRoom();
    const rooms: PersistedRoomSession[] = [
      {
        ...room,
        estado: {
          ...room.estado!,
          historico: [
            ...room.estado!.historico,
            {
              tipo: 'MONTE_ESGOTADO',
              timestamp: 123,
              jogadorId: room.estado!.jogadores[0]!.id,
              cartasSolicitadas: 4,
              cartasObtidas: 1,
            },
          ],
        },
      },
    ];

    persistence.save(rooms);

    expect(persistence.load()).toEqual(rooms);
    const snapshotText = readFileSync(file, 'utf8');
    expect(JSON.parse(snapshotText)).toMatchObject({ version: 3, rooms });
    expect(snapshotText).not.toContain('token-bruto-proibido');
    expect(readdirSync(join(directory, 'nested'))).toEqual(['rooms.json']);
  });

  it('lê snapshot v2 antigo sem reescrevê-lo e migra para v3 no próximo save', () => {
    const { directory, file } = temporaryFile();
    const room = activeRoom();
    const legacyText = JSON.stringify({ version: 2, rooms: [room] });
    mkdirSync(join(directory, 'nested'), { recursive: true });
    writeFileSync(file, legacyText, 'utf8');
    const persistence = new JsonRoomPersistence(file);

    const restored = persistence.load();

    expect(restored).toEqual([room]);
    expect(readFileSync(file, 'utf8')).toBe(legacyText);

    persistence.save(restored);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 3, rooms: [room] });
  });

  it('não aceita MONTE_ESGOTADO rotulado como v2', () => {
    const { directory, file } = temporaryFile();
    const room = activeRoom();
    const incompatibleV2 = {
      version: 2,
      rooms: [
        {
          ...room,
          estado: {
            ...room.estado,
            historico: [
              ...room.estado!.historico,
              {
                tipo: 'MONTE_ESGOTADO',
                timestamp: 123,
                jogadorId: room.estado!.jogadores[0]!.id,
                cartasSolicitadas: 1,
                cartasObtidas: 0,
              },
            ],
          },
        },
      ],
    };
    mkdirSync(join(directory, 'nested'), { recursive: true });
    writeFileSync(file, JSON.stringify(incompatibleV2), 'utf8');

    expect(() => new JsonRoomPersistence(file).load()).toThrow(/partida .* malformada/);
  });

  it('migra snapshot legado com jogadorQuebrou para a coleção vazia', () => {
    const { directory, file } = temporaryFile();
    const room = activeRoom();
    const legacy = {
      version: 2,
      rooms: [
        {
          ...room,
          estado: {
            ...room.estado,
            silencio: { ativo: true, jogadorQuebrou: room.estado!.jogadores[0]!.id },
          },
        },
      ],
    };
    mkdirSync(join(directory, 'nested'), { recursive: true });
    writeFileSync(file, JSON.stringify(legacy), 'utf8');

    const restored = new JsonRoomPersistence(file).load();

    expect(restored[0]?.estado?.silencio).toEqual({ ativo: true, jogadoresQuebraram: [] });
  });

  it.each([
    ['JSON corrompido', '{nao-json'],
    ['raiz que não é objeto', JSON.stringify([])],
    ['versão desconhecida', JSON.stringify({ version: 999, rooms: [] })],
    ['snapshot v1 sem credenciais migráveis', JSON.stringify({ version: 1, rooms: [] })],
    ['rooms que não é array', JSON.stringify({ version: 3, rooms: {} })],
    ['estrutura inválida', JSON.stringify({ version: 3, rooms: [{ sala: null }] })],
  ])('falha explicitamente para %s sem sobrescrever o arquivo', (_case, contents) => {
    const { file } = temporaryFile();
    const persistence = new JsonRoomPersistence(file);
    persistence.save([]);
    writeFileSync(file, contents, 'utf8');

    expect(() => persistence.load()).toThrow(RoomSnapshotError);
    expect(readFileSync(file, 'utf8')).toBe(contents);
  });

  it('mantém a sala "Jogar agora" (tamanho da mesa e hora de começar) depois de reiniciar', () => {
    const { file } = temporaryFile();
    const room = waitingRoom();
    const rapida = {
      sala: {
        ...room.sala,
        modo: 'ONLINE_PUBLICA' as const,
        visibilidade: 'PUBLICA' as const,
        maxJogadores: 4 as const,
        rapida: { tamanhoAlvo: 4, iniciaEm: 1_800_000_000_000 },
      },
      resumeTokenHashes: room.resumeTokenHashes,
    };
    new JsonRoomPersistence(file).save([rapida]);
    const [lida] = new JsonRoomPersistence(file).load();
    expect(lida!.sala.rapida).toEqual({ tamanhoAlvo: 4, iniciaEm: 1_800_000_000_000 });
  });

  it('mantém os bots de uma partida "Jogar agora" depois de reiniciar', () => {
    const { file } = temporaryFile();
    const estado = criarPartidaInicial({
      baralho: Constants.BARALHO_COMPLETO_108,
      modo: 'ONLINE_PUBLICA',
      totalJogadores: 3,
      idsCustomizados: ['player-1', 'bot_ABC123_1', 'bot_ABC123_2'],
      salaId: 'ABC123',
      partidaId: 'game_1_ABC123',
      bots: [false, true, true],
    });
    const room = waitingRoom();
    const sala: Sala = {
      ...room.sala,
      modo: 'ONLINE_PUBLICA',
      visibilidade: 'PUBLICA',
      status: 'EM_PARTIDA',
      partidaId: 'game_1_ABC123',
      jogadores: estado.jogadores.map((j) => ({
        id: j.id,
        nome: j.nome,
        quantidadeCartas: j.mao.length,
        isBot: j.isBot,
        conectado: true,
        disseUno: false,
        avatar: j.avatar,
        pontos: 0,
      })),
      rapida: { tamanhoAlvo: 3, iniciaEm: 1 },
    };
    new JsonRoomPersistence(file).save([
      { sala, estado, resumeTokenHashes: room.resumeTokenHashes },
    ]);
    const [lida] = new JsonRoomPersistence(file).load();
    expect(lida!.estado!.jogadores.map((j) => j.isBot)).toEqual([false, true, true]);
  });

  it('rejeita "Jogar agora" com tamanho de mesa inválido', () => {
    const { file } = temporaryFile();
    const room = waitingRoom();
    const ruim = {
      sala: { ...room.sala, rapida: { tamanhoAlvo: 1, iniciaEm: 5 } },
      resumeTokenHashes: room.resumeTokenHashes,
    };
    expect(() => new JsonRoomPersistence(file).save([ruim])).toThrow(/malformada/);
  });

  it('guarda quem saiu da partida e rejeita marcador de bot malformado', () => {
    const { file } = temporaryFile();
    const room = activeRoom();
    const marcar = (marcas: object): PersistedRoomSession => ({
      ...room,
      estado: {
        ...room.estado!,
        jogadores: room.estado!.jogadores.map((j, i) => (i === 0 ? { ...j, ...marcas } : j)),
      },
    });
    const persistence = new JsonRoomPersistence(file);
    persistence.save([marcar({ isBot: true, controladoPorBot: true, motivoBot: 'SAIU' })]);
    expect(persistence.load()[0]!.estado!.jogadores[0]).toMatchObject({
      isBot: true,
      motivoBot: 'SAIU',
    });
    expect(() => persistence.save([marcar({ controladoPorBot: 'sim' })])).toThrow(/malformada/);
    expect(() => persistence.save([marcar({ motivoBot: 'OUTRO' })])).toThrow(/malformada/);
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

    expect(() =>
      new JsonRoomPersistence(file).save([
        { sala: room.sala, resumeTokenHashes: room.resumeTokenHashes },
      ]),
    ).toThrow(/sem partida ativa/);
  });

  it('rejeita hash de retomada malformado e não aceita token bruto no snapshot', () => {
    const { file } = temporaryFile();
    const room = waitingRoom();

    expect(() =>
      new JsonRoomPersistence(file).save([
        { ...room, resumeTokenHashes: { 'player-1': 'token-bruto-proibido' } },
      ]),
    ).toThrow(RoomSnapshotError);
  });

  it.each([
    ['cartasSolicitadas menor que 1', 0, 0],
    ['cartasObtidas igual a cartasSolicitadas', 1, 1],
    ['cartasObtidas maior que cartasSolicitadas', 2, 3],
  ])('rejeita MONTE_ESGOTADO com %s', (_case, cartasSolicitadas, cartasObtidas) => {
    const { directory, file } = temporaryFile();
    const room = activeRoom();
    const invalidSnapshot = {
      version: 3,
      rooms: [
        {
          ...room,
          estado: {
            ...room.estado,
            historico: [
              ...room.estado!.historico,
              {
                tipo: 'MONTE_ESGOTADO',
                timestamp: 123,
                jogadorId: room.estado!.jogadores[0]!.id,
                cartasSolicitadas,
                cartasObtidas,
              },
            ],
          },
        },
      ],
    };
    mkdirSync(join(directory, 'nested'), { recursive: true });
    writeFileSync(file, JSON.stringify(invalidSnapshot), 'utf8');

    expect(() => new JsonRoomPersistence(file).load()).toThrow(/partida .* malformada/);
  });

  it('rejeita origem inválida em ATAQUE_ACUMULADO', () => {
    const { directory, file } = temporaryFile();
    const room = activeRoom();
    const invalidSnapshot = {
      version: 3,
      rooms: [
        {
          ...room,
          estado: {
            ...room.estado,
            historico: [
              ...room.estado!.historico,
              {
                tipo: 'ATAQUE_ACUMULADO',
                timestamp: 123,
                novo: 2,
                stack: ['MAIS_DOIS'],
                origem: 'jogador-inexistente',
              },
            ],
          },
        },
      ],
    };
    mkdirSync(join(directory, 'nested'), { recursive: true });
    writeFileSync(file, JSON.stringify(invalidSnapshot), 'utf8');

    expect(() => new JsonRoomPersistence(file).load()).toThrow(/partida .* malformada/);
  });

  it('encapsula falha de substituição e remove o arquivo temporário', () => {
    const { directory, file } = temporaryFile();
    mkdirSync(file, { recursive: true });

    expect(() => new JsonRoomPersistence(file).save([])).toThrow(RoomSnapshotError);
    expect(readdirSync(join(directory, 'nested'))).toEqual(['rooms.json']);
  });

  describe('probeWritable', () => {
    it('retorna true e não deixa arquivo residual quando o volume é gravável', () => {
      const { directory, file } = temporaryFile();
      const persistence = new JsonRoomPersistence(file);

      expect(persistence.probeWritable()).toBe(true);
      expect(readdirSync(join(directory, 'nested'))).toEqual([]);
    });

    it('não toca no snapshot real ao sondar gravabilidade', () => {
      const { file } = temporaryFile();
      const persistence = new JsonRoomPersistence(file);
      persistence.save([waitingRoom()]);
      const before = readFileSync(file, 'utf8');

      persistence.probeWritable();

      expect(readFileSync(file, 'utf8')).toBe(before);
    });

    it('retorna false sem lançar quando o caminho é inalcançável', () => {
      const { directory } = temporaryFile();
      const blockerFile = join(directory, 'blocker');
      writeFileSync(blockerFile, 'isto é um arquivo, não um diretório', 'utf8');
      const blockedPath = join(blockerFile, 'nested', 'rooms.json');
      const persistence = new JsonRoomPersistence(blockedPath);

      expect(persistence.probeWritable()).toBe(false);
    });
  });

  it('placar é opcional, faz round-trip e é validado', () => {
    const { file } = temporaryFile();
    const persistence = new JsonRoomPersistence(file);
    const base = activeRoom();
    const [a, b] = base.sala.jogadores.map((jogador) => jogador.id) as [string, string];
    const placar = {
      partidas: 2,
      vitorias: [
        { jogadorId: a, vitorias: 1 },
        { jogadorId: b, vitorias: 1 },
      ],
      ultimaPartidaId: 'game-anterior',
    };
    persistence.save([base]);
    expect(persistence.load()[0]).not.toHaveProperty('placar');
    persistence.save([{ ...base, placar }]);
    expect(persistence.load()[0]!.placar).toEqual(placar);
    const ruins: unknown[] = [
      null,
      { ...placar, partidas: 1 },
      { ...placar, partidas: 1.5 },
      { ...placar, ultimaPartidaId: undefined },
      { ...placar, vitorias: [{ jogadorId: 'fora', vitorias: 0 }] },
      { ...placar, vitorias: [{ jogadorId: a, vitorias: -1 }] },
      {
        ...placar,
        vitorias: [
          { jogadorId: a, vitorias: 1 },
          { jogadorId: a, vitorias: 1 },
        ],
      },
    ];
    for (const ruim of ruins) {
      expect(() => persistence.save([{ ...base, placar: ruim as typeof placar }])).toThrow(
        RoomSnapshotError,
      );
    }
  });
});
