import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

const METRICS_TOKEN = 'a'.repeat(32);

describe('loadConfig', () => {
  it('usa defaults seguros em desenvolvimento sem env configurada', () => {
    const config = loadConfig(env({}));
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3001);
    expect(config.host).toBe('0.0.0.0');
    expect(config.corsOrigins).toBeUndefined();
    expect(config.e2eFixturesEnabled).toBe(false);
  });

  it('falha cedo para PORT inválida', () => {
    expect(() => loadConfig(env({ PORT: 'nao-numero' }))).toThrow(ConfigError);
  });

  it('falha cedo para NODE_ENV desconhecido', () => {
    expect(() => loadConfig(env({ NODE_ENV: 'staging' }))).toThrow(ConfigError);
  });

  it('exige CORS_ORIGINS em produção', () => {
    expect(() => loadConfig(env({ NODE_ENV: 'production' }))).toThrow(
      /CORS_ORIGINS é obrigatório em produção/,
    );
  });

  it('aceita produção com CORS_ORIGINS explícita e faz parse da lista', () => {
    const config = loadConfig(
      env({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://a.example.com, https://b.example.com',
        METRICS_TOKEN,
      }),
    );
    expect(config.corsOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('ignora CORS_ORIGINS vazia ou só com vírgulas', () => {
    expect(() =>
      loadConfig(env({ NODE_ENV: 'production', CORS_ORIGINS: ' , , ', METRICS_TOKEN })),
    ).toThrow(ConfigError);
  });

  it('exige METRICS_TOKEN em produção', () => {
    expect(() =>
      loadConfig(env({ NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example.com' })),
    ).toThrow(/METRICS_TOKEN é obrigatório em produção/);
  });

  it('rejeita METRICS_TOKEN curto demais', () => {
    expect(() =>
      loadConfig(
        env({
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://a.example.com',
          METRICS_TOKEN: 'curto',
        }),
      ),
    ).toThrow(ConfigError);
  });

  it('habilita fixture E2E fora de produção quando a flag está ligada', () => {
    const config = loadConfig(env({ KABEMJUNTO_E2E_FIXTURE: '1' }));
    expect(config.e2eFixturesEnabled).toBe(true);
  });

  it('nunca habilita fixture E2E em produção, mesmo com a flag ligada', () => {
    const config = loadConfig(
      env({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://a.example.com',
        KABEMJUNTO_E2E_FIXTURE: '1',
        METRICS_TOKEN,
      }),
    );
    expect(config.e2eFixturesEnabled).toBe(false);
  });

  it('omite roomStorageFile quando não configurado', () => {
    const config = loadConfig(env({}));
    expect(config.roomStorageFile).toBeUndefined();
  });

  it('repassa ROOM_STORAGE_FILE quando configurado', () => {
    const config = loadConfig(env({ ROOM_STORAGE_FILE: '/data/rooms.json' }));
    expect(config.roomStorageFile).toBe('/data/rooms.json');
  });

  it('usa 30 s por vez e 20 s de tolerância, inclusive com a variável vazia', () => {
    for (const vazio of [{}, { TURN_LIMIT_MS: '', DISCONNECT_GRACE_MS: ' ' }]) {
      const config = loadConfig(env(vazio));
      expect(config.turnLimitMs).toBe(30_000);
      expect(config.disconnectGraceMs).toBe(20_000);
    }
  });

  it('aceita 0 (desliga) e valores válidos para os tempos da partida', () => {
    const config = loadConfig(env({ TURN_LIMIT_MS: '0', DISCONNECT_GRACE_MS: '45000' }));
    expect(config.turnLimitMs).toBe(0);
    expect(config.disconnectGraceMs).toBe(45_000);
  });

  it('recusa tempos da partida inválidos', () => {
    for (const valor of ['-1', '999', '600001', '1500.5', 'abc']) {
      expect(() => loadConfig(env({ TURN_LIMIT_MS: valor }))).toThrow(ConfigError);
      expect(() => loadConfig(env({ DISCONNECT_GRACE_MS: valor }))).toThrow(ConfigError);
    }
  });

  it('REVANCHE_WAIT_MS: 15 s por padrão, de 1 s a 2 min', () => {
    for (const vazio of [{}, { REVANCHE_WAIT_MS: ' ' }]) {
      expect(loadConfig(env(vazio)).revancheWaitMs).toBe(15_000);
    }
    expect(loadConfig(env({ REVANCHE_WAIT_MS: '5000' })).revancheWaitMs).toBe(5_000);
    for (const valor of ['0', '-1', '999', '120001', '1500.5', 'abc']) {
      expect(() => loadConfig(env({ REVANCHE_WAIT_MS: valor }))).toThrow(ConfigError);
    }
  });
});
