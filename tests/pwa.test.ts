/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import manifestSource from '../public/manifest.webmanifest?raw';
import swSource from '../public/sw.js?raw';
import { stampServiceWorker } from '../vite.config';

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface Manifest {
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
}

const isRelativeUrl = (url: string): boolean =>
  !url.startsWith('/') && !url.includes('://');

describe('PWA manifest', () => {
  const manifest = JSON.parse(manifestSource) as Manifest;

  it('declares the app identity in Traditional Chinese with standalone portrait display', () => {
    expect(manifest.name).toBe('寶石地城');
    expect(manifest.short_name).toBe('寶石地城');
    expect(manifest.lang).toBe('zh-Hant');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait');
  });

  it('uses relative start_url and scope', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(isRelativeUrl(manifest.start_url)).toBe(true);
    expect(isRelativeUrl(manifest.scope)).toBe(true);
  });

  it('uses the dark theme colors', () => {
    expect(manifest.background_color).toBe('#0d0b16');
    expect(manifest.theme_color).toBe('#0d0b16');
  });

  it('declares 192 and 512 maskable PNG icons', () => {
    expect(manifest.icons).toHaveLength(2);
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(icon.purpose).toContain('any');
      expect(icon.purpose).toContain('maskable');
      expect(isRelativeUrl(icon.src)).toBe(true);
    }
    expect(manifest.icons.map((icon) => icon.src)).toContain('icons/icon-192.png');
    expect(manifest.icons.map((icon) => icon.src)).toContain('icons/icon-512.png');
  });

  it('contains no absolute URLs in the raw file', () => {
    expect(manifestSource).not.toMatch(/https?:\/\//);
    expect(manifestSource).not.toMatch(/"\/(?!\/)/);
  });
});

describe('service worker', () => {
  it('installs a precache, skips waiting, and activates by claiming clients', () => {
    expect(swSource).toContain("addEventListener('install'");
    expect(swSource).toContain("addEventListener('activate'");
    expect(swSource).toContain('skipWaiting');
    expect(swSource).toContain('clients.claim');
    expect(swSource).toContain('caches.delete');
  });

  it('fetch handles GET same-origin requests only', () => {
    expect(swSource).toContain("addEventListener('fetch'");
    expect(swSource).toMatch(/method/);
    expect(swSource).toContain("'GET'");
    expect(swSource).toContain('location.origin');
  });

  it('fetches every install resource with reload and checks it before writing', () => {
    const installSource = swSource.split("addEventListener('install'")[1]!.split("addEventListener('activate'")[0]!;
    expect(installSource).toContain("fetch('./', { cache: 'reload' })");
    expect(installSource).toContain("fetch(url, { cache: 'reload' })");
    expect(installSource.indexOf('Promise.all')).toBeLessThan(installSource.indexOf("cache.put('./'"));
    expect(installSource).toMatch(/pageResponse\.ok/);
    expect(installSource).toMatch(/response\.ok/);
    expect(installSource).toContain('caches.delete(CACHE_VERSION)');
  });

  it('uses a build-stamped cache name and deletes only older game caches', () => {
    expect(swSource).toContain("const CACHE_VERSION = 'gem-delve-__BUILD_ID__'");
    expect(swSource).toContain("key.startsWith('gem-delve-') && key !== CACHE_VERSION");
  });

  it('precaches hashed assets scripts referenced on the page during install', () => {
    const installStart = swSource.indexOf("addEventListener('install'");
    const activateStart = swSource.indexOf("addEventListener('activate'");
    const installSource = swSource.slice(installStart, activateStart);
    expect(swSource).toContain("'assets/'");
    expect(swSource).toContain("'./assets/'");
    expect(swSource).toContain('registration.scope');
    expect(swSource).toMatch(/new URL\(/);
    expect(installSource).toContain('collectAssetUrls');
    expect(installSource).toMatch(/pageResponse\.ok/);
    expect(installSource).toContain('...PRECACHE_URLS');
  });

  it('uses network-first navigation and cache-first assets without runtime writes', () => {
    const fetchSource = swSource.split("addEventListener('fetch'")[1]!;
    expect(fetchSource).toContain('fetch(request)');
    expect(fetchSource).toContain("caches.match('./', { ignoreVary: true })");
    expect(fetchSource).toContain('caches.match(request, { ignoreVary: true })');
    expect(fetchSource).not.toContain('cache.put');
    expect(fetchSource).not.toContain('caches.open');
  });

  it('contains no absolute "/" URLs', () => {
    expect(swSource).not.toMatch(/https?:\/\//);
    expect(swSource).not.toMatch(/['"`]\/(?!\/)/);
  });
});

describe('service worker build stamp', () => {
  it('replaces the placeholder deterministically and changes with assets or HTML', () => {
    const source = "const CACHE_VERSION = 'gem-delve-__BUILD_ID__';";
    const stamped = stampServiceWorker(source, ['b.js', 'a.css'], '<html>one</html>');
    expect(stamped).toMatch(/gem-delve-[0-9a-f]{12}/);
    expect(stamped).not.toContain('__BUILD_ID__');
    expect(stamped).toBe(stampServiceWorker(source, ['a.css', 'b.js'], '<html>one</html>'));
    expect(stamped).not.toBe(stampServiceWorker(source, ['b.js', 'c.css'], '<html>one</html>'));
    expect(stamped).not.toBe(stampServiceWorker(source, ['b.js', 'a.css'], '<html>two</html>'));
    expect(source).toContain('__BUILD_ID__');
  });
});
