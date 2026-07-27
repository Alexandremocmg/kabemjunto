import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
      <h1>🃏 Kabemjunto</h1>
      <p>Sprint 0 — bootstrap ok. Aguardando S0-2 (lint) e S0-3 (CI) para começar o gameplay.</p>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
