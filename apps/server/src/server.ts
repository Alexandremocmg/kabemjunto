import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';
import { JsonRoomPersistence } from './persistence.js';
import { RoomError, RoomStore, toPublicState } from './room-store.js';
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

  const storageFile = process.env['ROOM_STORAGE_FILE']?.trim();
  const store = new RoomStore(storageFile ? new JsonRoomPersistence(storageFile) : undefined);
  app.get('/health', async () => ({
    status: 'ok',
    service: 'kabemjunto-server',
    sprint: '2-backend',
    timestamp: new Date().toISOString(),
  }));

  return { app, store };
}

function e2eFixturesEnabled(): boolean {
  return process.env['KABEMJUNTO_E2E_FIXTURE'] === '1';
}

function registerE2EFixtureRoutes(
  app: Awaited<ReturnType<typeof buildServer>>['app'],
  store: RoomStore,
  io: SocketIOServer,
): void {
  if (!e2eFixturesEnabled()) return;

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

async function bootstrap(): Promise<void> {
  const { app, store } = await buildServer();
  const io = new SocketIOServer(app.server, { cors: { origin: true } });
  registerSocketHandlers(io, store);
  registerE2EFixtureRoutes(app, store, io);

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
