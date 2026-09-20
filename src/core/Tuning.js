/**
 * ECHOSTRIDE — Tuning
 * ===================
 * Every number that defines how the game *feels* lives here, and nowhere else.
 * Systems read from this object; they never hardcode a magic value. That makes
 * balancing a single-file activity and keeps the design doc honest, because
 * docs/GAME_DESIGN.md quotes these names directly.
 *
 * Units: metres, seconds, metres/second. One "unit" in Three.js is one metre.
 * A Strider is 1.8 m tall and their eyes sit at 1.62 m.
 */

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/* ------------------------------------------------------------------ *
 * MOVEMENT
 * The model is deliberately Quake-descended: ground acceleration is high
 * and friction is high, so you get crisp starts and stops, while air
 * acceleration is low but *uncapped in direction*, which is what makes
 * strafe-jumping and air-steering feel alive. Sliding converts crouch
 * into speed, and wall-running trades height for horizontal carry.
 * ------------------------------------------------------------------ */
export const MOVE = {
  eyeHeight: 1.62,
  crouchEyeHeight: 0.95,
  radius: 0.38,
  height: 1.8,
  crouchHeight: 1.1,

  walkSpeed: 7.4,
  sprintSpeed: 11.2,
  crouchSpeed: 3.6,
  // Ground accel is expressed as "speed gained per second at zero velocity".
  groundAccel: 92,
  airAccel: 16,
  // Air control cap: how much of airAccel applies along the current velocity.
  // Low value = you can steer but not freely gain speed by mashing forward.
  airSpeedCap: 1.9,
  friction: 9.5,
  stopSpeed: 2.2,

  gravity: 24.0,
  jumpVelocity: 8.4,
  // A short grace window after leaving a ledge during which jump still works.
  coyoteTime: 0.11,
  // Pressing jump slightly before landing still jumps on touchdown.
  jumpBuffer: 0.13,
  // Holding jump on landing auto-hops, preserving momentum (bunny hopping is
  // a feature, not an exploit -- but it is capped, see hopSpeedCap).
  hopSpeedCap: 15.5,

  slideImpulse: 5.0,
  slideFriction: 2.2,
  slideMinSpeed: 5.5,
  slideMaxTime: 1.15,
  slideCooldown: 0.35,

  wallRunMinSpeed: 6.5,
  wallRunGravity: 6.0,
  wallRunMaxTime: 1.6,
  wallRunStickForce: 6.0,
  wallJumpOut: 7.2,
  wallJumpUp: 7.4,
  // You cannot re-attach to the same wall plane without touching ground or
  // another wall first; this kills degenerate infinite climbing.
  wallRunSameWallLockout: 0.45,

  stepHeight: 0.45,
  maxSlopeDot: 0.62,
};

/* ------------------------------------------------------------------ *
 * THE ECHO — the reason this game exists.
 * ------------------------------------------------------------------ */
export const ECHO = {
  // Delay is dialled by the player between 1.5s and 5.0s. Every Strider in
  // CHARACTERS.md is really just a different default + clamp on this number.
  defaultDelay: 3.0,
  minDelay: 1.5,
  maxDelay: 5.0,
  delayStep: 0.25,
  // Re-dialling the delay is not free: it costs Flux and cannot be done while
  // an enemy has line of sight on you. Otherwise it degenerates into a
  // free reposition button.
  retuneFluxCost: 18,
  retuneLockoutInCombat: 1.25,

  // The echo hits for a fraction of your damage. Below ~0.5 the echo stops
  // feeling like a partner; above ~0.7 the player stops aiming carefully
  // because the echo carries the fight. 0.6 is the sweet spot found in
  // playtest notes (docs/ECHO_SHIFT.md, "the 60% rule").
  damageScale: 0.6,
  // The echo never consumes ammo. It is a replay, not a second inventory.
  consumesAmmo: false,

  // Echoes are killable. This is what makes keeping yours alive a skill.
  maxHealth: 70,
  // ...but they regenerate while you are not being shot, so a bad fight
  // does not cascade into an unwinnable one.
  regenPerSecond: 9,
  regenDelay: 2.4,
  // While dead, the echo respawns after this long at the position you
  // occupied `delay` seconds ago -- i.e. it rejoins the timeline naturally.
  respawnTime: 4.0,

  bufferSeconds: 6.0, // must exceed maxDelay with headroom for SHIFT stitching
};

/* ------------------------------------------------------------------ *
 * SHIFT / COLLAPSE / PHASE-CATCH
 * ------------------------------------------------------------------ */
export const SHIFT = {
  fluxCost: 35,
  cooldown: 0.55,
  // Brief invulnerability on arrival so a SHIFT into a crossfire is a
  // read, not a coin flip.
  iFrames: 0.22,
  // Arrival shove: enemies standing in your landing spot get pushed, you
  // never get stuck inside a Warden.
  arrivalPush: 6.0,
  arrivalPushRadius: 2.2,

  collapseFluxCost: 100,
  collapseRadius: 9.0,
  // Damage scales with what the echo actually did while alive -- a collapse
  // is a *payoff* for a good echo, not a panic button.
  collapseBaseDamage: 55,
  collapseDamagePerEchoDamage: 0.45,
  collapseMaxDamage: 420,
  collapsePullForce: 26,
  // You are alone for this long. The screen desaturates and the music
  // drops to a single held note. Feel it.
  collapseEchoLockout: 5.0,

  phaseCatchFluxCost: 50,
  phaseCatchCooldown: 20.0,
  phaseCatchIFrames: 1.1,
  phaseCatchHealthGranted: 1,
};

/* ------------------------------------------------------------------ *
 * FLUX — the single resource. Earned by aggression and speed, spent on
 * everything that makes you special. It replaces ammo economy, ability
 * cooldowns and ultimate charge with one legible bar.
 * ------------------------------------------------------------------ */
export const FLUX = {
  max: 100,
  start: 45,
  perDamageDealt: 0.16,
  perKill: 9,
  perResonantStrike: 7,
  // Moving fast trickles Flux. Standing still does not. The game pays you
  // to stay in motion, which is the behaviour every good FPS wants anyway.
  speedGainAt: 9.0,        // m/s at which trickle starts
  speedGainPerSecond: 5.5, // at or above sprint speed
  decayPerSecondIdle: 1.6, // bleeds while you are slow AND out of combat
};

/* ------------------------------------------------------------------ *
 * RESONANCE — you and your echo hitting the same target inside a short
 * window. This is the skill ceiling of the whole game.
 * ------------------------------------------------------------------ */
export const RESONANCE = {
  window: 0.5,
  damageMultiplier: 2.0,
  // Resonant strikes are the *only* thing that breaks Monolith plating,
  // which is how the game forces you to learn its own core mechanic.
  breaksArmor: true,
  chainTimeout: 4.0,
  // Stride Rank thresholds, in consecutive resonant strikes.
  rankThresholds: [0, 2, 5, 9, 14, 20],
  rankNames: ['DRIFT', 'STRIDE', 'CADENCE', 'HARMONY', 'RESONANT', 'SINGULAR'],
  rankSpeedBonus: [1.0, 1.02, 1.05, 1.08, 1.12, 1.18],
  rankEchoDamageBonus: [1.0, 1.05, 1.1, 1.18, 1.28, 1.45],
  // Taking a hit drops you one rank instead of resetting to zero. Total
  // resets punish learning; single-step decay teaches recovery.
  rankLossOnHit: 1,
};

/* ------------------------------------------------------------------ *
 * PLAYER
 * ------------------------------------------------------------------ */
export const PLAYER = {
  maxHealth: 100,
  maxArmor: 75,
  // No passive health regen. Health comes from Rend kills and Resonance,
  // which keeps you pushing forward instead of hiding behind a crate.
  regenPerSecond: 0,
  healOnResonantKill: 6,
  armorOnCollapse: 25,
  hurtInvulnerability: 0.22,
};

export const CAMERA = {
  fov: 92,
  fovSprintBonus: 8,
  fovSlideBonus: 12,
  fovLerp: 9.0,
  near: 0.05,
  far: 420,
  viewBobAmount: 0.028,
  viewBobSpeed: 11.5,
  landingDipMax: 0.22,
  tiltOnStrafe: 1.6,   // degrees
  tiltOnWallRun: 13.0, // degrees
  shakeDecay: 6.0,
};

export const LOOK = {
  sensitivity: 0.0022,
  sensitivityGamepad: 2.9,
  gamepadDeadzone: 0.16,
  gamepadCurve: 2.0,
  maxPitch: Math.PI / 2 - 0.02,
  // Aim assist exists on gamepad only, and only as friction near a target.
  // It never moves your crosshair for you.
  padAimFriction: 0.55,
  padAimFrictionRadius: 3.2, // degrees
};

export const WORLD = {
  fogNear: 40,
  fogFar: 300,
};
