import { describe, expect, it } from 'vitest';
import { findMatches } from '../src/core/index';
import { createRun } from '../src/run/index';
import { GAME_CONTENT } from '../src/data/index';
import { layout } from '../src/ui/model';
import { advanceTutorial, createTutorial, finishTutorial, titleButtons, TUTORIAL_KEY, TUTORIAL_MOVE,
  tutorialLayout, tutorialMove, tutorialReward, tutorialSeen } from '../src/ui/tutorial';

describe('interactive tutorial', () => {
  it('starts with a settled fixed board and accepts only the highlighted swap in either direction', () => {
    const state = createTutorial();
    expect(findMatches(state.board)).toEqual([]);
    const wrong = tutorialMove(state, { a: { row: 3, col: 1 }, b: { row: 3, col: 2 } });
    expect(wrong.step).toBe('swap'); expect(wrong.board).toBe(state.board); expect(wrong.hint).toBe(true);
    const next = tutorialMove(state, TUTORIAL_MOVE);
    expect(next.step).toBe('effects'); expect(next.board).not.toEqual(state.board);
    expect(tutorialMove(state, { a: TUTORIAL_MOVE.b, b: TUTORIAL_MOVE.a })).toEqual(next);
    expect(state).toEqual(createTutorial());
  });
  it('requires the exchange before advancing and an offered reward before finishing', () => {
    const state = createTutorial();
    expect(advanceTutorial(state)).toBe(state);
    expect(tutorialReward(state, 0)).toBe(state);
    const effects = tutorialMove(state, TUTORIAL_MOVE);
    expect(tutorialMove(effects, TUTORIAL_MOVE)).toBe(effects);
    const reward = advanceTutorial(effects);
    expect(reward.step).toBe('reward');
    for (const index of [-1, 3, .5, NaN]) expect(tutorialReward(reward, index)).toBe(reward);
    for (const index of [0, 1, 2]) expect(tutorialReward(reward, index)).toMatchObject({ step: 'ready', reward: index });
  });
  it('stores completion or skipping, tolerates unavailable storage, and can always replay', () => {
    const saved = new Map<string, string>();
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
    expect(tutorialSeen(storage)).toBe(false);
    finishTutorial(storage); expect(saved.get(TUTORIAL_KEY)).toBe('true'); expect(tutorialSeen(storage)).toBe(true);
    expect(createTutorial().step).toBe('swap');
    expect(tutorialSeen(undefined)).toBe(false);
    expect(tutorialSeen({ getItem: () => { throw new Error('denied'); } })).toBe(false);
    expect(() => finishTutorial({ setItem: () => { throw new Error('quota'); } })).not.toThrow();
    expect(() => finishTutorial(undefined)).not.toThrow();
  });
  it('keeps practice and replay independent of the formal seeded run', () => {
    const before = createRun(123, GAME_CONTENT);
    for (let replay = 0; replay < 2; replay++) tutorialReward(advanceTutorial(tutorialMove(createTutorial(), TUTORIAL_MOVE)), 1);
    expect(createRun(123, GAME_CONTENT)).toEqual(before);
  });
  it('keeps instructions, board, and finger-sized controls separate within mobile safe areas', () => {
    const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    for (const [w, h, insets] of [[320, 320, { top: 0, right: 0, bottom: 0, left: 0 }], [360, 640, { top: 0, right: 0, bottom: 0, left: 0 }], [390, 844, { top: 47, right: 0, bottom: 34, left: 0 }], [844, 390, { top: 0, right: 47, bottom: 0, left: 47 }], [1024, 768, { top: 0, right: 0, bottom: 0, left: 0 }]] as const) {
      const shape = layout(w, h, 3, insets), t = tutorialLayout(shape);
      for (const r of [t.board, t.panel, t.next, t.skip, ...t.cards, ...Object.values(titleButtons(shape))]) {
        expect(r.x).toBeGreaterThanOrEqual(shape.safe.x); expect(r.y).toBeGreaterThanOrEqual(shape.safe.y);
        expect(r.x + r.w).toBeLessThanOrEqual(shape.safe.x + shape.safe.w);
        expect(r.y + r.h).toBeLessThanOrEqual(shape.safe.y + shape.safe.h);
      }
      for (const r of [t.next, t.skip, ...t.cards, ...Object.values(titleButtons(shape))]) expect(r.h).toBeGreaterThanOrEqual(44);
      expect(overlaps(t.board, t.panel)).toBe(false); expect(overlaps(t.board, t.next)).toBe(false);
      for (const card of t.cards) expect(overlaps(card, t.next)).toBe(false);
    }
  });
});
