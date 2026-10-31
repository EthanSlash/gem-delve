import { describe, expect, it } from 'vitest';
import * as runApi from '../src/run/index';
import { createRng, findValidMoves } from '../src/core/index';
import { createCombat } from '../src/combat/index';
import { ALL_COLORS, MIN_COLORS } from '../src/types';
import type { GameContent, Move, RewardOption, RunApi, RunState } from '../src/types';

const api: RunApi = runApi;
const content = (): GameContent => ({
  enemies: [1, 2, 3].map(n => ({
    id: `enemy-${n}`, name: `Enemy ${n}`, maxHp: 1, attack: 0, countdown: 2,
    junkPerAction: 0, isBoss: n === 3,
  })),
  relics: [
    { id: 'heart', name: 'Heart', description: '', effects: [{ type: 'maxHp', amount: 4 }, { type: 'maxHp', amount: 2 }] },
    { id: 'guard', name: 'Guard', description: '', effects: [{ type: 'startShield', amount: 5 }] },
  ],
  balance: {
    playerMaxHp: 10, perGem: { red: 10, purple: 1, green: 1, yellow: 1 },
    chainBonus: 0, levelBonus: 0.25, rewardOptionCount: 3, rerollCost: 2,
    healAfterCombat: 0.25,
  },
});
const invalid: Move = { a: { row: -1, col: 0 }, b: { row: 0, col: 0 } };
const firstMove = (run: RunState): Move => findValidMoves(run.combat!.board)[0]!;
function finishCombat(run: RunState, game: GameContent): RunState {
  for (let i = 0; i < 200 && run.status === 'combat'; i++) {
    run = api.playMove(run, firstMove(run), game).run;
  }
  expect(run.status).not.toBe('combat');
  return run;
}
const rewardState = (game: GameContent, options: RewardOption[], seed = 17): RunState => ({
  ...api.createRun(seed, game), status: 'reward', combat: null, rewards: options,
});

describe('run', () => {
  it('implements RunApi and creates a seeded initial state', () => {
    expect(api.playMove).toBeTypeOf('function');
    expect(api.chooseReward).toBeTypeOf('function');
    expect(api.rerollRewards).toBeTypeOf('function');
    const game = content(), original = structuredClone(game);
    const initial = api.createRun(42, game);
    expect(initial).toEqual(api.createRun(42, game));
    expect(initial).toMatchObject({ seed: 42, floor: 1, status: 'combat', rewards: null,
      player: { hp: 10, maxHp: 10, gold: 0, colors: ALL_COLORS, colorLevels: { red: 0, purple: 0, green: 0, yellow: 0 }, relics: [] },
      combat: { enemy: { id: 'enemy-1', hp: 1 }, status: 'ongoing', shield: 0 },
    });
    const rng = createRng(42);
    const combatSeed = rng.int(2147483647);
    expect(initial.rngState).toBe(rng.state());
    expect(initial.combat).toEqual(createCombat(initial.player, game.enemies[0]!, game, combatSeed));
    expect(game).toEqual(original);
  });

  it('replays the same moves and rewards through all floors, ending won without a final offer', () => {
    const game = content();
    let a = api.createRun(83, game), b = api.createRun(83, game);
    for (let floor = 1; floor <= game.enemies.length; floor++) {
      for (let i = 0; i < 200 && a.status === 'combat'; i++) {
        const move = firstMove(a);
        a = api.playMove(a, move, game).run;
        b = api.playMove(b, move, game).run;
        expect(a).toEqual(b);
      }
      expect(a.status).toBe(floor === game.enemies.length ? 'won' : 'reward');
      expect(a.floor).toBe(floor);
      if (floor < game.enemies.length) {
        a = api.chooseReward(a, 0, game);
        b = api.chooseReward(b, 0, game);
        expect(a).toEqual(b);
      }
    }
    expect(a.rewards).toBeNull();
    expect(a.combat?.status).toBe('won');
  });

  it('keeps a lethal combat, and rejects invalid and non-combat moves', () => {
    const game = content();
    game.enemies[0]!.maxHp = 100000;
    game.enemies[0]!.attack = 100;
    game.enemies[0]!.countdown = 1;
    game.balance.perGem = { red: 0, purple: 0, green: 0, yellow: 0 };
    const start = api.createRun(5, game), before = structuredClone(start);
    const empty = { valid: false, steps: [], effects: { damage: 0, shield: 0, heal: 0, gold: 0 }, reshuffled: false, enemyAction: null, state: start.combat };
    expect(api.playMove(start, invalid, game)).toEqual({ turn: empty, run: start });
    const { run: lost, turn } = api.playMove(start, firstMove(start), game);
    expect(turn.valid).toBe(true);
    expect(lost.status).toBe('lost');
    expect(lost.player.hp).toBe(0);
    expect(lost.combat?.status).toBe('lost');
    expect(api.playMove(lost, invalid, game)).toEqual({ run: lost, turn: { ...empty, state: lost.combat } });
    expect(() => api.playMove({ ...lost, combat: null }, invalid, game)).toThrow();
    expect(start).toEqual(before);
  });

  it('persists hp, gold, and relics, floors and caps after-combat healing, and resets shield', () => {
    const game = content();
    const start = api.createRun(33, game);
    const modified: RunState = { ...start, combat: { ...start.combat!, shield: 9,
      enemy: { ...start.combat!.enemy, hp: 0 },
      player: { ...start.combat!.player, hp: 7, gold: 12, relics: ['guard'] },
    } };
    const before = structuredClone(modified);
    const { run: won, turn } = api.playMove(modified, firstMove(modified), game);
    expect(turn.state.player.hp).toBeGreaterThanOrEqual(7);
    expect(won.player.hp).toBe(Math.min(10, turn.state.player.hp + 2));
    expect(won.player.gold).toBe(turn.state.player.gold);
    expect(won.player.relics).toEqual(['guard']);
    expect(won.combat).toBeNull();
    expect(won.rewards).not.toBeNull();
    const next = api.chooseReward(won, won.rewards!.findIndex(o => o.type === 'upgradeColor'), game);
    expect(next.combat?.player).toEqual(next.player);
    expect(next.combat?.shield).toBe(5);
    expect(next.player.hp).toBe(won.player.hp);
    expect(next.player.gold).toBe(won.player.gold);
    expect(next.player.relics).toEqual(['guard']);
    expect(modified).toEqual(before);

    const capped: RunState = { ...modified, combat: { ...modified.combat!, player: { ...modified.combat!.player, hp: 9 } } };
    expect(api.playMove(capped, firstMove(capped), game).run.player.hp).toBe(10);
    game.balance.healAfterCombat = 0.19;
    const floored = api.playMove(modified, firstMove(modified), game);
    expect(floored.run.player.hp).toBe(Math.min(10, floored.turn.state.player.hp + 1));
  });

  it('applies each reward including all maxHp effects, and removes colors from new boards', () => {
    const game = content();
    for (const option of [
      { type: 'relic', relicId: 'heart' },
      { type: 'upgradeColor', color: 'purple' },
      { type: 'removeColor', color: 'yellow' },
    ] as RewardOption[]) {
      const offered = rewardState(game, [option]);
      const before = structuredClone(offered);
      const next = api.chooseReward(offered, 0, game);
      expect(next).toMatchObject({ floor: 2, status: 'combat', rewards: null, rngState: expect.any(Number) });
      expect(next.combat?.enemy.id).toBe('enemy-2');
      expect(next.combat?.player).toEqual(next.player);
      if (option.type === 'relic') {
        expect(next.player.relics).toEqual(['heart']);
        expect([next.player.maxHp, next.player.hp]).toEqual([16, 16]);
      } else if (option.type === 'upgradeColor') {
        expect(next.player.colorLevels.purple).toBe(1);
      } else {
        expect(next.player.colors).toEqual(['red', 'purple', 'green']);
        expect(next.player.colorLevels.yellow).toBe(0);
        expect(next.combat!.board.flat().every(cell => cell?.kind === 'gem' && cell.color !== 'yellow')).toBe(true);
      }
      expect(offered).toEqual(before);
    }
  });

  it('offers distinct options of each available type, omits held relics and removals at the minimum', () => {
    const game = content();
    game.balance.rewardOptionCount = 15;
    const starting = api.createRun(19, game);
    const won = finishCombat(starting, game);
    expect(won.rewards).toHaveLength(10);
    expect(new Set(won.rewards!.map(o => JSON.stringify(o))).size).toBe(10);
    expect(new Set(won.rewards!.map(o => o.type))).toEqual(new Set(['relic', 'upgradeColor', 'removeColor']));
    const reducedPlayer = { ...starting.player, colors: [...ALL_COLORS].slice(0, MIN_COLORS), relics: ['heart'] };
    const reduced: RunState = { ...starting, player: reducedPlayer,
      combat: createCombat(reducedPlayer, game.enemies[0]!, game, 19),
    };
    const smaller = finishCombat(reduced, game);
    expect(smaller.rewards).toHaveLength(4);
    expect(smaller.rewards!.some(o => o.type === 'removeColor' || (o.type === 'relic' && o.relicId === 'heart'))).toBe(false);
    expect(smaller.rewards!.map(o => o.type)).toContain('relic');
    const noRelics = content(); noRelics.relics = []; noRelics.balance.rewardOptionCount = 3;
    const offer = finishCombat(api.createRun(19, noRelics), noRelics).rewards!;
    expect(offer[0]?.type).toBe('upgradeColor');
    expect(offer[1]?.type).toBe('removeColor');
  });

  it('rerolls for gold, preserves inputs, and ignores wrong status, short gold, and bad indices', () => {
    const game = content();
    const reward = rewardState(game, [{ type: 'upgradeColor', color: 'red' }]);
    const original = structuredClone(reward), oldContent = structuredClone(game);
    expect(api.chooseReward(reward, -1, game)).toBe(reward);
    expect(api.chooseReward(reward, 1, game)).toBe(reward);
    expect(api.chooseReward(reward, 0.5, game)).toBe(reward);
    expect(api.rerollRewards(reward, game)).toBe(reward);
    const rich = { ...reward, player: { ...reward.player, gold: 5 } };
    const rerolled = api.rerollRewards(rich, game);
    expect(rerolled.player.gold).toBe(3);
    expect(rerolled.rewards).toHaveLength(3);
    expect(rerolled.rewards!.map(o => o.type)).toEqual(['relic', 'upgradeColor', 'removeColor']);
    expect(rerolled).toEqual(api.rerollRewards(rich, game));
    expect(api.chooseReward(api.createRun(17, game), 0, game)).toEqual(api.createRun(17, game));
    expect(api.rerollRewards(api.createRun(17, game), game)).toEqual(api.createRun(17, game));
    expect(reward).toEqual(original);
    expect(rich.player.gold).toBe(5);
    expect(game).toEqual(oldContent);
  });
});
