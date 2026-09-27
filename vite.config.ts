import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** The build's version and commit, for bug reports: "0.1.0+a60bb65". */
function buildId(): string {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  try {
    return `${version}+${execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()}`;
  } catch {
    return version;
  }
}

/** The web demo ships no art: its index is empty, and the game draws its own look throughout. */
function withoutArt(): Plugin {
  let art = '';
  return {
    name: 'demo-without-art',
    apply: 'build',
    configResolved(config) {
      art = resolve(config.root, config.build.outDir, 'art');
    },
    closeBundle() {
      rmSync(art, { recursive: true, force: true });
      mkdirSync(art, { recursive: true });
      writeFileSync(resolve(art, 'index.json'), `${JSON.stringify({ version: 1, assets: [] }, null, 1)}\n`);
    },
  };
}

// `vite build --mode demo` (npm run build:demo) makes the free web demo: see src/ui/demo.ts.
export default defineConfig(({ mode }) => ({
  // Relative base so the build works on GitHub Pages sub-paths and as a claude.ai artifact.
  base: './',
  plugins: mode === 'demo' ? [react(), withoutArt()] : [react()],
  define: {
    __BUILD__: JSON.stringify(buildId()),
    __DEMO__: JSON.stringify(mode === 'demo'),
  },
  build: {
    target: 'es2022',
    // Fonts are files, fetched as the page needs them; tools/artifact inlines them for the claude.ai
    // artifact, whose host only allows fonts from its own CSS.
    chunkSizeWarningLimit: 2500,
  },
}));
