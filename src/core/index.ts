import { BOARD_SIZE, MIN_COLORS, MIN_MATCH } from '../types';
import type { Board, Cell, GemColor, MatchGroup, Move, MoveResult, Pos, Rng } from '../types';

const copy = (board: Board): Board => board.map(row => row.map(cell => cell ? { ...cell } : null));
const gem = (color: GemColor): Cell => ({ kind: 'gem', color });
const colorAt = (board: Board, row: number, col: number): GemColor | undefined => {
  const cell = board[row]?.[col];
  return cell?.kind === 'gem' ? cell.color : undefined;
};
const key = (p: Pos): string => `${p.row},${p.col}`;
const inside = (p: Pos): boolean => Number.isInteger(p.row) && Number.isInteger(p.col)
  && p.row >= 0 && p.row < BOARD_SIZE && p.col >= 0 && p.col < BOARD_SIZE;

function checkColors(colors: readonly GemColor[]): void {
  if (new Set(colors).size < MIN_COLORS) throw new Error('At least three distinct colors are required');
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: max => Math.floor(next() * max), state: () => state };
}

export function findMatches(board: Board): MatchGroup[] {
  const runs: MatchGroup[] = [];
  for (let direction = 0; direction < 2; direction++) {
    for (let line = 0; line < BOARD_SIZE; line++) {
      let start = 0;
      while (start < BOARD_SIZE) {
        const row = direction === 0 ? line : start;
        const col = direction === 0 ? start : line;
        const color = colorAt(board, row, col);
        let end = start + 1;
        while (end < BOARD_SIZE && color !== undefined &&
          colorAt(board, direction === 0 ? line : end, direction === 0 ? end : line) === color) end++;
        if (color !== undefined && end - start >= MIN_MATCH) {
          const cells: Pos[] = [];
          for (let n = start; n < end; n++) cells.push(direction === 0 ? { row: line, col: n } : { row: n, col: line });
          runs.push({ color, cells });
        }
        start = end;
      }
    }
  }
  const groups: MatchGroup[] = [];
  for (const run of runs) {
    const cells = new Map(run.cells.map(p => [key(p), p]));
    // A run can bridge multiple previously separate groups.
    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i]!;
      if (group.color === run.color && group.cells.some(p => cells.has(key(p)))) {
        for (const p of group.cells) cells.set(key(p), p);
        groups.splice(i, 1);
      }
    }
    groups.push({ color: run.color, cells: [...cells.values()] });
  }
  return groups;
}

function swap(board: Board, a: Pos, b: Pos): void {
  const first = board[a.row]![a.col]!;
  board[a.row]![a.col] = board[b.row]![b.col]!;
  board[b.row]![b.col] = first;
}

function createsMatch(board: Board, a: Pos, b: Pos): boolean {
  swap(board, a, b);
  const matches = findMatches(board);
  swap(board, a, b);
  return matches.some(group => group.cells.some(p => key(p) === key(a) || key(p) === key(b)));
}

export function findValidMoves(board: Board): Move[] {
  const working = copy(board);
  const moves: Move[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) {
    if (colorAt(working, row, col) === undefined) continue;
    const a = { row, col };
    for (const b of [{ row, col: col + 1 }, { row: row + 1, col }]) {
      if (inside(b) && colorAt(working, b.row, b.col) !== undefined && createsMatch(working, a, b)) moves.push({ a, b });
    }
  }
  return moves;
}

function playable(board: Board): boolean {
  return findMatches(board).length === 0 && findValidMoves(board).length > 0;
}

export function reshuffle(board: Board, rng: Rng, colors: readonly GemColor[]): Board {
  checkColors(colors);
  const working = copy(board);
  const positions: Pos[] = [];
  const junk: Pos[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) {
    (working[row]?.[col]?.kind === 'junk' ? junk : positions).push({ row, col });
  }
  const original = positions.map(p => working[p.row]![p.col]);
  for (let attempt = 0; attempt < 80; attempt++) {
    const shuffled = original.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    positions.forEach((p, i) => { working[p.row]![p.col] = shuffled[i] ?? gem(colors[0]!); });
    if (playable(working)) return working;
  }
  while (true) {
    for (let attempt = 0; attempt < 80; attempt++) {
      for (const p of positions) working[p.row]![p.col] = gem(colors[rng.int(colors.length)]!);
      if (playable(working)) return working;
    }
    if (junk.length === 0) break;
    const index = rng.int(junk.length);
    const removed = junk.splice(index, 1)[0]!;
    positions.push(removed);
  }
  // A fixed three-color construction guarantees progress even for a constant RNG.
  const distinct = [...new Set(colors)];
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) {
    working[row]![col] = gem(distinct[(row * 2 + col) % 3]!);
  }
  working[0]![2] = gem(distinct[0]!);
  return working;
}

export function createBoard(rng: Rng, colors: readonly GemColor[]): Board {
  checkColors(colors);
  const board: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => gem(colors[rng.int(colors.length)]!)));
  return playable(board) ? board : reshuffle(board, rng, colors);
}

export function applyMove(board: Board, move: Move, rng: Rng, colors: readonly GemColor[]): MoveResult {
  const invalid = (): MoveResult => ({ valid: false, steps: [], board, reshuffled: false });
  const { a, b } = move;
  if (!inside(a) || !inside(b) || Math.abs(a.row - b.row) + Math.abs(a.col - b.col) !== 1 ||
    colorAt(board, a.row, a.col) === undefined || colorAt(board, b.row, b.col) === undefined) return invalid();
  const working = copy(board);
  if (!createsMatch(working, a, b)) return invalid();
  checkColors(colors);
  swap(working, a, b);
  const steps: MoveResult['steps'] = [];
  let groups = findMatches(working);
  while (groups.length > 0) {
    const junk = new Map<string, Pos>();
    for (const group of groups) for (const p of group.cells) {
      for (const q of [{ row: p.row - 1, col: p.col }, { row: p.row + 1, col: p.col },
        { row: p.row, col: p.col - 1 }, { row: p.row, col: p.col + 1 }]) {
        if (inside(q) && working[q.row]?.[q.col]?.kind === 'junk') junk.set(key(q), q);
      }
    }
    for (const group of groups) for (const p of group.cells) working[p.row]![p.col] = null;
    for (const p of junk.values()) working[p.row]![p.col] = null;
    const boardAfterClear = copy(working);
    for (let col = 0; col < BOARD_SIZE; col++) {
      let dest = BOARD_SIZE - 1;
      for (let row = BOARD_SIZE - 1; row >= 0; row--) {
        const cell = working[row]![col];
        if (cell) working[dest--]![col] = cell;
      }
      while (dest >= 0) working[dest--]![col] = gem(colors[rng.int(colors.length)]!);
    }
    steps.push({ chain: steps.length + 1, groups, clearedJunk: [...junk.values()], boardAfterClear, boardAfter: copy(working) });
    groups = findMatches(working);
  }
  const reshuffled = findValidMoves(working).length === 0;
  return { valid: true, steps, board: reshuffled ? reshuffle(working, rng, colors) : working, reshuffled };
}

export function addJunk(board: Board, count: number, rng: Rng, colors: readonly GemColor[]): { board: Board; reshuffled: boolean } {
  const working = copy(board);
  const gems: Pos[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) {
    if (working[row]?.[col]?.kind === 'gem') gems.push({ row, col });
  }
  const conversions = Math.min(Math.max(0, Math.floor(count)), Math.max(0, gems.length - Math.ceil(BOARD_SIZE * BOARD_SIZE / 2)));
  for (let i = 0; i < conversions; i++) {
    const p = gems.splice(rng.int(gems.length), 1)[0]!;
    working[p.row]![p.col] = { kind: 'junk' };
  }
  const reshuffled = !playable(working);
  return { board: reshuffled ? reshuffle(working, rng, colors) : working, reshuffled };
}
