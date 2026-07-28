import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server.js';
import { loadConfig } from './config.js';

let app: FastifyInstance | undefined;
const directories: string[] = [];

function storageFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kabemjunto-server-test-'));
  directories.push(directory);
  return join(directory, 'rooms.json');
}

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('buildServer', () => {
  it('responde /health em configuração padrão', async () => {
    ({ app } = await buildServer(loadConfig({})));
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('rejeita corpo acima do limite de 32 KiB', async () => {
    ({ app } = await buildServer(loadConfig({})));
    const response = await app.inject({
      method: 'POST',
      url: '/health',
      headers: { 'content-type': 'application/json' },
      payload: 'a'.repeat(33 * 1024),
    });
    expect(response.statusCode).toBe(413);
  });

  it('em produção, só libera CORS pra origem na allowlist', async () => {
    ({ app } = await buildServer(
      loadConfig({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://kabemjunto.example.com',
        METRICS_TOKEN: 'a'.repeat(32),
      }),
    ));

    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://kabemjunto.example.com' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://kabemjunto.example.com');

    const denied = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://atacante.example.com' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('health check funciona sem header Origin (probes não passam por CORS)', async () => {
    ({ app } = await buildServer(
      loadConfig({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://kabemjunto.example.com',
        METRICS_TOKEN: 'a'.repeat(32),
      }),
    ));
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('aplica headers de segurança do Helmet', async () => {
    ({ app } = await buildServer(loadConfig({})));
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('aplica rate limit HTTP de 120 requisições/minuto/IP', async () => {
    ({ app } = await buildServer(loadConfig({})));
    let last;
    for (let i = 0; i < 120; i++) {
      last = await app.inject({ method: 'GET', url: '/health' });
    }
    expect(last?.statusCode).toBe(200);
    const blocked = await app.inject({ method: 'GET', url: '/health' });
    expect(blocked.statusCode).toBe(429);
  });

  it('/live sempre responde 200 enquanto o processo está de pé', async () => {
    ({ app } = await buildServer(loadConfig({})));
    const response = await app.inject({ method: 'GET', url: '/live' });
    expect(response.statusCode).toBe(200);
  });

  it('/ready responde 200 quando o storage está gravável', async () => {
    ({ app } = await buildServer(loadConfig({ ROOM_STORAGE_FILE: storageFile() })));
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
  });

  it('/ready responde 200 sem persistência configurada (nada a sondar)', async () => {
    ({ app } = await buildServer(loadConfig({})));
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
  });

  it('/metrics exige bearer token em produção e recusa token errado', async () => {
    ({ app } = await buildServer(
      loadConfig({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://kabemjunto.example.com',
        METRICS_TOKEN: 'a'.repeat(32),
      }),
    ));

    const noAuth = await app.inject({ method: 'GET', url: '/metrics' });
    expect(noAuth.statusCode).toBe(401);

    const wrongToken = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer token-errado' },
    });
    expect(wrongToken.statusCode).toBe(401);

    const correctToken = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${'a'.repeat(32)}` },
    });
    expect(correctToken.statusCode).toBe(200);
    expect(correctToken.body).toContain('kabemjunto_socket_connections');
  });

  it('/metrics não exige token fora de produção', async () => {
    ({ app } = await buildServer(loadConfig({})));
    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
  });
});
