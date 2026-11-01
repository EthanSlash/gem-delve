import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export function stampServiceWorker(source: string, assetNames: string[], html: string): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([...assetNames].sort()))
    .update(html)
    .digest('hex')
    .slice(0, 12);
  return source.replace('__BUILD_ID__', hash);
}

export default defineConfig({
  base: './',
  plugins: [{
    name: 'stamp-service-worker',
    apply: 'build',
    async closeBundle() {
      const dist = resolve('dist');
      const [assets, html, source] = await Promise.all([
        readdir(resolve(dist, 'assets'), { recursive: true }),
        readFile(resolve(dist, 'index.html'), 'utf8'),
        readFile(resolve(dist, 'sw.js'), 'utf8'),
      ]);
      await writeFile(resolve(dist, 'sw.js'), stampServiceWorker(source, assets, html));
    },
  }],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
