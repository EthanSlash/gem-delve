// Shared contract for every module. Only the lead author changes this file;
// a module that needs a change reports it instead of editing here.
//
// Conventions:
// - Boards are indexed board[row][col]; row 0 is the top, gravity pulls toward higher rows.
// - Every exported function is pure: it never mutates its inputs. The only exception is an
//   Rng argument, whose internal state advances.
// - All randomness goes through Rng, so one seed reproduces one whole run.

export const BOARD_SIZE = 6;
export const MIN_MATCH = 3;
export const MIN_COLORS = 3;

export type GemColor = 'red' | 'purple' | 'green' | 'yellow';
export const ALL_COLORS: readonly GemColor[] = ['red', 'purple', 'green', 'yellow'];

// A junk cell cannot be swapped and never matches. It falls with gravity, and it is cleared
// when a matched gem is orthogonally adjacent to it.
export type Cell = { kind: 'gem'; color: GemColor } | { kind: 'junk' };

// A settled board has no null cells. Null appears only inside CascadeStep.boardAfterClear.
export type Board = (Cell | null)[][];

export interface Pos {
  row: number;
  col: number;
}

export interface Move {
  a: Pos;
  b: Pos;
}

export interface Rng {
  // Uniform float in [0, 1).
  next(): number;
  // Uniform integer in [0, maxExclusive).
  int(maxExclusive: number): number;
  // Current state. createRng(state) continues the same sequence.
  state(): number;
}

// Straight runs of MIN_MATCH or more. Runs of one color that share a cell form one group,
// so an L or T shape is a single group with every cell listed once.
export interface MatchGroup {
  color: GemColor;
  cells: Pos[];
}

export interface CascadeStep {
  // 1 for the player's own swap, 2 for the first cascade, and so on.
  chain: number;
  groups: MatchGroup[];
  clearedJunk: Pos[];
  // Matched gems and adjacent junk removed, before anything falls.
  boardAfterClear: Board;
  // Settled after gravity and refill. Each column refills from the top.
  boardAfter: Board;
}

export interface MoveResult {
  valid: boolean;
  // Empty when invalid.
  steps: CascadeStep[];
  // The input board when invalid; otherwise the final settled board with no matches
  // and at least one valid move.
  board: Board;
  // True if the board had no valid move after settling and was reshuffled.
  reshuffled: boolean;
}

// Implemented by src/core/index.ts as named exports.
export interface CoreApi {
  // Seeded mulberry32. The same seed gives the same sequence.
  createRng(seed: number): Rng;
  // BOARD_SIZE square, no existing match, at least one valid move.
  createBoard(rng: Rng, colors: readonly GemColor[]): Board;
  findMatches(board: Board): MatchGroup[];
  // Every swap of two orthogonally adjacent gems that creates a match, listed once each.
  findValidMoves(board: Board): Move[];
  // Invalid when: out of bounds, not orthogonally adjacent, either cell is junk,
  // or the swap creates no match.
  applyMove(board: Board, move: Move, rng: Rng, colors: readonly GemColor[]): MoveResult;
  // Result has no match and at least one valid move. Must always terminate and must never
  // return an unplayable board. Tries, in order:
  //   1. Rearrange the existing gems, junk stays in place, for a bounded number of tries.
  //   2. Regenerate gems from colors, junk stays in place, for a bounded number of tries.
  //   3. A junk layout can make this impossible (a junk checkerboard leaves no two gems
  //      adjacent). Turn one random junk cell into a gem and go back to step 2. Repeat as
  //      needed; a board with no junk is always solvable.
  reshuffle(board: Board, rng: Rng, colors: readonly GemColor[]): Board;
  // Turns up to count random gems into junk, then reshuffles if needed so the board stays
  // playable. Never creates a match. Conversion stops once fewer than half the cells would
  // remain gems. The final junk count can be lower than requested if reshuffle removes junk.
  addJunk(
    board: Board,
    count: number,
    rng: Rng,
    colors: readonly GemColor[],
  ): { board: Board; reshuffled: boolean };
}

export type RelicId = string;
export type EnemyId = string;

// Relics are plain data so that content can be balanced without touching combat code.
export type RelicEffect =
  // Adds flat to a group's value after multipliers.
  | { type: 'colorFlat'; color: GemColor; flat: number }
  // Adds to balance.chainBonus while this relic is held.
  | { type: 'chainBonus'; bonus: number }
  // Multiplies a group's value when it has at least minSize cells.
  | { type: 'bigMatch'; minSize: number; multiplier: number }
  // Shield at the start of each combat.
  | { type: 'startShield'; amount: number }
  // Raises max HP and heals by the same amount when picked up.
  | { type: 'maxHp'; amount: number }
  // Fraction of shield kept after an enemy attack, 0 to 1. Effects add up, capped at 1.
  | { type: 'shieldRetain'; ratio: number }
  // Heals this amount for each junk cell cleared.
  | { type: 'junkHeal'; amount: number }
  // Added to each enemy's countdown length. Result is never below 1.
  | { type: 'enemyCountdown'; delta: number }
  // Multiplies the enemy's attack. Effects multiply together, and the result is floored.
  | { type: 'enemyAttack'; multiplier: number };

export interface RelicDef {
  id: RelicId;
  // Player-facing Traditional Chinese text.
  name: string;
  description: string;
  effects: RelicEffect[];
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  maxHp: number;
  attack: number;
  // Player moves between enemy actions.
  countdown: number;
  // Junk cells added on each enemy action.
  junkPerAction: number;
  isBoss: boolean;
}

export interface BalanceConfig {
  playerMaxHp: number;
  // Value per gem cleared: red damage, purple shield, green heal, yellow gold.
  perGem: Record<GemColor, number>;
  // Extra multiplier per chain beyond the first.
  chainBonus: number;
  // Extra multiplier per upgrade level of that color.
  levelBonus: number;
  rewardOptionCount: number;
  rerollCost: number;
  // Fraction of maxHp healed after each won combat.
  healAfterCombat: number;
}

export interface GameContent {
  // Index 0 is floor 1. Length is the number of floors. The last entry is the boss.
  enemies: EnemyDef[];
  relics: RelicDef[];
  balance: BalanceConfig;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  gold: number;
  // Colors that can appear on the board. Never fewer than MIN_COLORS.
  colors: GemColor[];
  colorLevels: Record<GemColor, number>;
  relics: RelicId[];
}

export type CombatStatus = 'ongoing' | 'won' | 'lost';

export interface CombatState {
  board: Board;
  player: PlayerState;
  shield: number;
  enemy: {
    id: EnemyId;
    hp: number;
    // Moves left until the enemy acts.
    countdown: number;
  };
  turn: number;
  status: CombatStatus;
  rngState: number;
}

export interface EffectTotals {
  damage: number;
  shield: number;
  heal: number;
  gold: number;
}

export interface EnemyAction {
  attack: number;
  shieldAbsorbed: number;
  hpLost: number;
  junkAdded: number;
  reshuffled: boolean;
}

export interface TurnResult {
  valid: boolean;
  steps: CascadeStep[];
  effects: EffectTotals;
  // True if the board was reshuffled after the player's cascades, before any enemy action.
  reshuffled: boolean;
  // Null if the enemy did not act this turn.
  enemyAction: EnemyAction | null;
  state: CombatState;
}

// Implemented by src/combat/index.ts as named exports.
//
// Group value, computed per MatchGroup in each CascadeStep, then summed by color:
//   chainMult = 1 + (chainBonus + sum of chainBonus relics) * (chain - 1)
//   levelMult = 1 + levelBonus * colorLevels[color]
//   sizeMult  = product of multiplier for every bigMatch relic with cells >= minSize
//   value = floor(cells * perGem[color] * chainMult * levelMult * sizeMult) + colorFlat total
//
// Turn order:
//   1. Invalid move: nothing changes, turn does not advance.
//   2. Apply cascades, add gold, add shield, heal (never above maxHp), deal damage.
//   3. If enemy hp <= 0: status 'won', the enemy does not act.
//   4. Countdown decreases by 1. At 0 the enemy acts: shield absorbs the attack first,
//      the rest hits hp, shield is then multiplied by the shieldRetain total and floored,
//      junk is added, and countdown resets.
//   5. If player hp <= 0: status 'lost'.
export interface CombatApi {
  createCombat(player: PlayerState, enemy: EnemyDef, content: GameContent, seed: number): CombatState;
  applyTurn(state: CombatState, move: Move, content: GameContent): TurnResult;
}

export type SoundEvent =
  | 'select'
  | 'invalid'
  | 'match'
  | 'hit'
  | 'shield'
  | 'heal'
  | 'gold'
  | 'enemyAttack'
  | 'reward'
  | 'win'
  | 'lose';

export type MusicTrack = 'title' | 'combat' | 'boss';

// Implemented by src/audio/index.ts as `createAudio(): GameAudio`.
export interface GameAudio {
  // Crossfades to a looping track, or fades out on null. The same track keeps playing without
  // restarting. Sound only starts after unlock(). Never throws.
  setMusic(track: MusicTrack | null): void;
  // Independent of setMuted, which silences sound effects only.
  setMusicMuted(muted: boolean): void;
  isMusicMuted(): boolean;
  // Stops or resumes the scheduler, for when the page is hidden or shown.
  setSuspended(suspended: boolean): void;
  // level raises the pitch of 'match' for longer chains: 1 is the first match.
  // Never throws, and does nothing while muted or where Web Audio is missing.
  play(event: SoundEvent, level?: number): void;
  // Call from a user gesture. iOS only starts audio inside one. Never throws.
  unlock(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export type RewardOption =
  | { type: 'relic'; relicId: RelicId }
  | { type: 'upgradeColor'; color: GemColor }
  | { type: 'removeColor'; color: GemColor };

export type RunStatus = 'combat' | 'reward' | 'won' | 'lost';

export interface RunState {
  seed: number;
  rngState: number;
  // 1-based index into content.enemies.
  floor: number;
  status: RunStatus;
  player: PlayerState;
  // Set while status is 'combat', and kept at its final state for 'won' and 'lost'.
  combat: CombatState | null;
  // Set while status is 'reward'.
  rewards: RewardOption[] | null;
}

export interface RunTurnResult {
  turn: TurnResult;
  run: RunState;
}

// Implemented by src/run/index.ts as named exports.
//
// Winning a combat keeps the hp, gold, and everything else from the combat's player, then heals
// healAfterCombat * maxHp (floored, capped at maxHp). Winning the last floor sets 'won' and
// offers no reward; any other floor sets 'reward' with rewardOptionCount distinct options.
// Reward options never repeat a held relic, and removeColor is offered only while
// colors.length > MIN_COLORS. The player's hp, shield, and gold persist as described above;
// shield does not carry between combats.
export interface RunApi {
  createRun(seed: number, content: GameContent): RunState;
  playMove(run: RunState, move: Move, content: GameContent): RunTurnResult;
  // Applies the chosen option and starts the next floor's combat.
  chooseReward(run: RunState, index: number, content: GameContent): RunState;
  // Spends rerollCost gold for new options. Returns the same run if gold is short.
  rerollRewards(run: RunState, content: GameContent): RunState;
}
