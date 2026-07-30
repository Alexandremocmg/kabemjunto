import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  Constants,
  type ServerChatEvent,
  type ServerErroEvent,
  ServerSessaoEmitidaEvent,
  ServerSilencioQuebradoEvent,
} from '@kabemjunto/shared';
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

describe('socket — B24 (hardening)', () => {
  it('rejeita payload com campo de tipo inválido antes de chamar o RoomStore', async () => {
    const { url, store } = await harness();
    const socket = await connect(url);
    const errorEvent = once<ServerErroEvent>(socket, 'server:erro');

    socket.emit('client:entrar:sala', { jogadorId: 42, salaId: 'ROOM1', nome: 'Ana' });

    const error = await errorEvent;
    expect(error.codigo).toBe('INTERNAL');
    expect(store.get('ROOM1')).toBeUndefined();
  });

  it('aplica flood control por socket e categoria (chat)', async () => {
    const { url } = await harness();
    const socket = await connect(url);
    socket.emit('client:entrar:sala', { jogadorId: 'player-1', salaId: 'ROOM1', nome: 'Ana' });
    await once(socket, 'server:sessao:emitida');

    for (let i = 0; i < 10; i++) {
      socket.emit('client:chat:msg', { texto: `mensagem ${i}` });
    }
    const limited = once<ServerErroEvent>(socket, 'server:erro');
    socket.emit('client:chat:msg', { texto: 'excesso' });

    expect(await limited).toEqual({
      codigo: 'INTERNAL',
      mensagem: 'Muitas ações em pouco tempo. Aguarde um instante.',
    });
  });
});

describe('socket — salas públicas', () => {
  it('lista somente a projeção segura de salas públicas disponíveis e permite entrar pelo id listado', async () => {
    const { url } = await harness();
    const host = await connect(url);
    const lobby = await connect(url);
    const guest = await connect(url);
    const hostSession = once<ServerSessaoEmitidaEvent>(host, 'server:sessao:emitida');
    host.emit('client:entrar:sala', {
      jogadorId: 'public-host',
      salaId: 'PUBLIC1',
      nome: 'Host Público',
      nomeSala: ' < Sala   do host > ',
      visibilidade: 'PUBLICA',
    });
    await hostSession;

    const listed = once<{ salas: Array<Record<string, unknown>> }>(
      lobby,
      'server:salas:disponiveis',
    );
    lobby.emit('client:listar:salas', {});
    await expect(listed).resolves.toEqual({
      salas: [
        {
          id: 'PUBLIC1',
          nome: 'Sala do host',
          hostNome: 'Host Público',
          quantidadeJogadores: 1,
          maxJogadores: 10,
        },
      ],
    });

    const guestSession = once<ServerSessaoEmitidaEvent>(guest, 'server:sessao:emitida');
    guest.emit('client:entrar:sala', {
      jogadorId: 'public-guest',
      salaId: 'PUBLIC1',
      nome: 'Convidada',
      criar: false,
    });
    await expect(guestSession).resolves.toMatchObject({ salaId: 'PUBLIC1' });
  });
});

describe('socket — saídas explícitas', () => {
  it('difunde a sala sem o host que saiu e finaliza a partida abandonada para todos', async () => {
    const { url } = await harness();
    const host = await connect(url);
    const guest = await connect(url);
    const enterHost = once<ServerSessaoEmitidaEvent>(host, 'server:sessao:emitida');
    host.emit('client:entrar:sala', { jogadorId: 'host', salaId: 'EXIT1', nome: 'Ana' });
    await enterHost;
    const enterGuest = once<ServerSessaoEmitidaEvent>(guest, 'server:sessao:emitida');
    guest.emit('client:entrar:sala', { jogadorId: 'guest', salaId: 'EXIT1', nome: 'Bia' });
    await enterGuest;
    const roomAfterLeave = once<{ hostId: string; jogadores: Array<{ id: string }> }>(
      guest,
      'server:sala:atualizada',
    );
    host.emit('client:sair:sala', {});
    await expect(roomAfterLeave).resolves.toMatchObject({
      hostId: 'guest',
      jogadores: [{ id: 'guest' }],
    });

    const newHost = await connect(url);
    const newHostSession = once<ServerSessaoEmitidaEvent>(newHost, 'server:sessao:emitida');
    newHost.emit('client:entrar:sala', { jogadorId: 'host-2', salaId: 'EXIT2', nome: 'Nova Ana' });
    await newHostSession;
    const second = await connect(url);
    const secondSession = once<ServerSessaoEmitidaEvent>(second, 'server:sessao:emitida');
    second.emit('client:entrar:sala', { jogadorId: 'second', salaId: 'EXIT2', nome: 'Bia' });
    await secondSession;
    const started = once(second, 'server:estado:atualizado');
    newHost.emit('client:iniciar:partida', {});
    await started;
    const finalState = once<{ estado: { finalizada: boolean } }>(
      second,
      'server:estado:atualizado',
    );
    newHost.emit('client:abandonar:partida', {});
    await expect(finalState).resolves.toMatchObject({ estado: { finalizada: true } });
  });
});

describe('socket — Regra do 7 no chat', () => {
  it('usa a identidade autenticada e publica chat, penalidade, estado e mãos atualizados', async () => {
    const { url, store } = await harness();
    const first = await connect(url);
    const second = await connect(url);
    const firstSession = once<ServerSessaoEmitidaEvent>(first, 'server:sessao:emitida');
    first.emit('client:entrar:sala', { jogadorId: 'player-1', salaId: 'RULE7', nome: 'Ana' });
    await firstSession;
    const secondSession = once<ServerSessaoEmitidaEvent>(second, 'server:sessao:emitida');
    second.emit('client:entrar:sala', { jogadorId: 'player-2', salaId: 'RULE7', nome: 'Bia' });
    await secondSession;
    const started = once(first, 'server:estado:atualizado');
    first.emit('client:iniciar:partida', {});
    await started;

    const session = store.get('RULE7')!;
    session.estado = { ...session.estado!, silencio: { ativo: true, jogadoresQuebraram: [] } };
    const chat = once<ServerChatEvent>(second, 'server:chat:msg');
    const broken = once<ServerSilencioQuebradoEvent>(second, 'server:silencio:quebrado');
    const state = once(second, 'server:estado:atualizado');
    const hand = once(second, 'server:mao:atualizada');

    first.emit('client:chat:msg', { texto: 'falei', jogadorId: 'player-2' });

    expect(await chat).toMatchObject({ jogadorId: 'player-1', texto: 'falei' });
    expect(await broken).toEqual({ jogadorId: 'player-1', cartasCompradas: 2 });
    await state;
    await hand;
    expect(store.get('RULE7')?.estado?.silencio.jogadoresQuebraram).toEqual(['player-1']);
  });
});

describe('socket — descarte múltiplo', () => {
  it('rejeita payload nulo sem derrubar o handler', async () => {
    const { url } = await harness();
    const socket = await connect(url);
    const errorEvent = once<ServerErroEvent>(socket, 'server:erro');

    socket.emit('client:descarte:multiplo', null as unknown as { cartaIds: string[] });

    await expect(errorEvent).resolves.toEqual({
      codigo: 'JOGADA_INVALIDA',
      mensagem: 'Lote de descarte múltiplo inválido.',
    });
    expect(socket.connected).toBe(true);
  });

  it('rejeita payloads ausentes, não-objetos e cartaIds malformados sem lançar', async () => {
    const { url } = await harness();
    const socket = await connect(url);
    const malformedPayloads: unknown[] = [
      undefined,
      7,
      'cartas',
      [],
      {},
      { cartaIds: ['carta-1', ''] },
      { cartaIds: ['carta-1', 7] },
    ];

    for (const payload of malformedPayloads) {
      const errorEvent = once<ServerErroEvent>(socket, 'server:erro');
      socket.emit('client:descarte:multiplo', payload as { cartaIds: string[] });
      await expect(errorEvent).resolves.toEqual({
        codigo: 'JOGADA_INVALIDA',
        mensagem: 'Lote de descarte múltiplo inválido.',
      });
    }
    expect(socket.connected).toBe(true);
  });

  it('rejeita lotes maiores que o baralho canônico antes de consultar a sala', async () => {
    const { url, store } = await harness();
    const socket = await connect(url);
    const errorEvent = once<ServerErroEvent>(socket, 'server:erro');
    const cartaIds = Array.from({ length: 109 }, (_, index) => `carta-${index}`);

    socket.emit('client:descarte:multiplo', { cartaIds });

    await expect(errorEvent).resolves.toEqual({
      codigo: 'JOGADA_INVALIDA',
      mensagem: 'Lote de descarte múltiplo inválido.',
    });
    expect(store.get('MULTI1')).toBeUndefined();
  });

  it('rejeita ids duplicados antes de consultar a sala', async () => {
    const { url, store } = await harness();
    const socket = await connect(url);
    const errorEvent = once<ServerErroEvent>(socket, 'server:erro');

    socket.emit('client:descarte:multiplo', { cartaIds: ['carta-1', 'carta-1'] });

    await expect(errorEvent).resolves.toEqual({
      codigo: 'JOGADA_INVALIDA',
      mensagem: 'Lote de descarte múltiplo inválido.',
    });
    expect(store.get('MULTI1')).toBeUndefined();
  });

  it('rejeita fora de turno e cartas de outro jogador sem emitir mãos privadas', async () => {
    const { url, store } = await harness();
    const host = await connect(url);
    const guest = await connect(url);
    const hostSession = once<ServerSessaoEmitidaEvent>(host, 'server:sessao:emitida');
    host.emit('client:entrar:sala', { jogadorId: 'host', salaId: 'MULTI2', nome: 'Ana' });
    await hostSession;
    const guestSession = once<ServerSessaoEmitidaEvent>(guest, 'server:sessao:emitida');
    guest.emit('client:entrar:sala', { jogadorId: 'guest', salaId: 'MULTI2', nome: 'Bia' });
    await guestSession;
    const initialHostHand = once(host, 'server:mao:atualizada');
    const initialGuestHand = once(guest, 'server:mao:atualizada');
    const started = once(host, 'server:estado:atualizado');
    host.emit('client:iniciar:partida', {});
    await started;
    await Promise.all([initialHostHand, initialGuestHand]);

    const session = store.get('MULTI2')!;
    const estado = session.estado!;
    const maisDois = Constants.BARALHO_COMPLETO_108.filter((carta) => carta.acao === 'MAIS_DOIS');
    const [hostFirst, hostSecond, guestFirst, guestSecond, topo] = maisDois;
    if (!hostFirst || !hostSecond || !guestFirst || !guestSecond || !topo) {
      throw new Error('Fixture de descarte múltiplo incompleta.');
    }
    session.estado = {
      ...estado,
      vezDe: 'guest',
      jogadores: estado.jogadores.map((jogador) => {
        if (jogador.id === 'host') return { ...jogador, mao: [hostFirst, hostSecond] };
        if (jogador.id === 'guest') return { ...jogador, mao: [guestFirst, guestSecond] };
        return jogador;
      }),
      monteDescarte: [topo],
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };
    let privateHandEvents = 0;
    host.on('server:mao:atualizada', () => privateHandEvents++);
    guest.on('server:mao:atualizada', () => privateHandEvents++);

    const outsideTurn = once<ServerErroEvent>(host, 'server:erro');
    host.emit('client:descarte:multiplo', { cartaIds: [hostFirst.id, hostSecond.id] });
    await expect(outsideTurn).resolves.toMatchObject({ codigo: 'NAO_SUA_VEZ' });
    expect(session.estado!.vezDe).toBe('guest');
    expect(privateHandEvents).toBe(0);

    session.estado = { ...session.estado!, vezDe: 'host' };
    const notOwned = once<ServerErroEvent>(host, 'server:erro');
    host.emit('client:descarte:multiplo', { cartaIds: [guestFirst.id, guestSecond.id] });
    await expect(notOwned).resolves.toMatchObject({ codigo: 'JOGADA_INVALIDA' });
    expect(session.estado!.vezDe).toBe('host');
    expect(privateHandEvents).toBe(0);
  });

  it('aceita lote de +2, transmite estado público e mãos privadas sem vazamento', async () => {
    const { url, store } = await harness();
    const host = await connect(url);
    const guest = await connect(url);
    const hostSession = once<ServerSessaoEmitidaEvent>(host, 'server:sessao:emitida');
    host.emit('client:entrar:sala', { jogadorId: 'host', salaId: 'MULTI1', nome: 'Ana' });
    await hostSession;
    const guestSession = once<ServerSessaoEmitidaEvent>(guest, 'server:sessao:emitida');
    guest.emit('client:entrar:sala', { jogadorId: 'guest', salaId: 'MULTI1', nome: 'Bia' });
    await guestSession;
    const started = once(host, 'server:estado:atualizado');
    host.emit('client:iniciar:partida', {});
    await started;

    const session = store.get('MULTI1')!;
    const estado = session.estado!;
    const maisDoisAzul = Constants.BARALHO_COMPLETO_108.find(
      (carta) => carta.acao === 'MAIS_DOIS' && carta.cor === 'AZUL',
    )!;
    const maisDoisVerde = Constants.BARALHO_COMPLETO_108.find(
      (carta) => carta.acao === 'MAIS_DOIS' && carta.cor === 'VERDE',
    )!;
    const topo = Constants.BARALHO_COMPLETO_108.find(
      (carta) => carta.acao === 'MAIS_DOIS' && carta.cor === 'LARANJA',
    )!;
    session.estado = {
      ...estado,
      vezDe: 'host',
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === 'host' ? { ...jogador, mao: [maisDoisAzul, maisDoisVerde] } : jogador,
      ),
      monteDescarte: [topo],
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };
    const maoEsperadaDoGuest = session.estado.jogadores
      .find((jogador) => jogador.id === 'guest')!
      .mao.map((carta) => ({ id: carta.id }));

    const accepted = once<{ cartaIds: string[]; jogadorId: string }>(
      host,
      'server:descarte:multiplo:aceito',
    );
    const publicState = once<{ estado: Record<string, unknown> }>(host, 'server:estado:atualizado');
    const hostHand = once<{ mao: Array<{ id: string }> }>(host, 'server:mao:atualizada');
    const guestHand = once<{ mao: Array<{ id: string }> }>(guest, 'server:mao:atualizada');

    host.emit('client:descarte:multiplo', { cartaIds: [maisDoisVerde.id, maisDoisAzul.id] });

    await expect(accepted).resolves.toEqual({
      cartaIds: [maisDoisVerde.id, maisDoisAzul.id],
      jogadorId: 'host',
    });
    // A mão de 2 cartas esvazia inteira: vitória. GDD §10.8 — o ataque das
    // cartas vencedoras nunca é cobrado.
    await expect(publicState).resolves.toMatchObject({
      estado: {
        ataqueAcumulado: 0,
        finalizada: true,
        vencedor: 'host',
        topo: { id: maisDoisAzul.id },
      },
    });
    await expect(hostHand).resolves.toEqual({ mao: [] });
    const maoRecebidaPeloGuest = (await guestHand).mao.map((carta) => carta.id);
    expect(maoRecebidaPeloGuest).toEqual(maoEsperadaDoGuest.map((carta) => carta.id));
  });
});
