import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import type { ServerErroEvent, ServerSessaoEmitidaEvent } from '@kabemjunto/shared';
import { RoomStore } from './room-store.js';
import { registerSocketHandlers } from './socket.js';

const cleanup: Array<() => Promise<void> | void> = [];
const naoTratadas: unknown[] = [];
const anotar = (erro: unknown) => naoTratadas.push(erro);

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  process.off('uncaughtException', anotar);
  naoTratadas.length = 0;
});

function once<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}
async function esperar(condicao: () => boolean, ms = 4000): Promise<void> {
  const limite = Date.now() + ms;
  while (!condicao()) {
    if (Date.now() > limite) throw new Error('Tempo esgotado esperando a condição.');
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function servidor() {
  const http = createServer();
  const io = new Server(http);
  const store = new RoomStore();
  registerSocketHandlers(io, store);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => io.close(() => resolve())));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta.');
  const conectar = async () => {
    const socket = createClient(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    cleanup.push(() => {
      socket.close();
    });
    await once(socket, 'connect');
    return socket;
  };
  const entrar = async (socket: ClientSocket, jogadorId: string, salaId: string) => {
    const sessao = once<ServerSessaoEmitidaEvent>(socket, 'server:sessao:emitida');
    socket.emit('client:entrar:sala', { jogadorId, salaId, nome: jogadorId });
    return sessao;
  };
  return { store, conectar, entrar };
}

describe('2. exceções em eventos não derrubam o processo', () => {
  it('payload ausente ou que não é objeto é recusado com erro', async () => {
    process.on('uncaughtException', anotar);
    const t = await servidor();
    const socket = await t.conectar();
    const eventos = [
      'client:entrar:sala',
      'client:jogar:rapido',
      'client:jogar',
      'client:interceptar',
      'client:chat:msg',
    ];
    for (const evento of eventos) {
      for (const payload of [null, undefined, 7]) {
        const erro = once<ServerErroEvent>(socket, 'server:erro');
        socket.emit(evento, payload);
        expect((await erro).mensagem).toMatch(/inválido/i);
      }
    }
    expect(naoTratadas).toEqual([]);
  });

  it('a queda que não pôde ser gravada é registrada depois', async () => {
    process.on('uncaughtException', anotar);
    const t = await servidor();
    const socket = await t.conectar();
    await t.entrar(socket, 'ana', 'QUEDA1');
    vi.spyOn(t.store, 'disconnect').mockImplementationOnce(() => {
      throw new Error('disco cheio');
    });
    socket.close();
    await esperar(() => !t.store.get('QUEDA1')!.sala.jogadores[0]!.conectado, 8000);
    expect(naoTratadas).toEqual([]);
  }, 12_000);

  it('a penalidade de silêncio que falha não impede a mensagem', async () => {
    process.on('uncaughtException', anotar);
    const t = await servidor();
    const ana = await t.conectar();
    const bia = await t.conectar();
    await t.entrar(ana, 'ana', 'CHAT01');
    await t.entrar(bia, 'bia', 'CHAT01');
    const comecou = once(bia, 'server:estado:atualizado');
    ana.emit('client:iniciar:partida', {});
    await comecou;
    vi.spyOn(t.store, 'penalizeSilenceBreak').mockImplementation(() => {
      throw new Error('sem cartas');
    });
    const chat = once<{ texto: string }>(bia, 'server:chat:msg');
    ana.emit('client:chat:msg', { texto: 'oi' });
    expect((await chat).texto).toBe('oi');
    expect(naoTratadas).toEqual([]);
  });
});

describe('7. um socket só ocupa uma identidade', () => {
  it('na espera, entrar com outra identidade libera a anterior', async () => {
    const t = await servidor();
    const socket = await t.conectar();
    await t.entrar(socket, 'ana', 'UMA001');
    await t.entrar(socket, 'bia', 'UMA001');
    expect(t.store.get('UMA001')!.sala.jogadores.map((j) => j.id)).toEqual(['bia']);
    await t.entrar(socket, 'caio', 'DUAS01');
    expect(t.store.get('UMA001')).toBeUndefined();
    expect(t.store.get('DUAS01')!.sala.jogadores.map((j) => j.id)).toEqual(['caio']);
    // "Jogar agora" de novo, já na espera, continua na mesma sala com outro id liberado.
    const rapida = once<ServerSessaoEmitidaEvent>(socket, 'server:sessao:emitida');
    socket.emit('client:jogar:rapido', { jogadorId: 'duda', nome: 'Duda', tamanho: 4 });
    const { salaId } = await rapida;
    expect(t.store.get('DUAS01')).toBeUndefined();
    expect(t.store.get(salaId)!.sala.jogadores.map((j) => j.id)).toEqual(['duda']);
  });

  it('uma entrada recusada não tira ninguém da sala em que está', async () => {
    const t = await servidor();
    const ana = await t.conectar();
    const bia = await t.conectar();
    const caio = await t.conectar();
    await t.entrar(ana, 'ana', 'ESPERA');
    await t.entrar(bia, 'bia', 'ESPERA');
    await t.entrar(caio, 'caio', 'ALHEIA');
    for (const [evento, payload] of [
      ['client:jogar:rapido', { jogadorId: 'caio', nome: 'x', tamanho: 3 }],
      ['client:jogar:rapido', { jogadorId: 'nova', nome: 'x', tamanho: 11 }],
      ['client:entrar:sala', { jogadorId: 'nova', salaId: 'NAOHA1', nome: 'x', criar: false }],
      ['client:entrar:sala', { jogadorId: 'caio', salaId: 'ALHEIA', nome: 'x' }],
    ] as const) {
      const erro = once<ServerErroEvent>(bia, 'server:erro');
      bia.emit(evento, payload);
      await erro;
      expect(t.store.get('ESPERA')!.sala.jogadores.map((j) => j.id)).toEqual(['ana', 'bia']);
    }
    const chat = once<{ jogadorId: string }>(ana, 'server:chat:msg');
    bia.emit('client:chat:msg', { texto: 'ainda aqui' });
    expect((await chat).jogadorId).toBe('bia');
  });

  it('sair da sala com a partida em andamento equivale a abandonar', async () => {
    const t = await servidor();
    const ana = await t.conectar();
    const bia = await t.conectar();
    await t.entrar(ana, 'ana', 'SAIDA1');
    await t.entrar(bia, 'bia', 'SAIDA1');
    const comecou = once(bia, 'server:estado:atualizado');
    ana.emit('client:iniciar:partida', {});
    await comecou;
    const erros: unknown[] = [];
    ana.on('server:erro', (e) => erros.push(e));
    const sala = once<{ hostId: string }>(bia, 'server:sala:atualizada');
    ana.emit('client:sair:sala', {});
    expect((await sala).hostId).toBe('bia');
    const { estado } = t.store.get('SAIDA1')!;
    expect(estado!.finalizada).toBe(false);
    expect(estado!.jogadores[0]).toMatchObject({ isBot: true, motivoBot: 'SAIU' });
    // A identidade fica livre para outra sala.
    await t.entrar(ana, 'ana', 'OUTRA2');
    expect(erros).toEqual([]);
  });

  it('no meio da partida a segunda identidade é recusada e a primeira continua', async () => {
    const t = await servidor();
    const ana = await t.conectar();
    const bia = await t.conectar();
    await t.entrar(ana, 'ana', 'JOGO01');
    await t.entrar(bia, 'bia', 'JOGO01');
    const comecou = once(bia, 'server:estado:atualizado');
    ana.emit('client:iniciar:partida', {});
    await comecou;
    for (const [evento, payload] of [
      ['client:entrar:sala', { jogadorId: 'outra', salaId: 'OUTRA1', nome: 'x' }],
      ['client:jogar:rapido', { jogadorId: 'outra', nome: 'x', tamanho: 3 }],
    ] as const) {
      const erro = once<ServerErroEvent>(bia, 'server:erro');
      bia.emit(evento, payload);
      expect((await erro).codigo).toBe('JOGADOR_EM_OUTRA_SALA');
    }
    expect(t.store.sessions()).toHaveLength(1);
    expect(t.store.get('JOGO01')!.estado!.jogadores[1]).toMatchObject({
      id: 'bia',
      isBot: false,
      conectado: true,
    });
  });
});
