/**
 * Turns the Vite build into a page for a claude.ai artifact. The artifact host wraps the page in
 * its own <html>/<head>/<body>, so dist/artifact.html keeps only the title, the stylesheet, the
 * module script and the mount point. It sits next to index.html, so the relative asset and data
 * paths stay the same; dist/artifact-files.json lists every other file to publish alongside it.
 *
 * The host allows fonts only from the page's own CSS, so the artifact gets a copy of the stylesheet
 * with the fonts inlined, and the font files stay out of the list.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

const DIST = 'dist';
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

const title = /<title>[\s\S]*?<\/title>/.exec(html)?.[0];
const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script type="module"[^>]*><\/script>/g)].map((m) => m[0]);
if (!title || !styles.length || !scripts.length) throw new Error('dist/index.html does not look like a Vite build');

const FONT = /\.woff2?$/;
const inlined = new Set<string>();

/** A copy of a built stylesheet with its fonts as data URIs, next to it; returns the copy's path. */
function inlineFonts(cssPath: string): string {
  const dir = dirname(cssPath);
  const css = readFileSync(cssPath, 'utf8').replace(
    /url\(\s*(['"]?)([^'")]+\.woff2?)\1\s*\)/g,
    (_, _q, url: string) => {
      const file = join(dir, url);
      inlined.add(relative(DIST, file).split(sep).join('/'));
      return `url(data:font/woff2;base64,${readFileSync(file).toString('base64')})`;
    },
  );
  const out = join(dir, `artifact-${basename(cssPath)}`);
  writeFileSync(out, css);
  return out;
}

const artifactStyles = styles.map((tag) => {
  const href = /href="([^"]+)"/.exec(tag)?.[1];
  if (!href) return tag;
  const copy = inlineFonts(join(DIST, href));
  return tag.replace(href, `./${relative(DIST, copy).split(sep).join('/')}`);
});

const page = [title, ...artifactStyles, '<div id="root"></div>', ...scripts, ''].join('\n');
writeFileSync(join(DIST, 'artifact.html'), page);

const originals = new Set(styles.map((tag) => /href="\.?\/?([^"]+)"/.exec(tag)?.[1]));
const files: Record<string, string> = {};
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else {
      const published = relative(DIST, path).split(sep).join('/');
      if (published === 'index.html' || published.startsWith('artifact')) continue;
      // The fonts ride in the artifact's stylesheet, which stands in for the page's own.
      if ((FONT.test(published) && inlined.has(published)) || originals.has(published)) continue;
      files[published] = path.split(sep).join('/');
    }
  }
};
walk(DIST);
writeFileSync(join(DIST, 'artifact-files.json'), JSON.stringify(files, null, 2) + '\n');
const bytes = Object.values(files).reduce((n, f) => n + statSync(f).size, 0);
console.log(
  `dist/artifact.html + ${Object.keys(files).length} files (${(bytes / 1e6).toFixed(1)} MB), ${inlined.size} fonts inlined`,
);
