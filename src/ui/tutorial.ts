import { applyMove, createRng } from '../core/index';
import { ALL_COLORS } from '../types';
import type { Board, Move, MoveResult, Pos } from '../types';
import type { Layout, Rect } from './model';

export const TUTORIAL_KEY = 'gemDelve.tutorialSeen.v1';
export const TUTORIAL_MOVE: Move = { a: { row: 0, col: 2 }, b: { row: 1, col: 2 } };
export interface Tutorial {
  step: 'swap' | 'effects' | 'reward' | 'ready';
  board: Board;
  hint: boolean;
  reward?: number;
  result?: MoveResult;
}
export function createTutorial(): Tutorial {
  const rows = ['rrgypg', 'pgrypg', 'gypgyp', 'ypgypg', 'pgypgy', 'gypgyp'];
  const colors = { r: 'red', p: 'purple', g: 'green', y: 'yellow' } as const;
  return { step: 'swap', board: rows.map(row => [...row].map(char => ({ kind: 'gem', color: colors[char as keyof typeof colors] }))), hint: false };
}
function samePos(a: Pos, b: Pos) { return a.row === b.row && a.col === b.col; }
export function tutorialMove(state: Tutorial, move: Move): Tutorial {
  if (state.step !== 'swap') return state;
  const { a, b } = TUTORIAL_MOVE;
  if (!(samePos(move.a, a) && samePos(move.b, b) || samePos(move.a, b) && samePos(move.b, a)))
    return { ...state, hint: true };
  const result = applyMove(state.board, move, createRng(73), ALL_COLORS);
  return result.valid ? { step: 'effects', board: result.board, hint: false, result } : state;
}
export function advanceTutorial(state: Tutorial): Tutorial {
  return state.step === 'effects' ? { ...state, step: 'reward' } : state;
}
export function tutorialReward(state: Tutorial, index: number): Tutorial {
  return state.step === 'reward' && Number.isInteger(index) && index >= 0 && index < 3
    ? { ...state, step: 'ready', reward: index } : state;
}
export function tutorialSeen(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try { return storage?.getItem(TUTORIAL_KEY) === 'true'; } catch { return false; }
}
export function finishTutorial(storage: Pick<Storage, 'setItem'> | undefined): void {
  try { storage?.setItem(TUTORIAL_KEY, 'true'); } catch { /* Continue without persistence. */ }
}
export function titleButtons(shape: Layout): { primary: Rect; replay: Rect } {
  const { safe } = shape;
  const primary = { ...shape.primary, y: safe.y + Math.min(safe.h * .62, safe.h - 118) };
  return { primary, replay: { x: primary.x, y: primary.y + primary.h + 10, w: primary.w, h: 44 } };
}
export function tutorialLayout(shape: Layout) {
  const { safe } = shape;
  const landscape = safe.h < 480 || safe.w > safe.h * 1.24;
  const size = landscape ? Math.min(safe.h - 80, safe.w * .48 - 24) : Math.min(safe.w - 32, Math.max(72, safe.h - 248));
  const board: Rect = { x: landscape ? safe.x + 12 : safe.x + (safe.w - size) / 2,
    y: landscape ? safe.y + 64 : safe.y + 176, w: size, h: size };
  const panel: Rect = landscape ? { x: board.x + size + 20, y: safe.y + 64, w: safe.w - size - 44, h: safe.h - 128 }
    : { x: safe.x + 16, y: safe.y + 62, w: safe.w - 32, h: 106 };
  const next: Rect = { x: landscape ? panel.x : safe.x + 16, y: safe.y + safe.h - 56,
    w: landscape ? panel.w : safe.w - 32, h: 44 };
  const skip: Rect = { x: safe.x + safe.w - 100, y: safe.y + 8, w: 88, h: 44 };
  const cards = Array.from({ length: 3 }, (_, i): Rect => ({ x: safe.x + 16, y: safe.y + 110 + i * Math.min(80, (safe.h - 164) / 3),
    w: safe.w - 32, h: Math.min(68, (safe.h - 164) / 3 - 6) }));
  return { board, cell: size / 6, panel, next, skip, cards };
}
