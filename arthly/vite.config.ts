/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('lightweight-charts') || id.includes('fancy-canvas')) return 'charts';
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('/src/fixtures/')) return 'demo-data';
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
