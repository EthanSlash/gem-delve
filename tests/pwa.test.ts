/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import manifestSource from '../public/manifest.webmanifest?raw';
import swSource from '../public/sw.js?raw';

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

  it('never caches non-OK responses', () => {
    expect(swSource).toMatch(/response\.ok/);
    expect(swSource).not.toMatch(/cache\.put\((?![^)]*ok)[^)]*response/);
  });

  it('uses a versioned cache name', () => {
    expect(swSource).toMatch(/CACHE_VERSION/);
    expect(swSource).toMatch(/-v\d+/);
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
    expect(installSource).toMatch(/assetResponse\.ok/);
  });

  it('contains no absolute "/" URLs', () => {
    expect(swSource).not.toMatch(/https?:\/\//);
    expect(swSource).not.toMatch(/['"`]\/(?!\/)/);
  });
});
