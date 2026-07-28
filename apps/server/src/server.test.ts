import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server.js';
import { loadConfig } from './config.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
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
      loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://kabemjunto.example.com' }),
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
      loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://kabemjunto.example.com' }),
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
});
