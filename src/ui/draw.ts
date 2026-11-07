import { BOARD_SIZE } from '../types';
import type { Board, GameContent, GemColor, Move, RewardOption, RunState, TurnResult } from '../types';
import type { Layout, Phase, Rect } from './model';
import { statCards } from './model';
import { enemyPose } from './enemy-motion';
import { drawBackground, drawBoardCell, drawBoardFrame, drawEnemy, drawSelection, drawSprite } from './art';
import type { Effects, FloatAnchor } from './fx';
import { titleButtons, TUTORIAL_MOVE, tutorialLayout } from './tutorial';
import type { Tutorial } from './tutorial';

export interface View {
  screen: 'title' | 'tutorial' | 'combat' | 'reward' | 'won' | 'lost';
  tutorial?: Tutorial;
  run: RunState | null;
  board?: Board;
  phase?: Phase;
  progress: number;
  time: number;
  move?: Move;
  turn?: TurnResult;
  selected?: { row: number; col: number };
  shake?: number;
  muted: boolean;
  musicMuted: boolean;
  reduced: boolean;
  fx: Effects;
}

const hues: Record<GemColor, string> = { red: '#e96a60', purple: '#b69ae9', green: '#7bd3a4', yellow: '#f3cb70' };
const labels: Record<GemColor, string> = { red: '紅', purple: '紫', green: '綠', yellow: '黃' };
const ink = '#f7e8ca';

function box(ctx: CanvasRenderingContext2D, r: Rect, fill: string | CanvasGradient = '#252638', border = '#ae8250', radius = 12) {
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
function fittedText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number,
  maxWidth: number, size: number, color = ink, align: CanvasTextAlign = 'left', weight = 'normal') {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  if (ctx.measureText(value).width > maxWidth) {
    while (value.length && ctx.measureText(value + '…').width > maxWidth) value = value.slice(0, -1);
    value += '…';
  }
  text(ctx, value, x, y, size, color, align, weight);
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
  // Blast areas flash in the special's color and fade over the clear phase.
  if (view.phase?.kind === 'clear' && view.phase.blasts?.length) {
    const fade = view.reduced ? .35 : .6 * (1 - view.progress);
    for (const blast of view.phase.blasts) {
      ctx.fillStyle = hues[blast.color];
      for (const p of blast.cells) {
        ctx.globalAlpha = fade * (p.row === blast.origin.row && p.col === blast.origin.col ? 1 : .7);
        ctx.fillRect(b.x + p.col * s + 2, b.y + p.row * s + 2, s - 4, s - 4);
      }
    }
    ctx.globalAlpha = 1;
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
  const { width: w, height: h, safe } = shape;
  const cx = safe.x + safe.w / 2;
  drawBackground(ctx, w, h);
  const controls = () => {
    button(ctx, shape.mute, false);
    text(ctx, view.muted ? '靜音' : '音效', shape.mute.x + shape.mute.w / 2, shape.mute.y + shape.mute.h / 2, 14, ink, 'center');
    button(ctx, shape.music, false);
    text(ctx, view.musicMuted ? '音樂關' : '音樂', shape.music.x + shape.music.w / 2, shape.music.y + shape.music.h / 2, 14, ink, 'center');
  };
  const run = view.run;
  if (view.screen === 'title') {
    for (const [color, dx, dy, s] of [['purple',0,-15,86],['red',-47,12,62],['green',47,12,62],['yellow',0,39,54]] as const)
      drawSprite(ctx, { kind: 'gem', color }, cx + dx, safe.y + safe.h * .22 + dy, s);
    ctx.shadowColor = '#ad7942'; ctx.shadowBlur = 17;
    text(ctx, '寶石地城', cx, safe.y + safe.h * .35, Math.min(46, safe.w * .11), '#f9d58f', 'center', 'bold');
    ctx.shadowBlur = 0;
    fittedText(ctx, '交換相鄰寶石，消除三顆以上擊敗敵人', cx, safe.y + safe.h * .49,
      safe.w - 24, Math.max(14, Math.min(16, safe.w * .038)), '#cebca5', 'center');
    const title = titleButtons(shape);
    button(ctx, title.primary);
    text(ctx, '開始探險', cx, title.primary.y + title.primary.h / 2, 22, '#fff4de', 'center', 'bold');
    button(ctx, title.replay, false);
    text(ctx, '新手教學', cx, title.replay.y + title.replay.h / 2, 16, ink, 'center');
    controls();
    return;
  }
  if (view.tutorial) {
    const tutorial = view.tutorial, t = tutorialLayout(shape);
    const step = tutorial.step === 'swap' ? 1 : tutorial.step === 'effects' ? 2 : 3;
    text(ctx, `新手教學 ${step}／3`, safe.x + 16, safe.y + 30, 20, '#f3cb70', 'left', 'bold');
    button(ctx, t.skip, false);
    text(ctx, '略過', t.skip.x + t.skip.w / 2, t.skip.y + 22, 16, ink, 'center');
    let lineY = t.panel.y + 8;
    const line = (value: string, _index: number, color = ink) => {
      ctx.font = 'normal 14px system-ui, sans-serif';
      let row = '';
      for (const char of value) {
        if (row && ctx.measureText(row + char).width > t.panel.w) {
          text(ctx, row, t.panel.x, lineY, 14, color); lineY += 18; row = '';
        }
        row += char;
      }
      if (row) { text(ctx, row, t.panel.x, lineY, 14, color); lineY += 18; }
    };
    if (tutorial.step === 'swap' || tutorial.step === 'effects') {
      board(ctx, { ...shape, ...t }, view.phase?.board ?? tutorial.board, view);
      if (tutorial.step === 'swap') {
        line('交換亮框兩格，排成三顆紅寶石。', 0);
        line('可拖曳，也可依序點選兩格。', 1);
        line(tutorial.hint ? '再試試亮框中的兩格，不會扣血或扣步！' : '相鄰交換，三顆以上同色就能消除。', 2, '#f3cb70');
        ctx.strokeStyle = '#ffe4a1'; ctx.lineWidth = 3;
        for (const pos of [TUTORIAL_MOVE.a, TUTORIAL_MOVE.b]) ctx.strokeRect(
          t.board.x + pos.col * t.cell + 2, t.board.y + pos.row * t.cell + 2, t.cell - 4, t.cell - 4);
      } else {
        line('紅攻擊、紫護盾；綠回血、黃金幣。', 0, '#f3cb70');
        line('有效交換才推進敵人倒數，歸零時攻擊。', 1);
        line('無效交換不扣步；護盾可以擋傷害。', 2);
        line('石塊不能交換，消除旁邊寶石即可清除。', 3);
        line('四連以上會做出特殊寶石，消除時引爆。', 4, '#f3cb70');
        button(ctx, t.next);
        text(ctx, '下一步', t.next.x + t.next.w / 2, t.next.y + 22, 18, ink, 'center');
      }
    } else {
      fittedText(ctx, tutorial.step === 'ready' ? '教學完成！獎勵會強化接下來的冒險。' : '戰鬥勝利後三選一，試著選一張獎勵。',
        cx, safe.y + 82, safe.w - 32, 16, '#f3cb70', 'center');
      const examples = [['遺物：守護之盾', '每場戰鬥開始時獲得護盾'], ['強化：紅色寶石', '提升紅寶石消除的傷害'], ['移除：黃色寶石', '減少一種顏色，更容易連鎖']];
      for (let i = 0; i < t.cards.length; i++) {
        const card = t.cards[i]!;
        box(ctx, card, tutorial.reward === i ? '#795033' : '#252638');
        fittedText(ctx, examples[i]![0]!, card.x + 12, card.y + 15, card.w - 24, 16, ink);
        fittedText(ctx, examples[i]![1]!, card.x + 12, card.y + 35, card.w - 24, 14, '#cebca5');
      }
      if (tutorial.step === 'ready') {
        button(ctx, t.next);
        text(ctx, '開始探險', t.next.x + t.next.w / 2, t.next.y + 22, 18, ink, 'center');
      }
    }
    return;
  }
  if (!run) return;
  if (view.screen === 'won' || view.screen === 'lost') {
    box(ctx, { x: safe.x + safe.w * .1, y: safe.y + safe.h * .17, w: safe.w * .8, h: safe.h * .44 });
    text(ctx, view.screen === 'won' ? '地城征服！' : '冒險結束', cx, safe.y + safe.h * .28, Math.min(40, safe.w * .1), view.screen === 'won' ? '#f3cb70' : '#e96a60', 'center', 'bold');
    text(ctx, `抵達第 ${run.floor}／${content.enemies.length} 層`, cx, safe.y + safe.h * .43, 20, ink, 'center');
    text(ctx, `金幣 ${run.player.gold}`, cx, safe.y + safe.h * .51, 20, '#f3cb70', 'center');
    button(ctx, shape.primary);
    text(ctx, '重新開始', cx, shape.primary.y + shape.primary.h / 2, 22, ink, 'center', 'bold');
    controls();
    return;
  }
  if (view.screen === 'reward') {
    text(ctx, `第 ${run.floor} 層完成`, shape.landscape ? cx : safe.x + 20,
      shape.landscape ? shape.cards[0]!.y - 55 : safe.y + 42, shape.landscape ? 25 : 21,
      '#f3cb70', shape.landscape ? 'center' : 'left', 'bold');
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
            if (r.y + 58 + lineIndex * 23 <= r.y + r.h - 10)
              text(ctx, line, r.x + 15, r.y + 58 + lineIndex * 23, detailSize, '#c9d6d6');
            line = ''; lineIndex++;
          }
          line += char;
        }
        if (line && r.y + 58 + lineIndex * 23 <= r.y + r.h - 10)
          text(ctx, line, r.x + 15, r.y + 58 + lineIndex * 23, detailSize, '#c9d6d6');
      } else fittedText(ctx, detail, r.x + 15, r.y + (compact ? 38 : 58), r.w - 30, detailSize, '#c9d6d6');
    }
    const affordable = run.player.gold >= content.balance.rerollCost;
    button(ctx, shape.reroll, affordable);
    fittedText(ctx, `重新挑選  ${content.balance.rerollCost} 金幣  （持有 ${run.player.gold}）`, shape.reroll.x + shape.reroll.w / 2,
        shape.reroll.y + shape.reroll.h / 2, shape.reroll.w - 20, Math.max(14, Math.min(16, shape.reroll.w * .041)), affordable ? ink : '#91989a', 'center');
    controls();
    return;
  }
  const combat = run.combat;
  if (!combat) return;
  const enemy = content.enemies[run.floor - 1];
  const header = shape.header, stats = shape.stats;
  const narrow = shape.landscape && header.w < 180;
  // A quiet encounter panel keeps the enemy and its intent together.
  const panel = ctx.createLinearGradient(header.x, header.y, header.x + header.w, header.y + header.h);
  panel.addColorStop(0, '#28283e'); panel.addColorStop(1, '#171827');
  box(ctx, header, panel, '#5b4d69');
  const hero = shape.enemy;
  const halo = ctx.createRadialGradient(hero.x + hero.w / 2, hero.y + hero.h * .6, 0,
    hero.x + hero.w / 2, hero.y + hero.h * .6, hero.w * .55);
  halo.addColorStop(0, enemy?.isBoss ? 'rgba(177,105,232,.24)' : 'rgba(89,195,169,.18)');
  halo.addColorStop(1, 'rgba(89,195,169,0)');
  ctx.fillStyle = halo; ctx.fillRect(hero.x, hero.y, hero.w, hero.h);
  ctx.fillStyle = '#0b101d'; ctx.beginPath();
  ctx.ellipse(hero.x + hero.w / 2, hero.y + hero.h * .88, hero.w * .34, hero.h * .055, 0, 0, Math.PI * 2); ctx.fill();
  const pose = enemyPose(enemy?.id ?? combat.enemy.id, { time: view.time, reduced: view.reduced,
    attackProgress: view.phase?.kind === 'enemy' ? view.progress : undefined, hitFlash: view.fx.flash });
  ctx.save();
  // Clip the animated portrait to its own area, including in very short layouts.
  ctx.beginPath(); ctx.rect(hero.x, hero.y, hero.w, hero.h); ctx.clip();
  ctx.translate(hero.x + hero.w * (.5 + pose.x), hero.y + hero.h * (.9 + pose.y));
  ctx.rotate(pose.rotation); ctx.scale(pose.scaleX, pose.scaleY);
  drawEnemy(ctx, enemy?.id ?? combat.enemy.id, { x: -hero.w / 2, y: -hero.h * .9, w: hero.w, h: hero.h }, pose.glow);
  ctx.restore();
  const copyW = narrow ? header.w - 12 : header.w - hero.w - 22;
  const hx = header.x + 10;
  const floorLabel = `${run.floor} / ${content.enemies.length}`;
  text(ctx, floorLabel, hx, header.y + 14, 12, '#c8ac79', 'left', 'bold');
  if (!narrow && enemy?.trait) {
    ctx.font = 'bold 12px system-ui, sans-serif';
    const traitX = hx + ctx.measureText(floorLabel).width + 10;
    fittedText(ctx, enemy.trait, traitX, header.y + 14, copyW - (traitX - hx), 12,
      combat.enemy.enraged ? '#ff9a8a' : '#d9b8f0', 'left', 'bold');
  }
  fittedText(ctx, enemy?.name ?? '敵人', hx, header.y + (narrow ? 65 : 39), copyW,
    narrow ? 15 : 22, ink, 'left', 'bold');
  const resolved = view.phase?.kind === 'finish' || (view.phase?.kind === 'enemy' && view.progress > .5);
  const applied = !!view.turn && !!view.phase && view.phase.kind !== 'swap';
  const enemyHp = applied ? view.turn!.state.enemy.hp : combat.enemy.hp;
  const bar: Rect = { x: hx, y: header.y + (narrow ? 77 : 59), w: copyW, h: narrow ? 5 : 8 };
  ctx.fillStyle = '#100f1d'; ctx.beginPath(); ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 3); ctx.fill();
  const fill = Math.max(0, bar.w - 4) * Math.max(0, enemyHp) / (enemy?.maxHp || 1);
  const trailing = Math.max(0, bar.w - 4) * Math.min(1, Math.max(0, view.fx.trail) / (enemy?.maxHp || 1));
  ctx.fillStyle = '#ffd4bd'; ctx.fillRect(bar.x + 2, bar.y + 2, trailing, bar.h - 4);
  const healthFill = ctx.createLinearGradient(bar.x, 0, bar.x + bar.w, 0);
  healthFill.addColorStop(0, '#b13960'); healthFill.addColorStop(1, '#f8898e');
  ctx.fillStyle = healthFill; ctx.fillRect(bar.x + 2, bar.y + 2, fill, bar.h - 4);
  const countdown = resolved ? view.turn!.state.enemy.countdown : combat.enemy.countdown;
  const intent = countdown === 1 ? '#ffab8f' : '#d0c1ac';
  fittedText(ctx, narrow ? `${Math.max(0, enemyHp)} HP · ${countdown}步` : `${Math.max(0, enemyHp)} / ${enemy?.maxHp ?? 0} 生命`,
    hx, header.y + (narrow ? 89 : shape.landscape ? 75 : 80), copyW, narrow ? 11 : 12, '#c8b8bc');
  if (!narrow) {
    const intentY = header.y + (shape.landscape ? 90 : 99);
    icon(ctx, 'sword', hx + 6, intentY, 13);
    fittedText(ctx, `${countdown} 步後攻擊`, hx + 19, intentY, copyW - 19, 12, intent, 'left', 'bold');
  }
  controls();
  const player = resolved ? view.turn!.state.player : applied ? { ...combat.player,
    hp: Math.min(combat.player.maxHp, combat.player.hp + view.turn!.effects.heal),
    gold: combat.player.gold + view.turn!.effects.gold } : combat.player;
  const shield = resolved ? view.turn!.state.shield : combat.shield + (applied ? view.turn!.effects.shield : 0);
  const statItems: [string, 'heart' | 'shield' | 'coin'][] = [[`${player.hp}/${player.maxHp}`, 'heart'], [`${shield}`, 'shield'], [`${player.gold}`, 'coin']];
  const cards = statCards(shape);
  const anchors: Partial<Record<FloatAnchor, { x: number; y: number }>> = {
    enemy: { x: shape.enemy.x + shape.enemy.w / 2, y: shape.enemy.y + shape.enemy.h / 2 },
  };
  for (const [i, [value, kind]] of statItems.entries()) {
    const r = cards[i]!, stacked = stats.w < 180;
    const color = kind === 'heart' ? '#f09aab' : kind === 'shield' ? '#c5abf1' : '#f2d080';
    box(ctx, r, '#1b1e30', '#444158', 6);
    const sy = r.y + r.h / 2;
    anchors[kind] = { x: r.x + r.w / 2, y: sy };
    icon(ctx, kind, r.x + 13, sy, stacked ? 13 : 16);
    if (!stacked) text(ctx, kind === 'heart' ? '生命' : kind === 'shield' ? '護盾' : '金幣', r.x + 27, r.y + 11, 10, '#b3a9ba');
    fittedText(ctx, value, r.x + (stacked ? 26 : 27), r.y + (stacked ? 10 : 28), r.w - (stacked ? 32 : 33), stacked ? 13 : 18, color, 'left', 'bold');
  }
  const relics = player.relics.map(id => content.relics.find(r => r.id === id)?.name ?? id).join('、');
  fittedText(ctx, `遺物  ${relics || '尚未獲得'}`, stats.x + 2, stats.y + (stats.w < 180 ? 81 : 56),
    stats.w - 4, 12, '#b8a68e');
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
    const compact = legend.w < 180;
    drawSprite(ctx, { kind: 'gem', color: items[i]![0] }, x + (compact ? 7 : 10), y, compact ? 18 : 25);
    fittedText(ctx, compact ? items[i]![1].slice(1) : items[i]![1], x + (compact ? 18 : 26), y,
      legend.w / 2 - (compact ? 18 : 26), compact ? 11 : 14, hues[items[i]![0]]);
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
      const action = view.turn.enemyAction;
      const extras = [
        action?.junkAdded ? `新增 ${action.junkAdded} 顆石塊` : '',
        action?.goldStolen ? `偷走 ${action.goldStolen} 金幣` : '',
      ].filter(Boolean).join('　');
      if (extras) text(ctx, extras, shape.board.x + shape.board.w / 2,
        shape.board.y + shape.board.h / 2 + 30, 16, ink, 'center');
    }
    const events = view.turn.enemyEvents;
    const notice = phase.kind === 'finish' && phase.reshuffled ? '重新洗牌'
      : phase.kind === 'finish' && events.enraged ? `${enemy?.name ?? '敵人'}狂暴了！`
      : phase.kind === 'finish' && events.regenerated ? `${enemy?.name ?? '敵人'}分裂回復 ${events.regenerated}`
      : '';
    if (notice) text(ctx, notice, shape.board.x + shape.board.w / 2, shape.board.y + shape.board.h / 2, 24,
      events.enraged && !phase.reshuffled ? '#ff9a8a' : '#ffe4a1', 'center', 'bold');
  }
  for (const number of view.fx.numbers) {
    const anchor = anchors[number.anchor];
    if (!anchor) continue;
    ctx.globalAlpha = Math.min(1, (650 - number.age) / 150);
    // Keep long labels, such as damage with armor, inside the safe area near the screen edge.
    ctx.font = 'bold 20px system-ui, sans-serif';
    const half = ctx.measureText(number.value).width / 2;
    const x = Math.min(Math.max(anchor.x, safe.x + half + 4), safe.x + safe.w - half - 4);
    const y = anchor.y - (view.reduced ? 16 : 16 + number.age * .055);
    // A dark outline keeps numbers legible over the enemy portrait and bright gems.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(12,9,20,.9)'; ctx.lineWidth = 4;
    ctx.strokeText(number.value, x, y);
    text(ctx, number.value, x, y, 20, number.color, 'center', 'bold');
  }
  ctx.globalAlpha = 1;
}
