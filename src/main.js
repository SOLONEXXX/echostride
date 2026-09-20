import { Game } from './core/Game.js';
import { Hud } from './ui/Hud.js';
import { ENEMY_TYPES } from './enemies/Enemies.js';
import { WEAPONS } from './weapons/Arsenal.js';

/**
 * ECHOSTRIDE — entry point.
 * Boots the game, owns the menus, and runs the render loop.
 */

const canvas = document.getElementById('c');
const uiRoot = document.getElementById('ui');
const menu = document.getElementById('menu');
const pause = document.getElementById('pause');

let game, hud;

function boot() {
  game = new Game(canvas);
  hud = new Hud(uiRoot, game);
  // Exposed deliberately: the smoke test drives the game through this, and
  // it makes the whole simulation pokeable from a browser console, which is
  // worth far more during tuning than any debug menu.
  window.ECHOSTRIDE = { game, hud, ENEMY_TYPES, WEAPONS };
  requestAnimationFrame(loop);
}

let last = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.25, (t - last) / 1000);
  last = t;
  game.frame();
  if (game.started) hud.update(dt);
}

/* ---------------- menu ---------------- */
function startGame() {
  menu.classList.add('hidden');
  pause.classList.remove('on');
  game.paused = false;
  game.start();
  game.input.requestLock();
}

document.getElementById('play').addEventListener('click', startGame);

const soundBtn = document.getElementById('sound');
soundBtn.addEventListener('click', () => {
  game.audio.enabled = !game.audio.enabled;
  soundBtn.textContent = 'SOUND: ' + (game.audio.enabled ? 'ON' : 'OFF');
});

document.getElementById('resume').addEventListener('click', () => {
  pause.classList.remove('on');
  game.paused = false;
  game.input.requestLock();
});
document.getElementById('restart').addEventListener('click', () => {
  pause.classList.remove('on');
  game.paused = false;
  game.restart();
  game.input.requestLock();
});
document.getElementById('quit').addEventListener('click', () => {
  pause.classList.remove('on');
  menu.classList.remove('hidden');
  game.paused = true;
  document.exitPointerLock?.();
});

function openPause() {
  if (!game.started || !menu.classList.contains('hidden')) return;
  game.paused = true;
  pause.classList.add('on');
  const p = game.player;
  document.getElementById('pauseStats').textContent =
    `WAVE ${game.director.wave} · ${p.stats.kills} STILLED · `
    + `${game.resonance.totalResonances} RESONANCES · ${p.stats.shifts} SHIFTS`;
  document.exitPointerLock?.();
}

addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (pause.classList.contains('on')) {
      pause.classList.remove('on');
      game.paused = false;
      game.input.requestLock();
    } else {
      openPause();
    }
  }
});

// Clicking the canvas re-captures the mouse after an accidental release.
canvas.addEventListener('click', () => {
  if (game?.started && !game.paused) game.input.requestLock();
});

// Losing pointer lock mid-fight should pause, not leave you helpless while
// something eats you.
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game?.started && !game.paused
      && menu.classList.contains('hidden')) {
    openPause();
  }
});

boot();
