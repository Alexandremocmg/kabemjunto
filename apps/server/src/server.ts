import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';
import { RoomStore } from './room-store.js';
import { registerSocketHandlers } from './socket.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

export async function buildServer() {
  const app = Fastify({
    logger: {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    },
  });
  await app.register(cors, { origin: true });
  await app.register(sensible);

  const store = new RoomStore();
  app.get('/health', async () => ({
    status: 'ok',
    service: 'kabemjunto-server',
    sprint: '2-backend',
    timestamp: new Date().toISOString(),
  }));

  return { app, store };
}

async function bootstrap(): Promise<void> {
  const { app, store } = await buildServer();
  const io = new SocketIOServer(app.server, { cors: { origin: true } });
  registerSocketHandlers(io, store);

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Kabemjunto server escutando em http://${HOST}:${PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  bootstrap().catch((error: unknown) => {
    console.error('Falha fatal no bootstrap:', error);
    process.exitCode = 1;
  });
}
