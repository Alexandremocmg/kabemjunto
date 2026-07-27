import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureTelemetry, consoleSink } from '@kabemjunto/shared';
import App from './App';
import './styles.css';

// Telemetria (Sprint 4 polish): liga em produção com sample rate conservador.
// Em DEV, fica off (LGPD-friendly + zero overhead no console).
// ADR-005: telemetria é opcional e off-by-default.
if (import.meta.env.PROD) {
  configureTelemetry({
    enabled: true,
    sampleRate: 0.1, // 10% das sessões
    sink: consoleSink, // placeholder até PostHog/Sentry ser integrado (Sprint 4+)
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
