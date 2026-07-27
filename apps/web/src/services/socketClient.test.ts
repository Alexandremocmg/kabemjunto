import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gerarJogadorId, readSession, saveSession, type SessionCredentials } from './socketClient';

const SESSION_KEY = 'kabemjunto-online-session';

function createSessionStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', createSessionStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sessao estavel do jogador', () => {
  it('gera uma identidade nao vazia para a primeira entrada', () => {
    expect(gerarJogadorId()).not.toHaveLength(0);
  });

  it('persiste e recupera jogadorId, sala e nome', () => {
    const session: SessionCredentials = {
      jogadorId: 'jogador-teste-123',
      salaId: 'K4B3MJ',
      nome: 'Ana',
    };

    saveSession(session);
    expect(readSession()).toEqual(session);
  });

  it('ignora sessao antiga sem jogadorId', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ salaId: 'K4B3MJ', nome: 'Ana' }));
    expect(readSession()).toBeUndefined();
  });
});
