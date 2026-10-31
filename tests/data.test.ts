import { describe, expect, it } from 'vitest';
import { GAME_CONTENT } from '../src/data/index';
import type { RelicEffect } from '../src/types';

const effectNumbers = (effect: RelicEffect): number[] => {
  switch (effect.type) {
    case 'colorFlat':
      return [effect.flat];
    case 'chainBonus':
      return [effect.bonus];
    case 'bigMatch':
      return [effect.minSize, effect.multiplier];
    case 'startShield':
    case 'maxHp':
    case 'junkHeal':
      return [effect.amount];
    case 'shieldRetain':
      return [effect.ratio];
    case 'enemyCountdown':
      return [effect.delta];
  }
};

describe('game content', () => {
  it('has five enemies in rising difficulty with only the final boss', () => {
    const enemies = GAME_CONTENT.enemies;
    expect(enemies).toHaveLength(5);
    expect(enemies.slice(0, 4).every(enemy => !enemy.isBoss)).toBe(true);
    expect(enemies[4]!.isBoss).toBe(true);
    expect(enemies[4]!.name).toBe('史萊姆王');
    expect(enemies[0]).toMatchObject({ maxHp: 40, attack: 6, countdown: 3, junkPerAction: 1 });
    expect(enemies[4]).toMatchObject({ maxHp: 160, attack: 16, countdown: 3, junkPerAction: 3 });

    for (const enemy of enemies) {
      expect(enemy.id.trim()).not.toBe('');
      expect(enemy.name.trim()).not.toBe('');
      expect(enemy.maxHp).toBeGreaterThan(0);
      expect(enemy.attack).toBeGreaterThan(0);
      expect(enemy.countdown).toBeGreaterThan(0);
      expect(enemy.junkPerAction).toBeGreaterThan(0);
      expect(Number.isInteger(enemy.maxHp)).toBe(true);
      expect(Number.isInteger(enemy.attack)).toBe(true);
      expect(Number.isInteger(enemy.countdown)).toBe(true);
      expect(Number.isInteger(enemy.junkPerAction)).toBe(true);
    }

    for (let i = 1; i < enemies.length; i++) {
      expect(enemies[i]!.maxHp).toBeGreaterThan(enemies[i - 1]!.maxHp);
      expect(enemies[i]!.attack).toBeGreaterThan(enemies[i - 1]!.attack);
      expect(enemies[i]!.junkPerAction).toBeGreaterThanOrEqual(enemies[i - 1]!.junkPerAction);
    }

    const ids = new Set(enemies.map(enemy => enemy.id));
    expect(ids.size).toBe(enemies.length);
  });

  it('has eight relics covering every effect type', () => {
    const relics = GAME_CONTENT.relics;
    expect(relics).toHaveLength(8);

    const ids = new Set(relics.map(relic => relic.id));
    expect(ids.size).toBe(relics.length);

    const types = new Set(relics.flatMap(relic => relic.effects.map(effect => effect.type)));
    expect(types).toEqual(new Set([
      'colorFlat', 'chainBonus', 'bigMatch', 'startShield',
      'maxHp', 'shieldRetain', 'junkHeal', 'enemyCountdown',
    ]));

    for (const relic of relics) {
      expect(relic.id.trim()).not.toBe('');
      expect(relic.name.trim()).not.toBe('');
      expect(relic.description.trim()).not.toBe('');
      expect(relic.effects.length).toBeGreaterThan(0);

      for (const effect of relic.effects) {
        if (effect.type === 'shieldRetain') {
          expect(effect.ratio).toBeGreaterThanOrEqual(0);
          expect(effect.ratio).toBeLessThanOrEqual(1);
        } else {
          for (const value of effectNumbers(effect)) {
            expect(value).toBeGreaterThan(0);
          }
        }
        for (const value of effectNumbers(effect)) {
          expect(relic.description).toContain(String(value));
        }
      }
    }
  });

  it('has the required starting balance values', () => {
    expect(GAME_CONTENT.balance).toEqual({
      playerMaxHp: 60,
      perGem: { red: 3, purple: 2, green: 1, yellow: 1 },
      chainBonus: 0.5,
      levelBonus: 0.25,
      rewardOptionCount: 3,
      rerollCost: 15,
      healAfterCombat: 0.2,
    });
  });
});
