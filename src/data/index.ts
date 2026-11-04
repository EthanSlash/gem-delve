import type { GameContent } from '../types';

export const GAME_CONTENT: GameContent = {
  enemies: [
    { id: 'slime', name: '史萊姆', maxHp: 110, attack: 17, countdown: 2, junkPerAction: 1, isBoss: false },
    { id: 'caveBat', name: '洞穴蝙蝠', maxHp: 190, attack: 25, countdown: 2, junkPerAction: 1, isBoss: false },
    { id: 'skeleton', name: '骷髏戰士', maxHp: 270, attack: 30, countdown: 2, junkPerAction: 2, isBoss: false },
    { id: 'gargoyle', name: '石像鬼', maxHp: 350, attack: 36, countdown: 2, junkPerAction: 2, isBoss: false },
    { id: 'slimeKing', name: '史萊姆王', maxHp: 430, attack: 44, countdown: 2, junkPerAction: 3, isBoss: true },
  ],
  relics: [
    {
      id: 'flameCharm',
      name: '烈焰護符',
      description: '紅色寶石每組額外造成 2 點傷害。',
      effects: [{ type: 'colorFlat', color: 'red', flat: 2 }],
    },
    {
      id: 'chainPendant',
      name: '連鎖吊墜',
      description: '每多一層連鎖，倍率額外增加 0.2。',
      effects: [{ type: 'chainBonus', bonus: 0.2 }],
    },
    {
      id: 'giantBadge',
      name: '巨力徽章',
      description: '清除 4 顆以上寶石的組別，價值乘以 2。',
      effects: [{ type: 'bigMatch', minSize: 4, multiplier: 2 }],
    },
    {
      id: 'guardianShield',
      name: '守護之盾',
      description: '每場戰鬥開始時獲得 10 點護盾。',
      effects: [{ type: 'startShield', amount: 10 }],
    },
    {
      id: 'lifeHeart',
      name: '生命之心',
      description: '最大生命提高 15 點，並立即回復 15 點。',
      effects: [{ type: 'maxHp', amount: 15 }],
    },
    {
      id: 'sturdyBulwark',
      name: '堅韌壁壘',
      description: '敵人攻擊後保留 0.5（50%）的護盾。',
      effects: [{ type: 'shieldRetain', ratio: 0.5 }],
    },
    {
      id: 'purifyPotion',
      name: '淨化藥劑',
      description: '每清除 1 顆廢石，回復 3 點生命。',
      effects: [{ type: 'junkHeal', amount: 3 }],
    },
    {
      id: 'slowHourglass',
      name: '緩速沙漏',
      description: '敵人倒數增加 1，但攻擊力變為 1.25 倍。',
      effects: [{ type: 'enemyCountdown', delta: 1 }, { type: 'enemyAttack', multiplier: 1.25 }],
    },
  ],
  balance: {
    playerMaxHp: 70,
    perGem: { red: 4, purple: 1, green: 1, yellow: 1 },
    chainBonus: 0.25,
    levelBonus: 0.25,
    rewardOptionCount: 3,
    rerollCost: 15,
    healAfterCombat: 0.15,
  },
};
