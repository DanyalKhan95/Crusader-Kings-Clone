/**
 * Turns the Vite build into a page for a claude.ai artifact. The artifact host wraps the page in
 * its own <html>/<head>/<body>, so dist/artifact.html keeps only the title, the stylesheet, the
 * module script and the mount point. It sits next to index.html, so the relative asset and data
 * paths stay the same; dist/artifact-files.json lists every other file to publish alongside it.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

const title = /<title>[\s\S]*?<\/title>/.exec(html)?.[0];
const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script type="module"[^>]*><\/script>/g)].map((m) => m[0]);
if (!title || !styles.length || !scripts.length) throw new Error('dist/index.html does not look like a Vite build');

const page = [title, ...styles, '<div id="root"></div>', ...scripts, ''].join('\n');
writeFileSync(join(DIST, 'artifact.html'), page);

const files: Record<string, string> = {};
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else {
      const published = relative(DIST, path).split(sep).join('/');
      if (published === 'index.html' || published.startsWith('artifact')) continue;
      files[published] = path.split(sep).join('/');
    }
  }
};
walk(DIST);
writeFileSync(join(DIST, 'artifact-files.json'), JSON.stringify(files, null, 2) + '\n');
const bytes = Object.values(files).reduce((n, f) => n + statSync(f).size, 0);
console.log(`dist/artifact.html + ${Object.keys(files).length} files (${(bytes / 1e6).toFixed(1)} MB)`);
