import { BOARD_SIZE } from '../types';
import type { Blast, Board, MatchGroup, Move, Pos, TurnResult } from '../types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Layout {
  width: number; height: number; landscape: boolean;
  safe: Rect;
  board: Rect; cell: number; header: Rect; enemy: Rect; stats: Rect; legend: Rect;
  mute: Rect; music: Rect; cards: Rect[]; reroll: Rect; primary: Rect;
}

export function layout(width: number, height: number, rewardCount = 3,
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): Layout {
  const safe: Rect = { x: insets.left, y: insets.top,
    w: Math.max(1, width - insets.left - insets.right), h: Math.max(1, height - insets.top - insets.bottom) };
  const { w, h } = safe;
  const landscape = h < 480 || w > h * 1.24;
  const pad = Math.max(12, Math.min(24, w * 0.035));
  const sideX = landscape ? Math.min(h - pad * 2, w * 0.56) + pad * 2 : pad;
  const sideW = landscape ? w - sideX - pad : w - 2 * pad;
  const size = landscape
    ? Math.min(h - pad * 2, w * 0.55, w - pad * 2 - 116)
    : Math.min(w - pad * 2, Math.max(120, h - 328));
  const board: Rect = { x: landscape ? pad + (sideX - 2 * pad - size) / 2 : (w - size) / 2,
    y: landscape ? (h - size) / 2 : Math.max(264, Math.min(h - size - 64, h * 0.33)), w: size, h: size };
  const header: Rect = { x: landscape ? sideX : pad, y: 54, w: sideW, h: landscape ? 96 : 116 };
  const enemySize = landscape ? Math.min(90, Math.max(50, sideW * .28)) : 100;
  const enemy: Rect = { x: w - pad - enemySize, y: landscape ? 56 : 64, w: enemySize, h: enemySize };
  const stats: Rect = landscape ? { x: sideX, y: 156, w: sideW, h: 90 }
    : { x: pad, y: 184, w: sideW, h: 64 };
  const legend: Rect = landscape ? { x: sideX, y: stats.y + stats.h + 12, w: sideW, h: 58 }
    : { x: pad, y: board.y + size + 10, w: sideW, h: 52 };
  const mute: Rect = { x: w - pad - 48, y: 4, w: 48, h: 44 };
  const music: Rect = { x: mute.x - 56, y: mute.y, w: 48, h: 44 };
  const count = Math.max(1, rewardCount);
  const cardX = pad;
  const cardW = landscape ? Math.min(320, (w - 2 * pad - 16 * (count - 1)) / count) : w - pad * 2;
  const cardTop = landscape ? Math.max(120, h * .28) : 114;
  const footer = 105;
  const gap = 9;
  const cardH = landscape ? Math.min(190, h - cardTop - footer) : Math.min(120, Math.max(48, (h - cardTop - footer - gap * (count - 1)) / count));
  const rowW = count * cardW + (count - 1) * 16;
  const cards = Array.from({ length: count }, (_, i) => ({ x: landscape ? (w - rowW) / 2 + i * (cardW + 16) : cardX,
    y: landscape ? cardTop : cardTop + i * (cardH + gap), w: cardW, h: cardH }));
  const reroll: Rect = { x: landscape ? (w - Math.min(320, w - 2 * pad)) / 2 : cardX,
    y: landscape ? Math.min(h - 68, cardTop + cardH + 24) : Math.min(h - 68, cardTop + count * (cardH + gap) + 8),
    w: landscape ? Math.min(320, w - 2 * pad) : cardW, h: 46 };
  const primary: Rect = { x: (w - Math.min(280, w - 2 * pad)) / 2, y: Math.min(h - 96, h * 0.69), w: Math.min(280, w - 2 * pad), h: 58 };
  const shift = (r: Rect): Rect => ({ ...r, x: r.x + safe.x, y: r.y + safe.y });
  return { width, height, landscape, safe, board: shift(board), cell: size / BOARD_SIZE,
    header: shift(header), enemy: shift(enemy), stats: shift(stats), legend: shift(legend),
    mute: shift(mute), music: shift(music), cards: cards.map(shift), reroll: shift(reroll), primary: shift(primary) };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

// Keep stat widths independent of their values, so large gold/shield totals cannot
// push neighboring information out of the safe area.
export function statCards(shape: Layout): Rect[] {
  const { stats } = shape;
  const stacked = stats.w < 180;
  const gap = stacked ? 3 : 6;
  return Array.from({ length: 3 }, (_, i) => ({
    x: stats.x + (stacked ? 0 : i * (stats.w + gap) / 3),
    y: stats.y + (stacked ? i * 23 : 0),
    w: stacked ? stats.w : (stats.w - gap * 2) / 3,
    h: stacked ? 20 : 42,
  }));
}

export function hitCell(shape: Layout, x: number, y: number): Pos | null {
  if (!contains(shape.board, x, y)) return null;
  return { row: Math.floor((y - shape.board.y) / shape.cell), col: Math.floor((x - shape.board.x) / shape.cell) };
}

export function neighboringMove(a: Pos, b: Pos): Move | null {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1 ? { a, b } : null;
}

export function dragMove(a: Pos, dx: number, dy: number, threshold: number): Move | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  const b = Math.abs(dx) >= Math.abs(dy)
    ? { row: a.row, col: a.col + Math.sign(dx) }
    : { row: a.row + Math.sign(dy), col: a.col };
  return b.row >= 0 && b.row < BOARD_SIZE && b.col >= 0 && b.col < BOARD_SIZE ? { a, b } : null;
}

export type PhaseKind = 'swap' | 'clear' | 'fall' | 'enemy' | 'finish';
export interface Phase {
  kind: PhaseKind; board: Board; duration: number; chain?: number; groups?: MatchGroup[];
  blasts?: Blast[]; blasted?: MatchGroup[]; reshuffled?: boolean; dropRows?: number[][];
}

// Gravity preserves the order of the surviving cells in each column. New cells
// enter as a stack immediately above the board, one row per cleared space.
export function fallDistances(boardAfterClear: Board): number[][] {
  const distances = boardAfterClear.map(row => row.map(() => 0));
  for (let col = 0; col < (boardAfterClear[0]?.length ?? 0); col++) {
    let emptyBelow = 0;
    for (let row = boardAfterClear.length - 1; row >= 0; row--) {
      if (boardAfterClear[row]?.[col] === null) emptyBelow++;
      else distances[row + emptyBelow]![col] = emptyBelow;
    }
    for (let row = 0; row < emptyBelow; row++) distances[row]![col] = emptyBelow;
  }
  return distances;
}

export function sameBoard(a: Board, b: Board): boolean {
  return a.length === b.length && a.every((row, y) => row.length === b[y]?.length && row.every((cell, x) => {
    const other = b[y]?.[x];
    if (cell?.kind === 'gem') return other?.kind === 'gem' && cell.color === other.color && cell.special === other.special;
    if (cell?.kind === 'junk') return other?.kind === 'junk' && !cell.hard === !other.hard;
    return other === null || other === undefined;
  }));
}

export function buildTimeline(initial: Board, result: TurnResult): Phase[] {
  if (!result.valid) return [];
  const phases: Phase[] = [{ kind: 'swap', board: initial, duration: 90 }];
  for (const step of result.steps) {
    // Blasts get a little longer on screen so the player can see what each one reached.
    phases.push({ kind: 'clear', board: step.boardAfterClear, duration: step.blasts?.length ? 220 : 110,
      chain: step.chain, groups: step.groups, blasts: step.blasts, blasted: step.blasted });
    phases.push({ kind: 'fall', board: step.boardAfter, duration: 120, chain: step.chain,
      dropRows: fallDistances(step.boardAfterClear) });
  }
  if (result.enemyAction) phases.push({ kind: 'enemy',
    board: result.reshuffled ? result.state.board : phases[phases.length - 1]!.board, duration: 180 });
  const last = phases[phases.length - 1]!.board;
  phases.push({ kind: 'finish', board: result.state.board, duration: sameBoard(last, result.state.board) ? 60 : 140,
    reshuffled: result.reshuffled || !!result.enemyAction?.reshuffled });
  // Long cascades remain snappy while retaining every snapshot.
  const total = phases.reduce((n, phase) => n + phase.duration, 0);
  if (total > 1200) for (const phase of phases) phase.duration = phase.duration * 1200 / total;
  return phases;
}
