import { describe, expect, it } from 'vitest';
import * as core from '../src/core/index';
import { ALL_COLORS, BOARD_SIZE } from '../src/types';
import type { Board, CoreApi, GemColor, Move, Pos, Rng } from '../src/types';

const api: CoreApi = core;
const colors = ALL_COLORS.slice(0, 3);
const gem = (color: GemColor) => ({ kind: 'gem' as const, color });
const junk = () => ({ kind: 'junk' as const });
const pattern = (): Board => Array.from({ length: BOARD_SIZE }, (_, r) =>
  Array.from({ length: BOARD_SIZE }, (_, c) => gem(colors[(r * 2 + c) % 3]!)));
const forcedBoard = (): Board => {
  const b = pattern();
  b[0]![2] = gem('red');
  b[0]![3] = gem('green');
  return b;
};
const move: Move = { a: { row: 0, col: 1 }, b: { row: 1, col: 1 } };
const positions = (cells: Pos[]) => cells.map(p => `${p.row},${p.col}`).sort();
const scripted = (values: number[]): Rng => {
  let index = 0;
  return { int: max => (values[index++] ?? 0) % max, next: () => 0, state: () => index };
};
const playable = (board: Board) => {
  expect(board).toHaveLength(BOARD_SIZE);
  expect(board.every(row => row.length === BOARD_SIZE && row.every(Boolean))).toBe(true);
  expect(api.findMatches(board)).toEqual([]);
  expect(api.findValidMoves(board).length).toBeGreaterThan(0);
};

describe('core', () => {
  it('implements CoreApi', () => {
    expect(api.createRng).toBeTypeOf('function');
  });

  it('reproduces and resumes mulberry32 sequences', () => {
    const a = api.createRng(123), b = api.createRng(123);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
    const resumed = api.createRng(a.state());
    expect(Array.from({ length: 20 }, () => a.int(17))).toEqual(Array.from({ length: 20 }, () => resumed.int(17)));
  });

  it('creates playable boards across seeds and color counts', () => {
    for (const palette of [colors, ALL_COLORS]) for (let seed = 0; seed < 30; seed++) {
      const board = api.createBoard(api.createRng(seed), palette);
      playable(board);
      expect(board.flat().every(cell => cell?.kind === 'gem' && palette.includes(cell.color))).toBe(true);
    }
  });

  it('finds horizontal and vertical runs, including lengths four and five', () => {
    for (const [length, vertical] of [[3, false], [4, true], [5, false]] as const) {
      const b: Board = Array.from({ length: 6 }, () => Array.from({ length: 6 }, junk));
      for (let i = 0; i < length; i++) b[vertical ? i : 2]![vertical ? 2 : i] = gem('red');
      expect(api.findMatches(b).map(g => [g.color, g.cells.length])).toEqual([['red', length]]);
    }
  });

  it('merges L and T intersections, separates disjoint runs, and stops at junk', () => {
    for (const shape of [
      [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]],
      [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],
    ]) {
      const b: Board = Array.from({ length: 6 }, () => Array.from({ length: 6 }, junk));
      for (const [r, c] of shape) b[r!]![c!] = gem('red');
      const groups = api.findMatches(b);
      expect(groups).toHaveLength(1);
      expect(new Set(positions(groups[0]!.cells)).size).toBe(5);
    }
    const b: Board = Array.from({ length: 6 }, () => Array.from({ length: 6 }, junk));
    for (const r of [0, 2]) for (let c = 0; c < 3; c++) b[r]![c] = gem('red');
    b[4]![0] = gem('red'); b[4]![1] = gem('red'); b[4]![3] = gem('red'); b[4]![4] = gem('red');
    expect(api.findMatches(b).map(g => g.cells.length)).toEqual([3, 3]);
  });

  it('lists unique swaps that create matches and excludes junk', () => {
    const b = forcedBoard();
    b[5]![5] = junk();
    const before = structuredClone(b);
    const moves = api.findValidMoves(b);
    expect(moves.length).toBeGreaterThan(0);
    const ids = moves.map(m => [positions([m.a])[0], positions([m.b])[0]].sort().join('|'));
    expect(new Set(ids).size).toBe(moves.length);
    for (const m of moves) {
      expect(b[m.a.row]![m.a.col]!.kind).toBe('gem');
      expect(b[m.b.row]![m.b.col]!.kind).toBe('gem');
      const swapped = structuredClone(b);
      [swapped[m.a.row]![m.a.col], swapped[m.b.row]![m.b.col]] = [swapped[m.b.row]![m.b.col]!, swapped[m.a.row]![m.a.col]!];
      expect(api.findMatches(swapped).length).toBeGreaterThan(0);
    }
    expect(b).toEqual(before);
  });

  it('rejects out of bounds, non-adjacent, junk and non-matching swaps without mutation', () => {
    const b = forcedBoard(); b[5]![5] = junk();
    const before = structuredClone(b);
    const invalid: Move[] = [
      { a: { row: -1, col: 0 }, b: { row: 0, col: 0 } },
      { a: { row: 0, col: 0 }, b: { row: 0, col: 2 } },
      { a: { row: 5, col: 5 }, b: { row: 5, col: 4 } },
      { a: { row: 3, col: 0 }, b: { row: 3, col: 1 } },
    ];
    for (const m of invalid) {
      expect(api.applyMove(b, m, api.createRng(1), colors)).toEqual({ valid: false, steps: [], board: b, reshuffled: false });
      expect(b).toEqual(before);
    }
  });

  it('resolves a scripted two-step cascade with snapshots and chain numbers', () => {
    const b = forcedBoard(), before = structuredClone(b);
    const result = api.applyMove(b, move, scripted([1, 1, 1, 0, 1, 2]), colors);
    expect(result.valid).toBe(true);
    expect(result.steps.map(s => s.chain)).toEqual([1, 2]);
    expect(result.steps.map(s => s.groups.map(g => [g.color, positions(g.cells)]))).toEqual([
      [['red', ['0,0', '0,1', '0,2']]], [['purple', ['0,0', '0,1', '0,2']]],
    ]);
    expect(result.steps[0]!.boardAfterClear[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(result.steps[0]!.boardAfter[0]!.slice(0, 3)).toEqual([gem('purple'), gem('purple'), gem('purple')]);
    playable(result.board);
    expect(b).toEqual(before);
  });

  it('clears orthogonally adjacent junk, preserves diagonal junk, and drops junk', () => {
    const b = forcedBoard();
    b[1]![0] = junk(); // adjacent to first match
    b[1]![3] = junk(); // diagonal only
    const before = structuredClone(b);
    const result = api.applyMove(b, move, api.createRng(8), colors);
    expect(positions(result.steps[0]!.clearedJunk)).toEqual(['1,0']);
    expect(result.steps[0]!.boardAfterClear[1]![3]).toEqual(junk());
    expect(b).toEqual(before);

    const falling = forcedBoard();
    // Move the forced pattern down two rows, leaving a gem between the junk and match.
    for (let r = 0; r < 4; r++) falling[r + 2] = structuredClone(forcedBoard()[r]!);
    falling[0] = Array.from({ length: 6 }, junk);
    const shifted: Move = { a: { row: 2, col: 1 }, b: { row: 3, col: 1 } };
    const drop = api.applyMove(falling, shifted, api.createRng(12), colors);
    expect(drop.steps[0]!.boardAfter[1]![0]).toEqual(junk());
  });

  it('settles moves over many seeds without mutating inputs', () => {
    for (let seed = 0; seed < 25; seed++) {
      const rng = api.createRng(seed), b = api.createBoard(rng, colors), before = structuredClone(b);
      const result = api.applyMove(b, api.findValidMoves(b)[0]!, rng, colors);
      expect(result.valid).toBe(true);
      playable(result.board);
      expect(b).toEqual(before);
    }
  });

  it('reshuffles while preserving junk when possible and resolves impossible junk layouts', () => {
    const existing = forcedBoard(); existing[5]![5] = junk();
    const before = structuredClone(existing);
    const result = api.reshuffle(existing, api.createRng(42), colors);
    playable(result);
    expect(result[5]![5]).toEqual(junk());
    expect(existing).toEqual(before);
    for (const board of [
      Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => (r + c) % 2 ? junk() : gem(colors[(r * 2 + c) % 3]!))),
      Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => r === 0 && c < 2 ? gem('red') : junk())),
    ]) {
      const old = structuredClone(board);
      const shuffled = api.reshuffle(board, api.createRng(5), colors);
      playable(shuffled);
      expect(shuffled.flat().filter(c => c?.kind === 'junk').length).toBeLessThan(board.flat().filter(c => c?.kind === 'junk').length);
      expect(board).toEqual(old);
    }
  });

  it('adds junk within the gem floor and accurately reports reshuffling', () => {
    const b = forcedBoard(), before = structuredClone(b);
    const none = api.addJunk(b, 0, api.createRng(4), colors);
    expect(none.reshuffled).toBe(false);
    expect(none.board).toEqual(b);
    for (let seed = 0; seed < 10; seed++) {
      const result = api.addJunk(b, 100, api.createRng(seed), colors);
      playable(result.board);
      expect(result.board.flat().filter(c => c?.kind === 'gem').length).toBeGreaterThanOrEqual(18);
    }
    const dead: Board = Array.from({ length: 6 }, () => Array.from({ length: 6 }, junk));
    const rebuilt = api.addJunk(dead, 0, api.createRng(9), colors);
    expect(rebuilt.reshuffled).toBe(true);
    playable(rebuilt.board);
    expect(b).toEqual(before);
  });
});
