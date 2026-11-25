import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import {
  Constants,
  type Carta,
  type EventoPartida,
  type ServerErroEvent,
  type ServerEstadoAtualizadoEvent,
  type ServerPartidaEncerradaEvent,
  type ServerRevancheAtualizadaEvent,
  type ServerSalaAtualizadaEvent,
  type ServerSessaoEmitidaEvent,
} from '@kabemjunto/shared';
import { RoomStore, type RoomSession } from './room-store.js';
import { registerSocketHandlers } from './socket.js';

const SALA = 'REVAN1';
const LONGE = 600_000;
const cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const carta = (valor: number, cor = 'AZUL', n = 0): Carta =>
  Constants.BARALHO_COMPLETO_108.filter(
    (c) => c.tipo === 'NUMERADA' && !c.acao && c.cor === cor && c.valor === valor,
  )[n]!;
const AZUL1 = carta(1);
const AZUL1_B = carta(1, 'AZUL', 1);
const RUINS = [carta(9, 'LARANJA'), carta(8, 'LARANJA')];

async function esperar(condicao: () => boolean, ms = 4000): Promise<void> {
  const limite = Date.now() + ms;
  while (!condicao()) {
    if (Date.now() > limite) throw new Error('Tempo esgotado esperando a condição.');
    await new Promise((r) => setTimeout(r, 5));
  }
}
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cliente que guarda tudo o que recebe. */
class Pessoa {
  readonly eventos: Array<{ nome: string; payload: unknown }> = [];
  token = '';
  salaId = '';
  constructor(
    readonly socket: ClientSocket,
    readonly id: string,
  ) {
    socket.onAny((nome: string, payload: unknown) => this.eventos.push({ nome, payload }));
    socket.on('server:sessao:emitida', (s: ServerSessaoEmitidaEvent) => {
      this.token = s.resumeToken;
      this.salaId = s.salaId;
    });
  }
  de<T>(nome: string): T[] {
    return this.eventos.filter((e) => e.nome === nome).map((e) => e.payload as T);
  }
  get fins() {
    return this.de<ServerPartidaEncerradaEvent>('server:partida:encerrada');
  }
  get revanches() {
    return this.de<ServerRevancheAtualizadaEvent>('server:revanche:atualizada');
  }
  get erros() {
    return this.de<ServerErroEvent>('server:erro');
  }
  get estados() {
    return this.de<ServerEstadoAtualizadoEvent>('server:estado:atualizado').map((e) => e.estado);
  }
  viu(partidaId: string): boolean {
    return this.estados.some((e) => e.partidaId === partidaId);
  }
}

async function servidor(opcoes: { esperaMs?: number; limiteMs?: number } = {}) {
  const http = createServer();
  const io = new Server(http);
  const store = new RoomStore(undefined, {
    turnLimitMs: opcoes.limiteMs ?? 0,
    quickPlayWaitMs: 2500,
  });
  registerSocketHandlers(io, store, undefined, {
    quickPlay: { botDelayMs: { min: 30, max: 30 } },
    resiliencia: { disconnectGraceMs: LONGE },
    revanche: { esperaMs: opcoes.esperaMs ?? LONGE, toleranciaQuedaMs: 80 },
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => io.close(() => resolve())));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta.');
  const conectar = async (id: string): Promise<Pessoa> => {
    const socket = createClient(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    cleanup.push(() => {
      socket.close();
    });
    const pessoa = new Pessoa(socket, id);
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    return pessoa;
  };
  const entrar = async (p: Pessoa, extra: Record<string, unknown> = {}) => {
    const antes = p.de('server:sessao:emitida').length;
    p.socket.emit('client:entrar:sala', { jogadorId: p.id, salaId: SALA, nome: p.id, ...extra });
    await esperar(() => p.de('server:sessao:emitida').length > antes);
  };
  const gravar = (s: RoomSession) =>
    (store as unknown as { commit(s: RoomSession, nova: boolean): void }).commit(s, true);
  return { io, store, conectar, entrar, gravar };
}

async function mesa(ids: readonly string[], opcoes: Parameters<typeof servidor>[0] = {}) {
  const t = await servidor(opcoes);
  const pessoas: Pessoa[] = [];
  for (const [i, id] of ids.entries()) {
    const p = await t.conectar(id);
    await t.entrar(p, { avatarId: `0${i + 3}` });
    pessoas.push(p);
  }
  pessoas[0]!.socket.emit('client:iniciar:partida', {});
  await esperar(() => pessoas.every((p) => p.estados.length > 0));
  const preparar = (
    vezDe: string,
    maos: Record<string, Carta[]>,
    historico: EventoPartida[] = [],
  ) => {
    const s = t.store.get(SALA)!;
    t.gravar({
      ...s,
      estado: {
        ...s.estado!,
        jogadores: s.estado!.jogadores.map((j) => ({ ...j, mao: maos[j.id] ?? RUINS })),
        monteDescarte: [carta(3)],
        corAtiva: 'AZUL',
        sentido: 1,
        ataqueAcumulado: 0,
        ataqueStack: [],
        silencio: { ativo: false, jogadoresQuebraram: [] },
        interceptacao: undefined,
        historico,
        vezDe,
      },
    });
  };
  /** `quem` vence jogando a última carta. */
  const vencer = async (quem: Pessoa, testemunha = quem) => {
    const antes = testemunha.fins.length;
    preparar(quem.id, { [quem.id]: [AZUL1] });
    quem.socket.emit('client:jogar', { cartaId: AZUL1.id });
    await esperar(() => testemunha.fins.length > antes);
  };
  const pedir = (p: Pessoa) => p.socket.emit('client:revanche:pedir', {});
  const partida = () => t.store.get(SALA)!.estado!.partidaId;
  return { ...t, pessoas: pessoas as [Pessoa, Pessoa, Pessoa], preparar, vencer, pedir, partida };
}

describe('fim de partida: server:partida:encerrada uma vez por qualquer caminho', () => {
  const umaVez = async (p: Pessoa, motivo: string, vencedorId: string | null) => {
    await esperar(() => p.fins.length > 0);
    await pausa(60);
    expect(p.fins).toHaveLength(1);
    expect(p.fins[0]!.resumo).toMatchObject({ motivo, vencedorId });
    expect(p.fins[0]!.placar.partidas).toBe(1);
    expect(JSON.stringify(p.fins)).not.toMatch(/mao"|cartaId|colecao/);
  };

  it('jogada normal (e o andamento inicial vem com prontos vazio)', async () => {
    const t = await mesa(['ana', 'bia']);
    const [ana, bia] = t.pessoas;
    await t.vencer(ana);
    await umaVez(bia, 'VITORIA', 'ana');
    expect(bia.fins[0]!.placar.vitorias).toEqual([
      { jogadorId: 'ana', vitorias: 1 },
      { jogadorId: 'bia', vitorias: 0 },
    ]);
    expect(bia.revanches).toEqual([
      { partidaId: t.partida(), prontos: [], possiveis: ['ana', 'bia'] },
    ]);
  });

  it('descarte múltiplo', async () => {
    const t = await mesa(['ana', 'bia']);
    t.preparar('ana', { ana: [AZUL1, AZUL1_B] });
    t.pessoas[0].socket.emit('client:descarte:multiplo', { cartaIds: [AZUL1.id, AZUL1_B.id] });
    await umaVez(t.pessoas[1], 'VITORIA', 'ana');
  });

  it('Corta-Frente', async () => {
    const t = await mesa(['ana', 'bia']);
    const [ana, bia] = t.pessoas;
    t.preparar('ana', { ana: [AZUL1, ...RUINS], bia: [AZUL1_B] });
    ana.socket.emit('client:jogar', { cartaId: AZUL1.id });
    await esperar(() => bia.de('server:interceptacao:aberta').length > 0);
    const { janelaId, revisao } = t.store.get(SALA)!.estado!.interceptacao!;
    bia.socket.emit('client:interceptar', { janelaId, revisao, cartaId: AZUL1_B.id });
    await umaVez(ana, 'VITORIA', 'bia');
  });

  it('bot no lugar de quem saiu, que não recebe prêmio', async () => {
    const t = await mesa(['ana', 'bia']);
    const [ana, bia] = t.pessoas;
    bia.socket.emit('client:abandonar:partida', {});
    await esperar(() => ana.estados.at(-1)!.jogadores[1]!.isBot);
    // Mérito de sobra para prêmio no assento de quem saiu.
    const cortes = Array.from({ length: 8 }, () => ({
      tipo: 'INTERCEPTACAO_ACEITA' as const,
      timestamp: 1,
      janelaId: 'j',
      interceptadorId: 'bia',
      cartaId: 'c',
    }));
    t.preparar('bia', { bia: [AZUL1] }, cortes);
    await umaVez(ana, 'VITORIA', 'bia');
    expect(ana.fins[0]!.resumo.jogadores[1]!.cortaFrentes).toBe(8);
    expect(ana.fins[0]!.resumo.premios).toEqual([]);
  });

  it('estouro do limite por vez', async () => {
    const t = await mesa(['ana', 'bia'], { limiteMs: 150 });
    t.preparar('ana', { ana: [AZUL1] });
    await umaVez(t.pessoas[1], 'VITORIA', 'ana');
  });

  it('abandono da última pessoa', async () => {
    const t = await mesa(['ana', 'bia']);
    const [ana, bia] = t.pessoas;
    ana.socket.emit('client:abandonar:partida', {});
    await esperar(() => bia.estados.at(-1)!.jogadores[0]!.isBot);
    bia.socket.emit('client:abandonar:partida', {});
    await umaVez(bia, 'ABANDONO', null);
  });

  it('reenvia o mesmo resultado a quem reconecta no fim', async () => {
    const t = await mesa(['ana', 'bia']);
    const [ana, bia] = t.pessoas;
    await t.vencer(ana, bia);
    bia.socket.close();
    await esperar(() => ana.revanches.at(-1)!.possiveis.length === 1);
    const volta = await t.conectar('bia');
    await t.entrar(volta, { resumeToken: bia.token, avatarId: '12' });
    await esperar(() => volta.fins.length > 0 && volta.revanches.length > 0);
    expect(volta.fins).toEqual(bia.fins);
    expect(volta.revanches.at(-1)!.possiveis).toEqual(['ana', 'bia']);
    expect(ana.fins).toHaveLength(1);
    expect(t.store.get(SALA)!.sala.jogadores[1]!.avatar).toBe('04');
  });
});

describe('revanche', () => {
  it('começa na hora quando os dois aceitam; repetir o pedido não muda nada', async () => {
    const t = await mesa(['ana', 'bia']);
    const [ana, bia] = t.pessoas;
    await t.vencer(ana, bia);
    const primeira = t.partida();
    t.pedir(ana);
    t.pedir(ana);
    await esperar(() => bia.revanches.some((r) => r.prontos.length === 1));
    await pausa(40);
    expect(bia.revanches).toHaveLength(2);
    expect(bia.revanches[1]).toMatchObject({ prontos: ['ana'], possiveis: ['ana', 'bia'] });
    expect(bia.revanches[1]!.restanteMs).toBeGreaterThan(LONGE - 2000);
    expect(t.partida()).toBe(primeira);
    t.pedir(bia);
    await esperar(() => t.partida() !== primeira);
    const segunda = t.partida();
    await esperar(() => ana.viu(segunda) && bia.viu(segunda));
    expect(bia.estados.at(-1)!.jogadores.map((j) => [j.id, j.isBot, j.avatar])).toEqual([
      ['ana', false, '03'],
      ['bia', false, '04'],
    ]);
    await esperar(() => bia.de<{ mao: Carta[] }>('server:mao:atualizada').at(-1)!.mao.length === 7);
    await t.vencer(bia, ana);
    expect(ana.fins.at(-1)!.placar).toEqual({
      partidas: 2,
      vitorias: [
        { jogadorId: 'ana', vitorias: 1 },
        { jogadorId: 'bia', vitorias: 1 },
      ],
    });
  });

  it('no fim da espera começa com quem aceitou; quem ficou fora não vê nem joga nada', async () => {
    const t = await mesa(['ana', 'bia', 'caio'], { esperaMs: 120 });
    const [ana, bia, caio] = t.pessoas;
    await t.vencer(ana, bia);
    const primeira = t.partida();
    t.pedir(bia);
    await esperar(() => ana.erros.length > 0 && caio.erros.length > 0);
    const segunda = t.partida();
    expect(segunda).not.toBe(primeira);
    await esperar(() => bia.viu(segunda));
    expect(caio.erros[0]!).toMatchObject({ codigo: 'SALA_INEXISTENTE' });
    const sala = bia.de<ServerSalaAtualizadaEvent>('server:sala:atualizada').at(-1)!;
    expect(sala.hostId).toBe('bia'); // a anfitriã não aceitou
    expect(sala.jogadores.map((j) => j.isBot)).toEqual([true, false, true]);

    const maosDeFora = caio.de('server:mao:atualizada').length;
    caio.socket.emit('client:jogar', { cartaId: AZUL1.id });
    caio.socket.emit('client:chat:msg', { texto: 'oi' });
    caio.socket.emit('client:revanche:pedir', {});
    await esperar(() => caio.erros.length >= 4);
    await pausa(80);
    for (const fora of [ana, caio]) expect(fora.viu(segunda)).toBe(false);
    expect(caio.de('server:mao:atualizada')).toHaveLength(maosDeFora);
    expect(bia.de('server:chat:msg')).toHaveLength(0);
    expect(JSON.stringify(bia.estados)).not.toContain('"mao"');

    // Não volta com o token antigo, mas entra em outra sala com a mesma identidade.
    await t.entrar(caio, { salaId: 'OUTRA1' });
    expect(caio.salaId).toBe('OUTRA1');
    const volta = await t.conectar('ana');
    volta.socket.emit('client:entrar:sala', {
      jogadorId: 'ana',
      salaId: SALA,
      nome: 'ana',
      resumeToken: ana.token,
    });
    await esperar(() => volta.erros.length > 0);
    expect(volta.erros[0]!.codigo).toBe('AUTH_REQUIRED');
  });

  it('quem cai na contagem deixa de ser possível e a revanche começa sem esperar', async () => {
    const t = await mesa(['ana', 'bia', 'caio']);
    const [ana, bia, caio] = t.pessoas;
    await t.vencer(ana);
    const primeira = t.partida();
    t.pedir(ana);
    t.pedir(bia);
    await esperar(() => ana.revanches.at(-1)!.prontos.length === 2);
    caio.socket.close();
    await esperar(() => t.partida() !== primeira && ana.viu(t.partida()));
    expect(ana.revanches.at(-1)!.possiveis).toEqual(['ana', 'bia']);
    expect(t.store.get(SALA)!.estado!.jogadores.map((j) => j.isBot)).toEqual([false, false, true]);
  });

  it.each(['client:sair:sala', 'client:abandonar:partida'] as const)(
    'se quem pediu usa %s, a contagem é cancelada e o resultado fica',
    async (evento) => {
      const t = await mesa(['ana', 'bia', 'caio']);
      const [ana, bia] = t.pessoas;
      await t.vencer(ana, bia);
      t.pedir(ana);
      await esperar(() => bia.revanches.at(-1)!.prontos.length === 1);
      ana.socket.emit(evento, {});
      await esperar(() => bia.revanches.at(-1)!.possiveis.length === 2);
      expect(bia.revanches.at(-1)!.prontos).toEqual([]);
      expect(bia.revanches.at(-1)).not.toHaveProperty('restanteMs');
      const { estado, sala } = t.store.get(SALA)!;
      expect(estado).toMatchObject({ finalizada: true, vencedor: 'ana' });
      expect(estado!.historico.some((e) => e.tipo === 'PARTIDA_FINALIZADA')).toBe(false);
      expect(sala.hostId).toBe('bia');
      expect(bia.fins).toHaveLength(1);
      expect(ana.erros).toEqual([]);
      for (const p of t.pessoas.slice(1)) p.socket.emit(evento, {});
      await esperar(() => t.store.get(SALA) === undefined);
    },
  );

  it('antes do fim o pedido é recusado, e "iniciar" nunca substitui a revanche', async () => {
    const t = await mesa(['ana', 'bia']);
    const [ana, bia] = t.pessoas;
    const primeira = t.partida();
    t.pedir(ana);
    await esperar(() => ana.erros.length === 1);
    ana.socket.emit('client:iniciar:partida', {});
    await esperar(() => ana.erros.length === 2);
    await t.vencer(ana, bia);
    ana.socket.emit('client:iniciar:partida', {});
    await esperar(() => ana.erros.length === 3);
    expect(t.partida()).toBe(primeira);
  });
});

describe('"Jogar agora" e avatar', () => {
  it('sozinho com bots recomeça na hora, com o mesmo avatar e a mesma mesa', async () => {
    const t = await servidor();
    const ana = await t.conectar('ana');
    ana.socket.emit('client:jogar:rapido', {
      jogadorId: 'ana',
      nome: 'Ana',
      tamanho: 4,
      avatarId: '11',
    });
    await esperar(() => ana.salaId !== '');
    ana.socket.emit('client:iniciar:partida', {});
    await esperar(() => ana.estados.length > 0);
    const s = t.store.get(ana.salaId)!;
    t.gravar({ ...s, estado: { ...s.estado!, finalizada: true, vencedor: 'ana' } });
    await esperar(() => ana.fins.length === 1);
    const primeira = s.estado!.partidaId;
    ana.socket.emit('client:revanche:pedir', {});
    await esperar(() => ana.estados.at(-1)!.partidaId !== primeira);
    const nova = ana.estados.find((e) => e.partidaId !== primeira)!;
    expect(nova.jogadores.map((j) => j.isBot)).toEqual([false, true, true, true]);
    expect(nova.jogadores[0]!.avatar).toBe('11');
  });

  it('quem pede "Jogar agora" depois do fim não derruba a sala de quem ficou', async () => {
    const t = await servidor();
    const ana = await t.conectar('ana');
    const bia = await t.conectar('bia');
    for (const p of [ana, bia]) {
      p.socket.emit('client:jogar:rapido', { jogadorId: p.id, nome: p.id, tamanho: 2 });
    }
    await esperar(() => ana.estados.length > 0 && bia.estados.length > 0);
    const sala = ana.salaId;
    const s = t.store.get(sala)!;
    t.gravar({ ...s, estado: { ...s.estado!, finalizada: true, vencedor: 'ana' } });
    // Ninguém tira a Ana da sala só por saber o id público dela.
    const intrusa = await t.conectar('ana');
    intrusa.socket.emit('client:jogar:rapido', { jogadorId: 'ana', nome: 'x', tamanho: 2 });
    await esperar(() => intrusa.erros.length > 0);
    expect(intrusa.erros[0]!.codigo).toBe('AUTH_REQUIRED');

    ana.socket.emit('client:jogar:rapido', { jogadorId: 'ana', nome: 'Ana', tamanho: 2 });
    await esperar(() => ana.salaId !== sala);
    await esperar(() => bia.revanches.at(-1)!.possiveis.length === 1);
    bia.socket.emit('client:revanche:pedir', {});
    await esperar(() => t.store.get(sala)!.estado!.partidaId !== s.estado!.partidaId);
    const nova = t.store.get(sala)!.estado!.partidaId;
    await esperar(() => bia.viu(nova));
    await pausa(30);
    expect(ana.viu(nova)).toBe(false);
  });

  it('avatar ausente ou inválido vira 01, sem recusar a entrada', async () => {
    const t = await servidor();
    const casos: Array<[unknown, string]> = [
      [undefined, '01'],
      ['00', '01'],
      ['13', '01'],
      ['1', '01'],
      ['⭐', '01'],
      [7, '01'],
      [null, '01'],
      ['12', '12'],
    ];
    for (const [i, [avatarId, esperado]] of casos.entries()) {
      const p = await t.conectar(`p${i}`);
      await t.entrar(p, { salaId: 'AVATAR', ...(avatarId === undefined ? {} : { avatarId }) });
      const assento = t.store.get('AVATAR')!.sala.jogadores.find((j) => j.id === p.id)!;
      expect(assento.avatar).toBe(esperado);
    }
  });
});
