import * as THREE from 'three';
import { MovementState, stepMovement } from './Movement.js';
import { Recorder } from './Recorder.js';
import { Echo } from './Echo.js';
import { WEAPONS, WEAPON_ORDER, MELEE, WeaponInstance } from '../weapons/Arsenal.js';
import {
  MOVE, PLAYER, FLUX, SHIFT, ECHO, CAMERA, LOOK, SIM_DT,
} from '../core/Tuning.js';

/**
 * ECHOSTRIDE — Player
 *
 * Owns the three things that make a Strider a Strider: a body that moves, a
 * tape of where that body has been, and the ability to trade places with it.
 */
export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.move = new MovementState();
    this.recorder = new Recorder();
    this.echo = new Echo(this.recorder, ctx.scene);

    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.flux = FLUX.start;
    this.dead = false;
    this.lastHurtAt = -999;
    this.invulnerableUntil = 0;
    this.shiftCooldown = 0;
    this.lastPhaseCatchAt = -999;
    this.retuneLockedUntil = 0;

    this.weapons = WEAPON_ORDER.map((id) => new WeaponInstance(WEAPONS[id]));
    this.weaponIndex = 0;
    this.meleeCooldown = 0;
    this.parryUntil = 0;
    this.shotSeed = 1;

    // Recoil is tracked separately from aim so it can recover without
    // fighting the player's own mouse movement -- the "recoil pushes your
    // crosshair and then gives it back" model, which is the only one that
    // feels fair with a 3-round burst.
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelP = 0;
    this.recoilVelY = 0;

    this.burstQueue = 0;
    this.burstTimer = 0;

    this.stats = { kills: 0, shots: 0, hits: 0, shifts: 0, collapses: 0, damage: 0 };
    this._footAccum = 0;
  }

  get weapon() { return this.weapons[this.weaponIndex]; }
  get position() { return this.move.position; }
  get velocity() { return this.move.velocity; }
  get center() {
    return new THREE.Vector3(
      this.move.position.x,
      this.move.position.y + this.move.height * 0.5,
      this.move.position.z,
    );
  }
  get eye() { return this.move.eye; }
  get fluxRatio() { return this.flux / FLUX.max; }

  addFlux(n) { this.flux = Math.min(FLUX.max, this.flux + n); }
  spendFlux(n) {
    if (this.flux < n) return false;
    this.flux -= n;
    return true;
  }
  heal(n) { this.health = Math.min(PLAYER.maxHealth, this.health + n); }

  /* ------------------------------------------------------------------ *
   * DAMAGE
   * ------------------------------------------------------------------ */
  hurt(amount, now, from) {
    if (this.dead || now < this.invulnerableUntil) return false;

    // PHASE-CATCH. If a hit would kill you and your echo is standing, your
    // past self catches you: you are yanked back to where you were, at 1 HP.
    //
    // This is the one "second chance" in the game and it is deliberately not
    // free and not automatic-feeling. It costs Flux, it has a 20 s cooldown,
    // and crucially it requires you to have kept your echo ALIVE -- so the
    // comeback is paid for by a decision you made several seconds earlier.
    // A revive you earned in the past is thematically the only revive this
    // game could have.
    if (amount >= this.health && this.echo.canShift
        && this.flux >= SHIFT.phaseCatchFluxCost
        && now - this.lastPhaseCatchAt > SHIFT.phaseCatchCooldown) {
      this.flux -= SHIFT.phaseCatchFluxCost;
      this.lastPhaseCatchAt = now;
      this.health = SHIFT.phaseCatchHealthGranted;
      this.invulnerableUntil = now + SHIFT.phaseCatchIFrames;
      this._teleportToEcho(now, true);
      this.ctx.events.emit('phaseCatch', {});
      return false;
    }

    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.6);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    this.lastHurtAt = now;
    this.invulnerableUntil = now + PLAYER.hurtInvulnerability;
    this.ctx.resonance.onPlayerHurt();
    this.ctx.events.emit('playerHurt', { amount, from, health: this.health });
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.ctx.events.emit('playerDied', { from });
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * SHIFT — the verb the game is named for
   * ------------------------------------------------------------------ */
  canShift(now) {
    return !this.dead && this.echo.canShift && this.shiftCooldown <= 0
      && this.flux >= SHIFT.fluxCost;
  }

  doShift(now) {
    if (!this.canShift(now)) {
      this.ctx.audio?.play('empty', null);
      return false;
    }
    this.flux -= SHIFT.fluxCost;
    this.shiftCooldown = SHIFT.cooldown;
    this.stats.shifts++;
    this._teleportToEcho(now, false);
    this.ctx.events.emit('shift', {});
    return true;
  }

  /**
   * The mechanic, in eleven lines.
   *
   * You move to where your echo is -- which is where *you* were, `delay`
   * seconds ago. You inherit the velocity you had then, so a shift taken
   * mid-sprint keeps the sprint.
   *
   * The recorder is NOT cleared. That is the subtle, important part. Your
   * recent history stays on the tape, so your echo keeps walking the route you
   * just abandoned: it continues forward from here, retracing your path toward
   * the spot you just left, while you take a different one. One SHIFT turns a
   * single body into a genuine pincer, and it costs you nothing but Flux and
   * the nerve to give up the ground you were standing on.
   */
  _teleportToEcho(now, silent) {
    const from = this.move.position.clone();
    const to = this.echo.position.clone();

    this.move.position.copy(to);
    this.move.velocity.set(this.echo.velocity.x, this.echo.velocity.y, this.echo.velocity.z);
    this.move.grounded = this.echo.state.grounded;
    this.move.sliding = false;
    this.move.wallRunning = false;

    // Mark the discontinuity so the echo performs the same jump on schedule
    // rather than interpolating a straight line through the level geometry.
    this.recorder.markTeleport();
    this.invulnerableUntil = Math.max(this.invulnerableUntil, now + SHIFT.iFrames);

    // Shove anything standing in the arrival spot. Materialising inside a
    // Warden is the kind of thing that only has to happen once to lose a
    // player's trust in the button.
    for (const e of this.ctx.enemies) {
      if (e.dead) continue;
      const d = e.position.distanceTo(to);
      if (d < SHIFT.arrivalPushRadius) {
        const away = new THREE.Vector3().subVectors(e.position, to).setY(0);
        if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
        away.normalize().multiplyScalar(SHIFT.arrivalPush);
        e.velocity.add(away);
      }
    }

    this.ctx.fx.shiftBurst(from, to);
    if (!silent) this.ctx.audio?.play('shift', null);
  }

  /* ------------------------------------------------------------------ *
   * COLLAPSE — spend your echo
   * ------------------------------------------------------------------ */
  canCollapse() {
    return !this.dead && this.echo.canShift && this.flux >= SHIFT.collapseFluxCost;
  }

  doCollapse(now) {
    if (!this.canCollapse()) { this.ctx.audio?.play('empty', null); return false; }
    this.flux -= SHIFT.collapseFluxCost;
    this.stats.collapses++;
    const at = this.echo.center.clone();

    // Damage scales with what the echo actually did while it was alive. A
    // COLLAPSE is the payoff for an echo that fought well, not a button that
    // happens to be off cooldown. Players learn to *bank* an echo.
    const dmg = Math.min(
      SHIFT.collapseMaxDamage,
      SHIFT.collapseBaseDamage + this.echo.damageDealt * SHIFT.collapseDamagePerEchoDamage,
    );

    for (const e of this.ctx.enemies) {
      if (e.dead) continue;
      const d = e.center.distanceTo(at);
      if (d > SHIFT.collapseRadius) continue;
      const pull = new THREE.Vector3().subVectors(at, e.position).setY(0).normalize();
      e.velocity.addScaledVector(pull, SHIFT.collapsePullForce * (1 - d / SHIFT.collapseRadius));
      const falloff = 1 - (d / SHIFT.collapseRadius) * 0.55;
      // A collapse always counts as resonant: it is literally both of you at
      // once. That is what lets it shatter a Monolith in a pinch, and it is
      // also why it costs your partner.
      this.ctx.damage.apply(e, dmg * falloff, 'echo', {
        now, point: e.center, weaponId: 'collapse', canResonate: false,
      });
      if (e.armor > 0) { e.armor = 0; this.ctx.events.emit('armorBreak', { target: e, point: e.center }); }
    }

    this.armor = Math.min(PLAYER.maxArmor, this.armor + PLAYER.armorOnCollapse);
    this.echo.consume(now, SHIFT.collapseEchoLockout);
    this.ctx.fx.collapse(at, SHIFT.collapseRadius);
    this.ctx.audio?.play('collapse', null);
    this.ctx.events.emit('collapse', { at, damage: dmg });
    return true;
  }

  /* ------------------------------------------------------------------ *
   * WEAPONS
   * ------------------------------------------------------------------ */
  selectWeapon(i) {
    if (i < 0 || i >= this.weapons.length || i === this.weaponIndex) return;
    this.weaponIndex = i;
    this.burstQueue = 0;
    this.ctx.events.emit('weaponSwitch', { weapon: this.weapon.def });
  }

  aimDirection() {
    const yaw = this.move.yaw + this.recoilYaw;
    const pitch = this.move.pitch + this.recoilPitch;
    return new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
  }

  tryFire(now) {
    const w = this.weapon;
    if (w.reloading && !w.cancelReload()) return;
    if (w.ammo <= 0) {
      this.ctx.audio?.play('empty', null);
      w.beginReload();
      return;
    }
    if (w.cooldown > 0) return;
    if (w.def.burst) { this.burstQueue = w.def.burst; this.burstTimer = 0; this._fireOne(now); }
    else this._fireOne(now);
  }

  _fireOne(now) {
    const w = this.weapon;
    if (w.ammo <= 0) { this.burstQueue = 0; return; }
    const dir = this.aimDirection();
    const origin = this.eye.clone();
    const seed = (this.shotSeed = (this.shotSeed * 1103515245 + 12345) >>> 0);

    // Recorded BEFORE resolving, so the echo's copy of this shot carries the
    // same origin frame and the same seed and therefore the same pellets.
    this.recorder.pushShot(dir, w.id, seed, 1);

    w.consume();
    this.stats.shots++;
    w.def.fire(this.ctx.weaponCtx(now), { origin, dir, src: 'player', seed, charge: 1 });
    this.ctx.audio?.play(w.id, null, { src: 'player' });
    this.ctx.onPlayerShot?.();
    this.ctx.fx.shake = Math.max(this.ctx.fx.shake, w.def.recoil.v * 0.06);

    // Recoil kick. Vertical is consistent so it is learnable; horizontal
    // alternates sign so a burst walks in a shallow zigzag rather than a
    // straight diagonal, which is what makes long bursts feel controllable.
    this.recoilVelP += w.def.recoil.v * 0.045;
    this.recoilVelY += (this.stats.shots % 2 ? 1 : -1) * w.def.recoil.h * 0.028;

    if (w.ammo <= 0) { this.burstQueue = 0; w.beginReload(); }
  }

  tryMelee(now) {
    if (this.meleeCooldown > 0) return;
    this.meleeCooldown = MELEE.cooldown;
    this.parryUntil = now + MELEE.parryWindow;
    this.ctx.audio?.play('thresh', null, { src: 'player' });

    const dir = this.aimDirection();
    const origin = this.eye.clone();
    for (const e of this.ctx.enemies) {
      if (e.dead) continue;
      const to = new THREE.Vector3().subVectors(e.center, origin);
      const dist = to.length();
      if (dist > MELEE.range + e.radius) continue;
      to.divideScalar(dist);
      if (to.dot(dir) < Math.cos(MELEE.arc)) continue;
      this.ctx.damage.apply(e, MELEE.damage, 'player', {
        now, point: e.center, weaponId: 'thresh',
      });
      this.ctx.fx.impact(e.center, dir.clone().negate(), 'player', true);
    }
    this.ctx.events.emit('melee', {});
  }

  /* ------------------------------------------------------------------ *
   * PER-TICK
   * ------------------------------------------------------------------ */
  step(dt, cmd, now) {
    if (this.dead) return;

    if (this.shiftCooldown > 0) this.shiftCooldown -= dt;
    if (this.meleeCooldown > 0) this.meleeCooldown -= dt;
    for (const w of this.weapons) w.step(dt);

    // Burst fire continues on its own schedule so the player holds the
    // trigger once and the weapon finishes its sentence.
    if (this.burstQueue > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstQueue--;
        if (this.burstQueue > 0) {
          this.burstTimer = this.weapon.def.burstDelay;
          this._fireOne(now);
        }
      }
    }

    // Recoil: a spring toward zero. Critically damped-ish, so it settles
    // without overshooting into a visible bounce.
    const rec = this.weapon.def.recoil.recover;
    this.recoilVelP -= this.recoilPitch * rec * dt * 8;
    this.recoilVelY -= this.recoilYaw * rec * dt * 8;
    this.recoilVelP *= Math.max(0, 1 - rec * dt);
    this.recoilVelY *= Math.max(0, 1 - rec * dt);
    this.recoilPitch += this.recoilVelP * dt * 8;
    this.recoilYaw += this.recoilVelY * dt * 8;

    this.move.speedMultiplier = this.ctx.resonance.speedBonus;
    stepMovement(this.move, cmd, this.ctx.world, dt);

    // Updraft columns.
    for (const u of this.ctx.map.updrafts) {
      const d = Math.hypot(this.move.position.x - u.x, this.move.position.z - u.z);
      if (d < u.radius && this.move.position.y < u.topY) {
        this.move.velocity.y = Math.min(u.force, this.move.velocity.y + u.force * dt * 4.5);
        this.move.grounded = false;
      }
    }

    // Flux economy: speed pays, standing still costs.
    const sp = this.move.speed;
    if (sp > FLUX.speedGainAt) {
      const k = Math.min(1, (sp - FLUX.speedGainAt) / (MOVE.sprintSpeed - FLUX.speedGainAt + 2));
      this.addFlux(FLUX.speedGainPerSecond * k * dt);
    } else if (now - this.lastHurtAt > 4 && this.ctx.enemies.every((e) => e.dead || e.position.distanceTo(this.position) > 30)) {
      this.flux = Math.max(0, this.flux - FLUX.decayPerSecondIdle * dt);
    }

    // Footsteps and landing.
    this._footAccum += sp * dt;
    const stride = this.move.crouching ? 2.4 : 2.0;
    if (this.move.grounded && !this.move.sliding && this._footAccum > stride) {
      this._footAccum = 0;
      this.ctx.audio?.play('footstep', null, { pitch: 0.85 + Math.random() * 0.3 });
    }
    if (this.move.landImpact > 4) {
      this.ctx.audio?.play('land', null, { pitch: Math.min(1.4, this.move.landImpact / 12) });
      // Fall damage starts well above any jump the movement system can
      // produce, so it only ever punishes falling off the top tier.
      if (this.move.landImpact > 26) {
        this.hurt((this.move.landImpact - 26) * 3.4, now, 'fall');
      }
    }

    // Out of the world.
    if (this.move.position.y < (this.ctx.map.meta?.killZ ?? -50)) {
      this.hurt(9999, now, 'void');
    }

    this.recorder.record(this.move, this.weapon.id, dt);
  }

  respawn(spawnPos) {
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.flux = FLUX.start;
    this.dead = false;
    this.move.position.copy(spawnPos);
    this.move.velocity.set(0, 0, 0);
    this.recorder.reset();
    this.echo.active = false;
    this.echo.alive = true;
    this.echo.health = ECHO.maxHealth;
    this.echo.lockedOutUntil = 0;
    this.echo.deadUntil = 0;
    for (const w of this.weapons) {
      w.ammo = w.def.mag;
      w.reserve = w.def.reserve;
      w.reloading = false;
    }
    this.weaponIndex = 0;
    this.stats = { kills: 0, shots: 0, hits: 0, shifts: 0, collapses: 0, damage: 0 };
  }
}
