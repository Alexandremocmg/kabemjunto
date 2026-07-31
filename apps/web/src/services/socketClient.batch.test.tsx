// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeSocket {
  connected = false;
  id = 'socket-test';
  io = { on: vi.fn(), off: vi.fn() };
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  on = vi.fn((event: string, handler: (payload: unknown) => void) => {
    const listeners = this.handlers.get(event) ?? new Set();
    listeners.add(handler);
    this.handlers.set(event, listeners);
    return this;
  });
  off = vi.fn((event: string, handler: (payload: unknown) => void) => {
    this.handlers.get(event)?.delete(handler);
    return this;
  });
  emit = vi.fn(() => this);
  connect = vi.fn(() => this);
  disconnect = vi.fn(() => this);

  serverEmit(event: string, payload: unknown): void {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }
}

const fakeSocket = new FakeSocket();
vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket) }));

import { useGameSocket } from './socketClient';

type GameSocketHook = ReturnType<typeof useGameSocket>;
let latestHook: GameSocketHook | undefined;

function HookHarness(): null {
  latestHook = useGameSocket();
  return null;
}

describe('correlação do descarte múltiplo', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    fakeSocket.emit.mockClear();
    sessionStorage.clear();
    latestHook = undefined;
  });

  it('não confunde erro posterior ao aceite com rejeição do lote', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<HookHarness />));
    if (!latestHook) throw new Error('Hook não renderizado.');

    act(() => latestHook!.jogarMultiplasCartas(['carta-a', 'carta-b']));
    act(() =>
      fakeSocket.serverEmit('server:descarte:multiplo:aceito', {
        cartaIds: ['carta-a', 'carta-b'],
        jogadorId: 'jogador-local',
      }),
    );
    act(() =>
      fakeSocket.serverEmit('server:erro', {
        codigo: 'INTERNAL',
        mensagem: 'Erro não relacionado ao lote já aceito.',
      }),
    );

    expect(latestHook!.state.descarteMultiploErro).toBe(0);
    expect(latestHook!.state.erro).toBe('Erro não relacionado ao lote já aceito.');
    act(() => root.unmount());
  });

  it('não perde a correlação do lote quando uma atualização de mão não relacionada chega antes da rejeição', () => {
    // Regressão do bug do relatório Mavis: server:mao:atualizada não pode
    // limpar o batch pendente — só aceite explícito ou erro correlacionado devem.
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<HookHarness />));
    if (!latestHook) throw new Error('Hook não renderizado.');

    act(() => latestHook!.jogarMultiplasCartas(['carta-a', 'carta-b']));

    // Mão atualizada por outro motivo (ex.: Troca/Gira do oponente) chega
    // ANTES do erro do lote. Isso não deve liberar/zerar a correlação.
    act(() =>
      fakeSocket.serverEmit('server:mao:atualizada', {
        mao: [{ id: 'carta-c' }],
      }),
    );

    act(() =>
      fakeSocket.serverEmit('server:erro', {
        codigo: 'JOGADA_INVALIDA',
        mensagem: 'Lote rejeitado pelo servidor.',
      }),
    );

    // O erro ainda deve ser corretamente atribuído ao lote pendente.
    expect(latestHook!.state.descarteMultiploErro).toBe(1);
    act(() => root.unmount());
  });
});
