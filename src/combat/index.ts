import { addJunk, applyMove, createBoard, createRng } from '../core/index';
import type {
  Board, CombatState, EffectTotals, EnemyDef, GameContent, Move, PlayerState, RelicEffect, TurnResult,
} from '../types';

function relicEffects(player: PlayerState, content: GameContent): RelicEffect[] {
  return player.relics.flatMap(id => {
    const relic = content.relics.find(item => item.id === id);
    if (!relic) throw new Error(`Unknown relic: ${id}`);
    return relic.effects;
  });
}

function countdown(enemy: EnemyDef, effects: RelicEffect[]): number {
  return Math.max(1, enemy.countdown + effects.reduce(
    (sum, effect) => sum + (effect.type === 'enemyCountdown' ? effect.delta : 0), 0,
  ));
}

function junkCount(board: Board): number {
  return board.flat().filter(cell => cell?.kind === 'junk').length;
}

export function createCombat(player: PlayerState, enemy: EnemyDef, content: GameContent, seed: number): CombatState {
  const effects = relicEffects(player, content);
  if (!content.enemies.some(item => item.id === enemy.id)) throw new Error(`Unknown enemy: ${enemy.id}`);
  const rng = createRng(seed);
  const board = createBoard(rng, player.colors);
  return {
    board,
    player: { ...player, colors: [...player.colors], colorLevels: { ...player.colorLevels }, relics: [...player.relics] },
    shield: effects.reduce((sum, effect) => sum + (effect.type === 'startShield' ? effect.amount : 0), 0),
    enemy: { id: enemy.id, hp: enemy.maxHp, countdown: countdown(enemy, effects) },
    turn: 0,
    status: 'ongoing',
    rngState: rng.state(),
  };
}

export function applyTurn(state: CombatState, move: Move, content: GameContent): TurnResult {
  const empty = (): TurnResult => ({
    valid: false, steps: [], effects: { damage: 0, shield: 0, heal: 0, gold: 0 }, reshuffled: false, enemyAction: null, state,
  });
  if (state.status !== 'ongoing') return empty();
  const rng = createRng(state.rngState);
  const result = applyMove(state.board, move, rng, state.player.colors);
  if (!result.valid) return empty();

  const relics = relicEffects(state.player, content);
  const enemyDef = content.enemies.find(enemy => enemy.id === state.enemy.id);
  if (!enemyDef) throw new Error(`Unknown enemy: ${state.enemy.id}`);
  const chainBonus = relics.reduce((sum, effect) => sum + (effect.type === 'chainBonus' ? effect.bonus : 0), content.balance.chainBonus);
  const junkHeal = relics.reduce((sum, effect) => sum + (effect.type === 'junkHeal' ? effect.amount : 0), 0);
  const totals: EffectTotals = { damage: 0, shield: 0, heal: 0, gold: 0 };
  for (const step of result.steps) {
    totals.heal += junkHeal * step.clearedJunk.length;
    for (const group of step.groups) {
      let multiplier = 1;
      let flat = 0;
      for (const effect of relics) {
        if (effect.type === 'bigMatch' && group.cells.length >= effect.minSize) multiplier *= effect.multiplier;
        if (effect.type === 'colorFlat' && effect.color === group.color) flat += effect.flat;
      }
      const value = Math.floor(group.cells.length * content.balance.perGem[group.color]
        * (1 + chainBonus * (step.chain - 1))
        * (1 + content.balance.levelBonus * state.player.colorLevels[group.color]) * multiplier) + flat;
      switch (group.color) {
        case 'red': totals.damage += value; break;
        case 'purple': totals.shield += value; break;
        case 'green': totals.heal += value; break;
        case 'yellow': totals.gold += value; break;
      }
    }
  }

  const next: CombatState = {
    ...state,
    board: result.board,
    player: { ...state.player, hp: Math.min(state.player.maxHp, Math.max(0, state.player.hp + totals.heal)), gold: state.player.gold + totals.gold },
    shield: state.shield + totals.shield,
    enemy: { ...state.enemy, hp: Math.max(0, state.enemy.hp - totals.damage) },
    turn: state.turn + 1,
    rngState: rng.state(),
  };
  let enemyAction: TurnResult['enemyAction'] = null;
  if (next.enemy.hp <= 0) {
    next.status = 'won';
  } else {
    next.enemy.countdown--;
    if (next.enemy.countdown <= 0) {
      const attack = Math.floor(enemyDef.attack * relics.reduce(
        (product, effect) => product * (effect.type === 'enemyAttack' ? effect.multiplier : 1), 1,
      ));
      const shieldAbsorbed = Math.min(next.shield, attack);
      const hpLost = Math.min(next.player.hp, attack - shieldAbsorbed);
      next.player.hp -= hpLost;
      const retain = Math.min(1, relics.reduce((sum, effect) => sum + (effect.type === 'shieldRetain' ? effect.ratio : 0), 0));
      next.shield = Math.floor((next.shield - shieldAbsorbed) * retain);
      const before = junkCount(next.board);
      const junk = addJunk(next.board, enemyDef.junkPerAction, rng, state.player.colors);
      next.board = junk.board;
      next.enemy.countdown = countdown(enemyDef, relics);
      next.rngState = rng.state();
      enemyAction = { attack, shieldAbsorbed, hpLost, junkAdded: Math.max(0, junkCount(junk.board) - before), reshuffled: junk.reshuffled };
    }
    if (next.player.hp <= 0) next.status = 'lost';
  }
  return { valid: true, steps: result.steps, effects: totals, reshuffled: result.reshuffled, enemyAction, state: next };
}
