import { LOOK } from './Tuning.js';

/**
 * ECHOSTRIDE — Input
 *
 * Design notes (the full rationale is in docs/CONTROLS.md):
 *
 *  - Everything is an *action*, never a key. Systems ask `input.down('shift')`,
 *    so remapping is a data change and gamepad parity is free.
 *  - SHIFT is bound to Q, not to a modifier or a mouse button. It is pressed
 *    more often than reload in a normal fight, so it must be reachable without
 *    the hand leaving WASD, and it must never share a button with something
 *    you might press by accident under pressure.
 *  - Both edge state (pressed this frame) and level state (held) are tracked,
 *    because movement wants "held" and weapons want "pressed".
 *  - Inputs are consumed by the fixed-step simulation, so edges are latched
 *    until a sim tick reads them. A 144 Hz mouse never loses a click to a
 *    60 Hz simulation.
 */

export const DEFAULT_BINDS = {
  forward:   ['KeyW', 'ArrowUp'],
  back:      ['KeyS', 'ArrowDown'],
  left:      ['KeyA', 'ArrowLeft'],
  right:     ['KeyD', 'ArrowRight'],
  jump:      ['Space'],
  crouch:    ['ControlLeft', 'KeyC'],   // hold to crouch, tap while fast to slide
  sprint:    ['ShiftLeft'],
  shift:     ['KeyQ'],                  // trade places with your echo
  collapse:  ['KeyF'],                  // detonate your echo
  markEcho:  ['KeyE'],                  // ping / focus-fire order for the echo
  reload:    ['KeyR'],
  melee:     ['KeyV'],
  weapon1:   ['Digit1'],
  weapon2:   ['Digit2'],
  weapon3:   ['Digit3'],
  weapon4:   ['Digit4'],
  weaponNext:['Tab'],
  delayUp:   ['Equal', 'NumpadAdd'],
  delayDown: ['Minus', 'NumpadSubtract'],
  scoreboard:['KeyB'],
  pause:     ['Escape'],
  restart:   ['KeyP'],
};

/** Gamepad layout. Chosen so SHIFT sits on a bumper: it is a movement verb. */
export const DEFAULT_PAD = {
  jump: 0,        // A / Cross
  crouch: 1,      // B / Circle
  melee: 2,       // X / Square
  markEcho: 3,    // Y / Triangle
  weaponNext: 4,  // LB
  shift: 5,       // RB   <- the core mechanic gets the best button on the pad
  collapse: 6,    // LT (as a button, analogue read separately)
  fire: 7,        // RT
  scoreboard: 8,
  pause: 9,
  sprint: 10,     // L3
  reload: 11,     // R3
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.binds = structuredClone(DEFAULT_BINDS);
    this.pad = { ...DEFAULT_PAD };

    this._held = new Set();      // physical codes currently down
    this._edgePressed = new Set();  // actions pressed since last sim read
    this._edgeReleased = new Set();

    this.mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0 };
    this._mouseLeftEdge = false;
    this._mouseRightEdge = false;

    this.locked = false;
    this.sensitivity = LOOK.sensitivity;
    this.invertY = false;
    this.padConnected = false;
    this.lastInputWasPad = false;

    this._bindEvents();
  }

  _bindEvents() {
    const kd = (e) => {
      // Never swallow devtools / refresh / fullscreen.
      if (e.code === 'F5' || e.code === 'F12' || e.metaKey) return;
      if (e.repeat) return;
      this.lastInputWasPad = false;
      this._held.add(e.code);
      for (const [action, codes] of Object.entries(this.binds)) {
        if (codes.includes(e.code)) this._edgePressed.add(action);
      }
      // Tab and Space would otherwise scroll or move focus out of the canvas.
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const ku = (e) => {
      this._held.delete(e.code);
      for (const [action, codes] of Object.entries(this.binds)) {
        if (codes.includes(e.code)) this._edgeReleased.add(action);
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    // Losing focus mid-sprint used to leave the key stuck down. It does not now.
    window.addEventListener('blur', () => { this._held.clear(); this.mouse.left = false; this.mouse.right = false; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouse.left = false; this.mouse.right = false; }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.lastInputWasPad = false;
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this._mouseLeftEdge = true; }
      if (e.button === 2) { this.mouse.right = true; this._mouseRightEdge = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });

    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX ?? 0;
      this.mouse.dy += e.movementY ?? 0;
    });

    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
    window.addEventListener('gamepaddisconnected', () => { this.padConnected = false; });
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock?.();
  }

  /** Held state, keyboard or pad. */
  down(action) {
    const codes = this.binds[action];
    if (codes) for (const c of codes) if (this._held.has(c)) return true;
    return this._padDown(action);
  }

  /** True once per press. Cleared by `endFrame()`. */
  pressed(action) {
    if (this._edgePressed.has(action)) return true;
    return this._padPressed(action);
  }

  released(action) { return this._edgeReleased.has(action); }

  get fireHeld() { return this.mouse.left || this._padAxisTrigger('fire') > 0.35; }
  get firePressed() { return this._mouseLeftEdge || this._padEdge.has('fire'); }
  get aimHeld() { return this.mouse.right || this._padAxisTrigger('aim') > 0.35; }

  /* ---------------- gamepad ---------------- */

  _padDown(action) {
    const gp = this._gamepad();
    if (!gp) return false;
    const idx = this.pad[action];
    return idx != null && !!gp.buttons[idx]?.pressed;
  }

  _padPressed(action) { return this._padEdge.has(action); }

  _padAxisTrigger(kind) {
    const gp = this._gamepad();
    if (!gp) return 0;
    // Standard mapping: buttons[6]=LT, buttons[7]=RT with analogue `.value`.
    if (kind === 'fire') return gp.buttons[7]?.value ?? 0;
    if (kind === 'aim') return gp.buttons[6]?.value ?? 0;
    return 0;
  }

  _gamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    return null;
  }

  _padEdge = new Set();
  _padPrev = new Map();

  /** Sample the pad once per frame and synthesise edges. */
  pollPad() {
    this._padEdge.clear();
    const gp = this._gamepad();
    this.padStick = { mx: 0, my: 0, lx: 0, ly: 0 };
    if (!gp) return;

    for (const [action, idx] of Object.entries(this.pad)) {
      const now = !!gp.buttons[idx]?.pressed;
      if (now && !this._padPrev.get(action)) this._padEdge.add(action);
      this._padPrev.set(action, now);
    }
    const rt = (gp.buttons[7]?.value ?? 0) > 0.35;
    if (rt && !this._padPrev.get('fire')) this._padEdge.add('fire');
    this._padPrev.set('fire', rt);

    const dz = (v) => {
      const a = Math.abs(v);
      if (a < LOOK.gamepadDeadzone) return 0;
      // Radial deadzone with a power curve: precise near centre, fast at edge.
      const t = (a - LOOK.gamepadDeadzone) / (1 - LOOK.gamepadDeadzone);
      return Math.sign(v) * Math.pow(t, LOOK.gamepadCurve);
    };
    this.padStick = {
      mx: dz(gp.axes[0] ?? 0), my: dz(gp.axes[1] ?? 0),
      lx: dz(gp.axes[2] ?? 0), ly: dz(gp.axes[3] ?? 0),
    };
    if (this.padStick.mx || this.padStick.my || this.padStick.lx || this.padStick.ly) {
      this.lastInputWasPad = true;
      this.padConnected = true;
    }
  }

  /** Movement intent in local space, unified across keyboard and stick. */
  moveAxis() {
    let x = 0, y = 0;
    if (this.down('right')) x += 1;
    if (this.down('left')) x -= 1;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    if (x || y) {
      const l = Math.hypot(x, y);
      x /= l; y /= l;
    }
    const s = this.padStick;
    if (s && (s.mx || s.my)) { x = s.mx; y = -s.my; }
    return { x, y };
  }

  /** Look delta for this frame, in radians, mouse and stick combined. */
  lookDelta(dt) {
    let yaw = -this.mouse.dx * this.sensitivity;
    let pitch = -this.mouse.dy * this.sensitivity * (this.invertY ? -1 : 1);
    const s = this.padStick;
    if (s && (s.lx || s.ly)) {
      yaw += -s.lx * LOOK.sensitivityGamepad * dt;
      pitch += -s.ly * LOOK.sensitivityGamepad * dt * (this.invertY ? -1 : 1);
    }
    return { yaw, pitch };
  }

  /** Clear per-frame edges. Called at the very end of the frame. */
  endFrame() {
    this._edgePressed.clear();
    this._edgeReleased.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this._mouseLeftEdge = false; this._mouseRightEdge = false;
  }

  rebind(action, code) {
    if (!this.binds[action]) return false;
    for (const [a, codes] of Object.entries(this.binds)) {
      if (a !== action) this.binds[a] = codes.filter((c) => c !== code);
    }
    this.binds[action] = [code];
    return true;
  }
}
