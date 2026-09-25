import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { game: 'index.html', uiKit: 'ui-kit.html' } } },
});
