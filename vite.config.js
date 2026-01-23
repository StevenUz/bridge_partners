import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  appType: 'spa',
  root: '.',
  base: '/',
  server: {
    port: 5000
  },
  preview: {
    port: 5000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
