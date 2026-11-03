import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read only the API port; provider keys are never part of client configuration.
  const port = Number(loadEnv(mode, process.cwd(), 'PORT').PORT ?? 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API PORT.');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 4311,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${port}` },
    },
  };
});
