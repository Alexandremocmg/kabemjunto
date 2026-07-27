import { describe, expect, it } from 'vitest';
import { Constants, validarJogada, type JogadorId } from '@kabemjunto/shared';
import { RoomError, RoomStore, toPublicState } from './room-store.js';

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
    const before = {
      ...session.estado!,
      ataqueAcumulado: 0,
      ataqueStack: [],
    };
    session.estado = before;
    const jogador = before.jogadores.find((item) => item.id === before.vezDe)!;
    const carta = jogador.mao.find((item) => validarJogada(before, item, jogador.id).valida)!;

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
