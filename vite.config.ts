import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './packages/shared/src'),
      '@assets': path.resolve(__dirname, './assets'),
      '@src': path.resolve(__dirname, './src'),
    },
  },
});
