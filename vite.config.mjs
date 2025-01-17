import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    format: 'es'
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
});
