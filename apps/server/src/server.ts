import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';
import { loadConfig, type AppConfig } from './config.js';
import { JsonRoomPersistence } from './persistence.js';
import { RoomError, RoomStore, toPublicState } from './room-store.js';
import { registerSocketHandlers } from './socket.js';

const HTTP_BODY_LIMIT_BYTES = 32 * 1024;
const SOCKET_MAX_BUFFER_BYTES = 16 * 1024;
const HTTP_RATE_LIMIT_PER_MINUTE = 120;

export async function buildServer(config: AppConfig = loadConfig()) {
  const app = Fastify({
    bodyLimit: HTTP_BODY_LIMIT_BYTES,
    logger:
      config.nodeEnv === 'production'
        ? true
        : { transport: { target: 'pino-pretty', options: { colorize: true } } },
  });
  await app.register(helmet);
  await app.register(rateLimit, { max: HTTP_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' });
  await app.register(cors, {
    // Requests sem header Origin (health checks, probes, curl) não passam
    // pelo CORS de qualquer forma — isto só filtra chamadas de browser.
    origin: config.corsOrigins ?? true,
  });
  await app.register(sensible);

  const store = new RoomStore(
    config.roomStorageFile ? new JsonRoomPersistence(config.roomStorageFile) : undefined,
  );
  app.get('/health', async () => ({
    status: 'ok',
    service: 'kabemjunto-server',
    sprint: '2-backend',
    timestamp: new Date().toISOString(),
  }));

  return { app, store, config };
}

function registerE2EFixtureRoutes(
  app: Awaited<ReturnType<typeof buildServer>>['app'],
  store: RoomStore,
  io: SocketIOServer,
  config: AppConfig,
): void {
  if (!config.e2eFixturesEnabled) return;

  app.post<{ Body: { salaId?: string } }>(
    '/__e2e/fixture/online-vitoria-deterministica',
    async (request, reply) => {
      const salaId = request.body?.salaId?.trim();
      if (!salaId) {
        return reply.code(400).send({
          codigo: 'SALA_INEXISTENTE',
          mensagem: 'Informe o salaId para a fixture E2E.',
        });
      }

      try {
        const { session, fixture } = store.prepareDeterministicVictoryFixture(salaId);
        io.to(session.sala.id).emit('server:estado:atualizado', {
          estado: toPublicState(session.estado),
        });
        for (const [jogadorId, socketId] of session.socketByPlayer) {
          const jogador = session.estado.jogadores.find((item) => item.id === jogadorId);
          const playerSocket = io.sockets.sockets.get(socketId);
          if (jogador && playerSocket) {
            playerSocket.emit('server:mao:atualizada', { mao: jogador.mao });
          }
        }
        return reply.code(200).send(fixture);
      } catch (error) {
        const roomError =
          error instanceof RoomError
            ? error
            : new RoomError('INTERNAL', 'Falha ao aplicar fixture E2E.');
        return reply.code(400).send({ codigo: roomError.code, mensagem: roomError.message });
      }
    },
  );
}

function registerGracefulShutdown(app: Awaited<ReturnType<typeof buildServer>>['app']): void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`Recebido ${signal}, encerrando graciosamente...`);
    app
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        app.log.error(error);
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function bootstrap(): Promise<void> {
  const { app, store, config } = await buildServer();
  const io = new SocketIOServer(app.server, {
    cors: { origin: config.corsOrigins ?? true },
    maxHttpBufferSize: SOCKET_MAX_BUFFER_BYTES,
  });
  registerSocketHandlers(io, store);
  registerE2EFixtureRoutes(app, store, io, config);
  registerGracefulShutdown(app);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Kabemjunto server escutando em http://${config.host}:${config.port}`);
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
