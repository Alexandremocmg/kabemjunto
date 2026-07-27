import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const tunnelHost = process.env['VITE_TUNNEL_HOST'];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    ...(tunnelHost ? { allowedHosts: [tunnelHost] } : {}),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
    },
  },
});
