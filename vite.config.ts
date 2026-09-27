import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
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

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths and as a claude.ai artifact.
  base: './',
  plugins: [react()],
  define: {
    __BUILD__: JSON.stringify(buildId()),
  },
  build: {
    target: 'es2022',
    // Fonts are inlined as data URIs: the artifact host only allows fonts from its own CSS.
    assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? true : undefined),
    chunkSizeWarningLimit: 2500,
  },
});
