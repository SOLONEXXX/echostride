import * as THREE from 'three';
import { MOVE } from '../core/Tuning.js';

/**
 * ECHOSTRIDE — Movement
 *
 * The lineage is deliberate: Quake's acceleration model for the feel of the
 * ground, Titanfall's verbs (slide, wall-run, wall-jump) for the shape of the
 * space, and Apex's slide-jump chaining for the reward curve.
 *
 * What ECHOSTRIDE adds is that movement is *recorded*. Every metre you travel
 * is going to be travelled again, three seconds later, by something that shoots.
 * That changes the value of a route: a corridor you sprint down is a corridor
 * your echo will sprint down, so the question is never just "is this path safe
 * for me" but "is this path *useful* three seconds from now". Sloppy movement
 * produces a sloppy echo. This is the deepest idea in the game and it lives
 * here, in code that does not mention the echo once.
 *
 * Consequence for tuning: the model must be *repeatable*. No random impulses,
 * no frame-rate-dependent terms, nothing that would make a replayed input
 * diverge from the original. Everything below is a pure function of
 * (state, input, dt) on a fixed timestep.
 */

const _wish = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class MovementState {
  constructor() {
    this.position = new THREE.Vector3(0, 2, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.grounded = false;
    this.wasGrounded = false;
    this.crouching = false;
    this.sliding = false;
    this.slideTime = 0;
    this.slideCooldown = 0;
    this.wallRunning = false;
    this.wallNormal = new THREE.Vector3();
    this.wallTime = 0;
    this.lastWallKey = '';
    this.wallLockout = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.height = MOVE.height;
    this.eyeHeight = MOVE.eyeHeight;
    this.landImpact = 0;   // downward speed at the moment of landing
    this.stepDistance = 0; // accumulated distance, drives footsteps + view bob
    this.speedMultiplier = 1;
  }

  get half() {
    return _tmp.set(MOVE.radius, this.height / 2, MOVE.radius);
  }
  /** Centre of the collision box (position is at the feet). */
  get center() {
    return new THREE.Vector3(this.position.x, this.position.y + this.height / 2, this.position.z);
  }
  get eye() {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }
  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
}

/**
 * Quake-style acceleration: project current velocity onto the wish direction,
 * and only add the shortfall up to `maxSpeed`. The magic is that this is a
 * *directional* cap, not a speed cap -- which is exactly why air-strafing
 * gains speed and why the skill ceiling on movement is genuinely high.
 */
function accelerate(vel, wishDir, wishSpeed, accel, dt) {
  const current = vel.x * wishDir.x + vel.z * wishDir.z;
  const add = wishSpeed - current;
  if (add <= 0) return;
  let accelSpeed = accel * wishSpeed * dt;
  if (accelSpeed > add) accelSpeed = add;
  vel.x += wishDir.x * accelSpeed;
  vel.z += wishDir.z * accelSpeed;
}

function applyFriction(vel, dt, amount) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 1e-4) { vel.x = 0; vel.z = 0; return; }
  const control = Math.max(speed, MOVE.stopSpeed);
  const drop = control * amount * dt;
  const newSpeed = Math.max(0, speed - drop);
  const scale = newSpeed / speed;
  vel.x *= scale;
  vel.z *= scale;
}

/**
 * One fixed simulation step.
 * @param {MovementState} s
 * @param {{move:{x:number,y:number}, jump:boolean, jumpHeld:boolean,
 *          crouch:boolean, crouchPressed:boolean, sprint:boolean}} cmd
 * @param {import('../world/Collision.js').CollisionWorld} world
 * @param {number} dt
 */
export function stepMovement(s, cmd, world, dt) {
  s.wasGrounded = s.grounded;
  s.landImpact = 0;
  if (s.slideCooldown > 0) s.slideCooldown -= dt;
  if (s.wallLockout > 0) s.wallLockout -= dt;

  // ---- wish direction in world space -------------------------------------
  const sinY = Math.sin(s.yaw), cosY = Math.cos(s.yaw);
  // yaw 0 looks down -Z (Three.js convention).
  const fwdX = -sinY, fwdZ = -cosY;
  const rightX = cosY, rightZ = -sinY;
  _wish.set(
    fwdX * cmd.move.y + rightX * cmd.move.x,
    0,
    fwdZ * cmd.move.y + rightZ * cmd.move.x,
  );
  const wishLen = Math.hypot(_wish.x, _wish.z);
  if (wishLen > 1e-5) { _wish.x /= wishLen; _wish.z /= wishLen; }

  // ---- crouch / slide ----------------------------------------------------
  const wantCrouch = cmd.crouch;
  const fastEnough = s.speed >= MOVE.slideMinSpeed;

  if (wantCrouch && s.grounded && fastEnough && !s.sliding && s.slideCooldown <= 0) {
    // Entering a slide *adds* speed. Sliding must always be faster than
    // running or nobody will ever do it, and a movement verb nobody uses is
    // a movement verb that does not exist.
    s.sliding = true;
    s.slideTime = 0;
    const sp = s.speed;
    if (sp > 1e-3) {
      const boost = MOVE.slideImpulse;
      s.velocity.x += (s.velocity.x / sp) * boost;
      s.velocity.z += (s.velocity.z / sp) * boost;
    }
  }
  if (s.sliding) {
    s.slideTime += dt;
    if (!wantCrouch || !s.grounded || s.slideTime > MOVE.slideMaxTime || s.speed < 3.0) {
      s.sliding = false;
      s.slideCooldown = MOVE.slideCooldown;
    }
  }
  s.crouching = wantCrouch || s.sliding;

  const targetHeight = s.crouching ? MOVE.crouchHeight : MOVE.height;
  if (targetHeight > s.height) {
    // Only stand back up if there is room. Otherwise stay crouched.
    const probe = new THREE.Vector3(s.position.x, s.position.y + targetHeight / 2, s.position.z);
    const probeHalf = _tmp.set(MOVE.radius, targetHeight / 2 - 0.01, MOVE.radius);
    if (!world.overlaps(probe, probeHalf)) s.height = targetHeight;
  } else {
    s.height = targetHeight;
  }
  const targetEye = s.crouching ? MOVE.crouchEyeHeight : MOVE.eyeHeight;
  // Smooth the *camera* but snap the collider: the player should never have
  // their view lurch, but collision must never lie about where they are.
  s.eyeHeight += (targetEye - s.eyeHeight) * Math.min(1, dt * 14);

  // ---- wall-run detection ------------------------------------------------
  let wallCandidate = null;
  if (!s.grounded && s.speed >= MOVE.wallRunMinSpeed && s.velocity.y < 4.0 && s.wallLockout <= 0) {
    wallCandidate = probeWalls(s, world);
  }
  if (wallCandidate) {
    // Must be moving roughly *along* the wall, not into it. Running at a wall
    // head-on and sticking is the failure mode that makes wall-running feel
    // like flypaper; requiring tangential motion makes it feel like parkour.
    const along = Math.abs(s.velocity.x * -wallCandidate.normal.z + s.velocity.z * wallCandidate.normal.x);
    if (along > MOVE.wallRunMinSpeed * 0.55 && s.wallTime < MOVE.wallRunMaxTime) {
      if (!s.wallRunning) { s.wallTime = 0; s.velocity.y = Math.max(s.velocity.y, 0.5); }
      s.wallRunning = true;
      s.wallNormal.copy(wallCandidate.normal);
      s.lastWallKey = wallCandidate.key;
      s.wallTime += dt;
    } else {
      s.wallRunning = false;
    }
  } else {
    s.wallRunning = false;
  }
  if (s.grounded) { s.wallTime = 0; s.lastWallKey = ''; }

  // ---- jump --------------------------------------------------------------
  if (cmd.jump) s.jumpBuffer = MOVE.jumpBuffer;
  else s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
  if (s.grounded) s.coyote = MOVE.coyoteTime;
  else s.coyote = Math.max(0, s.coyote - dt);

  const canGroundJump = s.coyote > 0;
  if (s.jumpBuffer > 0 && (canGroundJump || s.wallRunning)) {
    if (s.wallRunning) {
      // Wall-jump: push off and up. The outward component is what turns a
      // wall-run into a route rather than a decoration.
      s.velocity.x += s.wallNormal.x * MOVE.wallJumpOut;
      s.velocity.z += s.wallNormal.z * MOVE.wallJumpOut;
      s.velocity.y = MOVE.wallJumpUp;
      s.wallRunning = false;
      s.wallLockout = MOVE.wallRunSameWallLockout;
    } else {
      s.velocity.y = MOVE.jumpVelocity;
      if (s.sliding) {
        // Slide-hop: the signature chain. Leaving a slide with a jump keeps
        // the slide's speed, so slide -> jump -> slide is faster than running
        // and *feels* like it costs skill, because it does.
        const sp = s.speed;
        if (sp > MOVE.hopSpeedCap) {
          const k = MOVE.hopSpeedCap / sp;
          s.velocity.x *= k; s.velocity.z *= k;
        }
        s.sliding = false;
        s.slideCooldown = MOVE.slideCooldown * 0.5;
      }
    }
    s.jumpBuffer = 0;
    s.coyote = 0;
    s.grounded = false;
  }

  // ---- acceleration ------------------------------------------------------
  const sprinting = cmd.sprint && !s.crouching && cmd.move.y > 0.1;
  let maxSpeed = s.crouching && !s.sliding ? MOVE.crouchSpeed
    : sprinting ? MOVE.sprintSpeed : MOVE.walkSpeed;
  maxSpeed *= s.speedMultiplier;

  if (s.grounded && !s.sliding) {
    applyFriction(s.velocity, dt, MOVE.friction);
    accelerate(s.velocity, _wish, maxSpeed, MOVE.groundAccel, dt);
  } else if (s.sliding) {
    applyFriction(s.velocity, dt, MOVE.slideFriction);
    // You keep a little steering authority in a slide -- enough to curve
    // around a pillar, not enough to turn it into free ground movement.
    accelerate(s.velocity, _wish, maxSpeed * 0.45, MOVE.groundAccel * 0.25, dt);
  } else if (s.wallRunning) {
    // Project the wish along the wall so input never pulls you off it.
    const tx = -s.wallNormal.z, tz = s.wallNormal.x;
    const d = _wish.x * tx + _wish.z * tz;
    _flat.set(tx * Math.sign(d || 1), 0, tz * Math.sign(d || 1));
    accelerate(s.velocity, _flat, MOVE.sprintSpeed * 1.05, MOVE.groundAccel * 0.55, dt);
    s.velocity.x -= s.wallNormal.x * MOVE.wallRunStickForce * dt;
    s.velocity.z -= s.wallNormal.z * MOVE.wallRunStickForce * dt;
  } else {
    accelerate(s.velocity, _wish, Math.min(maxSpeed, MOVE.airSpeedCap), MOVE.airAccel, dt);
  }

  // ---- gravity -----------------------------------------------------------
  if (!s.grounded) {
    const g = s.wallRunning ? MOVE.wallRunGravity : MOVE.gravity;
    s.velocity.y -= g * dt;
    if (s.velocity.y < -70) s.velocity.y = -70;
  } else if (s.velocity.y < 0) {
    s.velocity.y = 0;
  }

  // ---- integrate + collide ----------------------------------------------
  const delta = _flat.set(s.velocity.x * dt, s.velocity.y * dt, s.velocity.z * dt);
  const center = s.center;
  const half = new THREE.Vector3(MOVE.radius, s.height / 2, MOVE.radius);
  const res = world.moveAABB(center, half, delta, {
    stepHeight: s.grounded || s.wallRunning ? 0 : MOVE.stepHeight,
  });

  s.position.set(res.pos.x, res.pos.y - s.height / 2, res.pos.z);

  if (res.grounded) {
    if (!s.wasGrounded) s.landImpact = Math.max(0, -s.velocity.y);
    s.velocity.y = 0;
  }
  if (res.ceiling && s.velocity.y > 0) s.velocity.y = 0;
  if (res.wallNormal) {
    // Kill velocity into the wall so we do not accumulate phantom speed.
    const into = s.velocity.x * -res.wallNormal.x + s.velocity.z * -res.wallNormal.z;
    if (into > 0) {
      s.velocity.x += res.wallNormal.x * into;
      s.velocity.z += res.wallNormal.z * into;
    }
  }
  s.grounded = res.grounded;
  if (s.grounded) { s.wallRunning = false; s.wallTime = 0; }

  s.stepDistance += Math.hypot(s.velocity.x, s.velocity.z) * dt;
  return s;
}

/** Look for a wall-runnable surface on either side. */
function probeWalls(s, world) {
  const c = s.center;
  const dirs = [
    { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
  ];
  let best = null;
  for (const d of dirs) {
    const origin = new THREE.Vector3(c.x, c.y, c.z);
    const dir = new THREE.Vector3(d.x, 0, d.z);
    const hit = world.raycast(origin, dir, MOVE.radius + 0.35);
    if (!hit || hit.brush.tag === 'nowallrun') continue;
    // Only tall surfaces qualify. Vaulting a crate should not read as a wall-run.
    if (hit.brush.max.y - s.position.y < 1.6) continue;
    if (!best || hit.dist < best.dist) {
      best = {
        dist: hit.dist,
        normal: new THREE.Vector3(-d.x, 0, -d.z),
        key: `${hit.brush.min.x.toFixed(1)},${hit.brush.min.z.toFixed(1)},${d.x},${d.z}`,
      };
    }
  }
  if (best && best.key === s.lastWallKey && s.wallLockout > 0) return null;
  return best;
}
