export type SocketActionCategory = 'sala' | 'chat' | 'jogo';

interface WindowLimit {
  /** Máximo de ações permitidas dentro da janela. */
  capacity: number;
  windowMs: number;
}

/** Limites por categoria de evento (critério de pronto B24). */
const LIMITS: Record<SocketActionCategory, WindowLimit> = {
  sala: { capacity: 10, windowMs: 60_000 },
  chat: { capacity: 10, windowMs: 10_000 },
  jogo: { capacity: 30, windowMs: 10_000 },
};

interface Window {
  count: number;
  windowStartedAt: number;
}

/**
 * Limitador de taxa por socket + categoria, em janela fixa. Cada socket tem
 * um contador independente por categoria; a janela reseta quando expira.
 * Estado é só em memória — não sobrevive a restart (aceitável: é proteção
 * de runtime, não persistência de segurança de longo prazo).
 */
export class SocketRateLimiter {
  private readonly windows = new Map<string, Window>();

  allow(socketId: string, category: SocketActionCategory, now = Date.now()): boolean {
    const key = `${socketId}:${category}`;
    const limit = LIMITS[category];
    const current = this.windows.get(key);

    if (!current || now - current.windowStartedAt >= limit.windowMs) {
      this.windows.set(key, { count: 1, windowStartedAt: now });
      return true;
    }

    if (current.count >= limit.capacity) return false;
    current.count += 1;
    return true;
  }

  /** Libera o estado de um socket desconectado, evitando vazamento de memória. */
  releaseSocket(socketId: string): void {
    for (const key of this.windows.keys()) {
      if (key.startsWith(`${socketId}:`)) this.windows.delete(key);
    }
  }
}

/**
 * Guarda de tipo mínima pra payloads de socket não confiáveis. Evita que um
 * campo com tipo inesperado (ex.: número onde se espera string) derrube o
 * handler antes de chegar no `RoomStore`.
 */
export function isNonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}
