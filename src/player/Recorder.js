import { SIM_HZ, ECHO } from '../core/Tuning.js';

/**
 * ECHOSTRIDE — Recorder
 *
 * A fixed-size ring buffer of everything the echo needs to be you, sampled
 * once per simulation tick. At 60 Hz and a 6 s window this is 360 frames of
 * about twenty numbers -- small enough that the "expensive" core mechanic of
 * the game costs less memory than one texture would.
 *
 * Two rules keep the replay honest:
 *
 *  1. Only *state*, never inputs, are recorded. Replaying inputs would require
 *     the simulation to be bit-for-bit deterministic forever, and one changed
 *     collision epsilon would desync your own past self. Replaying positions
 *     cannot desync. The echo is a tape, not a re-simulation.
 *
 *  2. Discontinuities are marked. When you SHIFT, your position jumps; the
 *     echo must jump at exactly the same point in its own timeline rather than
 *     smearing a 30 m interpolation across the arena. The `teleport` flag is
 *     what makes the echo perform your shift, three seconds later, which is
 *     both correct and the single best-looking moment in the game.
 */

export class Frame {
  constructor() {
    this.t = -1;
    this.px = 0; this.py = 0; this.pz = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.height = 1.8;
    this.grounded = false;
    this.sliding = false;
    this.wallRunning = false;
    this.teleport = false;
    this.weaponId = 'splitter';
    /** @type {null|Array<{dir:[number,number,number], weaponId:string, seed:number, charge:number}>} */
    this.shots = null;
  }
}

export class Recorder {
  constructor(seconds = ECHO.bufferSeconds) {
    this.size = Math.ceil(seconds * SIM_HZ) + 2;
    /** @type {Frame[]} */
    this.frames = Array.from({ length: this.size }, () => new Frame());
    this.head = -1;      // index of the newest frame
    this.count = 0;      // frames written, saturating at `size`
    this.time = 0;       // simulation time of the newest frame
    this._pendingTeleport = false;
    this._pendingShots = null;
  }

  /** Mark that the *next* recorded frame is a discontinuity. */
  markTeleport() { this._pendingTeleport = true; }

  /** Queue a shot to be attached to the next recorded frame. */
  pushShot(dir, weaponId, seed, charge = 1) {
    (this._pendingShots ??= []).push({
      dir: [dir.x, dir.y, dir.z], weaponId, seed, charge,
    });
  }

  /** @param {import('./Movement.js').MovementState} s */
  record(s, weaponId, dt) {
    this.time += dt;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
    const f = this.frames[this.head];
    f.t = this.time;
    f.px = s.position.x; f.py = s.position.y; f.pz = s.position.z;
    f.vx = s.velocity.x; f.vy = s.velocity.y; f.vz = s.velocity.z;
    f.yaw = s.yaw; f.pitch = s.pitch;
    f.height = s.height;
    f.grounded = s.grounded;
    f.sliding = s.sliding;
    f.wallRunning = s.wallRunning;
    f.weaponId = weaponId;
    f.teleport = this._pendingTeleport;
    f.shots = this._pendingShots;
    this._pendingTeleport = false;
    this._pendingShots = null;
    return f;
  }

  get newest() { return this.head < 0 ? null : this.frames[this.head]; }

  /** The oldest frame still in the buffer. */
  get oldest() {
    if (this.count === 0) return null;
    return this.frames[(this.head - this.count + 1 + this.size * 2) % this.size];
  }

  /** How far back the buffer currently reaches, in seconds. */
  get span() {
    const o = this.oldest;
    return o ? this.time - o.t : 0;
  }

  /**
   * Frame at absolute simulation time `t`, or null if outside the window.
   * Returns the frame *at or just before* t plus the next one, so callers can
   * interpolate -- except across a teleport, where interpolation is a lie.
   */
  sampleAt(t) {
    if (this.count === 0) return null;
    const oldest = this.oldest;
    if (t < oldest.t) return null;
    if (t > this.time) return null;

    // Frames are one dt apart and dt is fixed, so we can index directly
    // instead of searching. This is why the sim runs on a fixed step.
    const ticksBack = Math.round((this.time - t) * SIM_HZ);
    const idx = (this.head - ticksBack + this.size * 2) % this.size;
    const cur = this.frames[idx];
    if (cur.t < 0) return null;
    const nextIdx = (idx + 1) % this.size;
    const next = ticksBack > 0 && this.frames[nextIdx].t >= 0 ? this.frames[nextIdx] : null;

    let alpha = 0;
    if (next) {
      const dtFrame = next.t - cur.t;
      alpha = dtFrame > 1e-6 ? Math.min(1, Math.max(0, (t - cur.t) / dtFrame)) : 0;
      // Never interpolate through a discontinuity.
      if (next.teleport) alpha = 0;
    }
    return { cur, next, alpha, index: idx };
  }

  /**
   * All shot events recorded in the half-open interval (from, to].
   * The echo drains this every tick so it fires exactly the shots you fired,
   * in order, with no duplicates and none dropped even at low frame rates.
   */
  shotsBetween(from, to, out = []) {
    out.length = 0;
    if (this.count === 0 || to <= from) return out;
    const startBack = Math.floor((this.time - to) * SIM_HZ);
    const endBack = Math.ceil((this.time - from) * SIM_HZ);
    for (let back = Math.max(0, startBack); back <= endBack; back++) {
      if (back >= this.count) break;
      const f = this.frames[(this.head - back + this.size * 2) % this.size];
      if (f.t < 0 || !f.shots) continue;
      if (f.t > from && f.t <= to) {
        for (const sh of f.shots) out.push({ frame: f, shot: sh });
      }
    }
    // shotsBetween walks newest-first; the echo wants chronological order.
    out.reverse();
    return out;
  }

  /** Positions along the recorded path, for drawing the echo's trail. */
  pathPoints(fromT, toT, maxPoints = 48, out = []) {
    out.length = 0;
    if (this.count === 0) return out;
    const stepTicks = Math.max(1, Math.floor(((toT - fromT) * SIM_HZ) / maxPoints));
    const startBack = Math.max(0, Math.floor((this.time - toT) * SIM_HZ));
    const endBack = Math.min(this.count - 1, Math.ceil((this.time - fromT) * SIM_HZ));
    for (let back = startBack; back <= endBack; back += stepTicks) {
      const f = this.frames[(this.head - back + this.size * 2) % this.size];
      if (f.t < 0) continue;
      out.push(f);
    }
    return out;
  }

  reset() {
    this.head = -1;
    this.count = 0;
    this.time = 0;
    for (const f of this.frames) { f.t = -1; f.shots = null; f.teleport = false; }
  }
}
