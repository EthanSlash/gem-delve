import { describe, expect, it } from 'vitest';
import { applyTurn } from '../src/combat/index';
import { findValidMoves } from '../src/core/index';
import { createRun } from '../src/run/index';
import type { GameContent, RewardOption } from '../src/types';
import { greedyMove, greedyReward, simulateRun, summarize } from '../sim/simulate';
import type { RunRecord } from '../sim/simulate';

function fixture(): GameContent {
  return {
    enemies: [1, 2, 3].map(floor => ({ id: `enemy-${floor}`, name: '', maxHp: 3,
      attack: 100, countdown: 1, junkPerAction: 0, isBoss: floor === 3 })),
    relics: [
      { id: 'heart', name: '', description: '', effects: [{ type: 'maxHp', amount: 5 }] },
      { id: 'blade', name: '', description: '', effects: [{ type: 'colorFlat', color: 'red', flat: 1 }] },
    ],
    balance: { playerMaxHp: 10, perGem: { red: 1, purple: 0, green: 0, yellow: 0 },
      chainBonus: 0, levelBonus: 0.25, rewardOptionCount: 3, rerollCost: 3, healAfterCombat: 0 },
  };
}

describe('balance simulation', () => {
  it('reproduces records for each policy, while different seeds produce variety', () => {
    const content = fixture();
    for (const policy of ['random', 'greedy'] as const) {
      expect(simulateRun(7, policy, content)).toEqual(simulateRun(7, policy, content));
      const records = Array.from({ length: 8 }, (_, seed) => {
        const { seed: _seed, ...record } = simulateRun(seed, policy, content);
        return JSON.stringify(record);
      });
      expect(new Set(records).size).toBeGreaterThan(1);
    }
  });

  it('stops an unwinnable, harmless combat after 500 turns as a loss', () => {
    const content = fixture();
    content.enemies[0]!.attack = 0;
    content.balance.perGem = { red: 0, purple: 0, green: 0, yellow: 0 };
    for (const policy of ['random', 'greedy'] as const) {
      const record = simulateRun(23, policy, content);
      expect(record).toMatchObject({ won: false, floorReached: 1, turns: 500, finalHp: 10 });
    }
  }, 30000);

  it('greedy wins more often than random across 50 seeds', () => {
    const content = fixture();
    const wins = (policy: 'random' | 'greedy') => Array.from({ length: 50 }, (_, seed) =>
      simulateRun(seed + 1, policy, content)).filter(record => record.won).length;
    expect(wins('greedy')).toBeGreaterThan(wins('random'));
  }, 30000);

  it('selects the first winning move even when a non-winning move is listed first', () => {
    const content = fixture();
    let checked = false;
    for (let seed = 1; seed <= 50 && !checked; seed++) {
      const state = createRun(seed, content).combat!;
      const moves = findValidMoves(state.board);
      const winning = moves.filter(move => applyTurn(state, move, content).state.status === 'won');
      const other = moves.find(move => applyTurn(state, move, content).state.status !== 'won');
      if (winning.length && other) {
        expect(greedyMove(state, [other, ...winning], content)).toEqual(winning[0]);
        checked = true;
      }
    }
    expect(checked).toBe(true);
  });

  it('prioritizes relics, red upgrades, yellow removal, and then the first option', () => {
    const options: RewardOption[] = [
      { type: 'upgradeColor', color: 'green' }, { type: 'removeColor', color: 'yellow' },
      { type: 'upgradeColor', color: 'red' }, { type: 'relic', relicId: 'heart' },
    ];
    expect(greedyReward(options)).toBe(3);
    expect(greedyReward(options.slice(0, 3))).toBe(2);
    expect(greedyReward(options.slice(0, 2))).toBe(1);
    expect(greedyReward(options.slice(0, 1))).toBe(0);
  });

  it('summarizes floor counts and conditional relic win rates', () => {
    const content = fixture();
    const base: RunRecord = { seed: 1, policy: 'greedy', won: false, floorReached: 1,
      turns: 3, finalHp: 0, gold: 0, relics: [], colors: ['red', 'green', 'purple', 'yellow'] };
    const records: RunRecord[] = [base,
      { ...base, seed: 2, floorReached: 2, turns: 6, relics: ['heart'] },
      { ...base, seed: 3, won: true, floorReached: 3, turns: 9, relics: ['heart', 'blade'] },
    ];
    expect(summarize(records, content)).toEqual({ policy: 'greedy', runs: 3, winRate: 1 / 3,
      averageFloor: 2, averageTurns: 6, endedOnFloor: [1, 1, 1],
      relicPickRate: { heart: 2 / 3, blade: 1 / 3 }, relicWinRate: { heart: 1 / 2, blade: 1 } });
    expect(summarize([], content)).toMatchObject({ runs: 0, winRate: 0, averageFloor: 0,
      averageTurns: 0, endedOnFloor: [0, 0, 0], relicPickRate: { heart: 0, blade: 0 } });
  });
});
