/**
 * ECHOSTRIDE — Audio
 *
 * Every sound in this game is synthesised at runtime. There is not one audio
 * file in the repository.
 *
 * That began as a constraint (no asset pipeline) and turned into the right
 * artistic answer. The Stillness is an order that wants sound to happen once
 * and stop; the player is a walking recording. So the sound design is built
 * from two opposed families:
 *
 *   YOUR sounds are *struck* -- short, bright, metallic, with a hard attack
 *   and a long ring. Bells. The whole game is set in a carillon.
 *
 *   THEIR sounds are *blown* -- noise-based, low, with no clear pitch, and
 *   they end abruptly.
 *
 * And the echo's sounds are yours again, filtered: the same synthesis run
 * through a lowpass and a short reverb tail, so your past self is audibly
 * *further away in time*. Players reliably report being able to hear which of
 * them fired without looking, which is the entire goal.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.55;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this._lastPlayed = new Map();
  }

  /** Must be called from a user gesture; browsers require it. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;

      // A short convolution tail. The arena is a stone tower; everything in it
      // should sound like it is in a stone tower.
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = this._impulse(1.9, 2.6);
      this.verbGain = this.ctx.createGain();
      this.verbGain.gain.value = 0.25;
      this.verb.connect(this.verbGain).connect(this.master);

      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Distance + stereo placement from one world position. */
  _place(pos, maxDist = 60) {
    const g = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner?.() ?? null;
    let gain = 1;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dy = (pos.y ?? 0) - this.listener.y;
      const dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dy, dz);
      gain = Math.max(0, 1 - d / maxDist);
      gain *= gain;
      if (pan) {
        // Rotate into head space so panning follows where you are looking.
        const c = Math.cos(-this.listener.yaw), s = Math.sin(-this.listener.yaw);
        const rx = dx * c - dz * s;
        pan.pan.value = Math.max(-1, Math.min(1, rx / Math.max(3, d)));
      }
    }
    g.gain.value = gain;
    if (pan) { g.connect(pan); pan.connect(this.master); pan.connect(this.verb); }
    else { g.connect(this.master); g.connect(this.verb); }
    return { node: g, gain };
  }

  /** A struck metal partial: the building block of every "yours" sound. */
  _strike(t, freq, dur, level, dest, type = 'triangle', detune = 0) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  /** A blown noise burst: the building block of every "theirs" sound. */
  _blow(t, dur, level, dest, filterFreq = 1200, q = 1, sweepTo = null) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(Math.max(0.05, dur));
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t);
    src.stop(t + dur + 0.02);
    return src;
  }

  /**
   * @param {string} name
   * @param {{x:number,y:number,z:number}|null} pos
   * @param {{src?:'player'|'echo'|'enemy', pitch?:number}} [opts]
   */
  play(name, pos = null, opts = {}) {
    if (!this.enabled || !this.ctx) return;
    // Rate-limit identical sounds: a shotgun that fires nine pellets should
    // not play nine impacts and clip the master bus.
    const key = name + (opts.src ?? '');
    const now = this.ctx.currentTime;
    const last = this._lastPlayed.get(key) ?? -1;
    if (now - last < 0.012) return;
    this._lastPlayed.set(key, now);

    const placed = this._place(pos, SOUND_RANGE[name] ?? 60);
    if (placed.gain <= 0.001 && pos) return;
    let dest = placed.node;

    // The echo filter: your sound, but from three seconds ago.
    if (opts.src === 'echo') {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1450;
      lp.Q.value = 0.7;
      lp.connect(dest);
      dest = lp;
    }

    const t = now + 0.001;
    const p = opts.pitch ?? 1;
    const fn = VOICES[name];
    if (fn) fn(this, t, dest, p, opts);
  }
}

/** How far each sound carries. Combat sounds carry; footsteps do not. */
const SOUND_RANGE = {
  footstep: 16, land: 26, jump: 18, reload: 22, empty: 20,
  splitter: 85, rend: 90, kettle: 95, lattice: 85, thresh: 30,
  explosion: 120, resonance: 100, armorBreak: 100, collapse: 160,
  shift: 60, hurt: 70, kill: 80, rankUp: 200, echoSpawn: 60, echoDeath: 70,
  wardenLeap: 55, psalmFire: 70, monolithFire: 85, hushStrike: 40, echoFrozen: 50,
};

const VOICES = {
  /* ---------------- your weapons: struck metal ---------------------- */
  splitter: (a, t, d, p) => {
    a._strike(t, 880 * p, 0.09, 0.30, d, 'square');
    a._strike(t, 1760 * p, 0.05, 0.14, d, 'triangle', 8);
    a._blow(t, 0.05, 0.22, d, 2600, 1.2, 900);
  },
  rend: (a, t, d, p) => {
    a._strike(t, 180 * p, 0.28, 0.40, d, 'sawtooth');
    a._strike(t, 91 * p, 0.34, 0.30, d, 'triangle');
    a._blow(t, 0.19, 0.48, d, 1500, 0.6, 180);
  },
  kettle: (a, t, d, p) => {
    a._strike(t, 132 * p, 0.14, 0.34, d, 'triangle');
    a._blow(t, 0.13, 0.30, d, 700, 1.4, 250);
  },
  lattice: (a, t, d, p) => {
    // A bowed, ringing tone: LATTICE is the one weapon that sounds patient.
    a._strike(t, 1320 * p, 0.42, 0.20, d, 'sine');
    a._strike(t, 1979 * p, 0.34, 0.10, d, 'sine', 6);
    a._blow(t, 0.04, 0.12, d, 4200, 2);
  },
  thresh: (a, t, d, p) => {
    a._blow(t, 0.14, 0.34, d, 3200, 0.8, 620);
    a._strike(t + 0.01, 2400 * p, 0.10, 0.12, d, 'sine');
  },

  /* ---------------- events ------------------------------------------ */
  // SHIFT is a bell struck and then *un*-struck: a rising partial layered
  // under the falling one. It is the only sound in the game that goes up.
  shift: (a, t, d) => {
    a._strike(t, 523.25, 0.38, 0.34, d, 'sine');
    a._strike(t, 783.99, 0.30, 0.22, d, 'sine');
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.22);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g).connect(d);
    o.start(t); o.stop(t + 0.3);
  },
  // Resonance is a perfect fifth. It is the only consonant interval in the
  // whole sound design, so a resonant strike literally sounds *correct*.
  resonance: (a, t, d) => {
    a._strike(t, 659.25, 0.5, 0.26, d, 'sine');
    a._strike(t, 987.77, 0.44, 0.20, d, 'sine');
    a._strike(t + 0.03, 1318.5, 0.34, 0.11, d, 'triangle');
  },
  armorBreak: (a, t, d) => {
    a._blow(t, 0.4, 0.5, d, 2400, 0.5, 160);
    a._strike(t, 146.83, 0.5, 0.34, d, 'sawtooth');
    a._strike(t + 0.02, 220, 0.4, 0.2, d, 'square');
  },
  collapse: (a, t, d) => {
    // Six seconds of the tower ringing. The most expensive sound in the game,
    // for the most expensive decision in the game.
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.55);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(d);
    o.start(t); o.stop(t + 1.0);
    a._blow(t + 0.05, 0.8, 0.5, d, 900, 0.4, 90);
    for (const f of [261.6, 392.0, 523.25]) a._strike(t + 0.08, f, 2.6, 0.16, d, 'sine');
  },
  explosion: (a, t, d) => {
    a._blow(t, 0.55, 0.62, d, 900, 0.5, 70);
    a._strike(t, 72, 0.5, 0.36, d, 'sine');
  },
  echoSpawn: (a, t, d) => {
    a._strike(t, 392, 0.7, 0.18, d, 'sine');
    a._strike(t + 0.06, 587.33, 0.6, 0.12, d, 'sine');
  },
  echoDeath: (a, t, d) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.7);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g).connect(d);
    o.start(t); o.stop(t + 0.85);
  },
  echoFrozen: (a, t, d) => {
    a._blow(t, 0.3, 0.2, d, 400, 3, 260);
  },
  rankUp: (a, t, d) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      a._strike(t + i * 0.055, f, 0.7, 0.17, d, 'sine');
    });
  },
  kill: (a, t, d) => {
    a._strike(t, 330, 0.14, 0.2, d, 'triangle');
    a._blow(t, 0.1, 0.2, d, 1800, 1, 500);
  },
  hurt: (a, t, d) => {
    a._blow(t, 0.22, 0.42, d, 320, 0.7, 90);
    a._strike(t, 98, 0.2, 0.26, d, 'sawtooth');
  },

  /* ---------------- movement ---------------------------------------- */
  footstep: (a, t, d, p) => a._blow(t, 0.07, 0.16, d, 340 * p, 1.6, 150),
  land: (a, t, d, p) => {
    a._blow(t, 0.14, 0.30 * p, d, 220, 1.2, 80);
    a._strike(t, 110, 0.12, 0.14 * p, d, 'sine');
  },
  jump: (a, t, d) => a._blow(t, 0.06, 0.10, d, 600, 1.4, 900),
  reload: (a, t, d) => {
    a._strike(t, 1200, 0.05, 0.13, d, 'square');
    a._strike(t + 0.08, 800, 0.06, 0.11, d, 'square');
  },
  empty: (a, t, d) => a._strike(t, 2200, 0.04, 0.10, d, 'square'),

  /* ---------------- the Stillness: blown noise ---------------------- */
  wardenLeap: (a, t, d) => a._blow(t, 0.3, 0.3, d, 700, 0.8, 2200),
  psalmFire: (a, t, d) => {
    a._blow(t, 0.25, 0.3, d, 520, 2.2, 1400);
    a._strike(t, 155, 0.2, 0.14, d, 'sawtooth');
  },
  monolithFire: (a, t, d) => {
    a._blow(t, 0.35, 0.44, d, 260, 0.7, 110);
    a._strike(t, 62, 0.3, 0.22, d, 'square');
  },
  hushStrike: (a, t, d) => a._blow(t, 0.1, 0.34, d, 5200, 1.6, 900),
};
