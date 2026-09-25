import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths and as a claude.ai artifact.
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    // Fonts are inlined as data URIs: the artifact host only allows fonts from its own CSS.
    assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? true : undefined),
    chunkSizeWarningLimit: 2500,
  },
});
