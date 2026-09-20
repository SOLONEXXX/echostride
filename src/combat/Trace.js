import * as THREE from 'three';
import { raySphere } from '../world/Collision.js';

/**
 * Shared shot tracing. Every hitscan in the game funnels through here so that
 * wall penetration, headshots and friendly-fire rules are defined exactly once.
 *
 * Note the deliberate asymmetry: your shots cannot hit your echo, and your
 * echo's shots cannot hit you. Two versions of the same person blocking each
 * other's fire would make the core mechanic feel like an obstacle, and the
 * whole design rests on the echo feeling like an ally.
 */
export function traceRay(world, enemies, origin, dir, maxDist = 300, opts = {}) {
  const worldHit = world.raycast(origin, dir, maxDist);
  let best = worldHit
    ? { type: 'world', dist: worldHit.dist, point: worldHit.point, normal: worldHit.normal }
    : null;

  for (const e of enemies) {
    if (e.dead) continue;
    if (opts.ignore && opts.ignore.includes(e)) continue;
    for (const hs of e.hitSpheres()) {
      const t = raySphere(origin, dir, hs.center, hs.radius);
      if (t == null || t > maxDist) continue;
      if (best && t >= best.dist) continue;
      best = {
        type: 'enemy', dist: t, enemy: e, headshot: !!hs.head,
        point: new THREE.Vector3(
          origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t,
        ),
        normal: dir.clone().negate(),
      };
    }
  }
  return best;
}

/** Deterministic per-shot spread so a replayed echo shot lands where yours did. */
export function spreadDir(dir, spreadRad, seed, index = 0) {
  if (spreadRad <= 0) return dir.clone();
  // xorshift from the recorded seed: the echo passes the same seed and gets
  // the same pellets. Math.random() here would desync your past from you.
  let x = (seed * 747796405 + index * 2891336453) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  const r1 = (x >>> 8) / 16777216;
  x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
  const r2 = (x >>> 8) / 16777216;

  const theta = r1 * Math.PI * 2;
  // sqrt for a uniform disc -- without it pellets cluster in the centre and
  // the shotgun feels like a rifle.
  const radius = Math.sqrt(r2) * spreadRad;

  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const realUp = new THREE.Vector3().crossVectors(right, dir).normalize();
  return dir.clone()
    .addScaledVector(right, Math.cos(theta) * radius)
    .addScaledVector(realUp, Math.sin(theta) * radius)
    .normalize();
}
