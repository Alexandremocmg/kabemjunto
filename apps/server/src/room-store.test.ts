import { describe, expect, it } from 'vitest';
import { validarJogada } from '@kabemjunto/shared';
import { RoomStore, toPublicState } from './room-store.js';

function createStartedStore(): RoomStore {
  const store = new RoomStore();
  store.join({ salaId: 'KJTEST', nome: 'Ana', socketId: 'socket-a' });
  store.join({ salaId: 'KJTEST', nome: 'Bia', socketId: 'socket-b' });
  store.start('KJTEST', 'socket-a');
  return store;
}

describe('RoomStore', () => {
  it('cria uma sala e só inicia com pelo menos dois jogadores', () => {
    const store = new RoomStore();
    const joined = store.join({ salaId: 'kj01', nome: '<Ana>', socketId: 'socket-a' });

    expect(joined.session.sala.id).toBe('KJ01');
    expect(joined.session.sala.jogadores[0]?.nome).toBe('Ana');
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
    const before = store.get('KJTEST')!.estado!;
    const jogador = before.jogadores.find((item) => item.id === before.vezDe)!;
    const carta = jogador.mao.find((item) => validarJogada(before, item, jogador.id).valida)!;

    const after = store.play('KJTEST', jogador.id, carta.id).estado!;
    expect(after.monteDescarte.at(-1)?.id).toBe(carta.id);
    expect(after.jogadores.find((item) => item.id === jogador.id)?.mao).toHaveLength(6);
  });

  it('calcula a compra no servidor e passa o turno', () => {
    const store = createStartedStore();
    const before = store.get('KJTEST')!.estado!;
    const currentPlayer = before.vezDe;

    const after = store.buy('KJTEST', currentPlayer).estado!;
    expect(after.jogadores.find((item) => item.id === currentPlayer)?.mao.length).toBe(8);
    expect(after.vezDe).not.toBe(currentPlayer);
  });
});
