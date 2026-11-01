import { BOARD_SIZE } from '../types';
import type { Board, GameContent, GemColor, Move, RewardOption, RunState, TurnResult } from '../types';
import type { Layout, Phase, Rect } from './model';
import { drawBackground, drawBoardCell, drawBoardFrame, drawEnemy, drawSelection, drawSprite } from './art';
import type { Effects, FloatAnchor } from './fx';

export interface View {
  screen: 'title' | 'combat' | 'reward' | 'won' | 'lost';
  run: RunState | null;
  board?: Board;
  phase?: Phase;
  progress: number;
  move?: Move;
  turn?: TurnResult;
  selected?: { row: number; col: number };
  shake?: number;
  muted: boolean;
  reduced: boolean;
  fx: Effects;
}

const hues: Record<GemColor, string> = { red: '#e96a60', purple: '#b69ae9', green: '#7bd3a4', yellow: '#f3cb70' };
const labels: Record<GemColor, string> = { red: '紅', purple: '紫', green: '綠', yellow: '黃' };
const ink = '#f7e8ca';

function box(ctx: CanvasRenderingContext2D, r: Rect, fill = '#252638', border = '#ae8250', radius = 12) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, radius); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d0a469';
  for (const x of [r.x + 8, r.x + r.w - 8]) for (const y of [r.y + 8, r.y + r.h - 8]) {
    ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
  }
}
function button(ctx: CanvasRenderingContext2D, r: Rect, enabled = true) {
  box(ctx, r, enabled ? '#795033' : '#34323a', enabled ? '#e4b879' : '#625b60');
  ctx.strokeStyle = enabled ? '#f5cb8d' : '#52505a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(r.x + 14, r.y + 5); ctx.lineTo(r.x + r.w - 14, r.y + 5); ctx.stroke();
  ctx.strokeStyle = enabled ? '#422a29' : '#272730';
  ctx.beginPath(); ctx.moveTo(r.x + 14, r.y + r.h - 5); ctx.lineTo(r.x + r.w - 14, r.y + r.h - 5); ctx.stroke();
}
function icon(ctx: CanvasRenderingContext2D, kind: 'heart' | 'shield' | 'coin' | 'sword', x: number, y: number, s = 16) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 20, s / 20);
  ctx.beginPath();
  if (kind === 'heart') {
    ctx.moveTo(0, 8); ctx.bezierCurveTo(-18, -2, -7, -15, 0, -7);
    ctx.bezierCurveTo(7, -15, 18, -2, 0, 8); ctx.fillStyle = '#ef6c70';
  } else if (kind === 'shield') {
    ctx.moveTo(0,-10); ctx.lineTo(9,-6); ctx.lineTo(8,3); ctx.lineTo(0,10);
    ctx.lineTo(-8,3); ctx.lineTo(-9,-6); ctx.fillStyle = '#b69ae9';
  } else if (kind === 'coin') {
    ctx.arc(0,0,9,0,Math.PI*2); ctx.fillStyle = '#f4c45e';
  } else {
    ctx.moveTo(-7,-9); ctx.lineTo(6,4); ctx.lineTo(8,2); ctx.lineTo(-5,-11); ctx.fillStyle = '#e9d2a6';
  }
  ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#463447'; ctx.lineWidth = 1.5; ctx.stroke();
  if (kind === 'coin') { ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.strokeStyle = '#a66a2d'; ctx.stroke(); }
  if (kind === 'sword') { ctx.beginPath(); ctx.moveTo(-9,3); ctx.lineTo(-1,-5); ctx.strokeStyle = '#e9d2a6'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 16,
  color = ink, align: CanvasTextAlign = 'left', weight = 'normal') {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}
function board(ctx: CanvasRenderingContext2D, shape: Layout, cells: Board, view: View) {
  const { board: b, cell: s } = shape;
  drawBoardFrame(ctx, b);
  const swap = view.phase?.kind === 'swap' && view.move;
  const shake = view.reduced ? 0 : (view.shake ?? 0) * Math.sin((view.shake ?? 0) * 35) * 5;
  ctx.save(); ctx.translate(shake, 0);
  ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) {
    const x = b.x + col * s, y = b.y + row * s;
    const selected = view.selected?.row === row && view.selected.col === col;
    drawBoardCell(ctx, x, y, s, (row + col) % 2 === 1, selected);
    const entry = cells[row]?.[col];
    if (entry) {
      let gx = x + s / 2, gy = y + s / 2;
      if (swap) {
        const { a, b: target } = view.move!;
        const other = row === a.row && col === a.col ? target : row === target.row && col === target.col ? a : null;
        if (other) { gx += (other.col - col) * s * view.progress; gy += (other.row - row) * s * view.progress; }
      }
      if (view.phase?.kind === 'fall' && !view.reduced)
        gy -= (1 - view.progress) * s * (view.phase.dropRows?.[row]?.[col] ?? 0);
      drawSprite(ctx, entry, gx, gy, s);
    }
    if (selected) drawSelection(ctx, x, y, s);
  }
  ctx.restore();
}

function rewardText(option: RewardOption, content: GameContent): [string, string, string] {
  if (option.type === 'relic') {
    const relic = content.relics.find(r => r.id === option.relicId);
    return ['遺物', relic?.name ?? '神祕遺物', relic?.description ?? '獲得新能力'];
  }
  return option.type === 'upgradeColor'
    ? ['強化', `${labels[option.color]}色寶石`, '提升此顏色消除的效果']
    : ['移除', `${labels[option.color]}色寶石`, '此顏色不再出現於棋盤'];
}

export function draw(ctx: CanvasRenderingContext2D, shape: Layout, view: View, content: GameContent) {
  const { width: w, height: h } = shape;
  drawBackground(ctx, w, h);
  const run = view.run;
  if (view.screen === 'title') {
    for (const [color, dx, dy, s] of [['purple',0,-15,86],['red',-47,12,62],['green',47,12,62],['yellow',0,39,54]] as const)
      drawSprite(ctx, { kind: 'gem', color }, w / 2 + dx, h * .22 + dy, s);
    ctx.shadowColor = '#ad7942'; ctx.shadowBlur = 17;
    text(ctx, '寶石地城', w / 2, h * .35, Math.min(46, w * .11), '#f9d58f', 'center', 'bold');
    ctx.shadowBlur = 0;
    text(ctx, '交換相鄰寶石，消除三顆以上擊敗敵人', w / 2, h * .49, Math.max(14, Math.min(16, w * .038)), '#cebca5', 'center');
    button(ctx, shape.primary);
    text(ctx, '開始探險', w / 2, shape.primary.y + shape.primary.h / 2, 22, '#fff4de', 'center', 'bold');
    return;
  }
  if (!run) return;
  if (view.screen === 'won' || view.screen === 'lost') {
    box(ctx, { x: w * .1, y: h * .17, w: w * .8, h: h * .44 });
    text(ctx, view.screen === 'won' ? '地城征服！' : '冒險結束', w / 2, h * .28, Math.min(40, w * .1), view.screen === 'won' ? '#f3cb70' : '#e96a60', 'center', 'bold');
    text(ctx, `抵達第 ${run.floor}／${content.enemies.length} 層`, w / 2, h * .43, 20, ink, 'center');
    text(ctx, `金幣 ${run.player.gold}`, w / 2, h * .51, 20, '#f3cb70', 'center');
    button(ctx, shape.primary);
    text(ctx, '重新開始', w / 2, shape.primary.y + shape.primary.h / 2, 22, ink, 'center', 'bold');
    return;
  }
  if (view.screen === 'reward') {
    text(ctx, `第 ${run.floor} 層完成`, w / 2, shape.landscape ? shape.cards[0]!.y - 55 : 42, 25, '#f3cb70', 'center', 'bold');
    for (let i = 0; i < (run.rewards?.length ?? 0); i++) {
      const r = shape.cards[i]; if (!r) continue;
      box(ctx, r);
      const [kind, name, detail] = rewardText(run.rewards![i]!, content);
      const option = run.rewards![i]!;
      if (option.type === 'relic') {
        drawSprite(ctx, { kind: 'gem', color: 'purple' }, r.x + r.w - 28, r.y + 26, 37);
        drawSprite(ctx, { kind: 'gem', color: 'yellow' }, r.x + r.w - 28, r.y + 26, 20);
      } else drawSprite(ctx, { kind: 'gem', color: option.color }, r.x + r.w - 28, r.y + 26, 37);
      const compact = r.h < 75;
      text(ctx, kind, r.x + 15, r.y + (compact ? 16 : 23), 14, '#f3cb70', 'left', 'bold');
      text(ctx, name, r.x + 65, r.y + (compact ? 16 : 23), Math.max(14, Math.min(19, r.w * .058)), ink, 'left', 'bold');
      const detailSize = 14;
      if (shape.landscape) {
        ctx.font = `normal ${detailSize}px system-ui, sans-serif`;
        let line = '', lineIndex = 0;
        for (const char of detail) {
          if (line && ctx.measureText(line + char).width > r.w - 30) {
            text(ctx, line, r.x + 15, r.y + 58 + lineIndex * 23, detailSize, '#c9d6d6');
            line = ''; lineIndex++;
          }
          line += char;
        }
        if (line) text(ctx, line, r.x + 15, r.y + 58 + lineIndex * 23, detailSize, '#c9d6d6');
      } else text(ctx, detail, r.x + 15, r.y + (compact ? 38 : 58), detailSize, '#c9d6d6');
    }
    const affordable = run.player.gold >= content.balance.rerollCost;
     button(ctx, shape.reroll, affordable);
    text(ctx, `重新挑選  ${content.balance.rerollCost} 金幣  （持有 ${run.player.gold}）`, shape.reroll.x + shape.reroll.w / 2,
        shape.reroll.y + shape.reroll.h / 2, Math.max(14, Math.min(16, shape.reroll.w * .041)), affordable ? ink : '#91989a', 'center');
    return;
  }
  const combat = run.combat;
  if (!combat) return;
  const enemy = content.enemies[run.floor - 1];
  const header = shape.header, stats = shape.stats;
  box(ctx, { x: header.x - 5, y: header.y - 8, w: header.w + 10,
    h: shape.landscape ? 106 : 136 });
  box(ctx, { x: stats.x - 5, y: stats.y - 2, w: stats.w + 10, h: stats.h + 4 });
  const recoil = view.reduced ? 0 : 5 * view.fx.flash / 200;
  drawEnemy(ctx, enemy?.id ?? combat.enemy.id, { ...shape.enemy, x: shape.enemy.x + recoil }, view.fx.flash / 200);
  const narrow = shape.landscape && header.w < 180;
  text(ctx, `第 ${run.floor}／${content.enemies.length} 層`, header.x, header.y + 10, 15, '#f3cb70', 'left', 'bold');
  text(ctx, enemy?.name ?? '敵人', header.x + (shape.landscape && !narrow ? 64 : 0),
    header.y + (narrow ? 35 : 35), narrow ? 16 : 20, ink, 'left', 'bold');
  const resolved = view.phase?.kind === 'finish' || (view.phase?.kind === 'enemy' && view.progress > .5);
  const applied = !!view.turn && !!view.phase && view.phase.kind !== 'swap';
  const enemyHp = applied ? view.turn!.state.enemy.hp : combat.enemy.hp;
  const bar: Rect = { x: header.x + (shape.landscape && !narrow ? 64 : 0), y: header.y + 57,
    w: header.w - (shape.landscape && !narrow ? 68 : narrow ? shape.enemy.w + 5 : 86), h: 12 };
  box(ctx, bar, '#231c2a', '#7e5956', 4);
  const fill = Math.max(0, bar.w - 4) * Math.max(0, enemyHp) / (enemy?.maxHp || 1);
  const trailing = Math.max(0, bar.w - 4) * Math.min(1, Math.max(0, view.fx.trail) / (enemy?.maxHp || 1));
  ctx.fillStyle = '#ffd4bd'; ctx.fillRect(bar.x + 2, bar.y + 2, trailing, bar.h - 4);
  ctx.fillStyle = '#ad3549'; ctx.fillRect(bar.x + 2, bar.y + 2, fill, bar.h - 4);
  ctx.fillStyle = '#f58383'; ctx.fillRect(bar.x + 2, bar.y + 2, fill, 2);
  const countdown = resolved ? view.turn!.state.enemy.countdown : combat.enemy.countdown;
  const badge: Rect = { x: bar.x, y: header.y + 76, w: Math.min(bar.w, 120), h: 21 };
  box(ctx, badge, '#302632', '#ae8250', 5);
  icon(ctx, 'sword', badge.x + 13, badge.y + 10, 15);
  text(ctx, narrow ? `${countdown}` : `${Math.max(0, enemyHp)}/${enemy?.maxHp ?? 0}  ${countdown} 步`, badge.x + 27, badge.y + 11, 14, '#f3d3b9');
  button(ctx, shape.mute, false);
  text(ctx, view.muted ? '靜音' : '音效', shape.mute.x + 24, shape.mute.y + 20, 14, ink, 'center');
  const player = resolved ? view.turn!.state.player : applied ? { ...combat.player,
    hp: Math.min(combat.player.maxHp, combat.player.hp + view.turn!.effects.heal),
    gold: combat.player.gold + view.turn!.effects.gold } : combat.player;
  const shield = resolved ? view.turn!.state.shield : combat.shield + (applied ? view.turn!.effects.shield : 0);
  const statSize = Math.max(14, Math.min(17, stats.w * .048));
  const statItems: [string, 'heart' | 'shield' | 'coin'][] = [[`${player.hp}/${player.maxHp}`, 'heart'], [`${shield}`, 'shield'], [`${player.gold}`, 'coin']];
  let sx = stats.x;
  const anchors: Partial<Record<FloatAnchor, { x: number; y: number }>> = {
    enemy: { x: shape.enemy.x + shape.enemy.w / 2, y: shape.enemy.y + shape.enemy.h / 2 },
  };
  for (const [i, [value, kind]] of statItems.entries()) {
    if (narrow && i === 1) sx = stats.x;
    const sy = stats.y + (narrow && i > 0 ? 41 : 17);
    anchors[kind] = { x: sx + 9, y: sy };
    icon(ctx, kind, sx + 9, sy, 17);
    text(ctx, value, sx + 22, sy, statSize, ink, 'left', 'bold');
    ctx.font = `bold ${statSize}px system-ui, sans-serif`;
    sx += 30 + ctx.measureText(value).width + (narrow ? 2 : shape.landscape ? 8 : 19);
  }
  const relics = player.relics.map(id => content.relics.find(r => r.id === id)?.name ?? id).join('、');
  text(ctx, `遺物：${relics || '無'}`, stats.x, stats.y + (narrow ? 68 : 40), Math.max(14, Math.min(16, stats.w * .042)), '#d5bc9c');
  board(ctx, shape, view.phase?.kind === 'enemy' && view.progress > .5 ? view.turn!.state.board : view.board ?? combat.board, view);
  for (const p of view.fx.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = hues[p.color]; ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.size); ctx.lineTo(p.x + p.size * .7, p.y);
    ctx.lineTo(p.x, p.y + p.size); ctx.lineTo(p.x - p.size * .7, p.y); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const legend = shape.legend;
  const items: [GemColor, string][] = [['red', '紅攻擊'], ['purple', '紫護盾'], ['green', '綠回血'], ['yellow', '黃金幣']];
  for (let i = 0; i < 4; i++) {
    const x = legend.x + (i % 2) * legend.w / 2;
    const y = legend.y + Math.floor(i / 2) * 25 + 9;
    drawSprite(ctx, { kind: 'gem', color: items[i]![0] }, x + 10, y, 25);
    text(ctx, items[i]![1], x + 26, y, Math.max(14, Math.min(16, legend.w * .042)), hues[items[i]![0]]);
  }
  if (view.phase && view.turn) {
    const phase = view.phase;
    if (phase.chain && phase.chain >= 2) {
      const pop = view.reduced || phase.kind !== 'clear' ? 1 : Math.min(1, .65 + view.progress * 2) + .16 * Math.sin(Math.min(1, view.progress * 2) * Math.PI);
      text(ctx, `${phase.chain} 連鎖！`, shape.board.x + shape.board.w / 2, shape.board.y + shape.board.h / 2,
        Math.min(40, 28 + (phase.chain - 2) * 2) * pop, '#ffe4a1', 'center', 'bold');
    }
    if (phase.kind === 'enemy') {
      ctx.fillStyle = `rgba(233,106,96,${.26 * (1 - view.progress)})`; ctx.fillRect(0, 0, w, h);
      text(ctx, `敵人攻擊！  -${view.turn.enemyAction?.hpLost ?? 0} 生命`, shape.board.x + shape.board.w / 2,
        shape.board.y + shape.board.h / 2, 20, '#ffe0d3', 'center', 'bold');
      if (view.turn.enemyAction?.junkAdded) text(ctx, `新增 ${view.turn.enemyAction.junkAdded} 顆石塊`, shape.board.x + shape.board.w / 2,
        shape.board.y + shape.board.h / 2 + 30, 16, ink, 'center');
    }
    if (phase.kind === 'finish' && phase.reshuffled)
      text(ctx, '重新洗牌', shape.board.x + shape.board.w / 2, shape.board.y + shape.board.h / 2, 26, '#ffe4a1', 'center', 'bold');
  }
  for (const number of view.fx.numbers) {
    const anchor = anchors[number.anchor];
    if (!anchor) continue;
    ctx.globalAlpha = Math.min(1, (650 - number.age) / 150);
    text(ctx, number.value, anchor.x, anchor.y - (view.reduced ? 16 : 16 + number.age * .055), 20, number.color, 'center', 'bold');
  }
  ctx.globalAlpha = 1;
}
