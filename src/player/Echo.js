import * as THREE from 'three';
import { ECHO, SIM_DT } from '../core/Tuning.js';
import { PALETTE } from '../engine/Palette.js';
import { makeEchoMaterial } from '../engine/Materials.js';
import { buildStrider, poseStrider } from '../engine/StriderMesh.js';

/**
 * ECHOSTRIDE — the Echo
 *
 * Your past self, `delay` seconds behind, rendered in violet, shooting what
 * you shot, walking where you walked, and entirely capable of dying.
 *
 * The three things that make it a *teammate* rather than a visual effect:
 *
 *  1. It deals real damage (60% of yours, no ammo) and enemies really target
 *     it. If the echo were cosmetic the mechanic would be a gimmick.
 *  2. It draws its own future -- the violet line on the floor is the path it
 *     is about to walk, which is the path you just walked. Being able to
 *     *see* your echo's next three seconds is what turns the mechanic from
 *     confusing to strategic, and it was the single biggest usability fix in
 *     the whole design (see docs/ECHO_SHIFT.md, "the readability crisis").
 *  3. It performs your SHIFT. When your timeline jumped, so does the echo's,
 *     at exactly the same point in its own replay.
 */
export class Echo {
  /**
   * @param {import('./Recorder.js').Recorder} recorder
   * @param {THREE.Scene} scene
   */
  constructor(recorder, scene) {
    this.recorder = recorder;
    this.scene = scene;

    this.delay = ECHO.defaultDelay;
    this.readTime = 0;
    this.active = false;     // has enough history accumulated?
    this.alive = true;
    this.health = ECHO.maxHealth;
    this.lastHurtAt = -999;
    this.deadUntil = 0;
    this.lockedOutUntil = 0; // set by COLLAPSE

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.height = 1.8;
    this.state = { speed: 0, stepDistance: 0, grounded: true, sliding: false, wallRunning: false };

    /** Damage this echo has dealt since it last respawned. Feeds COLLAPSE. */
    this.damageDealt = 0;
    /** Set by the Cantor enemy: a frozen echo stops replaying entirely. */
    this.frozenUntil = 0;

    this.material = makeEchoMaterial();
    const built = buildStrider({ material: this.material, scale: 1.0 });
    this.group = built.group;
    this.parts = built.parts;
    scene.add(this.group);

    // The path preview: a strip of the recorded route, brightest nearest the
    // echo (imminent) and fading toward the player (further in its future).
    this.trailGeo = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(64 * 3);
    this.trailColors = new Float32Array(64 * 3);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);

    // A ground marker under the echo. Verticality means the echo is often
    // above or below you; the marker keeps it findable.
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 20),
      new THREE.MeshBasicMaterial({
        color: PALETTE.echo, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    scene.add(this.marker);

    this._shotScratch = [];
    this._pathScratch = [];
  }

  get canShift() {
    return this.active && this.alive;
  }

  setDelay(d) {
    this.delay = THREE.MathUtils.clamp(d, ECHO.minDelay, ECHO.maxDelay);
  }

  kill(now) {
    if (!this.alive) return;
    this.alive = false;
    this.deadUntil = now + ECHO.respawnTime;
    this.group.visible = false;
    this.trail.visible = false;
    this.marker.visible = false;
  }

  /** Remove the echo for a fixed window without it counting as a death. */
  consume(now, seconds) {
    this.alive = false;
    this.lockedOutUntil = now + seconds;
    this.deadUntil = now + seconds;
    this.damageDealt = 0;
    this.group.visible = false;
    this.trail.visible = false;
    this.marker.visible = false;
  }

  damage(amount, now) {
    if (!this.alive || !this.active) return false;
    this.health -= amount;
    this.lastHurtAt = now;
    this.material.uniforms.uHurt.value = 1.0;
    if (this.health <= 0) { this.health = 0; this.kill(now); return true; }
    return false;
  }

  respawn(now) {
    this.alive = true;
    this.health = ECHO.maxHealth;
    this.damageDealt = 0;
    this.group.visible = true;
    this.trail.visible = true;
    this.marker.visible = true;
  }

  /**
   * Advance the echo by one simulation tick.
   * @param {number} dt
   * @param {(ev:{origin:THREE.Vector3,dir:THREE.Vector3,weaponId:string,charge:number,seed:number})=>void} onShot
   */
  step(dt, now, onShot) {
    // Regeneration between fights keeps a bad exchange from snowballing.
    if (this.alive && this.health < ECHO.maxHealth && now - this.lastHurtAt > ECHO.regenDelay) {
      this.health = Math.min(ECHO.maxHealth, this.health + ECHO.regenPerSecond * dt);
    }
    this.material.uniforms.uHurt.value *= 0.88;

    if (!this.alive) {
      if (now >= this.deadUntil && now >= this.lockedOutUntil) this.respawn(now);
      else return;
    }

    const targetRead = this.recorder.time - this.delay;

    // A frozen echo does not advance its read head. The tape stops. This is
    // the Cantor's whole threat and it is legible without a tutorial: your
    // partner simply stops moving.
    const frozen = now < this.frozenUntil;
    const prevRead = this.readTime;
    if (!frozen) this.readTime = targetRead;

    // Before the buffer has filled, there is no past to be. The game opens
    // with a few seconds of you alone, which is deliberate: the echo's arrival
    // should feel like something switching on.
    const sample = this.recorder.sampleAt(this.readTime);
    if (!sample) {
      this.active = false;
      this.group.visible = false;
      this.trail.visible = false;
      this.marker.visible = false;
      return;
    }
    if (!this.active) {
      this.active = true;
      this.group.visible = true;
      this.trail.visible = true;
      this.marker.visible = true;
    }

    const { cur, next, alpha } = sample;
    const px = next ? cur.px + (next.px - cur.px) * alpha : cur.px;
    const py = next ? cur.py + (next.py - cur.py) * alpha : cur.py;
    const pz = next ? cur.pz + (next.pz - cur.pz) * alpha : cur.pz;
    this.position.set(px, py, pz);
    this.velocity.set(cur.vx, cur.vy, cur.vz);
    this.yaw = next ? lerpAngle(cur.yaw, next.yaw, alpha) : cur.yaw;
    this.pitch = next ? cur.pitch + (next.pitch - cur.pitch) * alpha : cur.pitch;
    this.height = cur.height;
    this.state.speed = Math.hypot(cur.vx, cur.vz);
    this.state.grounded = cur.grounded;
    this.state.sliding = cur.sliding;
    this.state.wallRunning = cur.wallRunning;
    this.state.stepDistance += this.state.speed * dt;

    // Fire everything recorded in the window we just crossed. Using an
    // interval rather than "the current frame" means no shot is ever dropped
    // when the read head jumps, and none is ever fired twice.
    if (!frozen && onShot && this.readTime > prevRead) {
      const events = this.recorder.shotsBetween(prevRead, this.readTime, this._shotScratch);
      for (const { frame, shot } of events) {
        onShot({
          origin: new THREE.Vector3(frame.px, frame.py + frame.height * 0.86, frame.pz),
          dir: new THREE.Vector3(shot.dir[0], shot.dir[1], shot.dir[2]),
          weaponId: shot.weaponId,
          charge: shot.charge,
          seed: shot.seed,
        });
      }
    }

    this._updateVisual(now, cur);
  }

  _updateVisual(now, frame) {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.material.uniforms.uTime.value = now;
    // Fade with remaining health so a dying echo is visibly dying.
    this.material.uniforms.uOpacity.value = 0.35 + 0.65 * (this.health / ECHO.maxHealth);

    poseStrider(this.parts, {
      speed: this.state.speed,
      stepDistance: this.state.stepDistance,
      grounded: this.state.grounded,
      sliding: this.state.sliding,
      wallRunning: this.state.wallRunning,
      crouch: this.height < 1.5,
      pitch: this.pitch,
      time: now,
      fluxRatio: this.health / ECHO.maxHealth,
    });

    this.marker.position.set(this.position.x, this.position.y + 0.03, this.position.z);
    const pulse = 1 + Math.sin(now * 4.2) * 0.07;
    this.marker.scale.setScalar(pulse);

    this._updateTrail();
  }

  /** Draw the route the echo is about to walk. */
  _updateTrail() {
    const pts = this.recorder.pathPoints(this.readTime, this.recorder.time, 60, this._pathScratch);
    const n = Math.min(pts.length, 64);
    const c = new THREE.Color(PALETTE.echo);
    for (let i = 0; i < n; i++) {
      const f = pts[i];
      this.trailPositions[i * 3 + 0] = f.px;
      this.trailPositions[i * 3 + 1] = f.py + 0.06;
      this.trailPositions[i * 3 + 2] = f.pz;
      // Bright at the echo (about to happen), dim toward you (further off).
      const k = 1 - i / Math.max(1, n - 1);
      const w = 0.20 + k * k * 0.95;
      this.trailColors[i * 3 + 0] = c.r * w;
      this.trailColors[i * 3 + 1] = c.g * w;
      this.trailColors[i * 3 + 2] = c.b * w;
    }
    this.trailGeo.setDrawRange(0, Math.max(0, n));
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }

  /** Centre of mass, for enemy aim and hit tests. */
  get center() {
    return new THREE.Vector3(this.position.x, this.position.y + this.height * 0.55, this.position.z);
  }

  dispose() {
    this.scene.remove(this.group, this.trail, this.marker);
    this.trailGeo.dispose();
    this.material.dispose();
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
