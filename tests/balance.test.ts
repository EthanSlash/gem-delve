import { describe, expect, it } from 'vitest';
import { GAME_CONTENT } from '../src/data/index';
import { simulateRun, summarize } from '../sim/simulate';

describe('default difficulty', () => {
  it('lets deliberate play win a majority of runs in fewer than 42 turns, while rewarding strategy', () => {
    const records = (policy: 'random' | 'greedy') => Array.from({ length: 100 }, (_, index) =>
      simulateRun(index + 1, policy, GAME_CONTENT));
    const greedy = records('greedy');
    const random = records('random');
    const summary = summarize(greedy, GAME_CONTENT);
    const wins = greedy.filter(record => record.won);
    const winningTurns = wins.reduce((sum, record) => sum + record.turns, 0) / wins.length;

    expect(summary.winRate).toBeGreaterThanOrEqual(0.6);
    expect(summary.winRate).toBeLessThanOrEqual(0.8);
    expect(winningTurns).toBeGreaterThanOrEqual(30);
    expect(winningTurns).toBeLessThanOrEqual(42);
    expect(summary.winRate).toBeGreaterThan(summarize(random, GAME_CONTENT).winRate);
    expect(random.filter(record => record.floorReached > 1).length).toBeGreaterThanOrEqual(60);
  }, 30000);
});
