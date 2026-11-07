import { describe, expect, it } from 'vitest';
import * as combat from '../src/combat/index';
import * as core from '../src/core/index';
import type { Board, CombatApi, CombatState, EnemyDef, GameContent, GemColor, Move, PlayerState, RelicEffect } from '../src/types';

const api: CombatApi = combat;
const colors: GemColor[] = ['red', 'purple', 'green', 'yellow'];
const gem = (color: GemColor) => ({ kind: 'gem' as const, color });
const move: Move = { a: { row: 0, col: 1 }, b: { row: 1, col: 1 } };
const board = (color: GemColor = 'red', size = 3): Board => {
  const palette = [color, ...colors.filter(c => c !== color)].slice(0, 3);
  const b: Board = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => gem(palette[(r * 2 + c) % 3]!)));
  b[0]![2] = gem(color);
  b[0]![3] = gem(size === 4 ? color : palette[2]!);
  return b;
};
const player = (): PlayerState => ({ hp: 20, maxHp: 30, gold: 0, colors: [...colors], colorLevels: { red: 0, purple: 0, green: 0, yellow: 0 }, relics: [] });
const enemy = (): EnemyDef => ({ id: 'enemy', name: 'enemy', maxHp: 500, attack: 8, countdown: 3, junkPerAction: 0, isBoss: false, abilities: [], trait: '' });
const content = (): GameContent => ({
  enemies: [enemy()], relics: [],
  balance: { playerMaxHp: 30, perGem: { red: 2, purple: 2, green: 2, yellow: 2 }, chainBonus: 0.5, levelBonus: 0.25, rewardOptionCount: 3, rerollCost: 1, healAfterCombat: 0 },
});
const state = (b = board()): CombatState => ({ board: b, player: player(), shield: 0, enemy: { id: 'enemy', hp: 500, countdown: 3, regenerated: false, enraged: false }, turn: 0, status: 'ongoing', rngState: 0 });
function equip(s: CombatState, c: GameContent, effects: RelicEffect[]): void {
  s.player.relics.push('relic');
  c.relics.push({ id: 'relic', name: 'relic', description: '', effects });
}
// Select a reproducible RNG state by inspecting the actual, hand-built board's cascades.
function seedFor(s: CombatState, predicate: (steps: ReturnType<typeof core.applyMove>['steps']) => boolean): number {
  for (let seed = 0; seed < 2000; seed++) {
    const result = core.applyMove(s.board, move, core.createRng(seed), s.player.colors);
    if (result.valid && predicate(result.steps)) return seed;
  }
  throw new Error('No seed found for the requested cascade');
}
const single = (s: CombatState): void => { s.rngState = seedFor(s, steps => steps.length === 1 && steps[0]!.groups.length === 1); };
const countJunk = (b: Board) => b.flat().filter(cell => cell?.kind === 'junk').length;

describe('combat', () => {
  it('implements CombatApi', () => {
    expect(api.createCombat).toBeTypeOf('function');
    expect(api.applyTurn).toBeTypeOf('function');
  });

  it('creates seeded combat with relic bonuses, without mutating the player', () => {
    const c = content(), p = player();
    p.relics.push('relic');
    c.relics.push({ id: 'relic', name: '', description: '', effects: [
      { type: 'startShield', amount: 4 }, { type: 'startShield', amount: 3 },
      { type: 'enemyCountdown', delta: -99 }, { type: 'maxHp', amount: 50 },
    ] });
    const before = structuredClone(p), rng = core.createRng(42);
    const expectedBoard = core.createBoard(rng, p.colors);
    const result = api.createCombat(p, c.enemies[0]!, c, 42);
    expect(result).toEqual({ board: expectedBoard, player: before, shield: 7, enemy: { id: 'enemy', hp: 500, countdown: 1, regenerated: false, enraged: false }, turn: 0, status: 'ongoing', rngState: rng.state() });
    expect(p).toEqual(before);
    expect(api.createCombat(p, c.enemies[0]!, c, 42)).toEqual(result);
    expect(() => api.createCombat({ ...p, relics: ['missing'] }, c.enemies[0]!, c, 1)).toThrow();
    expect(() => api.createCombat(p, { ...c.enemies[0]!, id: 'missing' }, c, 1)).toThrow();
  });

  it('routes all four colors and caps healing only in player state', () => {
    for (const color of colors) {
      const s = state(board(color)), c = content();
      s.player.hp = 29;
      single(s);
      const result = api.applyTurn(s, move, c);
      const expected = { damage: 0, shield: 0, heal: 0, gold: 0 };
      expected[{ red: 'damage', purple: 'shield', green: 'heal', yellow: 'gold' }[color] as keyof typeof expected] = 6;
      expect(result.effects).toEqual(expected);
      expect(result.state.player.hp).toBe(color === 'green' ? 30 : 29);
      expect(result.state.player.gold).toBe(color === 'yellow' ? 6 : 0);
      expect(result.state.shield).toBe(color === 'purple' ? 6 : 0);
      expect(result.state.enemy.hp).toBe(color === 'red' ? 494 : 500);
    }
  });

  it('multiplies eligible big matches, applies levels, and adds flats after flooring per group', () => {
    for (const size of [3, 4]) {
      const s = state(board('red', size)), c = content();
      c.balance.perGem.red = 1.1;
      s.player.colorLevels.red = 1;
      equip(s, c, [
        { type: 'bigMatch', minSize: 4, multiplier: 1.5 },
        { type: 'bigMatch', minSize: 4, multiplier: 2 },
        { type: 'colorFlat', color: 'red', flat: 2 }, { type: 'colorFlat', color: 'red', flat: 1 },
        { type: 'colorFlat', color: 'green', flat: 100 },
      ]);
      single(s);
      const result = api.applyTurn(s, move, c);
      expect(result.steps[0]!.groups[0]!.cells).toHaveLength(size);
      expect(result.effects.damage).toBe(size === 3 ? 7 : 19);
    }
  });

  it('applies chain bonuses and flats separately for every cascade group', () => {
    const s = state(), c = content();
    c.balance.perGem = { red: 1.1, purple: 1.1, green: 1.1, yellow: 1.1 };
    s.player.colorLevels = { red: 1, purple: 1, green: 1, yellow: 1 };
    equip(s, c, [{ type: 'chainBonus', bonus: 0.3 }, ...colors.map(color => ({ type: 'colorFlat' as const, color, flat: 2 }))]);
    s.rngState = seedFor(s, steps => steps.length >= 2);
    const result = api.applyTurn(s, move, c);
    const expected = { damage: 0, shield: 0, heal: 0, gold: 0 };
    for (const step of result.steps) for (const group of step.groups) {
      const key = { red: 'damage', purple: 'shield', green: 'heal', yellow: 'gold' }[group.color] as keyof typeof expected;
      expected[key] += Math.floor(group.cells.length * 1.1 * (1 + 0.8 * (step.chain - 1)) * 1.25) + 2;
    }
    expect(result.effects).toEqual(expected);
  });

  it('wins before the enemy can act', () => {
    const s = state(), c = content(); single(s);
    s.enemy.hp = 1; s.enemy.countdown = 1;
    const result = api.applyTurn(s, move, c);
    expect(result.state.status).toBe('won');
    expect(result.state.enemy.hp).toBe(0);
    expect(result.state.enemy.countdown).toBe(1);
    expect(result.enemyAction).toBeNull();
  });

  it('absorbs attacks, resets shield, and floors and caps retention', () => {
    for (const [shield, ratios, absorbed, hpLost, remaining] of [
      [3, [], 3, 5, 0], [20, [], 8, 0, 0], [19, [0.25, 0.25], 8, 0, 5], [19, [0.75, 0.75], 8, 0, 11],
    ] as [number, number[], number, number, number][]) {
      const s = state(), c = content(); single(s);
      s.shield = shield; s.enemy.countdown = 1;
      equip(s, c, ratios.map(ratio => ({ type: 'shieldRetain', ratio })));
      const result = api.applyTurn(s, move, c);
      expect(result.enemyAction).toEqual({ attack: 8, shieldAbsorbed: absorbed, hpLost, goldStolen: 0, junkAdded: 0, reshuffled: false });
      expect(result.state.shield).toBe(remaining);
      expect(result.state.player.hp).toBe(20 - hpLost);
    }
  });

  it('floors modified enemy attack and reports its shield and hp damage', () => {
    const s = state(), c = content(); single(s);
    s.shield = 3; s.enemy.countdown = 1;
    equip(s, c, [{ type: 'enemyAttack', multiplier: 0.7 }]);
    const result = api.applyTurn(s, move, c);
    expect(result.enemyAction).toEqual({ attack: 5, shieldAbsorbed: 3, hpLost: 2, goldStolen: 0, junkAdded: 0, reshuffled: false });
    expect(result.state.player.hp).toBe(18);
    expect(result.state.shield).toBe(0);
  });

  it('stacks enemy attack multipliers across relics before flooring', () => {
    const s = state(), c = content(); single(s);
    s.shield = 6; s.enemy.countdown = 1;
    equip(s, c, [{ type: 'enemyAttack', multiplier: 0.7 }]);
    s.player.relics.push('second');
    c.relics.push({ id: 'second', name: '', description: '', effects: [{ type: 'enemyAttack', multiplier: 1.5 }] });
    const result = api.applyTurn(s, move, c);
    expect(result.enemyAction).toEqual({ attack: 8, shieldAbsorbed: 6, hpLost: 2, goldStolen: 0, junkAdded: 0, reshuffled: false });
    expect(result.state.player.hp).toBe(18);
  });

  it('counts down and resets to at least one, and reports lethal damage as actual hp lost', () => {
    const s = state(), c = content(); single(s);
    s.enemy.countdown = 2;
    equip(s, c, [{ type: 'enemyCountdown', delta: -20 }]);
    const first = api.applyTurn(s, move, c);
    expect(first.enemyAction).toBeNull();
    expect(first.state.enemy.countdown).toBe(1);
    const lethal = structuredClone(s); lethal.enemy.countdown = 1; lethal.player.hp = 2;
    const second = api.applyTurn(lethal, move, c);
    expect(second.enemyAction?.hpLost).toBe(2);
    expect(second.state.player.hp).toBe(0);
    expect(second.state.status).toBe('lost');
    expect(second.state.enemy.countdown).toBe(1);
  });

  it('heals for junk cleared across cascade steps and adds playable enemy junk', () => {
    const s = state(), c = content();
    s.board[1]![0] = { kind: 'junk' };
    s.board[1]![3] = { kind: 'junk' };
    s.rngState = seedFor(s, steps => steps.filter(step => step.clearedJunk.length > 0).length >= 2);
    s.enemy.countdown = 1; c.enemies[0]!.junkPerAction = 3;
    equip(s, c, [{ type: 'junkHeal', amount: 7 }]);
    const without = structuredClone(c); without.relics[0]!.effects = [];
    const base = api.applyTurn(s, move, without);
    const result = api.applyTurn(s, move, c);
    const cleared = result.steps.reduce((sum, step) => sum + step.clearedJunk.length, 0);
    expect(result.steps.filter(step => step.clearedJunk.length > 0).length).toBeGreaterThanOrEqual(2);
    expect(result.effects.heal - base.effects.heal).toBe(7 * cleared);
    // The move may reshuffle before the action; its settled board is the authoritative starting point.
    const resolved = core.applyMove(s.board, move, core.createRng(s.rngState), s.player.colors);
    expect(result.enemyAction?.junkAdded).toBe(Math.max(0, countJunk(result.state.board) - countJunk(resolved.board)));
    expect(result.enemyAction?.junkAdded).toBeGreaterThan(0);
    expect(core.findMatches(result.state.board)).toEqual([]);
    expect(core.findValidMoves(result.state.board).length).toBeGreaterThan(0);
  });

  it('rejects invalid and finished turns without changes and is deterministic and pure', () => {
    const s = state(), c = content(); single(s);
    const before = structuredClone(s), oldContent = structuredClone(c), oldMove = structuredClone(move);
    const invalid = { a: { row: -1, col: 0 }, b: { row: 0, col: 0 } };
    const empty = { valid: false, steps: [], effects: { damage: 0, shield: 0, heal: 0, gold: 0 }, enemyEvents: { armorBlocked: 0, regenerated: 0, enraged: false }, reshuffled: false, enemyAction: null, state: s };
    expect(api.applyTurn(s, invalid, c)).toEqual(empty);
    for (const status of ['won', 'lost'] as const) {
      const finished = { ...s, status };
      expect(api.applyTurn(finished, move, c)).toEqual({ ...empty, state: finished });
    }
    expect(api.applyTurn(s, move, c)).toEqual(api.applyTurn(s, move, c));
    expect(s).toEqual(before); expect(c).toEqual(oldContent); expect(move).toEqual(oldMove);
    expect(() => api.applyTurn({ ...s, enemy: { ...s.enemy, id: 'missing' } }, move, c)).toThrow();
    expect(() => api.applyTurn({ ...s, player: { ...s.player, relics: ['missing'] } }, move, c)).toThrow();
  });
});

describe('special gem values', () => {
  it('values blasted gems by chain and level, without big-match multipliers or color flats', () => {
    const s = state(), c = content();
    s.player.colorLevels.green = 2;
    equip(s, c, [{ type: 'bigMatch', minSize: 1, multiplier: 10 }, { type: 'colorFlat', color: 'green', flat: 50 }]);
    s.board[3]![5] = { kind: 'gem', color: 'red', special: 'row' };
    // Match the special by making column 5 red at rows 2..4.
    s.board[2]![5] = gem('red'); s.board[4]![4] = gem('red'); s.board[4]![5] = gem('purple');
    const swapMove: Move = { a: { row: 4, col: 4 }, b: { row: 4, col: 5 } };
    const preview = core.applyMove(s.board, swapMove, core.createRng(0), s.player.colors);
    expect(preview.valid).toBe(true);
    const result = api.applyTurn(s, swapMove, c);
    const expected = { damage: 0, shield: 0, heal: 0, gold: 0 };
    const field = { red: 'damage', purple: 'shield', green: 'heal', yellow: 'gold' } as const;
    for (const step of result.steps) {
      const chain = 1 + 0.5 * (step.chain - 1);
      for (const group of step.groups) expected[field[group.color]] += Math.floor(group.cells.length * 2 * chain
        * (1 + 0.25 * s.player.colorLevels[group.color]) * 10) + (group.color === 'green' ? 50 : 0);
      for (const group of step.blasted) expected[field[group.color]] += Math.floor(group.cells.length * 2 * chain
        * (1 + 0.25 * s.player.colorLevels[group.color]));
    }
    expect(result.steps[0]!.blasts.length).toBeGreaterThan(0);
    expect(result.steps[0]!.blasted.length).toBeGreaterThan(0);
    expect(result.effects).toEqual(expected);
  });
});

describe('enemy abilities', () => {
  const withAbility = (abilities: EnemyDef['abilities'], tweak: Partial<EnemyDef> = {}) => {
    const c = content();
    c.enemies[0] = { ...c.enemies[0]!, abilities, ...tweak };
    return c;
  };

  it('armor reduces each turn of damage and reports what it blocked', () => {
    const c = withAbility([{ type: 'armor', amount: 4 }]);
    const s = state(); single(s);
    const result = api.applyTurn(s, move, c);
    expect(result.effects.damage).toBe(2);
    expect(result.enemyEvents.armorBlocked).toBe(4);
    expect(result.state.enemy.hp).toBe(498);
    const blocked = withAbility([{ type: 'armor', amount: 50 }]);
    const all = api.applyTurn(s, move, blocked);
    expect([all.effects.damage, all.enemyEvents.armorBlocked, all.state.enemy.hp]).toEqual([0, 6, 500]);
  });

  it('regenerates once when damage crosses the threshold, but not on a kill', () => {
    const c = withAbility([{ type: 'regenerate', threshold: 0.5, healRatio: 0.25 }]);
    const s = state(); single(s);
    s.enemy.hp = 255;
    const first = api.applyTurn(s, move, c);
    expect(first.state.enemy.hp).toBe(249 + 125);
    expect(first.enemyEvents.regenerated).toBe(125);
    expect(first.state.enemy.regenerated).toBe(true);
    const again = api.applyTurn({ ...first.state, enemy: { ...first.state.enemy, hp: 200 }, board: s.board, rngState: s.rngState }, move, c);
    expect(again.enemyEvents.regenerated).toBe(0);
    const kill = api.applyTurn({ ...s, enemy: { ...s.enemy, hp: 6 } }, move, c);
    expect(kill.state.status).toBe('won');
    expect(kill.enemyEvents.regenerated).toBe(0);
  });

  it('steals gold on each attack, never more than the player has', () => {
    const c = withAbility([{ type: 'stealGold', amount: 5 }]);
    for (const [gold, stolen] of [[3, 3], [12, 5]] as const) {
      const s = state(); single(s);
      s.player.gold = gold; s.enemy.countdown = 1;
      const result = api.applyTurn(s, move, c);
      expect(result.enemyAction?.goldStolen).toBe(stolen);
      expect(result.state.player.gold).toBe(gold - stolen);
    }
  });

  it('adds hard junk when the enemy has hardJunk', () => {
    const c = withAbility([{ type: 'hardJunk' }], { junkPerAction: 3 });
    const s = state(); single(s);
    s.enemy.countdown = 1;
    const result = api.applyTurn(s, move, c);
    const hard = result.state.board.flat().filter(cell => cell?.kind === 'junk' && cell.hard).length;
    expect(result.enemyAction?.junkAdded).toBeGreaterThan(0);
    expect(hard).toBe(result.enemyAction?.junkAdded);
  });

  it('enrages below the threshold: shorter countdown now and later, and extra junk', () => {
    const c = withAbility([{ type: 'enrage', threshold: 0.5, countdownDelta: -1, junkBonus: 2 }]);
    const s = state(); single(s);
    s.enemy.hp = 253;
    const first = api.applyTurn(s, move, c);
    expect(first.enemyEvents.enraged).toBe(true);
    expect(first.state.enemy.enraged).toBe(true);
    expect(first.state.enemy.countdown).toBe(1);
    expect(first.enemyAction).toBeNull();
    const next = { ...first.state, board: s.board, rngState: s.rngState };
    const second = api.applyTurn(next, move, c);
    expect(second.enemyEvents.enraged).toBe(false);
    expect(second.enemyAction?.junkAdded).toBe(2);
    expect(second.state.enemy.countdown).toBe(2);
  });
});
