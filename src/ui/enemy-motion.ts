// Pure presentation values. Offsets are fractions of the sprite size; angles are radians.
// These motions never consume game RNG or change turn timing.
export interface EnemyMotionInput {
  time: number;
  reduced: boolean;
  attackProgress?: number;
  hitFlash?: number;
}
export interface EnemyPose {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  glow: number;
}
const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const smooth = (value: number) => value * value * (3 - 2 * value);

export function enemyPose(id: string, input: EnemyMotionInput): EnemyPose {
  const glow = clamp((input.hitFlash ?? 0) / 200);
  const pose: EnemyPose = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, glow };
  // Keep hit feedback through tint while eliminating all idle, attack and recoil motion.
  if (input.reduced) return pose;
  const time = Number.isFinite(input.time) ? input.time : 0;
  const period = id === 'caveBat' ? 900 : id === 'gargoyle' ? 2600 : 1700;
  const breath = Math.sin(time / period * Math.PI * 2);
  if (id === 'caveBat') {
    pose.y = breath * .035;
    pose.scaleY += Math.cos(time / 230 * Math.PI * 2) * .025;
    pose.rotation = breath * .035;
  } else if (id === 'slime' || id === 'slimeKing') {
    pose.scaleX += breath * .035;
    pose.scaleY -= breath * .04;
  } else {
    pose.scaleY += breath * .015;
    pose.y = -breath * .007;
    pose.rotation = breath * (id === 'skeleton' ? .012 : .006);
  }
  if (input.attackProgress !== undefined) {
    const progress = clamp(input.attackProgress);
    // Brief anticipation, a readable strike, then a smooth return at the phase boundary.
    const strike = progress < .2 ? -.22 * smooth(progress / .2)
      : progress < .48 ? -.22 + 1.22 * smooth((progress - .2) / .28)
      : 1 - smooth((progress - .48) / .52);
    pose.x -= strike * .11;
    pose.y += strike * .035;
    pose.scaleX += strike * .055;
    pose.scaleY -= strike * .035;
    pose.rotation -= strike * .09;
  }
  // Recoil decays with the existing hit flash, without extending animation input locks.
  pose.x += Math.sin(glow * Math.PI * 2) * glow * .035;
  pose.rotation += Math.sin(glow * Math.PI) * .035;
  return pose;
}

export function shouldAnimateEnemy(screen: string, reduced: boolean, hidden: boolean): boolean {
  return screen === 'combat' && !reduced && !hidden;
}
