import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

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
      env({ NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example.com, https://b.example.com' }),
    );
    expect(config.corsOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('ignora CORS_ORIGINS vazia ou só com vírgulas', () => {
    expect(() => loadConfig(env({ NODE_ENV: 'production', CORS_ORIGINS: ' , , ' }))).toThrow(
      ConfigError,
    );
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
});
