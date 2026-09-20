import * as THREE from 'three';
import { PALETTE } from '../engine/Palette.js';
import { MAT } from '../engine/Materials.js';

/**
 * ECHOSTRIDE — The Stillness
 *
 * The faction is an order that believes recursion is a disease: they want a
 * world where a moment happens once and then is *over*. Everything about them
 * is designed as the visual opposite of you. You are asymmetric, layered, and
 * always in motion; they are symmetrical, sealed, and hold still until they
 * commit. You glow cyan and trail violet; they burn oxide orange.
 *
 * The rule every enemy in this game obeys:
 *
 *   Each enemy type must teach one specific lesson about the echo,
 *   and must be *unbeatable in a boring way* if you ignore that lesson.
 *
 *   WARDEN    -- your echo is a body. Enemies will chase it. Use that.
 *   PSALM     -- things can lead a target. So can you.
 *   MONOLITH  -- only Resonance breaks plating. Learn to aim into the future.
 *   HUSH      -- reading an echo is a skill. Here is one pointed at you.
 *   CANTOR    -- your echo can be taken away. Protect it.
 *
 * That is a whole bestiary derived from one mechanic, which is what makes the
 * game feel like it is about something rather than merely containing a gimmick.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class Enemy {
  constructor(type, pos, ctx) {
    this.type = type;
    this.ctx = ctx;
    this.position = pos.clone();
    this.velocity = V();
    this.yaw = 0;
    this.dead = false;
    this.spawnedAt = ctx.now;
    this.lastDamagedAt = -999;

    // Resonance bookkeeping. Kept on the target rather than in a global map so
    // it cannot leak when an enemy dies.
    this.lastPlayerHitAt = null;
    this.lastEchoHitAt = null;
    this.lastPlayerShotDir = null;
    this.lastEchoShotDir = null;
    /** @type {Set<Enemy>} */
    this.tethers = new Set();

    this.attackTimer = 0;
    this.stateTimer = 0;
    this.target = null;
    this.flash = 0;
    this.grounded = false;
  }

  /** Spheres used for hit detection. One flagged `head` for headshots. */
  hitSpheres() {
    return [{ center: this.center, radius: this.radius, head: false }];
  }

  get center() {
    return V(this.position.x, this.position.y + this.height * 0.5, this.position.z);
  }

  /**
   * Target selection. This single method is why the echo feels alive: enemies
   * genuinely do not know which of you is the original, so your past self
   * draws real aggression and can really die for you.
   */
  pickTarget(ctx) {
    const cands = [];
    const p = ctx.player;
    if (!p.dead) cands.push({ kind: 'player', pos: p.center, obj: p });
    if (ctx.echo.active && ctx.echo.alive) {
      cands.push({ kind: 'echo', pos: ctx.echo.center, obj: ctx.echo });
    }
    if (cands.length === 0) return null;

    let best = null, bestScore = -Infinity;
    for (const c of cands) {
      const d = this.center.distanceTo(c.pos);
      const los = ctx.world.lineOfSight(this.center, c.pos);
      // Distance dominates, line of sight matters a lot, and there is a mild
      // bias toward the player so fights never devolve into the whole arena
      // ignoring you. The bias is small enough that a well-placed echo still
      // reliably pulls a room.
      let score = -d * 1.0 + (los ? 26 : 0) + (c.kind === 'player' ? 6 : 0);
      // ...and enemies briefly commit to a target instead of oscillating
      // between two bodies standing equidistant, which looked like a bug.
      if (this.target && this.target.kind === c.kind) score += 9;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  /** Shared ground locomotion: steer toward a point, fall, resolve. */
  locomote(dt, desiredDir, speed, world) {
    const accel = 26;
    if (desiredDir) {
      this.velocity.x += desiredDir.x * accel * dt;
      this.velocity.z += desiredDir.z * accel * dt;
      const sp = Math.hypot(this.velocity.x, this.velocity.z);
      if (sp > speed) {
        this.velocity.x *= speed / sp;
        this.velocity.z *= speed / sp;
      }
    } else {
      this.velocity.x *= 1 - Math.min(1, dt * 7);
      this.velocity.z *= 1 - Math.min(1, dt * 7);
    }
    if (!this.floats) this.velocity.y -= 24 * dt;

    const half = V(this.radius, this.height / 2, this.radius);
    const center = V(this.position.x, this.position.y + this.height / 2, this.position.z);
    const res = world.moveAABB(center, half,
      V(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt),
      { stepHeight: 0.55 });
    this.position.set(res.pos.x, res.pos.y - this.height / 2, res.pos.z);
    if (res.grounded) { this.velocity.y = 0; this.grounded = true; } else this.grounded = false;
    if (res.ceiling && this.velocity.y > 0) this.velocity.y = 0;
    // Bounce off walls slightly rather than grinding along them; a charging
    // Warden that scrapes a pillar for two seconds looks broken.
    if (res.wallNormal) {
      this.velocity.x += res.wallNormal.x * 3.0;
      this.velocity.z += res.wallNormal.z * 3.0;
    }
  }

  /** Simple obstacle-aware steering: if the direct line is blocked, slide. */
  steerToward(targetPos, world) {
    const dir = V().subVectors(targetPos, this.position).setY(0);
    const dist = dir.length();
    if (dist < 1e-3) return null;
    dir.divideScalar(dist);
    const probe = world.raycast(
      V(this.position.x, this.position.y + this.height * 0.5, this.position.z),
      dir, Math.min(dist, this.radius + 2.2),
    );
    if (probe) {
      // Try both tangents, prefer the one with more room.
      const left = V(-dir.z, 0, dir.x);
      const right = V(dir.z, 0, -dir.x);
      const clear = (d) => {
        const h = world.raycast(
          V(this.position.x, this.position.y + this.height * 0.5, this.position.z), d, 4.0);
        return h ? h.dist : 4.0;
      };
      const cl = clear(left), cr = clear(right);
      const tangent = cl > cr ? left : right;
      dir.lerp(tangent, 0.85).normalize();
    }
    return dir;
  }

  faceTarget(pos, dt, rate = 7) {
    const want = Math.atan2(-(pos.x - this.position.x), -(pos.z - this.position.z));
    let d = ((want - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }

  onDamaged() { this.flash = 1; }

  step(dt, ctx) {
    this.flash *= 0.85;
    this.stateTimer += dt;
    if (this.attackTimer > 0) this.attackTimer -= dt;
    this.think(dt, ctx);
    this.updateMesh(ctx);
  }

  think() {}

  updateMesh() {
    if (!this.group) return;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    if (this.flashMat) {
      this.flashMat.emissiveIntensity = 0.65 + this.flash * 3.2;
    }
  }

  dispose(scene) { if (this.group) scene.remove(this.group); }
}

/* ===================================================================== *
 * WARDEN — the rusher. A headless ceramic quadruped with one oxide slit
 * where a face should be. Fast, fragile, and it will happily chase your
 * echo across the arena, which is the entire lesson: your past self is
 * bait you can place on purpose.
 * ===================================================================== */
export class Warden extends Enemy {
  static displayName = 'WARDEN';
  constructor(pos, ctx) {
    super('warden', pos, ctx);
    this.maxHealth = 58; this.health = 58;
    this.armor = 0; this.armorAbsorb = 0.5;
    this.radius = 0.52; this.height = 1.05;
    this.speed = 9.2;
    this.contactDamage = 14;
    this.leapCooldown = 0;
    this.buildMesh(ctx.scene);
  }

  hitSpheres() {
    return [
      { center: this.center, radius: 0.55 },
      // The "head" is the sensor slit at the front of the chassis. Hitting a
      // sprinting quadruped's sensor is hard, and paying 60% extra for it is
      // the reward for tracking rather than spraying.
      {
        center: V(
          this.position.x - Math.sin(this.yaw) * 0.55,
          this.position.y + 0.78,
          this.position.z - Math.cos(this.yaw) * 0.55,
        ), radius: 0.26, head: true,
      },
    ];
  }

  buildMesh(scene) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BOX(0.62, 0.40, 1.15), MAT.ceramicEnemy?.() ?? MAT.pillar());
    body.position.y = 0.72;
    g.add(body);
    const slitMat = MAT.oxide(0.9).clone();
    this.flashMat = slitMat;
    // The sensor slit wraps the front corners, so a Warden reads as facing you
    // from any angle rather than only head-on.
    const slit = new THREE.Mesh(BOX(0.44, 0.085, 0.06), slitMat);
    slit.position.set(0, 0.78, -0.59);
    g.add(slit);
    for (const sx of [-1, 1]) {
      const wrap = new THREE.Mesh(BOX(0.06, 0.085, 0.30), slitMat);
      wrap.position.set(sx * 0.32, 0.78, -0.44);
      g.add(wrap);
    }
    // Front cowl: gives the box a nose, so the silhouette has a direction.
    const cowl = new THREE.Mesh(BOX(0.46, 0.22, 0.26), MAT.bone());
    cowl.position.set(0, 0.60, -0.56);
    cowl.rotation.x = 0.30;
    g.add(cowl);
    // A low dorsal fin gives the silhouette a direction when seen from above,
    // which matters because Wardens are usually below you.
    const fin = new THREE.Mesh(BOX(0.07, 0.30, 0.62), MAT.ash());
    fin.position.set(0, 1.02, 0.08);
    fin.rotation.x = -0.10;
    g.add(fin);
    this.legs = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * 0.28, 0.58, sz * 0.42);
        const upper = new THREE.Mesh(BOX(0.10, 0.34, 0.10), MAT.ash());
        upper.position.y = -0.17;
        hip.add(upper);
        const lower = new THREE.Mesh(BOX(0.085, 0.30, 0.085), MAT.ash());
        lower.position.set(0, -0.44, 0.06);
        hip.add(lower);
        g.add(hip);
        this.legs.push({ hip, phase: (sx * 1 + sz * 2) * 1.1 });
      }
    }
    this.group = g;
    scene.add(g);
  }

  think(dt, ctx) {
    const t = this.pickTarget(ctx);
    this.target = t;
    if (!t) { this.locomote(dt, null, 0, ctx.world); return; }
    const dist = this.position.distanceTo(t.pos);
    this.faceTarget(t.pos, dt, 9);

    if (this.leapCooldown > 0) this.leapCooldown -= dt;

    // Leap: commits to a ballistic arc. A charge you can dodge by moving
    // sideways *at the right moment* is a far better teacher than a homing one.
    if (dist < 12 && dist > 4.5 && this.grounded && this.leapCooldown <= 0
        && ctx.world.lineOfSight(this.center, t.pos)) {
      const to = V().subVectors(t.pos, this.position).setY(0).normalize();
      this.velocity.x = to.x * 15.5;
      this.velocity.z = to.z * 15.5;
      this.velocity.y = 8.2;
      this.leapCooldown = 2.6;
      ctx.audio?.play('wardenLeap', this.position);
    }

    const dir = this.steerToward(t.pos, ctx.world);
    this.locomote(dt, dir, this.speed, ctx.world);

    if (dist < 1.9 && this.attackTimer <= 0) {
      this.attackTimer = 0.85;
      ctx.hurtTarget(t, this.contactDamage, this);
      ctx.fx.impact(t.pos, V(0, 1, 0), 'enemy');
    }
  }

  updateMesh(ctx) {
    super.updateMesh(ctx);
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    const phase = ctx.now * (4 + sp * 0.9);
    for (const l of this.legs) {
      l.hip.rotation.x = Math.sin(phase + l.phase) * Math.min(0.8, 0.15 + sp * 0.06);
    }
    if (!this.grounded) for (const l of this.legs) l.hip.rotation.x = -0.6;
  }
}

/* ===================================================================== *
 * PSALM — the ranged priest. Floats, robed, holds a slab. It *leads* its
 * shots: it fires at where you will be. Being shot at by something that
 * predicts you is the fastest possible way to teach a player that
 * prediction is a thing they can also do.
 * ===================================================================== */
export class Psalm extends Enemy {
  static displayName = 'PSALM';
  constructor(pos, ctx) {
    super('psalm', pos, ctx);
    this.maxHealth = 72; this.health = 72;
    this.armor = 0; this.armorAbsorb = 0.4;
    this.radius = 0.45; this.height = 2.1;
    this.floats = true;
    this.speed = 3.6;
    this.preferredRange = 22;
    this.bob = Math.random() * 6;
    this.buildMesh(ctx.scene);
  }

  hitSpheres() {
    return [
      { center: V(this.position.x, this.position.y + 1.0, this.position.z), radius: 0.55 },
      { center: V(this.position.x, this.position.y + 1.82, this.position.z), radius: 0.30, head: true },
    ];
  }

  buildMesh(scene) {
    const g = new THREE.Group();
    // A tapered column: wide at the shoulders, narrowing to nothing at the
    // floor. It reads as "robe" without a single cloth simulation.
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.52, 1.55, 6), MAT.pillar());
    robe.position.y = 0.80;
    g.add(robe);
    const shoulders = new THREE.Mesh(BOX(0.78, 0.16, 0.34), MAT.bone());
    shoulders.position.y = 1.56;
    g.add(shoulders);
    const headMat = MAT.oxide(0.8).clone();
    this.flashMat = headMat;
    const head = new THREE.Mesh(BOX(0.24, 0.34, 0.24), headMat);
    head.position.y = 1.82;
    g.add(head);
    // The slab: a floating tablet it aims over. It tilts when the Psalm is
    // charging a volley, which is the tell.
    this.slab = new THREE.Mesh(BOX(0.52, 0.72, 0.07), MAT.ash());
    this.slab.position.set(0.42, 1.15, -0.30);
    g.add(this.slab);
    this.group = g;
    scene.add(g);
  }

  think(dt, ctx) {
    const t = this.pickTarget(ctx);
    this.target = t;
    this.position.y += Math.sin(ctx.now * 1.4 + this.bob) * 0.004;
    if (!t) return;
    const dist = this.position.distanceTo(t.pos);
    this.faceTarget(t.pos, dt, 4);

    // Strafe at range: hold the preferred distance and circle. Standing still
    // makes a ranged enemy a turret; circling makes it a duel.
    const to = V().subVectors(t.pos, this.position).setY(0).normalize();
    let dir = null;
    if (dist > this.preferredRange + 3) dir = to;
    else if (dist < this.preferredRange - 5) dir = to.clone().negate();
    else dir = V(-to.z, 0, to.x).multiplyScalar(Math.sin(this.spawnedAt * 3) > 0 ? 1 : -1);
    this.locomote(dt, dir, this.speed, ctx.world);

    if (this.attackTimer <= 0 && dist < 44 && ctx.world.lineOfSight(this.center, t.pos)) {
      this.attackTimer = 2.35;
      this.charging = 0.55;
      ctx.schedule(0.55, () => {
        if (this.dead) return;
        const muzzle = V(this.position.x, this.position.y + 1.25, this.position.z);
        // Lead the target. The speed of the bolt is slow enough that a good
        // player can simply walk out of the prediction -- the counterplay is
        // "change your mind", which is thematically perfect for this game.
        const targetVel = t.obj.velocity ?? V();
        const bolt = 26;
        const flight = muzzle.distanceTo(t.pos) / bolt;
        const lead = t.pos.clone().addScaledVector(targetVel, flight * 0.72);
        const dirB = V().subVectors(lead, muzzle).normalize();
        ctx.projectiles.spawn({
          position: muzzle, velocity: dirB.multiplyScalar(bolt), gravity: 2.0,
          color: PALETTE.oxide, radius: 0.22, life: 5, hostile: true, shard: true,
          damage: 17, src: 'enemy',
          onDirectHit: (p, who) => ctx.hurtByName(who, 17, this),
          onDetonate: (p) => ctx.fx.impact(p.position, V(0, 1, 0), 'enemy'),
        });
        ctx.audio?.play('psalmFire', this.position);
      });
    }
  }

  updateMesh(ctx) {
    super.updateMesh(ctx);
    if (this.slab) {
      const charge = Math.max(0, (this.attackTimer - 1.8) / 0.55);
      this.slab.rotation.z = -0.25 - charge * 0.9;
      this.slab.position.x = 0.42 - charge * 0.24;
    }
  }
}

/* ===================================================================== *
 * MONOLITH — the wall. A slab walker whose frontal plating cannot be
 * damaged by ordinary fire at all. Only a Resonant Strike shatters it.
 *
 * This is the most important enemy in the game. It is the moment the
 * player stops treating the echo as a bonus and starts treating it as a
 * weapon, because there is literally no other way past this thing from
 * the front. The counterplay it does allow -- shoot it in the back -- is
 * the *other* lesson: your echo can hold its attention while you move.
 * ===================================================================== */
export class Monolith extends Enemy {
  static displayName = 'MONOLITH';
  constructor(pos, ctx) {
    super('monolith', pos, ctx);
    this.maxHealth = 260; this.health = 260;
    this.armor = 140; this.maxArmor = 140;
    this.armorAbsorb = 1.0;   // total absorption from the front: a gate, not a buffer
    this.radius = 0.95; this.height = 2.6;
    this.speed = 3.1;
    this.buildMesh(ctx.scene);
  }

  hitSpheres() {
    return [
      { center: V(this.position.x, this.position.y + 1.4, this.position.z), radius: 1.05 },
      { center: V(this.position.x, this.position.y + 2.35, this.position.z), radius: 0.34, head: true },
    ];
  }

  /**
   * Plating only protects the front 150 degrees. Shooting a Monolith in the
   * back always works -- which makes "get behind it" a real, discoverable
   * answer alongside "resonate through it".
   */
  isFrontal(point) {
    const to = V().subVectors(point, this.position).setY(0).normalize();
    const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return to.dot(fwd) > Math.cos((150 * Math.PI) / 180 / 2 + 0.35);
  }

  buildMesh(scene) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BOX(1.30, 1.55, 0.90), MAT.ash());
    body.position.y = 1.45;
    g.add(body);
    // The plate. Deliberately huge and deliberately a different colour from
    // the body, so "the orange part is the problem" needs no tutorial.
    this.plateMat = MAT.oxide(0.55).clone();
    this.flashMat = this.plateMat;
    this.plate = new THREE.Mesh(BOX(1.62, 1.80, 0.20), this.plateMat);
    this.plate.position.set(0, 1.45, -0.56);
    g.add(this.plate);
    for (const sx of [-1, 1]) {
      const rib = new THREE.Mesh(BOX(0.12, 1.80, 0.30), MAT.bone());
      rib.position.set(sx * 0.78, 1.45, -0.46);
      g.add(rib);
    }
    const head = new THREE.Mesh(BOX(0.40, 0.34, 0.40), MAT.bone());
    head.position.y = 2.35;
    g.add(head);
    const eye = new THREE.Mesh(BOX(0.30, 0.05, 0.05), MAT.oxide(1.4));
    eye.position.set(0, 2.36, -0.21);
    g.add(eye);
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.42, 0.72, 0);
      const leg = new THREE.Mesh(BOX(0.26, 0.76, 0.26), MAT.ash());
      leg.position.y = -0.38;
      hip.add(leg);
      const foot = new THREE.Mesh(BOX(0.36, 0.14, 0.52), MAT.bone());
      foot.position.set(0, -0.76, 0.06);
      hip.add(foot);
      g.add(hip);
      this.legs.push({ hip, phase: sx });
    }
    this.group = g;
    scene.add(g);
  }

  think(dt, ctx) {
    const t = this.pickTarget(ctx);
    this.target = t;
    if (!t) { this.locomote(dt, null, 0, ctx.world); return; }
    // It always turns to face its target: the plate must be a *choice* the
    // enemy is making, not a static weak-spot puzzle.
    this.faceTarget(t.pos, dt, 2.2);
    const dist = this.position.distanceTo(t.pos);
    const dir = dist > 14 ? this.steerToward(t.pos, ctx.world) : null;
    this.locomote(dt, dir, this.speed, ctx.world);

    if (this.attackTimer <= 0 && dist < 32 && ctx.world.lineOfSight(this.center, t.pos)) {
      this.attackTimer = 3.1;
      ctx.schedule(0.7, () => {
        if (this.dead) return;
        const muzzle = V(this.position.x, this.position.y + 1.5, this.position.z);
        const to = V().subVectors(t.pos, muzzle).normalize();
        // A three-round fan: it punishes standing in one place without ever
        // being an unavoidable hitscan.
        for (let i = -1; i <= 1; i++) {
          const d = to.clone().applyAxisAngle(V(0, 1, 0), i * 0.14);
          ctx.projectiles.spawn({
            position: muzzle.clone().addScaledVector(d, 1.0),
            velocity: d.multiplyScalar(31), gravity: 1.2,
            color: PALETTE.oxide, radius: 0.26, life: 4, hostile: true,
            damage: 21, src: 'enemy',
            onDirectHit: (p, who) => ctx.hurtByName(who, 21, this),
            onDetonate: (p) => ctx.fx.explosion(p.position, 2.4, 'enemy'),
          });
        }
        ctx.audio?.play('monolithFire', this.position);
      });
    }
  }

  updateMesh(ctx) {
    super.updateMesh(ctx);
    if (this.plate) {
      this.plate.visible = this.armor > 0;
      this.plateMat.emissiveIntensity = 0.35 + (this.armor / this.maxArmor) * 0.8 + this.flash * 2;
    }
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    for (const l of this.legs) {
      l.hip.rotation.x = Math.sin(ctx.now * 3.2 + l.phase * Math.PI) * Math.min(0.5, sp * 0.1);
    }
  }
}

/* ===================================================================== *
 * HUSH — the assassin, and the game's cleverest idea turned against you.
 * The Hush itself is nearly invisible. What you *can* see is the Hush's
 * own echo, three seconds behind it. To hit a Hush you must read its
 * echo's path and shoot three seconds ahead of it.
 *
 * It is the exact skill the player has been practising all game, tested
 * in reverse. Players who have internalised their own echo kill a Hush on
 * reflex; players who have not, cannot touch it. No tutorial required.
 * ===================================================================== */
export class Hush extends Enemy {
  static displayName = 'HUSH';
  constructor(pos, ctx) {
    super('hush', pos, ctx);
    this.maxHealth = 46; this.health = 46;
    this.armor = 0; this.armorAbsorb = 0.3;
    this.radius = 0.40; this.height = 1.85;
    this.speed = 10.5;
    this.echoDelay = 3.0;
    /** @type {{t:number,x:number,y:number,z:number,yaw:number}[]} */
    this.history = [];
    this.buildMesh(ctx.scene);
  }

  hitSpheres() {
    return [
      { center: V(this.position.x, this.position.y + 1.0, this.position.z), radius: 0.48 },
      { center: V(this.position.x, this.position.y + 1.62, this.position.z), radius: 0.26, head: true },
    ];
  }

  buildMesh(scene) {
    const g = new THREE.Group();
    // The real body: barely there. 12% opacity, no emissive. In a firefight
    // you will not see it; you will see the shimmer it leaves.
    const ghost = new THREE.MeshBasicMaterial({
      color: PALETTE.oxide, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.ghostMat = ghost;
    const body = new THREE.Mesh(BOX(0.42, 1.30, 0.32), ghost);
    body.position.y = 1.0;
    g.add(body);
    const head = new THREE.Mesh(BOX(0.24, 0.26, 0.26), ghost);
    head.position.y = 1.72;
    g.add(head);
    this.group = g;
    scene.add(g);

    // The visible echo: a hard oxide wireframe of where the Hush *was*.
    const eg = new THREE.Group();
    const wire = new THREE.MeshBasicMaterial({
      color: PALETTE.oxide, wireframe: true, transparent: true, opacity: 0.95,
    });
    const eb = new THREE.Mesh(BOX(0.42, 1.30, 0.32), wire);
    eb.position.y = 1.0;
    eg.add(eb);
    const eh = new THREE.Mesh(BOX(0.24, 0.26, 0.26), wire);
    eh.position.y = 1.72;
    eg.add(eh);
    this.echoGroup = eg;
    scene.add(eg);
  }

  think(dt, ctx) {
    this.history.push({
      t: ctx.now, x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.yaw,
    });
    while (this.history.length > 2 && ctx.now - this.history[0].t > this.echoDelay + 0.5) {
      this.history.shift();
    }

    const t = this.pickTarget(ctx);
    this.target = t;
    if (!t) return;
    this.faceTarget(t.pos, dt, 8);
    const dist = this.position.distanceTo(t.pos);

    // Circle-strafe at knife range, dart in, dart out.
    const to = V().subVectors(t.pos, this.position).setY(0).normalize();
    const tangent = V(-to.z, 0, to.x);
    const orbit = Math.sin(ctx.now * 0.9 + this.spawnedAt) > 0 ? 1 : -1;
    let dir;
    if (dist > 9) dir = to;
    else dir = to.clone().multiplyScalar(0.35).addScaledVector(tangent, orbit * 0.95).normalize();
    this.locomote(dt, dir, this.speed, ctx.world);

    if (dist < 2.6 && this.attackTimer <= 0) {
      this.attackTimer = 1.15;
      ctx.hurtTarget(t, 19, this);
      ctx.fx.impact(t.pos, V(0, 1, 0), 'enemy');
      ctx.audio?.play('hushStrike', this.position);
    }
  }

  updateMesh(ctx) {
    super.updateMesh(ctx);
    // A faint shimmer when close: the Hush is invisible, not unfair.
    const d = ctx.player ? this.position.distanceTo(ctx.player.position) : 99;
    this.ghostMat.opacity = d < 8 ? 0.30 : 0.12;

    const want = ctx.now - this.echoDelay;
    let f = this.history[0];
    for (const h of this.history) { if (h.t <= want) f = h; else break; }
    if (f) {
      this.echoGroup.position.set(f.x, f.y, f.z);
      this.echoGroup.rotation.y = f.yaw;
      this.echoGroup.visible = true;
    }
  }

  dispose(scene) {
    super.dispose(scene);
    if (this.echoGroup) scene.remove(this.echoGroup);
  }
}

/* ===================================================================== *
 * CANTOR — the support, and the only enemy that can take your echo away.
 * Its Stillness Field does not damage you; it *freezes your echo's replay*.
 * The tape stops. Your partner stands still in the middle of a firefight.
 *
 * It is the scariest enemy in the game and it has 54 health, because the
 * threat is not its damage, it is the removal of the thing the player has
 * built their entire fight around. Kill it first. That is the lesson:
 * target priority is about capability, not health bars.
 * ===================================================================== */
export class Cantor extends Enemy {
  static displayName = 'CANTOR';
  constructor(pos, ctx) {
    super('cantor', pos, ctx);
    this.maxHealth = 54; this.health = 54;
    this.armor = 0; this.armorAbsorb = 0.3;
    this.radius = 0.5; this.height = 1.9;
    this.floats = true;
    this.speed = 4.4;
    this.fieldRadius = 13.0;
    this.buildMesh(ctx.scene);
  }

  hitSpheres() {
    return [
      { center: V(this.position.x, this.position.y + 0.95, this.position.z), radius: 0.56 },
      { center: V(this.position.x, this.position.y + 1.66, this.position.z), radius: 0.28, head: true },
    ];
  }

  buildMesh(scene) {
    const g = new THREE.Group();
    const mat = MAT.oxide(0.5).clone();
    this.flashMat = mat;
    // An inverted cone -- the only enemy that points *down*. It is the
    // silhouette that does not belong, for the enemy that breaks the rules.
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.25, 5), MAT.bone());
    body.position.y = 1.05;
    body.rotation.x = Math.PI;
    g.add(body);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), mat);
    core.position.y = 1.62;
    g.add(core);
    this.core = core;
    // Three orbiting tines, visibly *holding* the field open.
    this.tines = [];
    for (let i = 0; i < 3; i++) {
      const tine = new THREE.Mesh(BOX(0.07, 0.62, 0.07), MAT.ash());
      g.add(tine);
      this.tines.push(tine);
    }
    this.group = g;
    scene.add(g);

    // The field boundary, drawn on the floor. A threat you cannot see is a
    // threat that feels like a bug.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(this.fieldRadius - 0.22, this.fieldRadius, 48),
      new THREE.MeshBasicMaterial({
        color: PALETTE.oxide, transparent: true, opacity: 0.30,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    scene.add(this.ring);
  }

  think(dt, ctx) {
    const t = this.pickTarget(ctx);
    this.target = t;
    // It keeps its distance and tries to keep your *echo* inside the field,
    // which makes it actively hostile to the thing you care about most.
    const anchor = (ctx.echo.active && ctx.echo.alive) ? ctx.echo.center : t?.pos;
    if (anchor) {
      const d = this.position.distanceTo(anchor);
      const to = V().subVectors(anchor, this.position).setY(0).normalize();
      let dir = null;
      if (d > this.fieldRadius * 0.7) dir = to;
      else if (d < this.fieldRadius * 0.35) dir = to.clone().negate();
      else dir = V(-to.z, 0, to.x);
      this.locomote(dt, dir, this.speed, ctx.world);
      this.faceTarget(anchor, dt, 3);
    }

    // Apply the field.
    if (ctx.echo.active && ctx.echo.alive) {
      const d = this.position.distanceTo(ctx.echo.center);
      if (d < this.fieldRadius) {
        ctx.echo.frozenUntil = Math.max(ctx.echo.frozenUntil, ctx.now + 0.15);
        ctx.events.emit('echoFrozen', { by: this });
      }
    }
  }

  updateMesh(ctx) {
    super.updateMesh(ctx);
    this.ring.position.set(this.position.x, 0.04, this.position.z);
    const pulse = 0.22 + Math.sin(ctx.now * 3) * 0.08;
    this.ring.material.opacity = pulse;
    this.core.rotation.y = ctx.now * 1.6;
    this.core.rotation.x = ctx.now * 0.9;
    this.tines.forEach((tine, i) => {
      const a = ctx.now * 1.1 + (i / 3) * Math.PI * 2;
      tine.position.set(Math.cos(a) * 0.62, 1.15, Math.sin(a) * 0.62);
      tine.rotation.z = Math.cos(a) * 0.5;
      tine.rotation.x = Math.sin(a) * 0.5;
    });
  }

  dispose(scene) {
    super.dispose(scene);
    if (this.ring) scene.remove(this.ring);
  }
}

export const ENEMY_TYPES = { warden: Warden, psalm: Psalm, monolith: Monolith, hush: Hush, cantor: Cantor };
