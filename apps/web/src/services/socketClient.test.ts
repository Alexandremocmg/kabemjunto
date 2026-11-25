import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyIssuedSession,
  gerarJogadorId,
  readSession,
  saveSession,
  toEntrarSalaEvent,
  type SessionCredentials,
} from './socketClient';

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

  it('preserva token válido e ignora token com tipo inválido', () => {
    saveSession({
      jogadorId: 'jogador-teste-123',
      salaId: 'K4B3MJ',
      nome: 'Ana',
      resumeToken: 'token-opaco',
    });
    expect(readSession()?.resumeToken).toBe('token-opaco');

    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        jogadorId: 'jogador-teste-123',
        salaId: 'K4B3MJ',
        nome: 'Ana',
        resumeToken: 1,
      }),
    );
    expect(readSession()?.resumeToken).toBeUndefined();
  });

  it('salva token emitido pelo servidor no sessionStorage', () => {
    const updated = applyIssuedSession(
      { jogadorId: 'player-1', salaId: 'ROOM1', nome: 'Ana', criar: true },
      { jogadorId: 'player-1', salaId: 'ROOM1', resumeToken: 'token-rotacionado' },
    );

    expect(updated.resumeToken).toBe('token-rotacionado');
    expect(readSession()).toEqual(updated);
  });

  it('normaliza a intenção interna do lobby para o contrato compartilhado ao criar', () => {
    expect(
      toEntrarSalaEvent({
        jogadorId: 'jogador-teste-123',
        salaId: 'K4B3MJ',
        nome: 'Ana',
        criar: true,
        nomeSala: 'Mesa da Ana',
        visibilidade: 'publica',
      }),
    ).toEqual({
      jogadorId: 'jogador-teste-123',
      salaId: 'K4B3MJ',
      nome: 'Ana',
      criar: true,
      nomeSala: 'Mesa da Ana',
      visibilidade: 'PUBLICA',
    });
  });

  it('"Jogar agora": guarda o pedido sem sala e recebe o código da sala junto com o token', () => {
    const pedido: SessionCredentials = { jogadorId: 'p1', salaId: '', nome: 'Ana', rapido: 3 };
    saveSession(pedido);
    expect(readSession()).toEqual(pedido);

    const emitida = applyIssuedSession(pedido, {
      jogadorId: 'p1',
      salaId: 'ABC234',
      resumeToken: 'token-novo',
    });
    expect(emitida).toMatchObject({ salaId: 'ABC234', resumeToken: 'token-novo', rapido: 3 });
    expect(readSession()?.salaId).toBe('ABC234');
  });

  it('ignora o tamanho da mesa rápida quando não é um número inteiro', () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ jogadorId: 'p1', salaId: '', nome: 'Ana', rapido: '3' }),
    );
    expect(readSession()?.rapido).toBeUndefined();
  });

  it('não envia o campo interno "rapido" ao reentrar numa sala', () => {
    const evento = toEntrarSalaEvent({
      jogadorId: 'p1',
      salaId: 'ABC234',
      nome: 'Ana',
      rapido: 3,
      resumeToken: 't',
    });
    expect(evento).toEqual({ jogadorId: 'p1', salaId: 'ABC234', nome: 'Ana', resumeToken: 't' });
    expect('rapido' in evento).toBe(false);
  });

  it('ignora sessao antiga sem jogadorId', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ salaId: 'K4B3MJ', nome: 'Ana' }));
    expect(readSession()).toBeUndefined();
  });
});
