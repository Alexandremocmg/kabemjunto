import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import type { ServerErroEvent, ServerSessaoEmitidaEvent } from '@kabemjunto/shared';
import { RoomStore } from './room-store.js';
import { registerSocketHandlers } from './socket.js';

const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function once<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function harness(): Promise<{ url: string; store: RoomStore }> {
  const http = createServer();
  const io = new Server(http);
  const store = new RoomStore();
  registerSocketHandlers(io, store);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta.');
  cleanup.push(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
  return { url: `http://127.0.0.1:${address.port}`, store };
}

async function connect(url: string): Promise<ClientSocket> {
  const socket = createClient(url, { transports: ['websocket'], forceNew: true });
  cleanup.push(() => {
    socket.close();
  });
  await once(socket, 'connect');
  return socket;
}

describe('socket — B28', () => {
  it('emite token só ao autenticado e revoga o socket anterior', async () => {
    const { url, store } = await harness();
    const oldSocket = await connect(url);
    const firstToken = once<ServerSessaoEmitidaEvent>(oldSocket, 'server:sessao:emitida');
    oldSocket.emit('client:entrar:sala', {
      jogadorId: 'player-1',
      salaId: 'ROOM1',
      nome: 'Ana',
    });
    const first = await firstToken;

    const newSocket = await connect(url);
    const revoked = once(oldSocket, 'disconnect');
    const rotatedToken = once<ServerSessaoEmitidaEvent>(newSocket, 'server:sessao:emitida');
    newSocket.emit('client:entrar:sala', {
      jogadorId: 'player-1',
      salaId: 'ROOM1',
      nome: 'Ana',
      resumeToken: first.resumeToken,
    });

    const rotated = await rotatedToken;
    await revoked;
    expect(rotated.resumeToken).not.toBe(first.resumeToken);
    expect(oldSocket.connected).toBe(false);
    expect(store.get('ROOM1')?.socketByPlayer.get('player-1')).toBe(newSocket.id);
    expect(store.get('ROOM1')?.sala.jogadores[0]?.conectado).toBe(true);
  });

  it('retorna erro genérico para token ausente ou inválido', async () => {
    const { url } = await harness();
    const original = await connect(url);
    const issued = once<ServerSessaoEmitidaEvent>(original, 'server:sessao:emitida');
    original.emit('client:entrar:sala', { jogadorId: 'player-1', salaId: 'ROOM1', nome: 'Ana' });
    await issued;

    for (const resumeToken of [undefined, 'inválido']) {
      const attacker = await connect(url);
      const errorEvent = once<ServerErroEvent>(attacker, 'server:erro');
      attacker.emit('client:entrar:sala', {
        jogadorId: 'player-1',
        salaId: 'ROOM1',
        nome: 'Ataque',
        ...(resumeToken === undefined ? {} : { resumeToken }),
      });
      expect(await errorEvent).toEqual({
        codigo: 'AUTH_REQUIRED',
        mensagem: 'Credenciais de retomada inválidas.',
      });
    }
  });
});
