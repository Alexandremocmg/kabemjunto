import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/types/**'],
      thresholds: {
        // Motor de regras é o coração do jogo — cobertura alta é obrigatória
        // (definido no plano §10.3 DoD Hard).
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
