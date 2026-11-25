import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  validarJogada,
  type ServerErroEvent,
  type ServerEstadoAtualizadoEvent,
  type ServerSalaAtualizadaEvent,
  type ServerSessaoEmitidaEvent,
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

async function harness(esperaMs = 150): Promise<{ url: string; store: RoomStore }> {
  const http = createServer();
  const io = new Server(http);
  const store = new RoomStore(undefined, { quickPlayWaitMs: esperaMs });
  registerSocketHandlers(io, store, undefined, {
    quickPlay: { botDelayMs: { min: 15, max: 15 }, graceMs: 60_000 },
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta.');
  cleanup.push(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
  return { url: `http://127.0.0.1:${address.port}`, store };
}

async function conectar(url: string): Promise<ClientSocket> {
  const socket = createClient(url, { transports: ['websocket'], forceNew: true });
  cleanup.push(() => {
    socket.close();
  });
  await once(socket, 'connect');
  return socket;
}

async function esperarAte(condicao: () => boolean, ms = 8000): Promise<void> {
  const limite = Date.now() + ms;
  while (!condicao()) {
    if (Date.now() > limite) throw new Error('Tempo esgotado esperando a condição.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('socket — "Jogar agora" (client:jogar:rapido)', () => {
  it('duas pessoas que pedem mesa de 2 caem na mesma sala e começam na hora, sem bots', async () => {
    const { url } = await harness(60_000);
    const ana = await conectar(url);
    const bia = await conectar(url);
    const sessaoAna = once<ServerSessaoEmitidaEvent>(ana, 'server:sessao:emitida');
    ana.emit('client:jogar:rapido', { jogadorId: 'ana', nome: 'Ana', tamanho: 2 });
    const a = await sessaoAna;

    const salaAtualizada = once<ServerSalaAtualizadaEvent>(ana, 'server:sala:atualizada');
    const estadoAna = once<ServerEstadoAtualizadoEvent>(ana, 'server:estado:atualizado');
    const sessaoBia = once<ServerSessaoEmitidaEvent>(bia, 'server:sessao:emitida');
    bia.emit('client:jogar:rapido', { jogadorId: 'bia', nome: 'Bia', tamanho: 2 });
    const b = await sessaoBia;

    expect(b.salaId).toBe(a.salaId);
    expect((await salaAtualizada).rapida?.tamanhoAlvo).toBe(2);
    const estado = (await estadoAna).estado;
    expect(estado.jogadores).toHaveLength(2);
    expect(estado.jogadores.every((j) => !j.isBot)).toBe(true);
  });

  it('uma pessoa sozinha é completada com bots depois da espera, e os bots jogam sozinhos', async () => {
    const { url, store } = await harness(120);
    const ana = await conectar(url);
    const estados: ServerEstadoAtualizadoEvent[] = [];
    ana.on('server:estado:atualizado', (payload) => estados.push(payload));

    const sessao = once<ServerSessaoEmitidaEvent>(ana, 'server:sessao:emitida');
    ana.emit('client:jogar:rapido', { jogadorId: 'ana', nome: 'Ana', tamanho: 3 });
    const { salaId } = await sessao;

    // Antes do fim da espera ainda não há partida.
    expect(estados).toHaveLength(0);

    await esperarAte(() => estados.length > 0);
    const primeiro = estados[0]!.estado;
    expect(primeiro.jogadores).toHaveLength(3);
    expect(primeiro.jogadores.filter((j) => j.isBot)).toHaveLength(2);
    const idsDosBots = new Set(primeiro.jogadores.filter((j) => j.isBot).map((j) => j.id));

    // A pessoa joga a vez dela (carta válida ou compra) para a mesa andar.
    const agir = setInterval(() => {
      const estado = store.get(salaId)?.estado;
      if (!estado || estado.finalizada || estado.interceptacao || estado.vezDe !== 'ana') return;
      const eu = estado.jogadores.find((j) => j.id === 'ana')!;
      const carta = eu.mao.find((c) => validarJogada(estado, c, 'ana').valida);
      if (!carta) {
        ana.emit('client:comprar', {});
        return;
      }
      // Coringas pedem cor; Troca Mão pede com quem trocar.
      ana.emit('client:jogar', {
        cartaId: carta.id,
        ...(carta.tipo === 'NEUTRA' ? { corEscolhida: 'AZUL' as const } : {}),
        ...(carta.acao === 'TROCA_MAO' ? { alvoTrocaId: [...idsDosBots][0]! } : {}),
      });
    }, 25);
    cleanup.push(() => clearInterval(agir));

    // Os bots passam a vez sozinhos: aparecem estados com a vez de um bot e depois de outro jogador.
    await esperarAte(() => {
      const turnosDeBot = estados.filter((e) => idsDosBots.has(e.estado.vezDe)).length;
      return turnosDeBot >= 2 && estados.length >= 4;
    }, 15_000);

    const finalSala = store.get(salaId)!;
    expect(finalSala.sala.jogadores.filter((j) => j.isBot)).toHaveLength(2);
    // Nenhuma transmissão pública traz a mão de ninguém.
    expect(JSON.stringify(estados)).not.toContain('"mao":[');
  }, 25_000);

  it('rejeita pedido inválido sem criar sala', async () => {
    const { url, store } = await harness();
    const ana = await conectar(url);
    for (const invalido of [
      { jogadorId: 'ana', nome: 'Ana', tamanho: 1.5 },
      { jogadorId: 'ana', nome: '', tamanho: 3 },
      { jogadorId: '', nome: 'Ana', tamanho: 3 },
    ]) {
      const erro = once<ServerErroEvent>(ana, 'server:erro');
      ana.emit('client:jogar:rapido', invalido);
      expect((await erro).mensagem).toMatch(/inválido/i);
    }
    const tamanhoFora = once<ServerErroEvent>(ana, 'server:erro');
    ana.emit('client:jogar:rapido', { jogadorId: 'ana', nome: 'Ana', tamanho: 11 });
    expect((await tamanhoFora).mensagem).toMatch(/tamanho/i);
    expect(store.sessions()).toHaveLength(0);
  });
});
