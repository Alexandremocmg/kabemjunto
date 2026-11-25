/**
 * PostHog sink (B17 — Sprint 5).
 *
 * Adapter de TelemetrySink que envia eventos pro PostHog via API REST (fetch
 * direto, sem SDK: sem autocapture, cookies nem gravação de sessão).
 *
 * Configuração (via env var):
 * - VITE_POSTHOG_API_KEY: project token (formato phc_...). Sem ela, é no-op.
 * - VITE_POSTHOG_HOST: opcional, default "https://us.i.posthog.com"
 *
 * Privacidade: só passam os eventos e propriedades da lista fechada de
 * `metricas.ts`. O `context` da telemetria (sala, partida) nunca é enviado.
 * Erros de envio são silenciosos: telemetria não pode atrapalhar o jogo.
 */

import type { TelemetrySink } from '@kabemjunto/shared';
import { chaveDeMetricas, limparEvento, metricasPermitidas } from './metricas';

const POSTHOG_HOST =
  (import.meta.env['VITE_POSTHOG_HOST'] as string | undefined) ?? 'https://us.i.posthog.com';

/** Id aleatório que vive só na memória desta página: recarregar gera outro. */
let distinctId: string | undefined;

function lerDistinctId(): string {
  distinctId ??=
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `ph-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return distinctId;
}

export const posthogSink: TelemetrySink = {
  name: 'posthog',
  emit(event) {
    const chave = chaveDeMetricas();
    if (!chave || !metricasPermitidas()) return;
    const propriedades = limparEvento(event.tipo, event.properties);
    if (!propriedades) return;
    try {
      void fetch(`${POSTHOG_HOST}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: chave,
          event: event.tipo,
          distinct_id: lerDistinctId(),
          properties: {
            ...propriedades,
            // Pede ao PostHog que não preencha IP e localização nem crie perfil de pessoa.
            $ip: '0.0.0.0',
            $geoip_disable: true,
            $process_person_profile: false,
          },
          timestamp: new Date(event.timestamp).toISOString(),
        }),
        keepalive: true,
        // Sem cookies e sem o endereço da página.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      }).catch(() => undefined);
    } catch {
      // Envio indisponível: descarta.
    }
  },
};

export default posthogSink;
