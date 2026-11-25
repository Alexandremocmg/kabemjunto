import { z } from 'zod';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  roomStorageFile?: string;
  /** `undefined` = allowlist não aplicada (permissivo, só fora de produção). */
  corsOrigins: string[] | undefined;
  e2eFixturesEnabled: boolean;
  /** Bearer token pra proteger `/metrics`. Obrigatório em produção. */
  metricsToken?: string;
  /** Quanto a sala "Jogar agora" espera por pessoas antes de completar com bots (ms). */
  quickPlayWaitMs?: number;
  /** Limite por vez de uma pessoa conectada (ms); 0 desliga. */
  turnLimitMs?: number;
  /** Quanto esperar por quem caiu antes de um bot jogar por ele (ms); 0 desliga. */
  disconnectGraceMs?: number;
  /** Quanto a revanche espera, desde o primeiro pedido, por quem ainda não aceitou (ms). */
  revancheWaitMs?: number;
}

/** Limite por vez quando `TURN_LIMIT_MS` não é informada. */
export const TURN_LIMIT_PADRAO_MS = 30_000;
/** Tolerância a quedas quando `DISCONNECT_GRACE_MS` não é informada. */
export const DISCONNECT_GRACE_PADRAO_MS = 20_000;
/** Espera da revanche quando `REVANCHE_WAIT_MS` não é informada. */
export const REVANCHE_WAIT_PADRAO_MS = 15_000;

/** Variável vazia vale o padrão (`Number('')` é 0). */
const vazioViraPadrao = (valor: unknown): unknown =>
  typeof valor === 'string' && valor.trim() === '' ? undefined : valor;

/**
 * Tempo em ms onde 0 desliga o recurso; abaixo de 1 s seria injogável. Variável
 * vazia vale o padrão (`Number('')` é 0 e desligaria o recurso sem querer).
 */
function tempoOuDesligado(padrao: number) {
  return z.preprocess(
    vazioViraPadrao,
    z.coerce
      .number()
      .int()
      .min(0)
      .max(600_000)
      .refine((ms) => ms === 0 || ms >= 1_000, 'use 0 (desliga) ou pelo menos 1000 ms')
      .default(padrao),
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  ROOM_STORAGE_FILE: z.string().trim().min(1).optional(),
  CORS_ORIGINS: z.string().trim().min(1).optional(),
  KABEMJUNTO_E2E_FIXTURE: z.enum(['0', '1']).optional(),
  METRICS_TOKEN: z.string().trim().min(16).optional(),
  QUICKPLAY_WAIT_MS: z.coerce.number().int().min(0).max(120_000).optional(),
  TURN_LIMIT_MS: tempoOuDesligado(TURN_LIMIT_PADRAO_MS),
  DISCONNECT_GRACE_MS: tempoOuDesligado(DISCONNECT_GRACE_PADRAO_MS),
  REVANCHE_WAIT_MS: z.preprocess(
    vazioViraPadrao,
    z.coerce.number().int().min(1_000).max(120_000).default(REVANCHE_WAIT_PADRAO_MS),
  ),
});

function parseOrigins(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : undefined;
}

/**
 * Carrega e valida a configuração de ambiente. Falha cedo (lança
 * `ConfigError`) em vez de deixar o servidor subir com estado inválido —
 * em especial, produção sem allowlist de CORS explícita.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Configuração de ambiente inválida: ${issues}`);
  }

  const data = parsed.data;
  const corsOrigins = parseOrigins(data.CORS_ORIGINS);

  if (data.NODE_ENV === 'production' && !corsOrigins) {
    throw new ConfigError(
      'CORS_ORIGINS é obrigatório em produção (lista de origens separadas por vírgula).',
    );
  }
  if (data.NODE_ENV === 'production' && !data.METRICS_TOKEN) {
    throw new ConfigError('METRICS_TOKEN é obrigatório em produção (mínimo 16 caracteres).');
  }

  return {
    nodeEnv: data.NODE_ENV,
    port: data.PORT,
    host: data.HOST,
    ...(data.ROOM_STORAGE_FILE ? { roomStorageFile: data.ROOM_STORAGE_FILE } : {}),
    corsOrigins,
    // Fixture E2E nunca liga em produção, independente da flag.
    e2eFixturesEnabled: data.NODE_ENV !== 'production' && data.KABEMJUNTO_E2E_FIXTURE === '1',
    ...(data.METRICS_TOKEN ? { metricsToken: data.METRICS_TOKEN } : {}),
    ...(data.QUICKPLAY_WAIT_MS !== undefined ? { quickPlayWaitMs: data.QUICKPLAY_WAIT_MS } : {}),
    turnLimitMs: data.TURN_LIMIT_MS,
    disconnectGraceMs: data.DISCONNECT_GRACE_MS,
    revancheWaitMs: data.REVANCHE_WAIT_MS,
  };
}
