import { applyTurn } from '../src/combat/index';
import { createRng, findValidMoves } from '../src/core/index';
import { chooseReward, createRun, playMove, rerollRewards } from '../src/run/index';
import type { CombatState, GameContent, GemColor, Move, RewardOption } from '../src/types';

export type PolicyName = 'random' | 'greedy';
export interface RunRecord {
  seed: number; policy: PolicyName; won: boolean; floorReached: number; turns: number;
  finalHp: number; gold: number; relics: string[]; colors: GemColor[];
}
export interface PolicySummary {
  policy: PolicyName; runs: number; winRate: number; averageFloor: number; averageTurns: number;
  endedOnFloor: number[];
  relicPickRate: Record<string, number>;
  relicWinRate: Record<string, number>;
}

export function greedyMove(state: CombatState, moves: readonly Move[], content: GameContent): Move {
  const attack = content.enemies.find(enemy => enemy.id === state.enemy.id)?.attack;
  if (attack === undefined || moves.length === 0) throw new Error('Cannot choose a move');
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const move of moves) {
    const result = applyTurn(state, move, content);
    if (result.state.status === 'won') return move;
    const healed = Math.min(result.effects.heal, state.player.maxHp - state.player.hp);
    const score = result.effects.damage * 3 + Math.min(result.effects.shield, attack) * 2
      + healed * 2 + result.effects.gold * 0.25;
    if (score > bestScore) { best = move; bestScore = score; }
  }
  return best;
}

export function greedyReward(options: readonly RewardOption[]): number {
  for (const matches of [
    (option: RewardOption) => option.type === 'relic',
    (option: RewardOption) => option.type === 'upgradeColor' && option.color === 'red',
    (option: RewardOption) => option.type === 'removeColor' && option.color === 'yellow',
  ]) {
    const index = options.findIndex(matches);
    if (index !== -1) return index;
  }
  return 0;
}

export function simulateRun(seed: number, policy: PolicyName, content: GameContent): RunRecord {
  const policyRng = createRng(seed ^ 0x9e3779b9);
  let run = createRun(seed, content);
  let turns = 0;
  while (run.status !== 'won' && run.status !== 'lost' && turns < 500) {
    if (run.status === 'reward') {
      const cost = content.balance.rerollCost;
      // A free reroll cannot make progress toward the gold threshold.
      if (policy === 'greedy' && cost === 0 && !run.rewards!.some(option => option.type === 'relic')) {
        run = rerollRewards(run, content);
      }
      while (policy === 'greedy' && cost > 0 && run.player.gold >= 2 * cost
        && !run.rewards!.some(option => option.type === 'relic')) {
        run = rerollRewards(run, content);
      }
      const options = run.rewards!;
      if (!options.length) throw new Error('Reward offer is empty');
      run = chooseReward(run, policy === 'greedy' ? greedyReward(options) : policyRng.int(options.length), content);
    } else {
      const state = run.combat!;
      const moves = findValidMoves(state.board);
      if (!moves.length) throw new Error('Combat board has no valid moves');
      const move = policy === 'greedy' ? greedyMove(state, moves, content) : moves[policyRng.int(moves.length)]!;
      run = playMove(run, move, content).run;
      turns++;
    }
  }
  return { seed, policy, won: run.status === 'won', floorReached: run.floor, turns,
    finalHp: run.player.hp, gold: run.player.gold, relics: [...run.player.relics], colors: [...run.player.colors] };
}

export function summarize(records: RunRecord[], content: GameContent): PolicySummary {
  const runs = records.length;
  const endedOnFloor = content.enemies.map(() => 0);
  const relicPickRate: Record<string, number> = Object.create(null);
  const relicWinRate: Record<string, number> = Object.create(null);
  for (const relic of content.relics) {
    const picked = records.filter(record => record.relics.includes(relic.id));
    relicPickRate[relic.id] = runs ? picked.length / runs : 0;
    relicWinRate[relic.id] = picked.length ? picked.filter(record => record.won).length / picked.length : 0;
  }
  for (const record of records) {
    if (record.floorReached >= 1 && record.floorReached <= endedOnFloor.length) endedOnFloor[record.floorReached - 1]!++;
  }
  return { policy: records[0]?.policy ?? 'random', runs,
    winRate: runs ? records.filter(record => record.won).length / runs : 0,
    averageFloor: runs ? records.reduce((sum, record) => sum + record.floorReached, 0) / runs : 0,
    averageTurns: runs ? records.reduce((sum, record) => sum + record.turns, 0) / runs : 0,
    endedOnFloor, relicPickRate, relicWinRate };
}
