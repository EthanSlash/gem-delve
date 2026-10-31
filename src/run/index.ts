import { createCombat, applyTurn } from '../combat/index';
import { createRng } from '../core/index';
import { ALL_COLORS, MIN_COLORS } from '../types';
import type { GameContent, Move, PlayerState, RewardOption, Rng, RunState, RunTurnResult, TurnResult } from '../types';

function startCombat(player: PlayerState, floor: number, content: GameContent, rng: Rng) {
  const enemy = content.enemies[floor - 1];
  if (!enemy) throw new Error(`No enemy on floor ${floor}`);
  return createCombat(player, enemy, content, rng.int(2147483647));
}

function offers(player: PlayerState, content: GameContent, rng: Rng): RewardOption[] {
  const relics: RewardOption[] = content.relics
    .filter(relic => !player.relics.includes(relic.id))
    .map(relic => ({ type: 'relic', relicId: relic.id }));
  const upgrades: RewardOption[] = player.colors.map(color => ({ type: 'upgradeColor', color }));
  const removals: RewardOption[] = player.colors.length > MIN_COLORS
    ? player.colors.map(color => ({ type: 'removeColor', color })) : [];
  const pool = [...relics, ...upgrades, ...removals];
  const result: RewardOption[] = [];
  const take = (group: RewardOption[]) => {
    if (!group.length || result.length >= content.balance.rewardOptionCount) return;
    const selected = group[rng.int(group.length)]!;
    result.push(selected);
    pool.splice(pool.indexOf(selected), 1);
  };
  take(relics);
  take(upgrades);
  take(removals);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return result.concat(pool.slice(0, Math.max(0, content.balance.rewardOptionCount - result.length)));
}

export function createRun(seed: number, content: GameContent): RunState {
  const rng = createRng(seed);
  const player: PlayerState = {
    hp: content.balance.playerMaxHp,
    maxHp: content.balance.playerMaxHp,
    gold: 0,
    colors: [...ALL_COLORS],
    colorLevels: { red: 0, purple: 0, green: 0, yellow: 0 },
    relics: [],
  };
  const combat = startCombat(player, 1, content, rng);
  return { seed, rngState: rng.state(), floor: 1, status: 'combat', player, combat, rewards: null };
}

export function playMove(run: RunState, move: Move, content: GameContent): RunTurnResult {
  if (!run.combat) throw new Error('Run has no combat');
  if (run.status !== 'combat') {
    const turn: TurnResult = {
      valid: false, steps: [], effects: { damage: 0, shield: 0, heal: 0, gold: 0 },
      enemyAction: null, state: run.combat,
    };
    return { turn, run };
  }
  const turn = applyTurn(run.combat, move, content);
  if (!turn.valid) return { turn, run };
  if (turn.state.status === 'lost') {
    return { turn, run: { ...run, player: turn.state.player, combat: turn.state, status: 'lost' } };
  }
  if (turn.state.status === 'won') {
    const player = {
      ...turn.state.player,
      hp: Math.min(turn.state.player.maxHp, turn.state.player.hp
        + Math.floor(content.balance.healAfterCombat * turn.state.player.maxHp)),
    };
    if (run.floor === content.enemies.length) {
      return { turn, run: { ...run, player, combat: turn.state, status: 'won' } };
    }
    const rng = createRng(run.rngState);
    const rewards = offers(player, content, rng);
    return { turn, run: { ...run, player, combat: null, rewards, status: 'reward', rngState: rng.state() } };
  }
  return { turn, run: { ...run, combat: turn.state, player: turn.state.player } };
}

export function chooseReward(run: RunState, index: number, content: GameContent): RunState {
  const option = run.rewards?.[index];
  if (run.status !== 'reward' || !Number.isInteger(index) || !option) return run;
  let player: PlayerState = { ...run.player };
  switch (option.type) {
    case 'relic': {
      const relic = content.relics.find(item => item.id === option.relicId);
      if (!relic) throw new Error(`Unknown relic: ${option.relicId}`);
      const addedHp = relic.effects.reduce((total, effect) => total + (effect.type === 'maxHp' ? effect.amount : 0), 0);
      player = { ...player, relics: [...player.relics, option.relicId], maxHp: player.maxHp + addedHp, hp: player.hp + addedHp };
      break;
    }
    case 'upgradeColor':
      player = { ...player, colorLevels: { ...player.colorLevels, [option.color]: player.colorLevels[option.color] + 1 } };
      break;
    case 'removeColor':
      player = { ...player, colors: player.colors.filter(color => color !== option.color) };
      break;
  }
  const rng = createRng(run.rngState);
  const floor = run.floor + 1;
  const combat = startCombat(player, floor, content, rng);
  return { ...run, player, floor, combat, status: 'combat', rewards: null, rngState: rng.state() };
}

export function rerollRewards(run: RunState, content: GameContent): RunState {
  if (run.status !== 'reward' || run.player.gold < content.balance.rerollCost) return run;
  const player = { ...run.player, gold: run.player.gold - content.balance.rerollCost };
  const rng = createRng(run.rngState);
  const rewards = offers(player, content, rng);
  return { ...run, player, rewards, rngState: rng.state() };
}
