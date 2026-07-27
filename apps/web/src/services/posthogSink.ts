/**
 * PostHog sink (B17 — Sprint 5).
 *
 * Adapter de TelemetrySink que envia eventos pra PostHog Cloud via API REST.
 * Usa fetch direto (sem SDK) pra evitar dep extra e problemas de workspace.
 *
 * Endpoint: POST https://us.i.posthog.com/capture/
 * Body: { api_key, event, distinct_id, properties, timestamp }
 *
 * Configuração (via env var):
 * - VITE_POSTHOG_API_KEY: project token (formato phc_...)
 * - VITE_POSTHOG_HOST: opcional, default "https://us.i.posthog.com"
 *
 * Erros de envio são silenciosos (não derrubam o app). Telemetria é
 * best-effort, não pode bloquear UX.
 */

import type { TelemetryEvent, TelemetrySink } from '@kabemjunto/shared';

const POSTHOG_API_KEY = import.meta.env['VITE_POSTHOG_API_KEY'] as string | undefined;
const POSTHOG_HOST =
  (import.meta.env['VITE_POSTHOG_HOST'] as string | undefined) ?? 'https://us.i.posthog.com';

interface PostHogCapturePayload {
  api_key: string;
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

let distinctIdCache: string | undefined;

/**
 * Gera um distinct_id estável por sessão (sessionStorage).
 * Se não tem, gera UUID v4 novo.
 */
function getDistinctId(): string {
  if (distinctIdCache) return distinctIdCache;
  const STORAGE_KEY = 'kabemjunto-posthog-distinct-id';
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    distinctIdCache = stored;
    return stored;
  }
  const novo =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `ph-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(STORAGE_KEY, novo);
  distinctIdCache = novo;
  return novo;
}

/**
 * Converte TelemetryEvent em payload PostHog.
 * - `tipo` vira `event` (nome do evento)
 * - `properties` é flatten direto
 * - `context` vai pra `$set` (properties globais do user)
 * - `timestamp` vira ISO string
 */
function toPostHogPayload(event: TelemetryEvent): PostHogCapturePayload {
  const baseProps: Record<string, unknown> = {
    ...event.properties,
  };

  // Context vira propriedades globais (prefixadas com $)
  if (event.context) {
    for (const [key, value] of Object.entries(event.context)) {
      if (value !== undefined) {
        baseProps[`$set` === key ? key : key] = value;
      }
    }
  }

  return {
    api_key: POSTHOG_API_KEY!,
    event: event.tipo,
    distinct_id: getDistinctId(),
    properties: baseProps,
    timestamp: new Date(event.timestamp).toISOString(),
  };
}

/**
 * Sink de telemetria que envia eventos pro PostHog Cloud.
 *
 * - Se `VITE_POSTHOG_API_KEY` não estiver definida, sink é no-op silencioso.
 * - Erros de rede são logados em console.error mas não interrompem o app.
 * - `keepalive: true` permite que o request sobreviva ao `unload` (importante pra reconexão/logout).
 */
export const posthogSink: TelemetrySink = {
  name: 'posthog',
  emit(event) {
    if (!POSTHOG_API_KEY) {
      // Modo dev: API key não configurada, no-op silencioso
      return;
    }
    const payload = toPostHogPayload(event);
    try {
      const result = fetch(`${POSTHOG_HOST}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error('[posthogSink] erro ao enviar evento:', err);
        });
      }
    } catch (err) {
      console.error('[posthogSink] erro síncrono:', err);
    }
  },
};

export default posthogSink;
