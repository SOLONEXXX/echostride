import * as THREE from 'three';
import { Brush, CollisionWorld } from './Collision.js';
import { MAT } from '../engine/Materials.js';
import { PALETTE } from '../engine/Palette.js';

/**
 * ECHOSTRIDE — MapBuilder
 *
 * One call adds both the visible box and the collision box. This is not a
 * convenience; it is a correctness guarantee. Levels where art and collision
 * are separate assets are levels where a player eventually wall-runs on a wall
 * that is not there, and in a movement shooter that single class of bug
 * destroys trust in the entire game.
 *
 * Tags carried by a brush drive behaviour, not just rendering:
 *   'solid'      normal geometry
 *   'nowallrun'  solid, but movement refuses to attach (used on cover so you
 *                cannot wall-run a waist-high crate)
 *   'phase'      not solid to you at all -- see PHASE DOORS in docs/MAPS.md
 */
export class MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.world = new CollisionWorld();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.spawns = { player: new THREE.Vector3(0, 1, 0), enemies: [], items: [] };
    this.lights = [];
    this.updrafts = [];
    this.jumpPads = [];
    /** Merged per-material geometry so a 300-brush arena is a handful of draws. */
    this._pending = new Map();
  }

  /**
   * @param {number} cx centre X @param {number} cy centre Y @param {number} cz centre Z
   * @param {number} sx size X  @param {number} sy size Y  @param {number} sz size Z
   */
  box(cx, cy, cz, sx, sy, sz, matKey = 'wall', tag = 'solid', opts = {}) {
    if (!opts.noCollide) {
      this.world.add(Brush.fromBox(cx, cy, cz, sx, sy, sz, tag));
    }
    if (!opts.invisible) {
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      geo.translate(cx, cy, cz);
      if (opts.rotateY) {
        // Rotated *visuals* only. Collision stays axis-aligned on purpose:
        // a diagonal wall you can see but that collides as a box is a lie,
        // so rotated boxes are used exclusively for decoration that the
        // player cannot reach, and `noCollide` is required with them.
        geo.rotateY(opts.rotateY);
      }
      let arr = this._pending.get(matKey);
      if (!arr) this._pending.set(matKey, (arr = []));
      arr.push(geo);
    }
    return this;
  }

  /**
   * A closed, chamfered-square chamber wall.
   *
   * This replaced a ring of boxes placed around a circle, which *looked* like
   * an octagon and leaked like a sieve: axis-aligned boxes cannot tile a
   * diagonal, so the "octagon" was really a pinwheel with eight gaps in it,
   * and a sprinting player walked straight out of the arena. The headless
   * smoke test caught it by running into a corner for fifteen seconds.
   *
   * The fix is to build only what an AABB world can actually express. Four
   * straight walls, each spanning the FULL width including the corners, so
   * they overlap at every junction and the boundary is provably closed. The
   * octagonal read is then restored by four chamfer blocks set on the
   * diagonals -- decoration that sits inside a seal it cannot break.
   *
   * @param {number} half   half-width of the chamber, inner face to centre
   * @param {number} height wall height
   * @param {number} thick  wall thickness
   * @param {number} chamfer size of the diagonal corner blocks (0 to skip)
   */
  chamberWall(half, height, thick, matKey = 'wall', chamfer = 0, tag = 'solid') {
    const w = half + thick / 2;
    const span = half * 2 + thick * 2;
    const y = height / 2;
    this.box(0, y, -w, span, height, thick, matKey, tag);
    this.box(0, y, w, span, height, thick, matKey, tag);
    this.box(-w, y, 0, thick, height, span, matKey, tag);
    this.box(w, y, 0, thick, height, span, matKey, tag);
    if (chamfer > 0) {
      // Corner blocks are placed so they overlap both adjacent walls; there
      // is no seam for a player to squeeze through even at 15 m/s.
      const c = half - chamfer * 0.30;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          this.box(sx * c, y, sz * c, chamfer, height, chamfer, matKey, tag);
        }
      }
    }
    return this;
  }

  /** Decorative buttresses on a circle. Never load-bearing for containment. */
  buttresses(cx, cz, radius, count, width, depth, height, yBase, matKey = 'pillar', tag = 'solid') {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = cx + Math.cos(a) * radius;
      const z = cz + Math.sin(a) * radius;
      const along = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
      this.box(
        x, yBase + height / 2, z,
        along ? depth : width, height, along ? width : depth,
        matKey, tag,
      );
    }
    return this;
  }

  light(x, y, z, color, intensity, distance) {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    this.scene.add(l);
    this.lights.push(l);
    return l;
  }

  /**
   * A column of rising air. Walking in gives lift while you hold jump.
   * Updrafts exist so that vertical maps stay *loops*: there is always a way
   * back up that does not require a specific movement tech, which keeps the
   * skill floor low without lowering the ceiling.
   */
  updraft(x, z, radius, force, topY) {
    this.updrafts.push({ x, z, radius, force, topY });
    const geo = new THREE.CylinderGeometry(radius, radius * 0.75, topY, 20, 1, true);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: PALETTE.flux, transparent: true, opacity: 0.055,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    mesh.position.set(x, topY / 2, z);
    this.group.add(mesh);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.25, radius, 32),
      new THREE.MeshBasicMaterial({
        color: PALETTE.flux, transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    this.group.add(ring);
    return this;
  }

  enemySpawn(x, y, z, weight = 1) {
    this.spawns.enemies.push({ pos: new THREE.Vector3(x, y, z), weight });
    return this;
  }

  /** Call once. Merges geometry and builds the collision broadphase. */
  finish() {
    for (const [key, geos] of this._pending) {
      const merged = mergeGeometries(geos);
      const mesh = new THREE.Mesh(merged, MAT[key] ? MAT[key]() : MAT.wall());
      mesh.frustumCulled = false;
      this.group.add(mesh);
      for (const g of geos) g.dispose();
    }
    this._pending.clear();
    this.world.build();
    return this;
  }
}

/**
 * Minimal geometry merge. Three.js ships BufferGeometryUtils for this, but it
 * lives in the examples folder; inlining twenty lines keeps the dependency
 * list at exactly one package.
 */
function mergeGeometries(geos) {
  // Count *indices* where present: BoxGeometry has 24 vertices but 36 indices,
  // and sizing the buffer from the vertex count silently truncates every box.
  let total = 0;
  for (const g of geos) total += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const idx = g.index ? g.index.array : null;
    if (idx) {
      // BoxGeometry is indexed; expand so we can concatenate without
      // rebasing index buffers.
      for (let i = 0; i < idx.length; i++) {
        pos[offset * 3 + 0] = p[idx[i] * 3 + 0];
        pos[offset * 3 + 1] = p[idx[i] * 3 + 1];
        pos[offset * 3 + 2] = p[idx[i] * 3 + 2];
        nrm[offset * 3 + 0] = n[idx[i] * 3 + 0];
        nrm[offset * 3 + 1] = n[idx[i] * 3 + 1];
        nrm[offset * 3 + 2] = n[idx[i] * 3 + 2];
        offset++;
      }
    } else {
      pos.set(p, offset * 3);
      nrm.set(n, offset * 3);
      offset += g.attributes.position.count;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, offset * 3), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm.subarray(0, offset * 3), 3));
  out.computeBoundingSphere();
  return out;
}
