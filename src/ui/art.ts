import type { Cell, GemColor, SpecialKind } from '../types';
import type { Rect } from './model';

type Point = [number, number];
type Palette = { light: string; mid: string; dark: string; deep: string; accent?: string };

const palettes: Record<GemColor, Palette> = {
  red: { light: '#ff9a8a', mid: '#f0504a', dark: '#c22436', deep: '#8e1428' },
  purple: { light: '#dcc8ff', mid: '#a06cf0', dark: '#6d3ccc', deep: '#4b287e', accent: '#b48cf6' },
  green: { light: '#b4f5cc', mid: '#4fd08a', dark: '#1f9a62', deep: '#127048' },
  yellow: { light: '#fff0a8', mid: '#f7c23c', dark: '#d98a14', deep: '#955018' },
};

// A key includes the actual raster dimensions, not only the CSS dimensions.
export function cacheKey(kind: string, width: number, height: number, dpr: number): string {
  return `${kind}:${Math.max(1, Math.round(width * dpr))}x${Math.max(1, Math.round(height * dpr))}@${width}x${height}:${dpr}`;
}

// Each sprite type retains its two most recently used size/DPR variants.
export function keepRecentSizes<T>(cache: Map<string, T>, key: string, value: T): Map<string, T> {
  const next = new Map(cache);
  next.delete(key);
  next.set(key, value);
  if (next.size > 2) next.delete(next.keys().next().value!);
  return next;
}

const sprites = new Map<string, Map<string, HTMLCanvasElement>>();
const backgrounds = new Map<string, HTMLCanvasElement>();

// Rounds a transform scale up to the next quarter step. Animated transforms, such as the
// enemy's breathing, change the raw scale every frame; without steps every frame would miss
// the sprite cache and re-raster. Rounding up keeps sprites at least as sharp as needed.
export function rasterScale(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.ceil(raw * 4 - 1e-6) / 4);
}

function scale(ctx: CanvasRenderingContext2D): number {
  const transform = ctx.getTransform();
  return rasterScale(Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d)));
}

function raster(width: number, height: number, dpr: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  paint(ctx);
  return canvas;
}

function cachedSprite(kind: string, width: number, height: number, dpr: number,
  paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const key = cacheKey(kind, width, height, dpr);
  const variants = sprites.get(kind) ?? new Map<string, HTMLCanvasElement>();
  const image = variants.get(key) ?? raster(width, height, dpr, paint);
  sprites.set(kind, keepRecentSizes(variants, key, image));
  return image;
}

function polygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath();
}

function outline(color: GemColor, r: number): Point[] {
  if (color === 'red') return [[-r * .68, -r], [r * .68, -r], [r, -r * .68], [r, r * .68],
    [r * .68, r], [-r * .68, r], [-r, r * .68], [-r, -r * .68]];
  if (color === 'purple') return [[0, -r * 1.2], [r, 0], [0, r * 1.2], [-r, 0]];
  if (color === 'yellow') return [[0, -r * 1.17], [r * 1.1, r * .9], [-r * 1.1, r * .9]];
  return Array.from({ length: 12 }, (_, i): Point => {
    const a = (i / 12 - .25) * Math.PI * 2;
    const radius = r * (i % 2 ? .965 : 1);
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
}

function jewel(ctx: CanvasRenderingContext2D, color: GemColor, size: number) {
  const r = size * .31;
  const outer = outline(color, r);
  const inner = outer.map(([x, y]): Point => [x * .56, y * .56]);
  const palette = palettes[color];
  ctx.translate(size / 2, size / 2);
  const shadow = ctx.createRadialGradient(0, r * .7, 0, 0, r * .7, r * 1.3);
  shadow.addColorStop(0, 'rgba(0,0,0,.65)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath(); ctx.ellipse(0, r * .7, r * 1.3, r * .6, 0, 0, Math.PI * 2); ctx.fill();
  polygon(ctx, outer);
  ctx.fillStyle = palette.deep;
  ctx.fill();
  ctx.strokeStyle = '#100d1c';
  ctx.lineWidth = Math.max(.7, size * .022);
  ctx.stroke();

  for (let i = 0; i < outer.length; i++) {
    const next = (i + 1) % outer.length;
    polygon(ctx, [outer[i]!, outer[next]!, inner[next]!, inner[i]!]);
    const y = (outer[i]![1] + outer[next]![1]) / 2;
    const x = (outer[i]![0] + outer[next]![0]) / 2;
    ctx.fillStyle = y < -r * .3 ? (x < 0 ? palette.light : (palette.accent ?? palette.mid))
      : y > r * .25 ? palette.deep : (x < 0 ? palette.mid : palette.dark);
    ctx.fill();
  }

  // Trace the upper cuts without connecting nonadjacent facets across the gem.
  ctx.beginPath();
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]!, b = outer[(i + 1) % outer.length]!;
    if (a[1] <= 0 && b[1] <= 0) {
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
  }
  ctx.strokeStyle = palette.light;
  ctx.lineWidth = Math.max(.7, size * .016);
  ctx.stroke();

  const table = ctx.createLinearGradient(-r * .5, -r * .6, r * .55, r * .65);
  table.addColorStop(0, palette.light);
  table.addColorStop(.46, palette.mid);
  table.addColorStop(1, palette.dark);
  polygon(ctx, inner);
  ctx.fillStyle = table;
  ctx.fill();
  ctx.strokeStyle = palette.deep;
  ctx.lineWidth = Math.max(.5, size * .012);
  ctx.stroke();

  ctx.save();
  polygon(ctx, inner); ctx.clip();
  const sheen = ctx.createLinearGradient(-r * .5, -r * .55, r * .5, r * .6);
  sheen.addColorStop(0, 'rgba(255,255,255,.42)');
  sheen.addColorStop(.38, 'rgba(255,255,255,.06)');
  sheen.addColorStop(.4, 'rgba(255,255,255,0)');
  sheen.addColorStop(.8, 'rgba(255,255,255,.1)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen; ctx.fillRect(-r, -r * 1.2, r * 2, r * 2.4);
  ctx.restore();

  // A single hard-edged reflection follows the upper left cut rather than a blurry dot.
  polygon(ctx, [[-r * .49, -r * .41], [-r * .18, -r * .68], [r * .05, -r * .57], [-r * .2, -r * .35]]);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fill();
  polygon(ctx, [[r * .16, r * .39], [r * .47, r * .19], [r * .35, r * .49]]);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fill();
}

function rock(ctx: CanvasRenderingContext2D, size: number) {
  const r = size * .32;
  ctx.translate(size / 2, size / 2);
  const edge: Point[] = [[-1.02, -.53], [-.72, -.96], [-.16, -.87], [.16, -1.08], [.79, -.77],
    [1.02, -.29], [.81, .17], [.96, .69], [.36, .93], [-.23, .83], [-.78, .94], [-1.06, .3]]
    .map(([x, y]): Point => [x! * r, y! * r]);
  polygon(ctx, edge);
  ctx.fillStyle = '#40434d'; ctx.fill();
  ctx.strokeStyle = '#181a23'; ctx.lineWidth = Math.max(.8, size * .025); ctx.stroke();
  polygon(ctx, [edge[0]!, edge[1]!, edge[2]!, [-r * .45, -r * .2], [-r * .72, r * .22]]);
  ctx.fillStyle = '#777b83'; ctx.fill();
  polygon(ctx, [edge[2]!, edge[3]!, edge[4]!, [r * .42, -r * .13], [-r * .45, -r * .2]]);
  ctx.fillStyle = '#5c606b'; ctx.fill();
  polygon(ctx, [edge[5]!, edge[6]!, edge[7]!, edge[8]!, [r * .38, r * .38]]);
  ctx.fillStyle = '#292d37'; ctx.fill();
  polygon(ctx, [edge[9]!, edge[10]!, edge[11]!, [-r * .72, r * .22], [-r * .24, r * .48]]);
  ctx.fillStyle = '#343842'; ctx.fill();

  // Skull and jaw are drawn as shapes, including eye sockets, nose and teeth.
  ctx.beginPath();
  ctx.moveTo(-r * .35, r * .19);
  ctx.bezierCurveTo(-r * .65, -r * .15, -r * .4, -r * .48, 0, -r * .49);
  ctx.bezierCurveTo(r * .47, -r * .48, r * .63, -r * .1, r * .35, r * .19);
  ctx.lineTo(r * .25, r * .46); ctx.lineTo(-r * .25, r * .46); ctx.closePath();
  ctx.fillStyle = '#c2c1bd'; ctx.fill();
  ctx.fillStyle = '#282a32';
  ctx.beginPath(); ctx.ellipse(-r * .21, -r * .02, r * .15, r * .18, -.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * .21, -r * .02, r * .15, r * .18, .2, 0, Math.PI * 2); ctx.fill();
  polygon(ctx, [[0, r * .09], [-r * .085, r * .22], [r * .085, r * .22]]); ctx.fill();
  ctx.strokeStyle = '#51535b'; ctx.lineWidth = Math.max(.55, size * .014);
  for (const x of [-.12, 0, .12]) {
    ctx.beginPath(); ctx.moveTo(r * x, r * .3); ctx.lineTo(r * x, r * .46); ctx.stroke();
  }
}

// Drawn on top of a jewel, with the context already centered on it.
function specialMark(ctx: CanvasRenderingContext2D, special: SpecialKind, size: number) {
  const r = size * .31;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(18,12,28,.9)';
  ctx.lineWidth = Math.max(1, size * .022);
  if (special === 'row' || special === 'col') {
    if (special === 'col') ctx.rotate(Math.PI / 2);
    // A double-headed arrow along the direction the blast travels.
    polygon(ctx, [[-r * 1.12, 0], [-r * .68, -r * .34], [-r * .68, -r * .12], [r * .68, -r * .12], [r * .68, -r * .34],
      [r * 1.12, 0], [r * .68, r * .34], [r * .68, r * .12], [-r * .68, r * .12], [-r * .68, r * .34]]);
    ctx.fillStyle = 'rgba(255,252,240,.95)'; ctx.fill(); ctx.stroke();
  } else if (special === 'bomb') {
    ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,226,150,.95)'; ctx.lineWidth = Math.max(1.5, size * .055); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * .42, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1526'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,205,.95)'; ctx.lineWidth = Math.max(1, size * .025); ctx.stroke();
    polygon(ctx, [[r * .2, -r * .62], [r * .32, -r * .36], [r * .58, -r * .3], [r * .36, -r * .14], [r * .42, r * .12],
      [r * .2, -r * .02], [-r * .02, r * .12], [r * .06, -r * .14], [-r * .16, -r * .3], [r * .1, -r * .36]]);
    ctx.fillStyle = '#ffd36b'; ctx.fill();
  } else {
    const ring = ctx.createLinearGradient(-r, -r, r, r);
    for (const [stop, color] of [[0, '#ff8a80'], [.33, '#ffe07a'], [.66, '#86e3ad'], [1, '#b49cff']] as const) ring.addColorStop(stop, color);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
    ctx.strokeStyle = ring; ctx.lineWidth = Math.max(1.5, size * .06); ctx.stroke();
    polygon(ctx, [[0, -r * .82], [r * .2, -r * .2], [r * .82, 0], [r * .2, r * .2], [0, r * .82], [-r * .2, r * .2],
      [-r * .82, 0], [-r * .2, -r * .2]]);
    ctx.fillStyle = '#fffdf5'; ctx.fill();
    ctx.strokeStyle = 'rgba(18,12,28,.9)'; ctx.lineWidth = Math.max(1, size * .022); ctx.stroke();
  }
  ctx.restore();
}

// Hard junk: the same rock, tinted cold and bound with two iron bands.
function boundRock(ctx: CanvasRenderingContext2D, size: number) {
  rock(ctx, size);
  const r = size * .32;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(70,105,160,.32)';
  ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
  ctx.globalCompositeOperation = 'source-over';
  for (const y of [-r * .7, r * .66]) {
    ctx.beginPath(); ctx.moveTo(-r * .98, y); ctx.lineTo(r * .98, y);
    ctx.strokeStyle = '#15171f'; ctx.lineWidth = Math.max(2, size * .075); ctx.stroke();
    ctx.strokeStyle = '#9aa6bd'; ctx.lineWidth = Math.max(.8, size * .022); ctx.stroke();
    for (const x of [-r * .7, r * .7]) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, size * .03), 0, Math.PI * 2);
      ctx.fillStyle = '#d7deea'; ctx.fill();
    }
  }
}

export function spriteKind(cell: Cell): string {
  if (cell.kind === 'junk') return cell.hard ? 'junk:hard' : 'junk';
  return cell.special ? `${cell.color}:${cell.special}` : cell.color;
}

export function drawSprite(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, size: number) {
  const dpr = scale(ctx);
  const sprite = cachedSprite(spriteKind(cell), size, size, dpr, surface => {
    if (cell.kind === 'junk') {
      if (cell.hard) boundRock(surface, size); else rock(surface, size);
    } else {
      jewel(surface, cell.color, size);
      if (cell.special) specialMark(surface, cell.special, size);
    }
  });
  ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
}

function shape(ctx: CanvasRenderingContext2D, points: Point[], fill: string, stroke = '#171322') {
  polygon(ctx, points); ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, radius = 3) {
  ctx.beginPath(); ctx.ellipse(x, y, radius, radius * 1.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff2cb'; ctx.fill();
  ctx.beginPath(); ctx.arc(x + 1, y + 1, radius * .48, 0, Math.PI * 2);
  ctx.fillStyle = '#281a35'; ctx.fill();
}

function creature(ctx: CanvasRenderingContext2D, id: string) {
  ctx.lineJoin = 'round';
  if (id === 'caveBat') {
    shape(ctx, [[48,42],[32,23],[21,31],[5,20],[9,52],[22,45],[34,57],[48,52]], '#514072');
    shape(ctx, [[52,42],[68,23],[79,31],[95,20],[91,52],[78,45],[66,57],[52,52]], '#514072');
    shape(ctx, [[18,34],[35,39],[45,49],[31,46]], '#7d639a');
    shape(ctx, [[82,34],[65,39],[55,49],[69,46]], '#7d639a');
    shape(ctx, [[37,43],[34,23],[45,32],[50,37],[55,32],[66,23],[63,43],[60,66],[50,73],[40,66]], '#32283e');
    eye(ctx, 43, 48); eye(ctx, 57, 48);
    shape(ctx, [[46,61],[49,69],[51,61]], '#e9d9b9'); shape(ctx, [[53,61],[56,69],[58,61]], '#e9d9b9');
  } else if (id === 'skeleton') {
    shape(ctx, [[22,80],[31,49],[39,50],[50,61],[61,50],[70,49],[78,80],[64,78],[59,70],[41,70],[36,78]], '#696079');
    shape(ctx, [[38,57],[42,75],[58,75],[62,57],[50,60]], '#c6baa8');
    for (const y of [63,69]) { shape(ctx, [[40,y],[50,y+2],[60,y]], '#918b89'); }
    shape(ctx, [[29,25],[35,13],[65,13],[71,25],[68,48],[60,55],[40,55],[32,48]], '#d3c6ad');
    shape(ctx, [[33,25],[48,19],[64,23],[67,30],[36,31]], '#f1debf');
    shape(ctx, [[36,35],[45,33],[46,42],[39,44]], '#302538');
    shape(ctx, [[54,33],[64,35],[61,44],[54,42]], '#302538');
    shape(ctx, [[50,42],[46,49],[54,49]], '#493648');
    for (const x of [41,47,53,59]) shape(ctx, [[x,50],[x+3,50],[x+3,56],[x,56]], '#eee0c5');
  } else if (id === 'gargoyle') {
    shape(ctx, [[38,54],[5,25],[13,69],[32,73],[42,67]], '#595568');
    shape(ctx, [[62,54],[95,25],[87,69],[68,73],[58,67]], '#595568');
    shape(ctx, [[13,39],[36,60],[25,57]], '#858192');
    shape(ctx, [[87,39],[64,60],[75,57]], '#858192');
    shape(ctx, [[24,71],[28,44],[38,32],[32,12],[45,26],[55,26],[68,12],[62,32],[72,44],[76,71],[63,82],[37,82]], '#666270');
    shape(ctx, [[31,49],[44,36],[56,36],[69,49],[60,65],[50,59],[40,65]], '#938b91');
    shape(ctx, [[42,70],[50,65],[58,70],[65,80],[35,80]], '#464351');
    eye(ctx, 41, 48, 4); eye(ctx, 59, 48, 4);
    shape(ctx, [[47,59],[50,65],[53,59]], '#38303d');
  } else {
    const king = id === 'slimeKing';
    if (king) {
      shape(ctx, [[26,37],[21,10],[37,22],[50,5],[63,22],[79,10],[74,37]], '#bd8241', '#4b2a2a');
      shape(ctx, [[30,31],[70,31],[72,39],[28,39]], '#f0c377', '#6f482a');
      shape(ctx, [[45,26],[50,17],[55,26],[50,33]], '#bd4e69');
    }
    ctx.beginPath();
    ctx.moveTo(12,75); ctx.bezierCurveTo(6,56,19,35,37,34);
    ctx.bezierCurveTo(52,king ? 27 : 24,76,34,85,56);
    ctx.quadraticCurveTo(94,79,83,83); ctx.quadraticCurveTo(50,92,17,83); ctx.closePath();
    ctx.fillStyle = king ? '#7c49ab' : '#4aa88f'; ctx.fill();
    ctx.strokeStyle = '#201d31'; ctx.lineWidth = 3; ctx.stroke();
    shape(ctx, [[19,62],[29,43],[48,37],[40,64],[22,74]], king ? '#aa76ca' : '#8addb7', 'transparent');
    shape(ctx, [[65,40],[82,58],[85,76],[69,78],[76,60]], king ? '#513c83' : '#32766d', 'transparent');
    eye(ctx, 39, 61, king ? 5 : 4); eye(ctx, 62, 61, king ? 5 : 4);
    ctx.beginPath(); ctx.arc(51, 70, 5, 0, Math.PI); ctx.strokeStyle = '#30243c'; ctx.lineWidth = 2; ctx.stroke();
  }
}

// Maps image files to enemy ids by file name, e.g. '../assets/enemies/caveBat.webp' -> 'caveBat'.
// When one enemy has both a .png and a .webp, the .webp wins.
export function enemyImageUrls(files: Record<string, string>): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const path of Object.keys(files).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const match = /([^/\\]+)\.(png|webp)$/i.exec(path);
    if (match) urls[match[1]!] = files[path]!;
  }
  return urls;
}

// Largest rect with the image's aspect ratio that fits in the box, centered.
export function fitContain(imageW: number, imageH: number, boxW: number, boxH: number): Rect {
  if (imageW <= 0 || imageH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const s = Math.min(boxW / imageW, boxH / imageH);
  const w = imageW * s, h = imageH * s;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

// Drop files named after an enemy id into src/assets/enemies/ to replace its drawn art.
export const ENEMY_IMAGE_URLS = enemyImageUrls(import.meta.glob('../assets/enemies/*.{png,webp}',
  { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
const enemyImages = new Map<string, HTMLImageElement>();

// Resolves once every enemy image has loaded or failed. A failed image keeps the drawn art.
export function loadEnemyArt(): Promise<void> {
  return Promise.all(Object.entries(ENEMY_IMAGE_URLS).map(async ([id, url]) => {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (image.naturalWidth > 0) enemyImages.set(id, image);
    } catch { /* keep the drawn fallback */ }
  })).then(() => undefined);
}

export function drawEnemy(ctx: CanvasRenderingContext2D, id: string, rect: Rect, flash: number) {
  const dpr = scale(ctx);
  const image = enemyImages.get(id);
  const kind = image ? `enemy:${id}:image` : `enemy:${id}`;
  const sprite = cachedSprite(kind, rect.w, rect.h, dpr, surface => {
    if (image) {
      const fit = fitContain(image.naturalWidth, image.naturalHeight, rect.w, rect.h);
      surface.imageSmoothingQuality = 'high';
      surface.drawImage(image, fit.x, fit.y, fit.w, fit.h);
      return;
    }
    surface.scale(rect.w / 100, rect.h / 100);
    creature(surface, id);
  });
  ctx.drawImage(sprite, rect.x, rect.y, rect.w, rect.h);
  if (flash > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, Math.max(0, flash));
    // Tint only opaque creature pixels, leaving the sprite's transparent margin untouched.
    const tinted = cachedSprite(`${kind}:white`, rect.w, rect.h, dpr, surface => {
      surface.drawImage(sprite, 0, 0, rect.w, rect.h);
      surface.globalCompositeOperation = 'source-in';
      surface.fillStyle = '#fff'; surface.fillRect(0, 0, rect.w, rect.h);
    });
    ctx.drawImage(tinted, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }
}

export function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const dpr = scale(ctx);
  const key = cacheKey('wall', width, height, dpr);
  let image = backgrounds.get(key);
  if (!image) {
    image = raster(width, height, dpr, surface => {
      const glow = surface.createRadialGradient(width * .5, height * .46, 0,
        width * .5, height * .46, Math.max(width, height) * .72);
      glow.addColorStop(0, '#2a2340'); glow.addColorStop(1, '#0d0b16');
      surface.fillStyle = glow; surface.fillRect(0, 0, width, height);
      const blockW = 114, blockH = 72;
      surface.lineWidth = 1;
      for (let row = 0, y = 0; y < height + blockH; row++, y += blockH) {
        const shift = row % 2 ? -blockW / 2 : 0;
        for (let col = -1; shift + col * blockW < width + blockW; col++) {
          const x = shift + col * blockW;
          surface.strokeStyle = 'rgba(142,125,171,.075)';
          surface.beginPath(); surface.moveTo(x + 2, y + 1);
          surface.lineTo(x + blockW - 2, y + 1); surface.lineTo(x + blockW - 2, y + blockH - 2);
          surface.stroke();
          if ((row * 7 + col * 3) % 5 === 0) {
            surface.fillStyle = 'rgba(164,146,194,.026)';
            polygon(surface, [[x + 10, y + 11], [x + 48, y + 8], [x + 30, y + 27]]);
            surface.fill();
          }
        }
      }
    });
    backgrounds.clear();
    backgrounds.set(key, image);
  }
  ctx.drawImage(image, 0, 0, width, height);
}

export function drawBoardFrame(ctx: CanvasRenderingContext2D, board: Rect) {
  const w = board.w + 10, h = board.h + 10;
  const image = cachedSprite('board-frame', w, h, scale(ctx), surface => {
    const metal = surface.createLinearGradient(0, 0, w, h);
    metal.addColorStop(0, '#e4c28a'); metal.addColorStop(.18, '#8a6445');
    metal.addColorStop(.47, '#3c3039'); metal.addColorStop(.75, '#8c6745');
    metal.addColorStop(1, '#d3a768');
    surface.beginPath(); surface.roundRect(.75, .75, w - 1.5, h - 1.5, 13);
    surface.fillStyle = metal; surface.fill();
    surface.strokeStyle = '#edcf94'; surface.lineWidth = 1; surface.stroke();
    surface.beginPath(); surface.roundRect(3, 3, w - 6, h - 6, 10);
    surface.fillStyle = '#0c0c16'; surface.fill();
    surface.strokeStyle = '#211922'; surface.lineWidth = 2; surface.stroke();
    surface.fillStyle = '#d5b176';
    for (const x of [3, w - 3]) for (const y of [3, h - 3]) {
      surface.beginPath(); surface.arc(x, y, 1.1, 0, Math.PI * 2); surface.fill();
    }
  });
  ctx.drawImage(image, board.x - 5, board.y - 5, w, h);
}

export function drawBoardCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alternate: boolean, selected: boolean) {
  const image = cachedSprite(`board-cell:${alternate}`, size, size, scale(ctx), surface => {
    const inset = Math.max(1, size * .025);
    const stone = surface.createLinearGradient(0, 0, size, size);
    stone.addColorStop(0, alternate ? '#111321' : '#161827');
    stone.addColorStop(.55, alternate ? '#202334' : '#272b3d');
    stone.addColorStop(1, alternate ? '#303044' : '#36364b');
    surface.beginPath(); surface.roundRect(inset, inset, size - inset * 2, size - inset * 2, size * .09);
    surface.fillStyle = stone; surface.fill();
    surface.strokeStyle = 'rgba(3,4,12,.8)'; surface.lineWidth = 1; surface.stroke();
    surface.beginPath(); surface.moveTo(inset + 3, size - inset - 1);
    surface.lineTo(size - inset - 3, size - inset - 1);
    surface.strokeStyle = 'rgba(175,167,210,.15)'; surface.stroke();
    const recess = surface.createRadialGradient(size * .5, size * .48, size * .1,
      size * .5, size * .48, size * .55);
    recess.addColorStop(0, 'rgba(0,0,0,.24)'); recess.addColorStop(1, 'rgba(0,0,0,0)');
    surface.fillStyle = recess; surface.fillRect(inset, inset, size - inset * 2, size - inset * 2);
  });
  ctx.drawImage(image, x, y, size, size);
  if (selected) {
    ctx.fillStyle = 'rgba(247,194,81,.17)';
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
  }
}

export function drawSelection(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.shadowColor = '#ffd77b'; ctx.shadowBlur = Math.min(12, size * .2);
  ctx.strokeStyle = '#ffe6a8'; ctx.lineWidth = Math.max(2, size * .045);
  ctx.beginPath(); ctx.roundRect(x + 3, y + 3, size - 6, size - 6, size * .1); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,248,224,.75)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x + 5, y + 5, size - 10, size - 10, size * .08); ctx.stroke();
  ctx.restore();
}
