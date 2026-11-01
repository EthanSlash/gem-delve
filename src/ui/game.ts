import { createAudio } from '../audio/index';
import { findValidMoves } from '../core/index';
import { GAME_CONTENT } from '../data/index';
import { chooseReward, createRun, playMove, rerollRewards } from '../run/index';
import type { Move, Pos, RunState, RunTurnResult } from '../types';
import { draw } from './draw';
import type { View } from './draw';
import { Effects } from './fx';
import { buildTimeline, contains, dragMove, hitCell, layout, neighboringMove } from './model';
import type { Insets, Layout, Phase } from './model';

function freshSeed(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]!;
}

export function startGame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const audio = createAudio();
  const requested = new URLSearchParams(location.search).get('seed');
  const parsed = requested === null ? NaN : Number(requested);
  let nextSeed = requested !== null && requested.trim() !== '' && Number.isSafeInteger(parsed) ? parsed >>> 0 : freshSeed();
  let run: RunState | null = null;
  let screen: View['screen'] = 'title';
  let shape: Layout;
  let selected: Pos | undefined;
  let press: { pos: Pos; x: number; y: number; id: number } | null = null;
  let animation: { result: RunTurnResult; phases: Phase[]; move: Move; start: number; last: number } | null = null;
  let invalidUntil = 0;
  let raf = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fx = new Effects(reduced);
  let lastFrame = 0;
  let unlocked = false;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  let insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  function readInsets() {
    const style = getComputedStyle(probe);
    insets = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  }

  function schedule() {
    if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function resize() {
    readInsets();
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx!.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    shape = layout(width, height, run?.rewards?.length ?? GAME_CONTENT.balance.rewardOptionCount, insets);
    render();
  }

  function soundPhase(phase: Phase) {
    if (phase.kind === 'clear') {
      for (const group of phase.groups ?? []) for (const cell of group.cells)
        fx.burst(shape.board.x + (cell.col + .5) * shape.cell, shape.board.y + (cell.row + .5) * shape.cell, group.color, shape.cell);
      audio.play('match', phase.chain);
      if (phase.chain === 1) {
        const effects = animation!.result.turn.effects;
        if (effects.damage) {
          fx.hit(); fx.setHp(run!.combat!.enemy.hp, animation!.result.turn.state.enemy.hp);
          fx.number('enemy', `-${effects.damage}`, '#ff9a8a');
        }
        if (effects.heal) fx.number('heart', `+${effects.heal}`, '#7bd3a4');
        if (effects.shield) fx.number('shield', `+${effects.shield}`, '#b69ae9');
        if (effects.gold) fx.number('coin', `+${effects.gold}`, '#f3cb70');
        if (animation?.result.turn.effects.damage) audio.play('hit');
        if (animation?.result.turn.effects.shield) audio.play('shield');
        if (animation?.result.turn.effects.heal) audio.play('heal');
        if (animation?.result.turn.effects.gold) audio.play('gold');
      }
    }
    if (phase.kind === 'enemy') { audio.play('enemyAttack'); fx.attack(); }
  }

  function frame(time: number) {
    raf = 0;
    fx.update(time - lastFrame);
    lastFrame = time;
    if (animation) {
      const elapsed = time - animation.start;
      let offset = 0, index = 0;
      for (; index < animation.phases.length - 1 && elapsed >= offset + animation.phases[index]!.duration; index++)
        offset += animation.phases[index]!.duration;
      if (index !== animation.last) {
        for (let i = animation.last + 1; i <= index; i++) soundPhase(animation.phases[i]!);
        animation.last = index;
      }
      const total = animation.phases.reduce((n, p) => n + p.duration, 0);
      if (elapsed >= total) {
        run = animation.result.run;
        screen = run.status;
        shape = layout(shape.width, shape.height, run.rewards?.length ?? GAME_CONTENT.balance.rewardOptionCount, insets);
        if (screen === 'won') audio.play('win');
        if (screen === 'lost') audio.play('lose');
        if (screen === 'reward') audio.play('reward');
        animation = null;
      }
    }
    render(time);
    if (animation || time < invalidUntil || !fx.idle) raf = requestAnimationFrame(frame);
  }

  function render(now = performance.now()) {
    if (!shape) return;
    let phase: Phase | undefined, progress = 0;
    if (animation) {
      const elapsed = Math.max(0, now - animation.start);
      let offset = 0;
      for (const item of animation.phases) {
        phase = item;
        if (elapsed < offset + item.duration) { progress = Math.min(1, (elapsed - offset) / item.duration); break; }
        offset += item.duration;
      }
    }
    ctx!.save();
    if (!reduced && fx.shake) ctx!.translate(Math.sin(fx.shake * .09) * 6 * fx.shake / 250, 0);
    draw(ctx!, shape, {
      screen, run, board: phase?.board ?? run?.combat?.board, phase, progress,
      move: animation?.move, turn: animation?.result.turn, selected,
      shake: now < invalidUntil ? (invalidUntil - now) / 260 : 0,
      muted: audio.isMuted(), reduced, fx,
    }, GAME_CONTENT);
    ctx!.restore();
  }

  function play(move: Move) {
    if (!run || screen !== 'combat' || animation || performance.now() < invalidUntil) return;
    const result = playMove(run, move, GAME_CONTENT);
    selected = undefined;
    if (!result.turn.valid) {
      audio.play('invalid'); invalidUntil = performance.now() + 260;
      schedule();
      return;
    }
    animation = { result, phases: buildTimeline(run.combat!.board, result.turn), move, start: performance.now(), last: -1 };
    schedule();
  }

  function pickReward(index: number) {
    if (!run || screen !== 'reward' || animation) return;
    const next = chooseReward(run, index, GAME_CONTENT);
    if (next === run) return;
    run = next; screen = run.status; selected = undefined; fx.reset();
    audio.play('reward'); render();
  }

  function point(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * shape.width / rect.width,
      y: (event.clientY - rect.top) * shape.height / rect.height };
  }

  canvas.addEventListener('pointerdown', event => {
    if (animation || performance.now() < invalidUntil) return;
    const p = point(event);
    const pos = screen === 'combat' ? hitCell(shape, p.x, p.y) : null;
    press = pos ? { pos, x: p.x, y: p.y, id: event.pointerId } : null;
    if (pos) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointercancel', () => { press = null; });
  canvas.addEventListener('pointerup', event => {
    if (!unlocked) { unlocked = true; audio.unlock(); }
    if (animation || performance.now() < invalidUntil) { press = null; return; }
    const p = point(event);
    if (screen === 'title' || screen === 'won' || screen === 'lost') {
      if (contains(shape.primary, p.x, p.y)) {
        run = createRun(nextSeed, GAME_CONTENT); nextSeed = freshSeed(); screen = 'combat'; selected = undefined; fx.reset();
        audio.play('select'); render();
      }
    } else if (screen === 'reward' && run) {
      const i = shape.cards.findIndex(r => contains(r, p.x, p.y));
      if (i >= 0 && i < (run.rewards?.length ?? 0)) pickReward(i);
      else if (contains(shape.reroll, p.x, p.y) && run.player.gold >= GAME_CONTENT.balance.rerollCost) {
        run = rerollRewards(run, GAME_CONTENT); audio.play('reward'); render();
      }
    } else if (screen === 'combat') {
      if (contains(shape.mute, p.x, p.y)) { audio.setMuted(!audio.isMuted()); render(); }
      else if (press?.id === event.pointerId) {
        const dragging = dragMove(press.pos, p.x - press.x, p.y - press.y, shape.cell * .22);
        if (dragging) play(dragging);
        else {
          const pos = hitCell(shape, p.x, p.y);
          if (pos) {
            const move = selected && neighboringMove(selected, pos);
            if (move) play(move);
            else { selected = pos; audio.play('select'); render(); }
          }
        }
      }
    }
    press = null;
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      press = null;
      return;
    }
    audio.unlock();
    resize();
    const now = performance.now();
    if (animation) {
      animation.start = now - animation.phases.reduce((total, phase) => total + phase.duration, 0);
      animation.last = animation.phases.length - 1;
    }
    lastFrame = now;
    frame(now);
  });
  resize();

  if (import.meta.env.DEV) {
    Object.assign(window, { __gemDelve: {
      getRun: () => run,
      getValidMoves: () => run?.status === 'combat' && run.combat ? findValidMoves(run.combat.board) : [],
      play, chooseReward: pickReward, isAnimating: () => animation !== null || performance.now() < invalidUntil,
    } });
  }
}
