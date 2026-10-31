import { BOARD_SIZE } from '../types';
import type { Board, Cell, GameContent, GemColor, Move, RewardOption, RunState, TurnResult } from '../types';
import type { Layout, Phase, Rect } from './model';

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
}

const hues: Record<GemColor, string> = { red: '#e96a60', purple: '#b69ae9', green: '#7bd3a4', yellow: '#f3cb70' };
const labels: Record<GemColor, string> = { red: '紅', purple: '紫', green: '綠', yellow: '黃' };
const ink = '#f7e8ca';

function box(ctx: CanvasRenderingContext2D, r: Rect, fill: string, border = '#6a5546', radius = 12) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, radius); ctx.fill(); ctx.stroke();
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 16,
  color = ink, align: CanvasTextAlign = 'left', weight = 'normal') {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}
function gem(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x, y);
  const r = size * .31;
  if (cell.kind === 'junk') {
    ctx.fillStyle = '#8a8986'; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const rr = r * (i % 2 ? .94 : 1.08); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    text(ctx, '☠', 0, 0, Math.max(11, size * .27), '#282b31', 'center', 'bold');
  } else {
    ctx.fillStyle = hues[cell.color]; ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = Math.max(1, size * .025);
    ctx.beginPath();
    if (cell.color === 'red') ctx.roundRect(-r, -r, 2 * r, 2 * r, r * .26);
    if (cell.color === 'purple') { ctx.moveTo(0, -r * 1.2); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r, 0); ctx.closePath(); }
    if (cell.color === 'green') ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (cell.color === 'yellow') { ctx.moveTo(0, -r * 1.15); ctx.lineTo(r * 1.1, r * .9); ctx.lineTo(-r * 1.1, r * .9); ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.arc(-r * .22, -r * .3, Math.max(2, r * .12), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function board(ctx: CanvasRenderingContext2D, shape: Layout, cells: Board, view: View) {
  const { board: b, cell: s } = shape;
  box(ctx, { x: b.x - 5, y: b.y - 5, w: b.w + 10, h: b.h + 10 }, '#141d26', '#9d7950', 13);
  const swap = view.phase?.kind === 'swap' && view.move;
  const shake = view.reduced ? 0 : (view.shake ?? 0) * Math.sin((view.shake ?? 0) * 35) * 5;
  ctx.save(); ctx.translate(shake, 0);
  ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) {
    const x = b.x + col * s, y = b.y + row * s;
    ctx.fillStyle = (row + col) % 2 ? '#273442' : '#2d3b49';
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    if (view.selected?.row === row && view.selected.col === col) {
      ctx.strokeStyle = '#fbd58b'; ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);
    }
    const entry = cells[row]?.[col];
    if (!entry) continue;
    let gx = x + s / 2, gy = y + s / 2;
    if (swap) {
      const { a, b: target } = view.move!;
      const other = row === a.row && col === a.col ? target : row === target.row && col === target.col ? a : null;
      if (other) { gx += (other.col - col) * s * view.progress; gy += (other.row - row) * s * view.progress; }
    }
    if (view.phase?.kind === 'fall' && !view.reduced)
      gy -= (1 - view.progress) * s * (view.phase.dropRows?.[row]?.[col] ?? 0);
    gem(ctx, entry, gx, gy, s);
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
  ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1c2932';
  for (let i = 0; i < 12; i++) ctx.fillRect(i * w / 12, 0, 1, h);
  ctx.fillStyle = '#a4774c'; ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 4, w, 4);
  const run = view.run;
  if (view.screen === 'title') {
    text(ctx, '✦', w / 2, h * .22, 52, '#f3cb70', 'center');
    text(ctx, '寶石地城', w / 2, h * .35, Math.min(46, w * .11), ink, 'center', 'bold');
    text(ctx, '交換相鄰寶石，消除三顆以上擊敗敵人', w / 2, h * .49, Math.min(16, w * .038), '#cebca5', 'center');
    box(ctx, shape.primary, '#9c633b', '#f0c48c');
    text(ctx, '開始探險', w / 2, shape.primary.y + shape.primary.h / 2, 22, '#fff4de', 'center', 'bold');
    return;
  }
  if (!run) return;
  if (view.screen === 'won' || view.screen === 'lost') {
    text(ctx, view.screen === 'won' ? '地城征服！' : '冒險結束', w / 2, h * .28, Math.min(40, w * .1), view.screen === 'won' ? '#f3cb70' : '#e96a60', 'center', 'bold');
    text(ctx, `抵達第 ${run.floor}／${content.enemies.length} 層`, w / 2, h * .43, 20, ink, 'center');
    text(ctx, `金幣 ${run.player.gold}`, w / 2, h * .51, 20, '#f3cb70', 'center');
    box(ctx, shape.primary, '#9c633b', '#f0c48c');
    text(ctx, '重新開始', w / 2, shape.primary.y + shape.primary.h / 2, 22, ink, 'center', 'bold');
    return;
  }
  if (view.screen === 'reward') {
    text(ctx, `第 ${run.floor} 層完成`, w / 2, shape.landscape ? shape.cards[0]!.y - 55 : 42, 25, '#f3cb70', 'center', 'bold');
    for (let i = 0; i < (run.rewards?.length ?? 0); i++) {
      const r = shape.cards[i]; if (!r) continue;
      box(ctx, r, '#293946', '#ad8259');
      const [kind, name, detail] = rewardText(run.rewards![i]!, content);
      const compact = r.h < 75;
      text(ctx, kind, r.x + 15, r.y + (compact ? 16 : 23), shape.landscape ? 14 : 13, '#f3cb70', 'left', 'bold');
      text(ctx, name, r.x + 65, r.y + (compact ? 16 : 23), shape.landscape ? Math.max(14, Math.min(19, r.w * .058)) : Math.min(19, r.w * .058), ink, 'left', 'bold');
      const detailSize = shape.landscape ? 14 : Math.min(14, r.w * .041);
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
    box(ctx, shape.reroll, affordable ? '#775634' : '#333940', affordable ? '#d9b075' : '#55595b');
    text(ctx, `重新挑選  ${content.balance.rerollCost} 金幣  （持有 ${run.player.gold}）`, shape.reroll.x + shape.reroll.w / 2,
       shape.reroll.y + shape.reroll.h / 2, shape.landscape ? Math.max(14, Math.min(16, shape.reroll.w * .041)) : Math.min(16, shape.reroll.w * .041), affordable ? ink : '#91989a', 'center');
    return;
  }
  const combat = run.combat;
  if (!combat) return;
  const enemy = content.enemies[run.floor - 1];
  const header = shape.header, stats = shape.stats;
  text(ctx, `第 ${run.floor}／${content.enemies.length} 層`, header.x, header.y + 10, 15, '#f3cb70', 'left', 'bold');
  text(ctx, enemy?.name ?? '敵人', header.x, header.y + 35, 22, ink, 'left', 'bold');
  const resolved = view.phase?.kind === 'finish' || (view.phase?.kind === 'enemy' && view.progress > .5);
  const enemyHp = resolved ? view.turn!.state.enemy.hp : combat.enemy.hp;
  const bar: Rect = { x: header.x, y: header.y + 57, w: Math.max(90, header.w - (shape.landscape ? 12 : 68)), h: 12 };
  box(ctx, bar, '#47373b', '#785557', 4);
  ctx.fillStyle = '#e96a60'; ctx.fillRect(bar.x + 2, bar.y + 2, Math.max(0, bar.w - 4) * Math.max(0, enemyHp) / (enemy?.maxHp || 1), bar.h - 4);
  text(ctx, `${Math.max(0, enemyHp)}/${enemy?.maxHp ?? 0}   ${resolved ? view.turn!.state.enemy.countdown : combat.enemy.countdown} 步後攻擊`, header.x, header.y + 83, shape.landscape ? 15 : 13, '#e6bdae');
  box(ctx, shape.mute, '#303d46', '#897257');
  text(ctx, view.muted ? '靜音' : '音效', shape.mute.x + 24, shape.mute.y + 20, shape.landscape ? 14 : 12, ink, 'center');
  const player = resolved ? view.turn!.state.player : combat.player;
  const shield = resolved ? view.turn!.state.shield : combat.shield;
  text(ctx, `♥ ${player.hp}/${player.maxHp}     ◆ ${shield}     ● ${player.gold}`, stats.x, stats.y + 17,
    shape.landscape ? Math.max(14, Math.min(17, stats.w * .048)) : Math.min(17, stats.w * .048), ink, 'left', 'bold');
  const relics = player.relics.map(id => content.relics.find(r => r.id === id)?.name ?? id).join('、');
  text(ctx, `遺物：${relics || '無'}`, stats.x, stats.y + 43, shape.landscape ? Math.max(14, Math.min(16, stats.w * .042)) : Math.min(13, stats.w * .037), '#d5bc9c');
  board(ctx, shape, view.phase?.kind === 'enemy' && view.progress > .5 ? view.turn!.state.board : view.board ?? combat.board, view);
  const legend = shape.legend;
  const items: [GemColor, string][] = [['red', '紅攻擊'], ['purple', '紫護盾'], ['green', '綠回血'], ['yellow', '黃金幣']];
  for (let i = 0; i < 4; i++) {
    const x = legend.x + (i % 2) * legend.w / 2;
    const y = legend.y + Math.floor(i / 2) * 25 + 9;
    gem(ctx, { kind: 'gem', color: items[i]![0] }, x + 10, y, 25);
    text(ctx, items[i]![1], x + 26, y, shape.landscape ? Math.max(14, Math.min(16, legend.w * .042)) : Math.min(14, legend.w * .042), hues[items[i]![0]]);
  }
  if (view.phase && view.turn) {
    const phase = view.phase;
    if (phase.chain && phase.chain >= 2) text(ctx, `${phase.chain} 連鎖！`, shape.board.x + shape.board.w / 2, shape.board.y + shape.board.h / 2,
      28, '#ffe4a1', 'center', 'bold');
    if ((phase.kind === 'clear' || phase.kind === 'fall') && phase.chain === 1) {
      const e = view.turn.effects;
      const floats: [number, string, string][] = [[e.damage, '傷害', '#e96a60'], [e.shield, '護盾', '#b69ae9'],
        [e.heal, '回血', '#7bd3a4'], [e.gold, '金幣', '#f3cb70']];
      floats.filter(v => v[0] > 0).forEach((v, i) => text(ctx, `+${v[0]} ${v[1]}`, shape.board.x + shape.board.w / 2,
        shape.board.y + shape.board.h * .27 + i * 28 - (view.reduced ? 0 : view.progress * 8), 20, v[2], 'center', 'bold'));
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
}
