import { ENEMY_TYPES } from './Enemies.js';

/**
 * ECHOSTRIDE — the Director
 *
 * Wave composition is a curriculum, not a difficulty curve. Each wave
 * introduces exactly one new idea and then gives you a wave to practise it
 * before the next one lands. The order is the order in which the mechanics
 * build on each other:
 *
 *   1  WARDEN              you exist, you move, you shoot
 *   2  + more WARDENs      your echo has arrived; notice it fights
 *   3  + PSALM             ranged pressure; you cannot stand still
 *   4  + CANTOR            your echo can be taken away; protect it
 *   5  + MONOLITH          you MUST resonate; the game's thesis, enforced
 *   6  + HUSH              read an echo that is not yours
 *   7+ combinations        everything, escalating, forever
 *
 * Nothing here is random until wave 7. A curriculum that shuffles is a
 * curriculum that sometimes teaches the final lesson first.
 */

const WAVES = [
  { warden: 4 },
  { warden: 7 },
  { warden: 5, psalm: 3 },
  { warden: 6, psalm: 2, cantor: 1 },
  { warden: 5, psalm: 3, monolith: 1 },
  { warden: 6, psalm: 3, hush: 2, monolith: 1 },
  { warden: 8, psalm: 4, cantor: 2, monolith: 2 },
  { warden: 9, psalm: 4, hush: 3, monolith: 2, cantor: 1 },
];

export class Director {
  constructor(ctx) {
    this.ctx = ctx;
    this.wave = 0;
    this.pending = [];
    this.spawnTimer = 0;
    this.betweenWaves = 3.0;
    this.state = 'idle';  // 'idle' | 'spawning' | 'fighting' | 'cleared'
    this.waveStartedAt = 0;
    this.totalKills = 0;
  }

  get alive() { return this.ctx.enemies.filter((e) => !e.dead).length; }

  start(now) {
    this.wave = 0;
    this.state = 'idle';
    this.betweenWaves = 2.5;
  }

  /** Composition for a wave index, extrapolating past the authored list. */
  composition(index) {
    if (index < WAVES.length) return { ...WAVES[index] };
    // Past the curriculum, scale the last authored wave. Growth is sublinear
    // in count and the cap is hard: forty enemies is not harder than twenty,
    // it is just slower, and a horde mode that becomes a slideshow has
    // stopped being a test of skill.
    const over = index - WAVES.length + 1;
    const base = { ...WAVES[WAVES.length - 1] };
    const scale = 1 + over * 0.22;
    let total = 0;
    for (const k of Object.keys(base)) {
      base[k] = Math.max(1, Math.round(base[k] * scale));
      total += base[k];
    }
    while (total > 34) {
      const k = Object.keys(base).sort((a, b) => base[b] - base[a])[0];
      base[k]--; total--;
      if (base[k] <= 0) delete base[k];
    }
    return base;
  }

  step(dt, now) {
    if (this.state === 'idle') {
      this.betweenWaves -= dt;
      if (this.betweenWaves <= 0) this._beginWave(now);
      return;
    }

    if (this.state === 'spawning') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.pending.length) {
        this._spawnOne(now);
        // Trickle spawns rather than dumping a wave at once: the player
        // should always be fighting, never waiting or drowning.
        this.spawnTimer = Math.max(0.28, 0.85 - this.wave * 0.05);
      }
      if (!this.pending.length) this.state = 'fighting';
      return;
    }

    if (this.state === 'fighting' && this.alive === 0) {
      this.state = 'idle';
      this.betweenWaves = 4.2;
      this.ctx.events.emit('waveCleared', {
        wave: this.wave, time: now - this.waveStartedAt,
      });
    }
  }

  _beginWave(now) {
    this.wave++;
    this.waveStartedAt = now;
    const comp = this.composition(this.wave - 1);
    this.pending = [];
    for (const [type, n] of Object.entries(comp)) {
      for (let i = 0; i < n; i++) this.pending.push(type);
    }
    // Interleave types so a wave does not arrive as four Wardens then four
    // Psalms; mixed pressure is what makes target priority a decision.
    this.pending.sort(() => Math.random() - 0.5);
    this.state = 'spawning';
    this.spawnTimer = 0;
    this.ctx.events.emit('waveStart', { wave: this.wave, composition: comp });
  }

  _spawnOne(now) {
    const type = this.pending.pop();
    const Cls = ENEMY_TYPES[type];
    if (!Cls) return;
    const pos = this._pickSpawn(type);
    const e = new Cls(pos, this.ctx);
    this.ctx.enemies.push(e);
    this.ctx.events.emit('enemySpawn', { enemy: e, type });
  }

  /**
   * Spawn placement. Two hard rules, both learned the same way -- by being
   * cheap-shotted in a playtest:
   *   - never within 11 m of the player
   *   - never inside the player's view cone at short range
   * Enemies should arrive *from* somewhere, not appear.
   */
  _pickSpawn(type) {
    const spawns = this.ctx.map.spawns.enemies;
    const p = this.ctx.player.position;
    const fwd = this.ctx.player.aimDirection();
    let best = null, bestScore = -Infinity;
    for (const s of spawns) {
      const d = s.pos.distanceTo(p);
      if (d < 11) continue;
      const to = s.pos.clone().sub(p).setY(0).normalize();
      const inView = to.dot(fwd) > 0.55;
      let score = s.weight * 10 - Math.abs(d - 26) * 0.6 + Math.random() * 7;
      if (inView && d < 22) score -= 25;
      // Psalms want height and sightlines; Wardens want the floor.
      if (type === 'psalm' && s.pos.y > 5) score += 12;
      if (type === 'monolith' && s.pos.y > 8) score -= 30;
      if (type === 'warden' && s.pos.y < 2) score += 6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return (best ?? spawns[Math.floor(Math.random() * spawns.length)]).pos.clone();
  }

  reset() {
    this.wave = 0;
    this.pending = [];
    this.state = 'idle';
    this.betweenWaves = 2.5;
    this.totalKills = 0;
  }
}
