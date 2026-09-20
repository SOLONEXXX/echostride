import * as THREE from 'three';
import { traceRay, spreadDir } from '../combat/Trace.js';
import { PALETTE } from '../engine/Palette.js';
import { ECHO, FLUX } from '../core/Tuning.js';

/**
 * ECHOSTRIDE — the Arsenal
 *
 * Design rule for every weapon in this game:
 *
 *   A weapon must be good on its own, and it must mean something *different*
 *   when your echo is holding it.
 *
 * That second clause is what stops the echo being a damage multiplier glued
 * onto an ordinary shooter. Each gun has an Echo Synergy that only triggers
 * on the interaction between your shot and a shot you fired three seconds ago,
 * and each one asks a different question of the player:
 *
 *   SPLITTER  "can you hit the same target twice, three seconds apart?"
 *   REND      "can you get to the *other side* of a target in three seconds?"
 *   KETTLE    "can you predict where a fight will be in three seconds?"
 *   LATTICE   "can you plan a shape instead of a shot?"
 *   THRESH    "can you give your past self a gift?"
 *
 * Four different skills, one mechanic. That is the whole arsenal philosophy.
 */

const V = () => new THREE.Vector3();

export const WEAPONS = {
  /* ================================================================== *
   * SPLITTER Mk.II — Dual-Phase Rifle
   * The starter weapon, and the one you will still be using at the end.
   * Three-round burst: long enough to reward tracking, short enough that
   * the burst *ends*, which is what creates the rhythmic gap you fill with
   * movement. Automatic weapons remove that gap and with it the reason to
   * move at all.
   * ================================================================== */
  splitter: {
    id: 'splitter',
    name: 'SPLITTER Mk.II',
    role: 'Dual-Phase Rifle',
    kind: 'hitscan',
    slot: 1,
    damage: 17,
    pellets: 1,
    spread: 0.0055,
    burst: 3,
    burstDelay: 0.062,
    rpm: 320,
    mag: 27,
    reserve: 162,
    reloadTime: 1.45,
    range: 180,
    falloffStart: 60,
    falloffEnd: 150,
    falloffMin: 0.55,
    recoil: { v: 0.82, h: 0.34, recover: 9.0 },
    echoSynergy: 'CONVERGE',
    echoNote: 'A round that lands on a target your echo has hit in the last '
      + '0.35 s braids into a lance and pierces the enemy behind it.',

    fire(ctx, shot) {
      const { origin, dir, src, seed } = shot;
      const d = spreadDir(dir, this.spread, seed);
      const hit = traceRay(ctx.world, ctx.enemies, origin, d, this.range);
      ctx.fx.tracer(origin, hit ? hit.point : origin.clone().addScaledVector(d, this.range), src);
      if (!hit) return;

      if (hit.type === 'world') { ctx.fx.impact(hit.point, hit.normal, src); return; }

      const dmg = this.damage * falloff(this, hit.dist);
      const r = ctx.damage.apply(hit.enemy, dmg, src, {
        now: ctx.now, headshot: hit.headshot, point: hit.point, weaponId: this.id,
      });

      // CONVERGE: your round pierces if your past self primed the target.
      const primedBy = src === 'player' ? hit.enemy.lastEchoHitAt : hit.enemy.lastPlayerHitAt;
      const primed = r.resonant || (primedBy != null && ctx.now - primedBy <= 0.35);
      if (primed) {
        const behind = traceRay(
          ctx.world, ctx.enemies,
          hit.point.clone().addScaledVector(d, 0.45), d, 26,
          { ignore: [hit.enemy] },
        );
        if (behind && behind.type === 'enemy') {
          ctx.damage.apply(behind.enemy, dmg * 0.7, src, {
            now: ctx.now, point: behind.point, weaponId: this.id,
          });
          ctx.fx.lance(hit.point, behind.point);
        }
      }
      ctx.fx.impact(hit.point, hit.normal, src, true);
    },
  },

  /* ================================================================== *
   * REND — Harmonic Shotgun
   * The close-range answer, and the weapon that teaches the game's spatial
   * idea best: its synergy only fires when you and your echo are shooting
   * the same target from opposite sides. To use REND well you must think
   * about where you will be relative to where you were -- which is the
   * sentence this entire game is built on.
   * ================================================================== */
  rend: {
    id: 'rend',
    name: 'REND',
    role: 'Harmonic Shotgun',
    kind: 'hitscan',
    slot: 2,
    damage: 11,
    pellets: 9,
    spread: 0.075,
    rpm: 96,
    mag: 6,
    reserve: 48,
    reloadTime: 0.62,      // shell-by-shell; interruptible
    reloadPerShell: true,
    range: 40,
    falloffStart: 7,
    falloffEnd: 24,
    falloffMin: 0.16,
    recoil: { v: 2.6, h: 0.5, recover: 7.0 },
    echoSynergy: 'STANDING WAVE',
    echoNote: 'If your echo hit the same target within 0.6 s from an angle '
      + 'greater than 110 degrees to your own shot, the pellets resonate: +80% '
      + 'damage on every pellet. Flank yourself.',

    fire(ctx, shot) {
      const { origin, dir, src, seed } = shot;

      // Standing Wave test happens once, before the pellets, using the
      // *direction* the other self fired from -- so it rewards geometry,
      // not luck.
      let wave = false;
      const probe = traceRay(ctx.world, ctx.enemies, origin, dir, this.range);
      if (probe?.type === 'enemy') {
        const e = probe.enemy;
        const rec = src === 'player' ? e.lastEchoShotDir : e.lastPlayerShotDir;
        const recAt = src === 'player' ? e.lastEchoHitAt : e.lastPlayerHitAt;
        if (rec && recAt != null && ctx.now - recAt <= 0.6) {
          const cos = rec.x * dir.x + rec.y * dir.y + rec.z * dir.z;
          if (cos < Math.cos((110 * Math.PI) / 180)) wave = true;
        }
      }

      for (let i = 0; i < this.pellets; i++) {
        const d = spreadDir(dir, this.spread, seed, i + 1);
        const hit = traceRay(ctx.world, ctx.enemies, origin, d, this.range);
        if (i % 3 === 0) {
          ctx.fx.tracer(origin, hit ? hit.point : origin.clone().addScaledVector(d, this.range), src, 0.55);
        }
        if (!hit) continue;
        if (hit.type === 'world') { if (i % 2 === 0) ctx.fx.impact(hit.point, hit.normal, src); continue; }

        let dmg = this.damage * falloff(this, hit.dist);
        if (wave) dmg *= 1.8;
        hit.enemy[src === 'player' ? 'lastPlayerShotDir' : 'lastEchoShotDir'] = dir.clone();
        const r = ctx.damage.apply(hit.enemy, dmg, src, {
          now: ctx.now, headshot: hit.headshot, point: hit.point, weaponId: this.id,
        });
        // REND refunds Flux on kill. The shotgun is the aggression engine, so
        // it pays you for being where the danger is.
        if (r.killed) ctx.player.addFlux(6);
      }
      if (wave) ctx.fx.standingWave(probe.point);
    },
  },

  /* ================================================================== *
   * KETTLE — Delayed Charge Launcher
   * The weapon that *is* the mechanic. Its fuse is not a number a designer
   * picked: it is exactly your current echo delay. Whatever you dial your
   * echo to, the Kettle re-tunes itself to match, so a charge always goes
   * off at the moment your echo walks into the room.
   *
   * Dial your delay to 5 s and the Kettle becomes area denial you set up a
   * corridor ahead. Dial to 1.5 s and it is a brutally fast breaching tool.
   * One weapon, two identities, chosen by the same dial that defines your
   * entire playstyle.
   * ================================================================== */
  kettle: {
    id: 'kettle',
    name: 'KETTLE',
    role: 'Delayed Charge Launcher',
    kind: 'projectile',
    slot: 3,
    damage: 96,
    splashRadius: 5.2,
    rpm: 68,
    mag: 4,
    reserve: 20,
    reloadTime: 1.85,
    muzzleVelocity: 34,
    projectileGravity: 13,
    recoil: { v: 1.9, h: 0.25, recover: 6.5 },
    echoSynergy: 'SYNCHRONY',
    echoNote: 'The fuse always equals your echo delay, so a charge detonates '
      + 'at the instant your echo arrives. Your echo\'s own charges land on the '
      + 'same beat one delay later: seed a room once, it burns twice.',

    fire(ctx, shot) {
      const { origin, dir, src } = shot;
      const fuse = ctx.echo.delay;
      ctx.projectiles.spawn({
        position: origin.clone().addScaledVector(dir, 0.6),
        velocity: dir.clone().multiplyScalar(this.muzzleVelocity),
        gravity: this.projectileGravity,
        color: src === 'echo' ? PALETTE.echo : PALETTE.oxide,
        radius: 0.2,
        life: fuse + 0.2,
        fuse,
        stickOnContact: true,
        src,
        weaponId: this.id,
        damage: this.damage,
        splashRadius: this.splashRadius,
        onDetonate: (p, now) => {
          ctx.fx.explosion(p.position, this.splashRadius, src);
          ctx.splash(p.position, this.splashRadius, this.damage, src, this.id);
        },
      });
    },
  },

  /* ================================================================== *
   * LATTICE — Tether Rifle
   * The thinking weapon. It does mediocre damage and links targets instead.
   * Damage to one tethered enemy bleeds to everything on its web, so LATTICE
   * turns the arena into a graph problem you solve while sprinting.
   *
   * Its echo synergy is the most elegant in the game and required no new
   * rule at all: your echo is also laying tethers, so the web you build is
   * always three seconds larger than the one you can see.
   * ================================================================== */
  lattice: {
    id: 'lattice',
    name: 'LATTICE',
    role: 'Tether Rifle',
    kind: 'hitscan',
    slot: 4,
    damage: 34,
    pellets: 1,
    spread: 0.0,
    rpm: 74,
    mag: 8,
    reserve: 40,
    reloadTime: 1.6,
    range: 260,
    falloffStart: 260,
    falloffEnd: 261,
    falloffMin: 1,
    recoil: { v: 1.3, h: 0.1, recover: 8.0 },
    bleed: 0.4,
    tetherLife: 7.0,
    echoSynergy: 'WEB',
    echoNote: 'Every hit links the target to your last one. Damage bleeds 40% '
      + 'along every link. Your echo lays tethers too, so the web is always '
      + 'larger than what you have personally drawn.',

    fire(ctx, shot) {
      const { origin, dir, src } = shot;
      const hit = traceRay(ctx.world, ctx.enemies, origin, dir, this.range);
      ctx.fx.tracer(origin, hit ? hit.point : origin.clone().addScaledVector(dir, this.range), src, 1.3);
      if (!hit) return;
      if (hit.type === 'world') { ctx.fx.impact(hit.point, hit.normal, src); return; }

      ctx.damage.apply(hit.enemy, this.damage, src, {
        now: ctx.now, headshot: hit.headshot, point: hit.point, weaponId: this.id,
      });
      ctx.fx.impact(hit.point, hit.normal, src, true);
      ctx.linkTether(hit.enemy, src, this.tetherLife);
    },
  },
};

/** THRESH is always in your other hand; it has no slot and no ammo. */
export const MELEE = {
  id: 'thresh',
  name: 'THRESH',
  role: 'Kinetic Blade',
  damage: 58,
  range: 3.1,
  arc: 0.62,          // radians, half-angle
  cooldown: 0.52,
  parryWindow: 0.24,
  echoSynergy: 'RETURN',
  echoNote: 'A parried projectile is not destroyed: it is pushed into your '
    + 'echo\'s timeline and comes back one delay later, aimed at whoever fired '
    + 'it. Parrying is how you give your past self a weapon.',
};

/** Linear damage falloff between two ranges, floored so guns stay useful. */
function falloff(w, dist) {
  if (dist <= w.falloffStart) return 1;
  if (dist >= w.falloffEnd) return w.falloffMin;
  const t = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
  return 1 + (w.falloffMin - 1) * t;
}

export const WEAPON_ORDER = ['splitter', 'rend', 'kettle', 'lattice'];

/**
 * Runtime state for one weapon in the player's hands. Ammo, reload and recoil
 * are tracked here; the echo never uses any of it, because a replay does not
 * consume ammunition -- it only ever repeats a shot that was already paid for.
 */
export class WeaponInstance {
  constructor(def) {
    this.def = def;
    this.ammo = def.mag;
    this.reserve = def.reserve;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.lastFiredAt = -999;
  }

  get id() { return this.def.id; }
  get interval() { return 60 / this.def.rpm; }
  get canFire() { return this.ammo > 0 && this.cooldown <= 0 && !this.reloading; }
  get magRatio() { return this.ammo / this.def.mag; }

  step(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.burstTimer > 0) this.burstTimer -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload();
    }
  }

  beginReload() {
    if (this.reloading || this.ammo >= this.def.mag || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = this.def.reloadTime;
    this.burstLeft = 0;
    return true;
  }

  _finishReload() {
    if (this.def.reloadPerShell) {
      // One shell at a time, and it can be cancelled by firing -- the classic
      // pump-shotgun tension of "do I top up or do I commit".
      const take = Math.min(1, this.reserve, this.def.mag - this.ammo);
      this.ammo += take;
      this.reserve -= take;
      if (this.ammo < this.def.mag && this.reserve > 0) {
        this.reloadTimer = this.def.reloadTime;
        return;
      }
    } else {
      const take = Math.min(this.def.mag - this.ammo, this.reserve);
      this.ammo += take;
      this.reserve -= take;
    }
    this.reloading = false;
  }

  cancelReload() {
    if (this.reloading && this.def.reloadPerShell && this.ammo > 0) {
      this.reloading = false;
      return true;
    }
    return false;
  }

  consume() {
    this.ammo--;
    this.cooldown = this.interval;
  }

  addReserve(n) {
    this.reserve = Math.min(this.def.reserve * 2, this.reserve + n);
  }
}
