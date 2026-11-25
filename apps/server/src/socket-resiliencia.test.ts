import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  Constants,
  type EstadoPartidaPublico,
  type ServerErroEvent,
  type ServerEstadoAtualizadoEvent,
  type ServerSalaAtualizadaEvent,
  type ServerSessaoEmitidaEvent,
} from '@kabemjunto/shared';
import { RoomStore } from './room-store.js';
import { registerSocketHandlers } from './socket.js';

const SALA = 'RESIL1';
/** Bots "lentos" o bastante para o teste nunca correr contra eles. */
const BOT_PARADO = 600_000;
const DESLIGADO = 600_000;

const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function once<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

/** Espera o primeiro estado público que satisfaz a condição. */
function estadoOnde(
  socket: ClientSocket,
  condicao: (estado: EstadoPartidaPublico) => boolean,
): Promise<EstadoPartidaPublico> {
  return new Promise((resolve) => {
    const ouvir = ({ estado }: ServerEstadoAtualizadoEvent): void => {
      if (!condicao(estado)) return;
      socket.off('server:estado:atualizado', ouvir);
      resolve(estado);
    };
    socket.on('server:estado:atualizado', ouvir);
  });
}

const assento = (estado: EstadoPartidaPublico, id: string) =>
  estado.jogadores.find((j) => j.id === id)!;

async function mesa(
  ids: readonly string[],
  opcoes: { limiteMs?: number; toleranciaMs?: number; botMs?: number } = {},
) {
  const http = createServer();
  const io = new Server(http);
  const store = new RoomStore(undefined, { turnLimitMs: opcoes.limiteMs ?? 0 });
  const botMs = opcoes.botMs ?? BOT_PARADO;
  registerSocketHandlers(io, store, undefined, {
    quickPlay: { botDelayMs: { min: botMs, max: botMs } },
    resiliencia: { disconnectGraceMs: opcoes.toleranciaMs ?? DESLIGADO },
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => io.close(() => resolve())));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta.');
  const url = `http://127.0.0.1:${address.port}`;

  const conectar = async (): Promise<ClientSocket> => {
    const socket = createClient(url, {
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
  const entrar = async (socket: ClientSocket, id: string, resumeToken?: string) => {
    const sessao = once<ServerSessaoEmitidaEvent>(socket, 'server:sessao:emitida');
    socket.emit('client:entrar:sala', {
      jogadorId: id,
      salaId: SALA,
      nome: id,
      ...(resumeToken ? { resumeToken } : {}),
    });
    return sessao;
  };

  const sockets: ClientSocket[] = [];
  const tokens: string[] = [];
  for (const id of ids) {
    const socket = await conectar();
    sockets.push(socket);
    tokens.push((await entrar(socket, id)).resumeToken);
  }
  const comecou = Promise.all(sockets.map((s) => once(s, 'server:estado:atualizado')));
  sockets[0]!.emit('client:iniciar:partida', {});
  await comecou;
  return { store, sockets, tokens, conectar, entrar };
}

const numero = (cor: string, valor: number) =>
  Constants.BARALHO_COMPLETO_108.find(
    (c) => c.tipo === 'NUMERADA' && !c.acao && c.cor === cor && c.valor === valor,
  )!;

/** Topo AZUL 3, vez de `vezDe` com uma carta jogável e duas que não são. */
function preparar(store: RoomStore, vezDe: string): void {
  const sessao = store.get(SALA)!;
  const estado = sessao.estado!;
  (store as unknown as { commit(s: typeof sessao, novaVez: boolean): void }).commit(
    {
      ...sessao,
      estado: {
        ...estado,
        jogadores: estado.jogadores.map((j) =>
          j.id === vezDe
            ? { ...j, mao: [numero('AZUL', 1), numero('VERDE', 5), numero('VERDE', 6)] }
            : { ...j, mao: [numero('AZUL', 8), numero('LARANJA', 9), numero('LARANJA', 8)] },
        ),
        monteDescarte: [numero('AZUL', 3)],
        corAtiva: 'AZUL',
        ataqueAcumulado: 0,
        ataqueStack: [],
        silencio: { ativo: false, jogadoresQuebraram: [] },
        interceptacao: undefined,
        vezDe,
      },
    },
    true,
  );
}

describe('socket — abandono com a partida seguindo', () => {
  it('um bot assume o assento, o host muda e quem saiu não recupera a vaga', async () => {
    const { store, sockets, tokens, conectar } = await mesa(['ana', 'bia', 'caio'], { botMs: 20 });
    const [ana, bia] = sockets as [ClientSocket, ClientSocket];
    preparar(store, 'ana');
    const estados: ServerEstadoAtualizadoEvent[] = [];
    bia.on('server:estado:atualizado', (e: ServerEstadoAtualizadoEvent) => estados.push(e));
    const assumido = estadoOnde(bia, (e) => assento(e, 'ana').motivoBot === 'SAIU');
    const sala = once<ServerSalaAtualizadaEvent>(bia, 'server:sala:atualizada');
    const botJogou = estadoOnde(bia, (e) => assento(e, 'ana').quantidadeCartas === 2);
    ana.emit('client:abandonar:partida', {});

    const estado = await assumido;
    expect(estado.finalizada).toBe(false);
    expect(assento(estado, 'ana')).toMatchObject({ isBot: true, controladoPorBot: true });
    expect(estado.jogadores.map((j) => j.id)).toEqual(['ana', 'bia', 'caio']);
    expect((await sala).hostId).toBe('bia');
    await botJogou;
    expect(JSON.stringify(estados)).not.toContain('"mao"');

    const volta = await conectar();
    const erro = once<ServerErroEvent>(volta, 'server:erro');
    volta.emit('client:entrar:sala', {
      jogadorId: 'ana',
      salaId: SALA,
      nome: 'ana',
      resumeToken: tokens[0],
    });
    expect((await erro).codigo).toBe('AUTH_REQUIRED');
  });

  it('quando a última pessoa sai, a partida termina para quem assiste', async () => {
    const { store, sockets } = await mesa(['ana', 'bia']);
    const [ana, bia] = sockets as [ClientSocket, ClientSocket];
    const assumido = estadoOnde(bia, (e) => assento(e, 'ana').isBot);
    ana.emit('client:abandonar:partida', {});
    await assumido;
    const fim = estadoOnde(bia, (e) => e.finalizada);
    bia.emit('client:abandonar:partida', {});
    expect((await fim).vencedor).toBeUndefined();
    expect(store.get(SALA)!.sala.status).toBe('FINALIZADA');
  });
});

describe('socket — queda e retorno', () => {
  it('um bot assume após a tolerância e o resumeToken devolve o controle e a mão', async () => {
    const { store, sockets, tokens, conectar, entrar } = await mesa(['ana', 'bia'], {
      toleranciaMs: 50,
    });
    const [ana, bia] = sockets as [ClientSocket, ClientSocket];
    preparar(store, 'bia');
    const assumido = estadoOnde(bia, (e) => assento(e, 'ana').controladoPorBot === true);
    ana.close();
    expect(assento(await assumido, 'ana')).toMatchObject({
      isBot: false,
      conectado: false,
      motivoBot: 'CAIU',
    });

    const mao = store.get(SALA)!.estado!.jogadores.find((j) => j.id === 'ana')!.mao;
    const deVolta = estadoOnde(bia, (e) => assento(e, 'ana').conectado);
    const nova = await conectar();
    const maoRecebida = once<{ mao: unknown }>(nova, 'server:mao:atualizada');
    await entrar(nova, 'ana', tokens[0]);
    expect((await maoRecebida).mao).toEqual(mao);
    expect(assento(await deVolta, 'ana')).not.toHaveProperty('controladoPorBot');
  });
});

describe('socket — estouro do limite por vez', () => {
  it('joga só aquela vez, com um único evento de estado por jogada e o próximo prazo', async () => {
    const { store, sockets } = await mesa(['ana', 'bia'], { limiteMs: 2000 });
    const [ana, bia] = sockets as [ClientSocket, ClientSocket];
    const recebidos: EstadoPartidaPublico[] = [];
    const jogou = estadoOnde(bia, (e) => e.topo.id === numero('AZUL', 1).id && !!e.interceptacao);
    preparar(store, 'ana');
    bia.on('server:estado:atualizado', (e: ServerEstadoAtualizadoEvent) =>
      recebidos.push(e.estado),
    );
    const maoNova = once<{ mao: unknown[] }>(ana, 'server:mao:atualizada');

    // Para com o Corta-Frente aberto (5 s), em que nenhum prazo corre.
    expect((await jogou).turno).toBeUndefined();
    expect((await maoNova).mao).toHaveLength(2);
    expect(assento(recebidos[0]!, 'ana')).not.toHaveProperty('controladoPorBot');
    expect(recebidos).toHaveLength(2); // a jogada e a abertura da janela
    expect(recebidos[0]!.turno).toMatchObject({ jogadorId: 'bia', duracaoMs: 2000 });
    expect(recebidos[0]!.turno!.restanteMs).toBeLessThanOrEqual(2000);
  });

  it('quem foi marcado como inativo recupera o assento com client:retomar:controle', async () => {
    const { store, sockets } = await mesa(['ana', 'bia'], { limiteMs: DESLIGADO });
    const [ana, bia] = sockets as [ClientSocket, ClientSocket];
    for (let i = 0; i < 2; i += 1) {
      preparar(store, 'ana');
      const { partidaId, turno } = store.get(SALA)!.estado!;
      store.expirarVez(SALA, { partidaId, jogadorId: 'ana', revisao: turno!.revisao });
    }
    expect(store.get(SALA)!.estado!.jogadores[0]!.motivoBot).toBe('INATIVO');
    const devolvido = estadoOnde(bia, (e) => !assento(e, 'ana').controladoPorBot);
    ana.emit('client:retomar:controle', {});
    await devolvido;
    expect(store.get(SALA)!.estado!.jogadores[0]!.controladoPorBot).toBeUndefined();
  });

  it('jogar a própria carta também devolve o assento', async () => {
    const { store, sockets } = await mesa(['ana', 'bia'], { limiteMs: DESLIGADO });
    const [ana, bia] = sockets as [ClientSocket, ClientSocket];
    for (let i = 0; i < 2; i += 1) {
      preparar(store, 'ana');
      const { partidaId, turno } = store.get(SALA)!.estado!;
      store.expirarVez(SALA, { partidaId, jogadorId: 'ana', revisao: turno!.revisao });
    }
    preparar(store, 'ana');
    const jogou = estadoOnde(bia, (e) => e.topo.id === numero('AZUL', 1).id);
    ana.emit('client:jogar', { cartaId: numero('AZUL', 1).id });
    expect(assento(await jogou, 'ana')).not.toHaveProperty('controladoPorBot');
  });
});
