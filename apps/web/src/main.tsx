import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureTelemetry } from '@kabemjunto/shared';
import App from './App';
import { chaveDeMetricas, registrarRetorno } from './services/metricas';
import { posthogSink } from './services/posthogSink';
import './styles.css';
import './styles/index.css';

// Métricas anônimas (docs/METRICAS.md): desligadas em DEV e sem VITE_POSTHOG_API_KEY.
// Sem amostragem: sortear evento a evento estragaria as taxas (início x fim de partida).
if (import.meta.env.PROD && chaveDeMetricas()) {
  configureTelemetry({ enabled: true, sampleRate: 1, sink: posthogSink });
  registrarRetorno();
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch((error: unknown) =>
      console.warn('Não foi possível preparar o Kabemjunto offline.', error),
    );
}
