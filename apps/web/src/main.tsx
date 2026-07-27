import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureTelemetry } from '@kabemjunto/shared';
import App from './App';
import { posthogSink } from './services/posthogSink';
import './styles.css';

// Telemetria (Sprint 5 — B17): PostHog Cloud em prod.
// Em DEV, fica off (LGPD-friendly + zero overhead). Configurar
// VITE_POSTHOG_API_KEY em apps/web/.env (ver apps/web/.env.example).
// ADR-005: telemetria é opcional e off-by-default.
if (import.meta.env.PROD) {
  configureTelemetry({
    enabled: true,
    sampleRate: 0.1, // 10% das sessões
    sink: posthogSink,
    context: { modo: 'ONLINE' },
  });
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
