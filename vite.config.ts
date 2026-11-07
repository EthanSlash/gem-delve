import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// assetNames are file paths relative to dist/assets, with either slash style.
export function stampServiceWorker(source: string, assetNames: string[], html: string): string {
  const names = assetNames.map(name => name.replace(/\\/g, '/')).sort();
  const hash = createHash('sha256')
    .update(JSON.stringify(names))
    .update(html)
    .digest('hex')
    .slice(0, 12);
  return source
    .replace('__BUILD_ID__', hash)
    .replace('/* __BUILD_ASSETS__ */ []', JSON.stringify(names.map(name => `assets/${name}`)));
}

export default defineConfig({
  base: './',
  plugins: [{
    name: 'stamp-service-worker',
    apply: 'build',
    async closeBundle() {
      const dist = resolve('dist');
      const assetsDir = resolve(dist, 'assets');
      const [entries, html, source] = await Promise.all([
        readdir(assetsDir, { recursive: true, withFileTypes: true }),
        readFile(resolve(dist, 'index.html'), 'utf8'),
        readFile(resolve(dist, 'sw.js'), 'utf8'),
      ]);
      const assets = entries.filter(entry => entry.isFile())
        .map(entry => relative(assetsDir, resolve(entry.parentPath, entry.name)));
      await writeFile(resolve(dist, 'sw.js'), stampServiceWorker(source, assets, html));
    },
  }],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
