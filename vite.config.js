import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites at /REPO_NAME/.
  // Override with VITE_BASE_PATH=/ for a custom domain or user/org site.
  base: '/VAMP/',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
