import { GAME_CONTENT } from '../src/data/index';
import { simulateRun, summarize } from './simulate';
import type { PolicyName } from './simulate';

// Node's globals are not included in this project's TypeScript configuration.
declare const process: { argv: string[] };

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || (name === '--runs' && value < 1)) {
    throw new Error(`Invalid ${name}: ${process.argv[index + 1]}`);
  }
  return value;
}

const runs = argument('--runs', 1000);
const seed = argument('--seed', 1);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
for (const policy of ['random', 'greedy'] as PolicyName[]) {
  const records = Array.from({ length: runs }, (_, index) => simulateRun(seed + index, policy, GAME_CONTENT));
  const summary = summarize(records, GAME_CONTENT);
  console.log(`${policy} (${runs} runs)`);
  console.log(`win rate  avg floor  avg turns  ended on floor`);
  console.log(`${percent(summary.winRate).padEnd(10)}${summary.averageFloor.toFixed(2).padEnd(11)}${summary.averageTurns.toFixed(2).padEnd(11)}${summary.endedOnFloor.join(', ')}`);
  console.log('top relics (win rate; pick rate)');
  const top = GAME_CONTENT.relics.filter(relic => summary.relicPickRate[relic.id]! > 0)
    .sort((a, b) => summary.relicWinRate[b.id]! - summary.relicWinRate[a.id]! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, 5);
  for (const relic of top) console.log(`${relic.id}: ${percent(summary.relicWinRate[relic.id]!)}; ${percent(summary.relicPickRate[relic.id]!)}`);
  if (!top.length) console.log('(none)');
  console.log('');
}
