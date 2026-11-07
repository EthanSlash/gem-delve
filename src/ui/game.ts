import { createAudio } from '../audio/index';
import { loadEnemyArt } from './art';
import { findValidMoves } from '../core/index';
import { GAME_CONTENT } from '../data/index';
import { chooseReward, createRun, playMove, rerollRewards } from '../run/index';
import type { Move, MusicTrack, Pos, RunState, RunTurnResult } from '../types';
import { draw } from './draw';
import type { View } from './draw';
import { Effects } from './fx';
import { shouldAnimateEnemy } from './enemy-motion';
import { advanceTutorial, createTutorial, finishTutorial, titleButtons, tutorialLayout, tutorialMove, tutorialReward, tutorialSeen } from './tutorial';
import type { Tutorial } from './tutorial';
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
  function preference(key: string): boolean {
    try { return localStorage.getItem(key) === 'true'; } catch { return false; }
  }
  function savePreference(key: string, value: boolean) {
    try { localStorage.setItem(key, String(value)); } catch { /* storage may be unavailable */ }
  }
  audio.setMuted(preference('gemDelve.effectsMuted'));
  audio.setMusicMuted(preference('gemDelve.musicMuted'));
  const requested = new URLSearchParams(location.search).get('seed');
  const parsed = requested === null ? NaN : Number(requested);
  let nextSeed = requested !== null && requested.trim() !== '' && Number.isSafeInteger(parsed) ? parsed >>> 0 : freshSeed();
  let run: RunState | null = null;
  let tutorial: Tutorial | undefined;
  let seenTutorial = (() => { try { return tutorialSeen(localStorage); } catch { return false; } })();
  let screen: View['screen'] = 'title';
  let currentMusic: MusicTrack = 'title';
  audio.setMusic(currentMusic);
  function updateMusic() {
    currentMusic = screen === 'combat' && run?.combat
      ? run.floor === GAME_CONTENT.enemies.length && GAME_CONTENT.enemies[run.floor - 1]?.isBoss ? 'boss' : 'combat'
      : 'title';
    audio.setMusic(currentMusic);
  }
  let shape: Layout;
  let selected: Pos | undefined;
  let press: { pos: Pos; x: number; y: number; id: number } | null = null;
  let animation: { result: RunTurnResult; phases: Phase[]; move: Move; start: number; last: number } | null = null;
  let tutorialAnimation: { phases: Phase[]; move: Move; start: number; last: number; next: Tutorial } | null = null;
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
    if (!raf && !document.hidden) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); }
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
    if (document.hidden) return;
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
        updateMusic();
        shape = layout(shape.width, shape.height, run.rewards?.length ?? GAME_CONTENT.balance.rewardOptionCount, insets);
        if (screen === 'won') audio.play('win');
        if (screen === 'lost') audio.play('lose');
        if (screen === 'reward') audio.play('reward');
        animation = null;
      }
    }
    if (tutorialAnimation) {
      const elapsed = time - tutorialAnimation.start;
      let offset = 0;
      for (let i = 0; i < tutorialAnimation.phases.length; i++) {
        const phase = tutorialAnimation.phases[i]!;
        if (elapsed >= offset && i > tutorialAnimation.last) {
          if (phase.kind === 'clear') audio.play('match', phase.chain);
          tutorialAnimation.last = i;
        }
        offset += phase.duration;
      }
      if (elapsed >= offset) { tutorial = tutorialAnimation.next; tutorialAnimation = null; }
    }
    render(time);
    if (animation || tutorialAnimation || time < invalidUntil || !fx.idle || shouldAnimateEnemy(screen, reduced, document.hidden)) raf = requestAnimationFrame(frame);
  }

  function render(now = performance.now()) {
    if (!shape) return;
    let phase: Phase | undefined, progress = 0;
    const activeAnimation = animation ?? tutorialAnimation;
    if (activeAnimation) {
      const elapsed = Math.max(0, now - activeAnimation.start);
      let offset = 0;
      for (const item of activeAnimation.phases) {
        phase = item;
        if (elapsed < offset + item.duration) { progress = Math.min(1, (elapsed - offset) / item.duration); break; }
        offset += item.duration;
      }
    }
    ctx!.save();
    if (!reduced && fx.shake) ctx!.translate(Math.sin(fx.shake * .09) * 6 * fx.shake / 250, 0);
    draw(ctx!, shape, {
      time: now, screen, run, board: phase?.board ?? run?.combat?.board, phase, progress,
      move: activeAnimation?.move, turn: animation?.result.turn, selected,
      shake: now < invalidUntil ? (invalidUntil - now) / 160 : 0,
      tutorial,
      muted: audio.isMuted(), musicMuted: audio.isMusicMuted(), reduced, fx,
    }, GAME_CONTENT);
    ctx!.restore();
  }

  function startRun() {
    tutorial = undefined;
    run = createRun(nextSeed, GAME_CONTENT); nextSeed = freshSeed(); screen = 'combat';
    updateMusic(); selected = undefined; press = null; fx.reset(); audio.play('select'); render();
    if (shouldAnimateEnemy(screen, reduced, document.hidden)) schedule();
  }
  function beginTutorial() {
    tutorial = createTutorial(); screen = 'tutorial'; selected = undefined; press = null;
    fx.reset(); updateMusic(); render();
  }
  function completeTutorial() {
    seenTutorial = true;
    try { finishTutorial(localStorage); } catch { /* Storage getter may be unavailable. */ }
    startRun();
  }
  function play(move: Move) {
    if (tutorialAnimation) return;
    if (tutorial) {
      const next = tutorialMove(tutorial, move);
      if (next.step !== tutorial.step && next.result) {
        const formal = createRun(0, GAME_CONTENT).combat!;
        const turn = { ...next.result, effects: { damage: 0, shield: 0, heal: 0, gold: 0 },
          reshuffled: next.result.reshuffled, enemyAction: null, state: { ...formal, board: next.board } };
        tutorialAnimation = { phases: buildTimeline(tutorial.board, turn), move, start: performance.now(), last: -1, next };
        schedule();
      } else tutorial = next;
      selected = undefined; render(); return;
    }
    if (!run || screen !== 'combat' || animation || performance.now() < invalidUntil) return;
    const result = playMove(run, move, GAME_CONTENT);
    selected = undefined;
    if (!result.turn.valid) {
      audio.play('invalid'); invalidUntil = performance.now() + 160;
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
    run = next; screen = run.status; updateMusic(); selected = undefined; fx.reset();
    audio.play('reward'); render();
    if (shouldAnimateEnemy(screen, reduced, document.hidden)) schedule();
  }

  function point(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * shape.width / rect.width,
      y: (event.clientY - rect.top) * shape.height / rect.height };
  }

  canvas.addEventListener('pointerdown', event => {
    if (press && press.id !== event.pointerId) return;
    if (animation || tutorialAnimation || performance.now() < invalidUntil) return;
    const p = point(event);
    const inputShape = tutorial ? { ...shape, ...tutorialLayout(shape) } : shape;
    const pos = screen === 'combat' || tutorial?.step === 'swap' ? hitCell(inputShape, p.x, p.y) : null;
    press = pos ? { pos, x: p.x, y: p.y, id: event.pointerId } : null;
    if (pos) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointercancel', event => {
    if (press?.id === event.pointerId) press = null;
  });
  canvas.addEventListener('pointerup', event => {
    if (press && press.id !== event.pointerId) return;
    if (!unlocked) { unlocked = true; audio.unlock(); }
    const p = point(event);
    if (tutorial && contains(tutorialLayout(shape).skip, p.x, p.y)) { tutorialAnimation = null; completeTutorial(); return; }
    if (animation || tutorialAnimation || performance.now() < invalidUntil) { press = null; return; }
    if (tutorial) {
      const t = tutorialLayout(shape);
      if (tutorial.step === 'ready' && contains(t.next, p.x, p.y)) { completeTutorial(); return; }
      if (tutorial.step === 'effects' && contains(t.next, p.x, p.y)) { tutorial = advanceTutorial(tutorial); render(); press = null; return; }
      if (tutorial.step === 'reward') {
        const index = t.cards.findIndex(card => contains(card, p.x, p.y));
        tutorial = tutorialReward(tutorial, index); render(); press = null; return;
      }
      if (tutorial.step === 'swap' && press?.id === event.pointerId) {
        const dragging = dragMove(press.pos, p.x - press.x, p.y - press.y, t.cell * .22);
        const pos = hitCell({ ...shape, ...t }, p.x, p.y);
        const move = dragging || (selected && pos ? neighboringMove(selected, pos) : null);
        if (move) play(move);
        else if (pos) { selected = pos; render(); }
      }
      press = null; return;
    }
    if (contains(shape.mute, p.x, p.y)) {
      audio.setMuted(!audio.isMuted()); savePreference('gemDelve.effectsMuted', audio.isMuted()); render(); press = null; return;
    }
    if (contains(shape.music, p.x, p.y)) {
      audio.setMusicMuted(!audio.isMusicMuted()); savePreference('gemDelve.musicMuted', audio.isMusicMuted()); render(); press = null; return;
    }
    if (screen === 'title' || screen === 'won' || screen === 'lost') {
      if (screen === 'title' && contains(titleButtons(shape).replay, p.x, p.y)) beginTutorial();
      else if (contains(screen === 'title' ? titleButtons(shape).primary : shape.primary, p.x, p.y)) {
        if (!seenTutorial) beginTutorial(); else startRun();
      }
    } else if (screen === 'reward' && run) {
      const i = shape.cards.findIndex(r => contains(r, p.x, p.y));
      if (i >= 0 && i < (run.rewards?.length ?? 0)) pickReward(i);
      else if (contains(shape.reroll, p.x, p.y) && run.player.gold >= GAME_CONTENT.balance.rerollCost) {
        run = rerollRewards(run, GAME_CONTENT); audio.play('reward'); render();
      }
    } else if (screen === 'combat') {
      if (press?.id === event.pointerId) {
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
      audio.setSuspended(true);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      press = null;
      return;
    }
    audio.setSuspended(false);
    if (unlocked) audio.unlock();
    resize();
    const now = performance.now();
    if (tutorialAnimation) tutorialAnimation.start = now - tutorialAnimation.phases.reduce((sum, phase) => sum + phase.duration, 0);
    if (animation) {
      animation.start = now - animation.phases.reduce((total, phase) => total + phase.duration, 0);
      animation.last = animation.phases.length - 1;
    }
    lastFrame = now;
    frame(now);
  });
  resize();
  // Drawn art shows until the images arrive; the title screen usually covers the wait.
  void loadEnemyArt().then(() => render());

  if (import.meta.env.DEV) {
    Object.assign(window, { __gemDelve: {
      getRun: () => run,
      getTutorial: () => tutorial,
      getScreen: () => screen,
      getMusic: () => currentMusic,
      getValidMoves: () => run?.status === 'combat' && run.combat ? findValidMoves(run.combat.board) : [],
      play, chooseReward: pickReward, isAnimating: () => animation !== null || tutorialAnimation !== null || performance.now() < invalidUntil,
    } });
  }
}
