import * as THREE from 'three';

/**
 * ECHOSTRIDE — Collision
 *
 * Static level geometry is a list of axis-aligned boxes ("brushes"), exactly
 * like a 1996 shooter, and for the same reason: an AABB world is fast, exact,
 * trivially debuggable, and -- crucially for this game -- gives *predictable*
 * surfaces to wall-run on. Curved collision is where movement shooters go to
 * die. Every wall in ECHOSTRIDE is flat and you can feel it in your hands.
 *
 * The player is resolved as an AABB rather than a capsule. A capsule slides off
 * ledge corners in a way that feels arbitrary at 11 m/s; a box catches them,
 * and combined with step-up that reads as "I made that jump" instead of
 * "the game dropped me".
 */

export class Brush {
  /** @param {THREE.Vector3} min @param {THREE.Vector3} max */
  constructor(min, max, tag = 'solid') {
    this.min = min;
    this.max = max;
    this.tag = tag; // 'solid' | 'wallrun' | 'nowallrun' | 'hazard' | 'phase'
  }
  static fromBox(cx, cy, cz, sx, sy, sz, tag) {
    return new Brush(
      new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
      tag,
    );
  }
  get center() {
    return new THREE.Vector3(
      (this.min.x + this.max.x) / 2,
      (this.min.y + this.max.y) / 2,
      (this.min.z + this.max.z) / 2,
    );
  }
}

/** Result of a single swept move along one axis. */
const _tmpMin = new THREE.Vector3();
const _tmpMax = new THREE.Vector3();

export class CollisionWorld {
  constructor() {
    /** @type {Brush[]} */
    this.brushes = [];
    // Uniform grid broadphase. Arenas here are ~120 m across; an 8 m cell
    // keeps the average query under a dozen brushes.
    this.cell = 8;
    this.grid = new Map();
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-999, -999, -999),
      new THREE.Vector3(999, 999, 999),
    );
  }

  add(brush) {
    this.brushes.push(brush);
    return brush;
  }

  /** Call once after all brushes are added. */
  build() {
    this.grid.clear();
    for (let i = 0; i < this.brushes.length; i++) {
      const b = this.brushes[i];
      const x0 = Math.floor(b.min.x / this.cell), x1 = Math.floor(b.max.x / this.cell);
      const z0 = Math.floor(b.min.z / this.cell), z1 = Math.floor(b.max.z / this.cell);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const k = x + ',' + z;
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(i);
        }
      }
    }
  }

  /** Brush indices potentially overlapping a world-space AABB. */
  query(min, max, out = []) {
    out.length = 0;
    const seen = new Set();
    const x0 = Math.floor(min.x / this.cell), x1 = Math.floor(max.x / this.cell);
    const z0 = Math.floor(min.z / this.cell), z1 = Math.floor(max.z / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(x + ',' + z);
        if (!arr) continue;
        for (const i of arr) {
          if (seen.has(i)) continue;
          seen.add(i);
          const b = this.brushes[i];
          if (b.max.x <= min.x || b.min.x >= max.x) continue;
          if (b.max.y <= min.y || b.min.y >= max.y) continue;
          if (b.max.z <= min.z || b.min.z >= max.z) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Move an AABB by `delta`, resolving one axis at a time.
   *
   * Axis-separated resolution is what lets you slide along a wall instead of
   * stopping dead against it -- the single most important feel detail in any
   * movement shooter. Order is Y, X, Z: vertical first so that landing is
   * resolved before horizontal sliding, which stops the "sink into the floor
   * while strafing" class of bug.
   *
   * @returns {{pos:THREE.Vector3, grounded:boolean, ceiling:boolean,
   *            wallNormal:THREE.Vector3|null, wallBrush:Brush|null, hitY:boolean}}
   */
  moveAABB(pos, half, delta, opts = {}) {
    const stepHeight = opts.stepHeight ?? 0;
    const p = pos.clone();
    let grounded = false, ceiling = false, hitY = false;
    let wallNormal = null, wallBrush = null;

    const candidates = [];
    const sweep = (axis, amount) => {
      if (amount === 0) return 0;
      p[axis] += amount;
      _tmpMin.set(p.x - half.x, p.y - half.y, p.z - half.z);
      _tmpMax.set(p.x + half.x, p.y + half.y, p.z + half.z);
      this.query(_tmpMin, _tmpMax, candidates);
      let resolved = amount;
      for (const b of candidates) {
        if (b.tag === 'phase') continue; // echo-only doors are not solid to you
        // Re-test: earlier resolutions in this loop may have moved us out.
        if (b.max.x <= p.x - half.x || b.min.x >= p.x + half.x) continue;
        if (b.max.y <= p.y - half.y || b.min.y >= p.y + half.y) continue;
        if (b.max.z <= p.z - half.z || b.min.z >= p.z + half.z) continue;

        if (amount > 0) {
          const push = b.min[axis] - (p[axis] + half[axis]);
          p[axis] += push; resolved += push;
          if (axis === 'y') { ceiling = true; hitY = true; }
        } else {
          const push = b.max[axis] - (p[axis] - half[axis]);
          p[axis] += push; resolved += push;
          if (axis === 'y') { grounded = true; hitY = true; }
        }
        if (axis !== 'y') {
          wallNormal = new THREE.Vector3();
          wallNormal[axis] = amount > 0 ? -1 : 1;
          wallBrush = b;
        }
      }
      return resolved;
    };

    sweep('y', delta.y);

    // Step-up: try the horizontal move raised by stepHeight; if that is clear
    // and there is floor beneath, take it. This is what makes stairs, rubble
    // and 40 cm ledges invisible to the player instead of a wall of shame.
    if (stepHeight > 0 && (delta.x !== 0 || delta.z !== 0)) {
      const before = p.clone();
      const beforeWall = { wallNormal, wallBrush };
      sweep('x', delta.x);
      sweep('z', delta.z);
      const movedFlat = Math.hypot(p.x - before.x, p.z - before.z);
      const wanted = Math.hypot(delta.x, delta.z);
      if (movedFlat < wanted - 1e-4) {
        // We were blocked. Retry elevated.
        const save = p.clone();
        const saveWall = { wallNormal, wallBrush };
        p.copy(before);
        wallNormal = beforeWall.wallNormal; wallBrush = beforeWall.wallBrush;
        const up = sweep('y', stepHeight);
        if (up > stepHeight - 1e-3) {
          sweep('x', delta.x);
          sweep('z', delta.z);
          const nowFlat = Math.hypot(p.x - before.x, p.z - before.z);
          if (nowFlat > movedFlat + 1e-4) {
            const down = sweep('y', -stepHeight);
            if (down < -stepHeight + 1e-3) {
              // Nothing to land on up there: it was a gap, not a step. Revert.
              p.copy(save);
              wallNormal = saveWall.wallNormal; wallBrush = saveWall.wallBrush;
            } else {
              grounded = true;
            }
          } else {
            p.copy(save);
            wallNormal = saveWall.wallNormal; wallBrush = saveWall.wallBrush;
          }
        } else {
          p.copy(save);
          wallNormal = saveWall.wallNormal; wallBrush = saveWall.wallBrush;
        }
      }
    } else {
      sweep('x', delta.x);
      sweep('z', delta.z);
    }

    return { pos: p, grounded, ceiling, wallNormal, wallBrush, hitY };
  }

  /** True if an AABB at `pos` overlaps anything solid. Used for uncrouch checks. */
  overlaps(pos, half) {
    _tmpMin.set(pos.x - half.x, pos.y - half.y, pos.z - half.z);
    _tmpMax.set(pos.x + half.x, pos.y + half.y, pos.z + half.z);
    const hits = this.query(_tmpMin, _tmpMax, []);
    return hits.some((b) => b.tag !== 'phase');
  }

  /**
   * Ray vs world using the slab method. Returns the nearest hit or null.
   * Used for hitscan weapons, enemy line-of-sight, and wall detection.
   */
  raycast(origin, dir, maxDist = 500) {
    let best = null;
    // Walk the broadphase grid along the ray, testing brushes as we meet them,
    // and stop as soon as the nearest hit is closer than the distance walked --
    // no cell beyond that point can contain anything nearer.
    const step = this.cell * 0.5;
    const seen = new Set();
    for (let t = 0; t <= maxDist + step; t += step) {
      const px = origin.x + dir.x * t, pz = origin.z + dir.z * t;
      const cx = Math.floor(px / this.cell), cz = Math.floor(pz / this.cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const arr = this.grid.get((cx + ox) + ',' + (cz + oz));
          if (!arr) continue;
          for (const i of arr) {
            if (seen.has(i)) continue;
            seen.add(i);
            const b = this.brushes[i];
            if (b.tag === 'phase') continue;
            const hit = rayBox(origin, dir, b.min, b.max, maxDist);
            if (hit && (!best || hit.dist < best.dist)) best = { ...hit, brush: b };
          }
        }
      }
      if (best && best.dist < t) break;
    }
    return best;
  }

  /** Unobstructed line between two points? */
  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    const hit = this.raycast(a, d, len);
    return !hit || hit.dist >= len - 0.05;
  }
}

const _n = new THREE.Vector3();

/** Slab-method ray/AABB. Returns {dist, point, normal} or null. */
export function rayBox(origin, dir, min, max, maxDist = Infinity) {
  let tmin = 0, tmax = maxDist;
  let nAxis = 0, nSign = 1;

  for (const axis of ['x', 'y', 'z']) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < min[axis] || o > max[axis]) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (min[axis] - o) * inv;
    let t2 = (max[axis] - o) * inv;
    let sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = axis; nSign = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin <= 0 || tmin > maxDist) return null;

  _n.set(0, 0, 0);
  if (nAxis) _n[nAxis] = nSign;
  return {
    dist: tmin,
    point: new THREE.Vector3(
      origin.x + dir.x * tmin,
      origin.y + dir.y * tmin,
      origin.z + dir.z * tmin,
    ),
    normal: _n.clone(),
  };
}

/** Ray vs sphere, for hitting enemies. Returns distance or null. */
export function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c > 0 && b > 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t < 0 ? (c <= 0 ? 0 : null) : t;
}
