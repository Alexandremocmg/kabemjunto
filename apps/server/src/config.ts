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
  };
}
