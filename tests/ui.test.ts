import { describe, expect, it } from 'vitest';
import { buildTimeline, dragMove, fallDistances, hitCell, layout, neighboringMove, sameBoard } from '../src/ui/model';
import type { Rect } from '../src/ui/model';
import type { Board, TurnResult } from '../src/types';

describe('canvas geometry and input', () => {
  it('keeps enemy art on canvas and clear of the board, stats, and mute control', () => {
    const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x &&
      a.y < b.y + b.h && a.y + a.h > b.y;
    for (const [width, height] of [[320,320],[360,640],[375,812],[480,400],
      [640,360],[844,390],[800,600],[1024,768]]) {
      const { enemy, board, stats, mute } = layout(width!, height!);
      expect(enemy.x).toBeGreaterThanOrEqual(0);
      expect(enemy.y).toBeGreaterThanOrEqual(0);
      expect(enemy.x + enemy.w).toBeLessThanOrEqual(width!);
      expect(enemy.y + enemy.h).toBeLessThanOrEqual(height!);
      for (const other of [board, stats, mute]) expect(overlaps(enemy, other)).toBe(false);
    }
  });
  it('hits only cells inside the board at phone and desktop sizes', () => {
    for (const [w, h] of [[360, 640], [900, 450], [1300, 900]]) {
      const shape = layout(w!, h!);
      expect(hitCell(shape, shape.board.x + shape.cell * 2.5, shape.board.y + shape.cell * 4.5)).toEqual({ row: 4, col: 2 });
      expect(hitCell(shape, shape.board.x + shape.board.w, shape.board.y)).toBeNull();
      expect(shape.board.x).toBeGreaterThanOrEqual(0);
      expect(shape.board.y + shape.board.h).toBeLessThanOrEqual(h!);
    }
  });
  it('keeps the entire board within short, portrait, and desktop canvases', () => {
    for (const [width, height] of [[320, 320], [360, 640], [375, 812], [480, 400],
      [640, 360], [800, 600], [1024, 768]]) {
      const { board, landscape } = layout(width!, height!);
      expect(board.x).toBeGreaterThanOrEqual(0);
      expect(board.y).toBeGreaterThanOrEqual(0);
      expect(board.x + board.w).toBeLessThanOrEqual(width!);
      expect(board.y + board.h).toBeLessThanOrEqual(height!);
      if (height! < 480) expect(landscape).toBe(true);
    }
  });
  it('keeps phone controls and content inside portrait and landscape safe areas', () => {
    for (const [width, height, insets] of [
      [390, 844, { top: 47, right: 0, bottom: 34, left: 0 }],
      [844, 390, { top: 0, right: 47, bottom: 0, left: 47 }],
    ] as const) {
      const shape = layout(width, height, 3, insets);
      for (const rect of [shape.board, shape.mute, shape.primary, ...shape.cards, shape.reroll,
        shape.header, shape.enemy, shape.stats, shape.legend]) {
        expect(rect.x).toBeGreaterThanOrEqual(insets.left);
        expect(rect.y).toBeGreaterThanOrEqual(insets.top);
        expect(rect.x + rect.w).toBeLessThanOrEqual(width - insets.right);
        expect(rect.y + rect.h).toBeLessThanOrEqual(height - insets.bottom);
      }
    }
  });
  it('gives mute a finger-sized target on a 360x640 phone', () => {
    const { mute } = layout(360, 640);
    expect(mute.w).toBeGreaterThanOrEqual(44);
    expect(mute.h).toBeGreaterThanOrEqual(44);
  });
  it('requires adjacent clicks and chooses the strongest drag direction', () => {
    const a = { row: 2, col: 2 };
    expect(neighboringMove(a, { row: 3, col: 2 })?.b).toEqual({ row: 3, col: 2 });
    expect(neighboringMove(a, { row: 3, col: 3 })).toBeNull();
    expect(dragMove(a, -32, 12, 14)?.b).toEqual({ row: 2, col: 1 });
    expect(dragMove(a, 4, 5, 14)).toBeNull();
    expect(dragMove({ row: 0, col: 0 }, -30, 0, 14)).toBeNull();
  });
  it('centers reward cards across wide screens and keeps the legend by the stats', () => {
    const wide = layout(1024, 768);
    expect(wide.cards.map(card => card.y)).toEqual([wide.cards[0]!.y, wide.cards[0]!.y, wide.cards[0]!.y]);
    expect(wide.cards[0]!.x).toBeLessThan(wide.board.x + wide.board.w);
    expect(wide.cards[2]!.x + wide.cards[2]!.w).toBeGreaterThan(wide.stats.x);
    expect(wide.cards[0]!.x + wide.cards[2]!.x + wide.cards[2]!.w).toBeCloseTo(wide.width);
    expect(wide.legend.y).toBe(wide.stats.y + wide.stats.h + 12);
    const phone = layout(375, 812);
    expect(phone.cards[0]!.x).toBe(phone.cards[1]!.x);
    expect(phone.cards[1]!.y).toBeGreaterThan(phone.cards[0]!.y);
  });
});

describe('turn timeline', () => {
  it('tracks each surviving cell and the new stack in its column', () => {
    const red = { kind: 'gem', color: 'red' } as const;
    const green = { kind: 'gem', color: 'green' } as const;
    const junk = { kind: 'junk' } as const;
    const cleared: Board = [[red, red, null], [null, green, red],
      [green, junk, null], [null, red, junk]];
    expect(fallDistances(cleared)).toEqual([
      [2, 0, 2], [2, 0, 2], [2, 0, 1], [1, 0, 0],
    ]);
    expect(cleared[1]![0]).toBeNull();
    expect(fallDistances([[red, junk], [green, red]])).toEqual([[0, 0], [0, 0]]);
  });
  it('keeps all clear and refill snapshots before enemy and final reshuffle', () => {
    const board: Board = [[{ kind: 'gem', color: 'red' }]];
    const cleared: Board = [[null]];
    const refill: Board = [[{ kind: 'gem', color: 'green' }]];
    const final: Board = [[{ kind: 'junk' }]];
    const result: TurnResult = { valid: true, steps: [{ chain: 2, groups: [], clearedJunk: [], boardAfterClear: cleared, boardAfter: refill }],
      effects: { damage: 0, shield: 0, heal: 0, gold: 0 }, reshuffled: false,
      enemyAction: { attack: 3, shieldAbsorbed: 0, hpLost: 3, junkAdded: 1, reshuffled: true },
      state: { board: final, player: { hp: 7, maxHp: 10, gold: 0, colors: ['red', 'purple', 'green'],
        colorLevels: { red: 0, purple: 0, green: 0, yellow: 0 }, relics: [] }, shield: 0,
        enemy: { id: 'test', hp: 10, countdown: 2 }, turn: 1, status: 'ongoing', rngState: 1 } };
    const phases = buildTimeline(board, result);
    expect(phases.map(p => p.kind)).toEqual(['swap', 'clear', 'fall', 'enemy', 'finish']);
    expect(phases.map(p => p.board)).toEqual([board, cleared, refill, refill, final]);
    expect(phases[2]?.dropRows).toEqual([[1]]);
    expect(phases.at(-1)?.reshuffled).toBe(true);
    expect(phases.reduce((n, p) => n + p.duration, 0)).toBeLessThan(2000);
    expect(sameBoard(board, [[{ kind: 'gem', color: 'red' }]])).toBe(true);
    expect(sameBoard(board, final)).toBe(false);
    const long = buildTimeline(board, { ...result, steps: Array.from({ length: 12 }, (_, i) => ({
      chain: i + 1, groups: [], clearedJunk: [], boardAfterClear: cleared, boardAfter: refill,
    })) });
    expect(long.filter(p => p.kind === 'clear').length).toBe(12);
    expect(long.reduce((n, p) => n + p.duration, 0)).toBeLessThanOrEqual(1751);
  });
  it('marks the finish phase for player reshuffles even when the enemy acts', () => {
    const board: Board = [[{ kind: 'gem', color: 'red' }]];
    const final: Board = [[{ kind: 'gem', color: 'green' }]];
    const result: TurnResult = {
      valid: true, steps: [], effects: { damage: 0, shield: 0, heal: 0, gold: 0 }, reshuffled: true,
      enemyAction: { attack: 1, shieldAbsorbed: 0, hpLost: 1, junkAdded: 0, reshuffled: false },
      state: { board: final, player: { hp: 9, maxHp: 10, gold: 0, colors: ['red', 'purple', 'green'],
        colorLevels: { red: 0, purple: 0, green: 0, yellow: 0 }, relics: [] }, shield: 0,
        enemy: { id: 'test', hp: 10, countdown: 2 }, turn: 1, status: 'ongoing', rngState: 1 },
    };
    expect(buildTimeline(board, result).find(p => p.kind === 'enemy')?.board).toBe(final);
    expect(buildTimeline(board, { ...result, reshuffled: false }).find(p => p.kind === 'enemy')?.board).toBe(board);
    expect(buildTimeline(board, result).at(-1)?.reshuffled).toBe(true);
    expect(buildTimeline(board, { ...result, enemyAction: null }).at(-1)?.reshuffled).toBe(true);
    expect(buildTimeline(board, { ...result, reshuffled: false }).at(-1)?.reshuffled).toBe(false);
  });
});
