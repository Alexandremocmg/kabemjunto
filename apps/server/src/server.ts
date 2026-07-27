/**
 * Kabemjunto — servidor autoritativo.
 * Sprint 0: stub mínimo. O motor de jogo (rotas, sockets, regras) entra em S0-4 + Sprint 1.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);

  app.get('/health', async () => ({
    status: 'ok',
    service: 'kabemjunto-server',
    sprint: '0-bootstrap',
    timestamp: new Date().toISOString(),
  }));

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`🎴 Kabemjunto server escutando em http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap().catch((err: unknown) => {
  console.error('Falha fatal no bootstrap:', err);
  process.exit(1);
});
