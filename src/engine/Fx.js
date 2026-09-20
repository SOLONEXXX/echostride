import * as THREE from 'three';
import { PALETTE } from './Palette.js';

/**
 * ECHOSTRIDE — effects
 *
 * Everything is pooled and everything is additive. The colour discipline from
 * Palette.js is enforced here at the point of use: a tracer fired by you is
 * cyan, a tracer fired by your echo is violet, and anything the Stillness does
 * is oxide. A player can tell who shot them by the colour of the line, which
 * in a game with two of you is not a nicety, it is load-bearing.
 *
 * Budget: 128 tracers, 96 sparks, 24 rings. Past those numbers the arena
 * becomes unreadable anyway, and a hard cap means a Kettle chain-detonation
 * can never tank the frame rate at the exact moment it matters most.
 */
const srcColor = (src) => src === 'echo' ? PALETTE.echo
  : src === 'enemy' ? PALETTE.oxide : PALETTE.flux;

/**
 * A round, soft-edged point sprite, drawn into a canvas at load time.
 *
 * THREE.PointsMaterial with no map renders every particle as a hard square,
 * and with size attenuation on, a spark near the camera becomes a large
 * orange rectangle floating in the arena. It is the single most obviously
 * "unfinished" artefact a renderer can produce.
 *
 * Generating the sprite procedurally keeps the promise the rest of the project
 * makes -- there is not one asset file in this repository -- while still giving
 * particles a shape that reads as light rather than as geometry.
 */
let _sparkTexture = null;
function sparkTexture() {
  if (_sparkTexture) return _sparkTexture;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // A hot core with a fast falloff: sharp enough to read as a spark, soft
  // enough that overlapping particles build up rather than tile.
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.20)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  _sparkTexture = new THREE.CanvasTexture(c);
  _sparkTexture.colorSpace = THREE.SRGBColorSpace;
  return _sparkTexture;
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.now = 0;

    /* ---- tracers: a pool of line segments ---- */
    this.maxTracers = 128;
    const tg = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(this.maxTracers * 2 * 3);
    this.tracerCol = new Float32Array(this.maxTracers * 2 * 3);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracerGeo = tg;
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    this.tracerLife = new Float32Array(this.maxTracers);
    this.tracerHead = 0;

    /* ---- sparks: point cloud ---- */
    this.maxSparks = 256;
    const sg = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(this.maxSparks * 3);
    this.sparkCol = new Float32Array(this.maxSparks * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparkGeo = sg;
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 0.17, map: sparkTexture(), vertexColors: true,
      transparent: true, opacity: 1, alphaTest: 0.01,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    this.sparkVel = new Float32Array(this.maxSparks * 3);
    this.sparkLife = new Float32Array(this.maxSparks);
    this.sparkMax = new Float32Array(this.maxSparks);
    this.sparkHead = 0;

    /* ---- rings: explosions, resonance, shockwaves ---- */
    this.ringPool = [];
    const ringGeo = new THREE.RingGeometry(0.85, 1.0, 28);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: PALETTE.flux, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      m.visible = false;
      scene.add(m);
      this.ringPool.push({ mesh: m, life: 0, maxLife: 1, from: 1, to: 1, billboard: false });
    }
    this.ringHead = 0;

    this.shake = 0;
    /** Consumed by the HUD each frame. */
    this.hudEvents = [];
  }

  tracer(from, to, src = 'player', width = 1) {
    const i = this.tracerHead;
    this.tracerHead = (this.tracerHead + 1) % this.maxTracers;
    const o = i * 6;
    this.tracerPos[o + 0] = from.x; this.tracerPos[o + 1] = from.y; this.tracerPos[o + 2] = from.z;
    this.tracerPos[o + 3] = to.x;   this.tracerPos[o + 4] = to.y;   this.tracerPos[o + 5] = to.z;
    const c = new THREE.Color(srcColor(src));
    for (let k = 0; k < 2; k++) {
      this.tracerCol[o + k * 3 + 0] = c.r * width;
      this.tracerCol[o + k * 3 + 1] = c.g * width;
      this.tracerCol[o + k * 3 + 2] = c.b * width;
    }
    this.tracerLife[i] = 0.055;
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;
  }

  spark(pos, normal, count, src = 'player', speed = 5, colorOverride) {
    const c = new THREE.Color(colorOverride ?? srcColor(src));
    for (let n = 0; n < count; n++) {
      const i = this.sparkHead;
      this.sparkHead = (this.sparkHead + 1) % this.maxSparks;
      this.sparkPos[i * 3 + 0] = pos.x;
      this.sparkPos[i * 3 + 1] = pos.y;
      this.sparkPos[i * 3 + 2] = pos.z;
      // Cone around the surface normal, biased outward: sparks that spray
      // back along the shot read as "I hit that", sparks that spray randomly
      // read as noise.
      const sp = speed * (0.35 + Math.random() * 0.9);
      this.sparkVel[i * 3 + 0] = (normal.x + (Math.random() - 0.5) * 1.2) * sp;
      this.sparkVel[i * 3 + 1] = (normal.y + (Math.random() - 0.5) * 1.2) * sp + 1.5;
      this.sparkVel[i * 3 + 2] = (normal.z + (Math.random() - 0.5) * 1.2) * sp;
      this.sparkLife[i] = 0.32 + Math.random() * 0.4;
      this.sparkMax[i] = this.sparkLife[i];
      this.sparkCol[i * 3 + 0] = c.r;
      this.sparkCol[i * 3 + 1] = c.g;
      this.sparkCol[i * 3 + 2] = c.b;
    }
  }

  impact(point, normal, src = 'player', onFlesh = false) {
    this.spark(point, normal, onFlesh ? 7 : 4, src, onFlesh ? 6 : 4.2);
  }

  ring(pos, from, to, life, color, billboard = false) {
    const r = this.ringPool[this.ringHead];
    this.ringHead = (this.ringHead + 1) % this.ringPool.length;
    r.mesh.position.copy(pos);
    r.mesh.material.color.setHex(color);
    r.mesh.visible = true;
    r.life = life; r.maxLife = life; r.from = from; r.to = to; r.billboard = billboard;
    if (!billboard) r.mesh.rotation.set(-Math.PI / 2, 0, 0);
    return r;
  }

  explosion(pos, radius, src = 'player') {
    const c = srcColor(src);
    this.ring(pos, 0.4, radius, 0.42, c, false);
    this.ring(pos, 0.2, radius * 0.75, 0.3, c, true);
    this.spark(pos, new THREE.Vector3(0, 1, 0), 22, src, 11);
    this.shake = Math.max(this.shake, 0.65);
    this.hudEvents.push({ kind: 'explosion', pos });
  }

  /**
   * The Resonant Strike. This effect gets more budget than anything else in
   * the game because it is the moment the player did the hard thing, and a
   * game that does not celebrate its own skill expression teaches nobody.
   */
  resonance(pos) {
    this.ring(pos, 0.3, 3.4, 0.36, PALETTE.gold, true);
    this.ring(pos, 0.2, 2.2, 0.5, PALETTE.gold, false);
    this.spark(pos, new THREE.Vector3(0, 1, 0), 16, 'player', 7.5, PALETTE.gold);
    this.shake = Math.max(this.shake, 0.3);
    this.hudEvents.push({ kind: 'resonance', pos });
  }

  armorBreak(pos) {
    this.ring(pos, 0.5, 4.2, 0.4, PALETTE.gold, true);
    this.spark(pos, new THREE.Vector3(0, 1, 0), 26, 'player', 9, PALETTE.bone);
    this.shake = Math.max(this.shake, 0.5);
    this.hudEvents.push({ kind: 'armorBreak', pos });
  }

  lance(a, b) {
    this.tracer(a, b, 'player', 2.4);
    this.spark(b, new THREE.Vector3(0, 1, 0), 8, 'player', 6);
  }

  standingWave(pos) {
    this.ring(pos, 0.4, 5.0, 0.45, PALETTE.gold, true);
    this.hudEvents.push({ kind: 'standingWave', pos });
  }

  shiftBurst(from, to) {
    this.ring(from, 0.3, 2.6, 0.35, PALETTE.echo, true);
    this.ring(to, 0.3, 3.0, 0.4, PALETTE.flux, true);
    this.spark(to, new THREE.Vector3(0, 1, 0), 18, 'player', 7);
    this.shake = Math.max(this.shake, 0.25);
  }

  collapse(pos, radius) {
    // An implosion, then a detonation. The inward ring is what sells it as a
    // singularity rather than another grenade.
    this.ring(pos, radius, 0.4, 0.55, PALETTE.echo, true);
    this.ring(pos, 0.4, radius, 0.35, PALETTE.gold, false);
    this.spark(pos, new THREE.Vector3(0, 1, 0), 40, 'player', 14, PALETTE.echo);
    this.shake = 1.0;
    this.hudEvents.push({ kind: 'collapse', pos });
  }

  step(dt, camera) {
    this.now += dt;

    for (let i = 0; i < this.maxTracers; i++) {
      if (this.tracerLife[i] <= 0) continue;
      this.tracerLife[i] -= dt;
      if (this.tracerLife[i] <= 0) {
        const o = i * 6;
        for (let k = 0; k < 6; k++) this.tracerCol[o + k] = 0;
        this.tracerGeo.attributes.color.needsUpdate = true;
      }
    }

    let sparkDirty = false;
    for (let i = 0; i < this.maxSparks; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      sparkDirty = true;
      if (this.sparkLife[i] <= 0) {
        this.sparkCol[i * 3] = this.sparkCol[i * 3 + 1] = this.sparkCol[i * 3 + 2] = 0;
        continue;
      }
      this.sparkVel[i * 3 + 1] -= 22 * dt;
      this.sparkPos[i * 3 + 0] += this.sparkVel[i * 3 + 0] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      const k = this.sparkLife[i] / this.sparkMax[i];
      this.sparkCol[i * 3 + 0] *= 0.94 + k * 0.05;
      this.sparkCol[i * 3 + 1] *= 0.94 + k * 0.05;
      this.sparkCol[i * 3 + 2] *= 0.94 + k * 0.05;
    }
    if (sparkDirty) {
      this.sparkGeo.attributes.position.needsUpdate = true;
      this.sparkGeo.attributes.color.needsUpdate = true;
    }

    for (const r of this.ringPool) {
      if (r.life <= 0) { if (r.mesh.visible) r.mesh.visible = false; continue; }
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.maxLife;
      const s = r.from + (r.to - r.from) * easeOut(t);
      r.mesh.scale.setScalar(Math.max(0.01, s));
      r.mesh.material.opacity = (1 - t) * 0.85;
      if (r.billboard && camera) r.mesh.quaternion.copy(camera.quaternion);
      if (r.life <= 0) r.mesh.visible = false;
    }

    this.shake = Math.max(0, this.shake - dt * 3.2);
  }

  drainHudEvents() {
    const e = this.hudEvents;
    this.hudEvents = [];
    return e;
  }
}

const easeOut = (t) => 1 - Math.pow(1 - t, 2.4);
