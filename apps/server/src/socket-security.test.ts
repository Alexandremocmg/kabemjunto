import { describe, expect, it } from 'vitest';
import { isNonEmptyString, SocketRateLimiter } from './socket-security.js';

describe('SocketRateLimiter', () => {
  it('permite até a capacidade da janela e bloqueia depois', () => {
    const limiter = new SocketRateLimiter();
    const now = 1_000;
    for (let i = 0; i < 10; i++) {
      expect(limiter.allow('s1', 'sala', now)).toBe(true);
    }
    expect(limiter.allow('s1', 'sala', now)).toBe(false);
  });

  it('reseta a janela depois do intervalo configurado', () => {
    const limiter = new SocketRateLimiter();
    for (let i = 0; i < 10; i++) limiter.allow('s1', 'chat', 0);
    expect(limiter.allow('s1', 'chat', 0)).toBe(false);
    expect(limiter.allow('s1', 'chat', 10_001)).toBe(true);
  });

  it('mantém contadores independentes por categoria e por socket', () => {
    const limiter = new SocketRateLimiter();
    for (let i = 0; i < 30; i++) expect(limiter.allow('s1', 'jogo', 0)).toBe(true);
    expect(limiter.allow('s1', 'jogo', 0)).toBe(false);
    // Outra categoria do mesmo socket não é afetada.
    expect(limiter.allow('s1', 'chat', 0)).toBe(true);
    // Outro socket não é afetado.
    expect(limiter.allow('s2', 'jogo', 0)).toBe(true);
  });

  it('releaseSocket libera memória sem afetar outros sockets', () => {
    const limiter = new SocketRateLimiter();
    for (let i = 0; i < 10; i++) limiter.allow('s1', 'sala', 0);
    limiter.releaseSocket('s1');
    expect(limiter.allow('s1', 'sala', 0)).toBe(true);

    for (let i = 0; i < 10; i++) limiter.allow('s2', 'sala', 0);
    limiter.releaseSocket('s1');
    expect(limiter.allow('s2', 'sala', 0)).toBe(false);
  });
});

describe('isNonEmptyString', () => {
  it('aceita strings não vazias dentro do limite', () => {
    expect(isNonEmptyString('ok')).toBe(true);
  });

  it('rejeita tipos que não são string', () => {
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString({})).toBe(false);
  });

  it('rejeita string vazia e string acima do limite', () => {
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('a'.repeat(10), 5)).toBe(false);
  });
});
