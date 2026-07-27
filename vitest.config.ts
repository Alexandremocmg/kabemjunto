import { defineConfig } from 'vitest/config';

/**
 * Vitest config raiz (Sprint 5 — M16).
 *
 * Roda testes unitários e de componentes. **Exclui `e2e/`** que é domínio
 * do Playwright (B18).
 */
export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '**/.{playwright,output}*/**'],
    environment: 'node',
  },
});
