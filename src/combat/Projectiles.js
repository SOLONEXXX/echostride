import * as THREE from 'three';
import { PALETTE } from '../engine/Palette.js';
import { raySphere } from '../world/Collision.js';

/**
 * Projectile pool. Kettle charges, Psalm volleys and Lattice tethers all live
 * here. Projectiles are simulated on the fixed step with swept collision, so
 * a 40 m/s charge cannot tunnel through a 30 cm wall at low frame rates --
 * the classic bug that makes grenade launchers feel untrustworthy.
 */
export class ProjectileSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    /** @type {any[]} */
    this.items = [];
    this._geoSphere = new THREE.IcosahedronGeometry(0.16, 1);
    this._geoShard = new THREE.TetrahedronGeometry(0.19);
  }

  spawn(cfg) {
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.color ?? PALETTE.flux, toneMapped: false,
    });
    const mesh = new THREE.Mesh(cfg.shard ? this._geoShard : this._geoSphere, mat);
    mesh.position.copy(cfg.position);
    this.scene.add(mesh);

    // A soft halo makes small projectiles trackable against busy geometry.
    const halo = new THREE.Mesh(this._geoSphere, new THREE.MeshBasicMaterial({
      color: cfg.color ?? PALETTE.flux, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(2.6);
    mesh.add(halo);

    const p = {
      mesh,
      position: cfg.position.clone(),
      velocity: cfg.velocity.clone(),
      gravity: cfg.gravity ?? 0,
      radius: cfg.radius ?? 0.18,
      life: cfg.life ?? 6,
      age: 0,
      src: cfg.src ?? 'player',
      hostile: !!cfg.hostile,
      damage: cfg.damage ?? 0,
      splashRadius: cfg.splashRadius ?? 0,
      // A fuse of `null` means "detonate on contact"; a number means the
      // charge ignores contact until the fuse burns down. The Kettle uses
      // the latter, timed to the echo's arrival.
      fuse: cfg.fuse ?? null,
      stickOnContact: !!cfg.stickOnContact,
      stuck: false,
      onDetonate: cfg.onDetonate,
      onDirectHit: cfg.onDirectHit,
      weaponId: cfg.weaponId,
      seed: cfg.seed ?? 0,
      spin: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4),
      data: cfg.data ?? {},
    };
    this.items.push(p);
    return p;
  }

  step(dt, enemies, playerCenter, echoCenter, now) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;

      if (p.fuse != null) {
        p.fuse -= dt;
        if (p.fuse <= 0) { this._detonate(p, now); this._remove(i); continue; }
      }
      if (p.age > p.life) { this._detonate(p, now); this._remove(i); continue; }

      if (p.stuck) {
        p.mesh.position.copy(p.position);
        // A stuck charge pulses faster as its fuse runs out. You can read the
        // detonation timing off the arena floor without ever looking at a HUD.
        const t = Math.max(0.0001, p.fuse ?? 1);
        const k = 1 + Math.sin(now * (6 + 14 / t)) * 0.28;
        p.mesh.scale.setScalar(k);
        continue;
      }

      p.velocity.y -= p.gravity * dt;
      const step = p.velocity.clone().multiplyScalar(dt);
      const dist = step.length();

      if (dist > 1e-6) {
        const dir = step.clone().divideScalar(dist);

        // Target check first: a charge that grazes a Warden should stick to
        // the Warden, not to the wall behind it.
        let hitTarget = null, hitT = Infinity;
        const list = p.hostile ? [] : enemies;
        for (const e of list) {
          if (e.dead) continue;
          for (const hs of e.hitSpheres()) {
            const t = raySphere(p.position, dir, hs.center, hs.radius + p.radius);
            if (t != null && t <= dist && t < hitT) { hitT = t; hitTarget = e; }
          }
        }
        if (p.hostile) {
          for (const [who, c, r] of [['player', playerCenter, 0.55], ['echo', echoCenter, 0.55]]) {
            if (!c) continue;
            const t = raySphere(p.position, dir, c, r + p.radius);
            if (t != null && t <= dist && t < hitT) { hitT = t; hitTarget = who; }
          }
        }

        const wallHit = this.world.raycast(p.position, dir, dist + p.radius);
        if (wallHit && wallHit.dist < hitT) {
          p.position.copy(wallHit.point).addScaledVector(wallHit.normal, p.radius * 0.9);
          if (p.stickOnContact && p.fuse != null) {
            p.stuck = true;
            p.velocity.set(0, 0, 0);
            p.mesh.position.copy(p.position);
            continue;
          }
          this._detonate(p, now, wallHit.normal);
          this._remove(i);
          continue;
        }

        if (hitTarget) {
          p.position.addScaledVector(dir, hitT);
          p.onDirectHit?.(p, hitTarget, now);
          if (p.stickOnContact && p.fuse != null) {
            p.stuck = true;
            p.velocity.set(0, 0, 0);
            p.data.stuckTo = hitTarget;
            p.mesh.position.copy(p.position);
            continue;
          }
          this._detonate(p, now);
          this._remove(i);
          continue;
        }

        p.position.add(step);
      }

      p.mesh.position.copy(p.position);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
    }
  }

  /** Stuck charges ride their host: shoot the Warden, the bomb goes with it. */
  followStuck() {
    for (const p of this.items) {
      if (p.stuck && p.data.stuckTo && p.data.stuckTo.position) {
        if (p.data.stuckTo.dead) { p.data.stuckTo = null; continue; }
        if (!p.data.stuckOffset) {
          p.data.stuckOffset = p.position.clone().sub(p.data.stuckTo.position);
        }
        p.position.copy(p.data.stuckTo.position).add(p.data.stuckOffset);
      }
    }
  }

  _detonate(p, now, normal) {
    p.onDetonate?.(p, now, normal);
  }

  _remove(i) {
    const p = this.items[i];
    this.scene.remove(p.mesh);
    p.mesh.geometry = null;
    p.mesh.material.dispose();
    this.items.splice(i, 1);
  }

  clear() {
    for (let i = this.items.length - 1; i >= 0; i--) this._remove(i);
  }
}
