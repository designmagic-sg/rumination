import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 5173 },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
