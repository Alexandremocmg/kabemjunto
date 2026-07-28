import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Constants, type JogadorId } from '@kabemjunto/shared';
import {
  JsonRoomPersistence,
  type PersistedRoomSession,
  type RoomPersistence,
} from './persistence.js';
import { buildServer } from './server.js';
import { RoomError, RoomStore, toPublicState } from './room-store.js';

const persistenceDirectories: string[] = [];

function persistenceFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kabemjunto-room-store-'));
  persistenceDirectories.push(directory);
  return join(directory, 'rooms.json');
}

afterEach(() => {
  for (const directory of persistenceDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function uuid(n: number): JogadorId {
  return `jogador-${n.toString().padStart(4, '0')}-aaaa-bbbb-cccc-ddddeeeeffff`;
}

function createStartedStore(): RoomStore {
  const store = new RoomStore();
  store.join({ jogadorId: uuid(1), salaId: 'KJTEST', nome: 'Ana', socketId: 'socket-a' });
  store.join({ jogadorId: uuid(2), salaId: 'KJTEST', nome: 'Bia', socketId: 'socket-b' });
  store.start('KJTEST', 'socket-a');
  return store;
}

describe('RoomStore — básico', () => {
  it('cria uma sala e só inicia com pelo menos dois jogadores', () => {
    const store = new RoomStore();
    const joined = store.join({
      jogadorId: uuid(1),
      salaId: 'kj01',
      nome: '<Ana>',
      socketId: 'socket-a',
    });

    expect(joined.session.sala.id).toBe('KJ01');
    expect(joined.session.sala.jogadores[0]?.nome).toBe('Ana');
    expect(joined.reconectado).toBe(false);
    expect(() => store.start('KJ01', 'socket-a')).toThrow('pelo menos 2 jogadores');
  });

  it('rejeita entrada em sala inexistente quando não é criação', () => {
    const store = new RoomStore();
    expect(() =>
      store.join({
        jogadorId: uuid(1),
        salaId: 'NAOEXI',
        nome: 'Ana',
        socketId: 'socket-a',
        criar: false,
      }),
    ).toThrow('Sala não encontrada');
  });

  it('inicia uma partida e nunca expõe mãos na projeção pública', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST');

    expect(session?.estado).toBeDefined();
    const publicState = toPublicState(session!.estado!);
    expect(publicState.jogadores.every((jogador) => !('mao' in jogador))).toBe(true);
    expect(publicState.jogadores.every((jogador) => jogador.quantidadeCartas === 7)).toBe(true);
  });

  it('valida a carta no servidor antes de avançar o turno', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const carta = Constants.BARALHO_COMPLETO_108.find(
      (item) => item.tipo === 'NUMERADA' && item.cor === 'LARANJA' && item.valor === 7,
    )!;
    const topo = Constants.BARALHO_COMPLETO_108.find(
      (item) => item.tipo === 'NUMERADA' && item.cor === 'LARANJA' && item.valor === 8,
    )!;
    const before = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === estado.vezDe ? { ...jogador, mao: [carta] } : jogador,
      ),
      monteDescarte: [topo],
      corAtiva: 'LARANJA' as const,
      ataqueAcumulado: 0,
      ataqueStack: [],
    };
    session.estado = before;
    const jogador = before.jogadores.find((item) => item.id === before.vezDe)!;

    const after = store.play('KJTEST', jogador.id, carta.id).estado!;
    expect(after.monteDescarte.at(-1)?.id).toBe(carta.id);
    expect(after.jogadores.find((item) => item.id === jogador.id)?.mao).toHaveLength(
      jogador.mao.length - 1,
    );
  });

  it('encaminha o alvo de TROCA_MAO para o motor autoritativo', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const jogadorAtual = estado.jogadores.find((item) => item.id === estado.vezDe)!;
    const alvo = estado.jogadores.find((item) => item.id !== estado.vezDe)!;
    const cartaTroca = Constants.BARALHO_COMPLETO_108.find((carta) => carta.acao === 'TROCA_MAO')!;

    session.estado = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === jogadorAtual.id
          ? { ...jogador, mao: [cartaTroca, jogador.mao[0]!] }
          : jogador.id === alvo.id
            ? { ...jogador, mao: [jogador.mao[0]!, jogador.mao[1]!, jogador.mao[2]!] }
            : jogador,
      ),
      monteDescarte: [estado.monteDescarte.at(-1)!],
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };

    const after = store.play('KJTEST', jogadorAtual.id, cartaTroca.id, undefined, alvo.id).estado!;
    expect(after.jogadores.find((jogador) => jogador.id === jogadorAtual.id)?.mao).toHaveLength(3);
    expect(after.jogadores.find((jogador) => jogador.id === alvo.id)?.mao).toHaveLength(1);
    expect(after.historico.some((evento) => evento.tipo === 'MAO_TROCADA')).toBe(true);
  });
  it('calcula a compra no servidor e passa o turno', () => {
    const store = createStartedStore();
    const before = store.get('KJTEST')!.estado!;
    const currentPlayer = before.vezDe;

    const after = store.buy('KJTEST', currentPlayer).estado!;
    const boughtCount = after.jogadores.find((item) => item.id === currentPlayer)?.mao.length ?? 0;
    expect(boughtCount).toBeGreaterThanOrEqual(8);
    expect(after.vezDe).not.toBe(currentPlayer);
  });
});

describe('RoomStore — M14 (identidade estável + reconexão)', () => {
  it('rejeita jogadorId ausente', () => {
    const store = new RoomStore();
    expect(() => store.join({ jogadorId: '', salaId: 'X1', nome: 'Test', socketId: 's' })).toThrow(
      RoomError,
    );
  });

  it('rejeita jogadorId que já está em OUTRA sala', () => {
    const store = new RoomStore();
    store.join({ jogadorId: uuid(1), salaId: 'A1', nome: 'Ana', socketId: 's1' });
    store.join({ jogadorId: uuid(2), salaId: 'A1', nome: 'Bia', socketId: 's2' });
    try {
      store.join({ jogadorId: uuid(1), salaId: 'B1', nome: 'Ana', socketId: 's3' });
      expect.fail('Deveria ter lançado RoomError');
    } catch (error) {
      expect(error).toBeInstanceOf(RoomError);
      expect((error as RoomError).code).toBe('JOGADOR_EM_OUTRA_SALA');
    }
  });

  it('restaura jogador existente com novo socket (reconexão)', () => {
    const store = new RoomStore();
    const id = uuid(1);
    const first = store.join({ jogadorId: id, salaId: 'R1', nome: 'Ana', socketId: 'socket-old' });
    expect(first.reconectado).toBe(false);

    // Simula reconexão: novo socket, mesmo jogadorId
    const second = store.join({ jogadorId: id, salaId: 'R1', nome: 'Ana', socketId: 'socket-new' });
    expect(second.reconectado).toBe(true);
    expect(second.session.sala.jogadores).toHaveLength(1);
    expect(second.session.socketByPlayer.get(id)).toBe('socket-new');
  });

  it('disconnect não remove o jogador, só marca como desconectado', () => {
    const store = new RoomStore();
    const id = uuid(1);
    store.join({ jogadorId: id, salaId: 'D1', nome: 'Ana', socketId: 'socket-a' });
    expect(store.get('D1')?.sala.jogadores[0]?.conectado).toBe(true);

    const after = store.disconnect('socket-a');
    expect(after?.sala.jogadores).toHaveLength(1);
    expect(after?.sala.jogadores[0]?.conectado).toBe(false);
    // socketByPlayer mantém o mapeamento (o jogador pode reconectar)
    expect(after?.socketByPlayer.get(id)).toBe('socket-a');
  });

  it('reconexão depois de disconnect restaura conectado=true', () => {
    const store = new RoomStore();
    const id = uuid(1);
    store.join({ jogadorId: id, salaId: 'RC1', nome: 'Ana', socketId: 'socket-1' });
    store.disconnect('socket-1');
    expect(store.get('RC1')?.sala.jogadores[0]?.conectado).toBe(false);

    // Reconexão
    const result = store.join({ jogadorId: id, salaId: 'RC1', nome: 'Ana', socketId: 'socket-2' });
    expect(result.reconectado).toBe(true);
    expect(result.session.sala.jogadores).toHaveLength(1);
    expect(result.session.sala.jogadores[0]?.conectado).toBe(true);
    expect(result.session.socketByPlayer.get(id)).toBe('socket-2');
  });

  it('reconecta o mesmo jogador depois que a partida começou', () => {
    const store = createStartedStore();
    const id = uuid(2);

    store.disconnect('socket-b');
    const result = store.join({
      jogadorId: id,
      salaId: 'KJTEST',
      nome: 'Bia',
      socketId: 'socket-b-new',
    });

    expect(result.reconectado).toBe(true);
    expect(result.session.sala.status).toBe('EM_PARTIDA');
    expect(result.session.estado).toBeDefined();
    expect(result.session.sala.jogadores.find((jogador) => jogador.id === id)?.conectado).toBe(
      true,
    );
    expect(result.session.socketByPlayer.get(id)).toBe('socket-b-new');
  });

  it('reconexão preserva nome/avatar do servidor (anti-impersonation)', () => {
    const store = new RoomStore();
    const id = uuid(1);
    store.join({ jogadorId: id, salaId: 'AI1', nome: 'Ana', socketId: 'socket-1' });
    // Atacante tenta entrar com nome diferente
    const result = store.join({
      jogadorId: id,
      salaId: 'AI1',
      nome: 'Hacker',
      socketId: 'socket-2',
    });
    expect(result.reconectado).toBe(true);
    // Nome continua sendo o do servidor
    expect(result.session.sala.jogadores[0]?.nome).toBe('Ana');
  });

  it('findBySocketId acha a sala correta', () => {
    const store = new RoomStore();
    store.join({ jogadorId: uuid(1), salaId: 'F1', nome: 'A', socketId: 'sock-a' });
    store.join({ jogadorId: uuid(2), salaId: 'F1', nome: 'B', socketId: 'sock-b' });
    store.join({ jogadorId: uuid(3), salaId: 'F2', nome: 'C', socketId: 'sock-c' });

    const found = store.findBySocketId('sock-b');
    expect(found?.salaId).toBe('F1');
    expect(found?.session.sala.jogadores).toHaveLength(2);
  });
});

describe('RoomStore — B23 (persistência durável)', () => {
  it('restaura sala aguardando sem sockets e com jogadores desconectados', () => {
    const persistence = new JsonRoomPersistence(persistenceFile());
    const beforeRestart = new RoomStore(persistence);
    beforeRestart.join({
      jogadorId: uuid(1),
      salaId: 'SAVE01',
      nome: 'Ana',
      socketId: 'socket-before-restart',
    });

    const afterRestart = new RoomStore(persistence);
    const restored = afterRestart.get('SAVE01')!;

    expect(restored.sala.jogadores[0]?.conectado).toBe(false);
    expect(restored.socketByPlayer.size).toBe(0);
    expect(afterRestart.findBySocketId('socket-before-restart')).toBeUndefined();
    expect(afterRestart.exportState()).toEqual([{ sala: restored.sala }]);
    expect(JSON.stringify(afterRestart.exportState())).not.toContain('socket-before-restart');
  });

  it('preserva partida ativa integralmente e permite retomar pela identidade estável', () => {
    const persistence = new JsonRoomPersistence(persistenceFile());
    const beforeRestart = new RoomStore(persistence);
    beforeRestart.join({ jogadorId: uuid(1), salaId: 'GAME01', nome: 'Ana', socketId: 'old-a' });
    beforeRestart.join({ jogadorId: uuid(2), salaId: 'GAME01', nome: 'Bia', socketId: 'old-b' });
    const started = beforeRestart.start('GAME01', 'old-a');

    const afterRestart = new RoomStore(persistence);
    const restored = afterRestart.get('GAME01')!;

    expect(restored.estado).toEqual({
      ...started.estado,
      jogadores: started.estado!.jogadores.map((player) => ({ ...player, conectado: false })),
    });
    expect(restored.sala.jogadores.every((player) => player.conectado === false)).toBe(true);
    expect(restored.socketByPlayer.size).toBe(0);

    const reconnected = afterRestart.join({
      jogadorId: uuid(1),
      salaId: 'GAME01',
      nome: 'Nome ignorado',
      socketId: 'new-a',
      criar: false,
    });
    expect(reconnected.reconectado).toBe(true);
    expect(reconnected.session.socketByPlayer.get(uuid(1))).toBe('new-a');
    expect(
      reconnected.session.estado?.jogadores.find((player) => player.id === uuid(1))?.conectado,
    ).toBe(true);
  });

  it('persiste antes de publicar a mutação na memória', () => {
    class FailingPersistence implements RoomPersistence {
      load(): PersistedRoomSession[] {
        return [];
      }

      save(): void {
        throw new Error('volume indisponível');
      }
    }

    const store = new RoomStore(new FailingPersistence());

    expect(() =>
      store.join({ jogadorId: uuid(1), salaId: 'FAIL01', nome: 'Ana', socketId: 'socket-a' }),
    ).toThrow('volume indisponível');
    expect(store.get('FAIL01')).toBeUndefined();
  });

  it('exporta e restaura apenas estado autoritativo, nunca identidade de socket', () => {
    const original = new RoomStore();
    original.join({ jogadorId: uuid(1), salaId: 'IDENT1', nome: 'Ana', socketId: 'secret-socket' });
    const exported = original.exportState();

    const restored = new RoomStore();
    restored.restoreState(exported);

    expect(restored.get('IDENT1')?.sala.hostId).toBe(uuid(1));
    expect(restored.get('IDENT1')?.socketByPlayer.size).toBe(0);
    expect(JSON.stringify(exported)).not.toContain('secret-socket');
  });

  it('hidrata o bootstrap por ROOM_STORAGE_FILE quando configurado', async () => {
    const file = persistenceFile();
    const persistence = new JsonRoomPersistence(file);
    const persistedStore = new RoomStore(persistence);
    persistedStore.join({
      jogadorId: uuid(1),
      salaId: 'BOOT01',
      nome: 'Ana',
      socketId: 'bootstrap-old-socket',
    });
    const previous = process.env['ROOM_STORAGE_FILE'];
    process.env['ROOM_STORAGE_FILE'] = file;

    try {
      const { app, store } = await buildServer();
      expect(store.get('BOOT01')?.sala.jogadores[0]?.conectado).toBe(false);
      expect(store.get('BOOT01')?.socketByPlayer.size).toBe(0);
      await app.close();
    } finally {
      if (previous === undefined) delete process.env['ROOM_STORAGE_FILE'];
      else process.env['ROOM_STORAGE_FILE'] = previous;
    }
  });
});
