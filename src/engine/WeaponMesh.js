import * as THREE from 'three';
import { PALETTE } from './Palette.js';
import { MAT } from './Materials.js';

/**
 * ECHOSTRIDE — weapon view models
 *
 * The weapon designs, as geometry. Same reasoning as StriderMesh.js: the
 * silhouette is the design.
 *
 * Shared language across the arsenal, so that four very different guns still
 * read as belonging to one armoury:
 *   - A bone-white ceramic shell, cast in slabs, with no panel lines.
 *   - Exactly one brass component per weapon -- the part that gets hot.
 *   - A cyan element that is *functional*: it shows the weapon's state.
 *   - Flat-bottomed. Every gun in this game looks like it could be set down.
 *
 * And one rule about framing: the model sits low and to the right, occupying
 * under a fifth of the screen. A view model that fills the frame is a view
 * model competing with the enemy you are trying to shoot, and in a game where
 * you also need to track a violet copy of yourself, screen space is the
 * scarcest resource there is.
 */

const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (r1, r2, h, s = 10) => new THREE.CylinderGeometry(r1, r2, h, s);

function mk(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/** Cyan "state" material -- brightness is driven by ammo remaining. */
function stateMat() {
  return new THREE.MeshBasicMaterial({ color: PALETTE.flux, toneMapped: false });
}

export function buildWeaponModel(id) {
  const g = new THREE.Group();
  const bone = MAT.bone(), dark = MAT.dark(), brass = MAT.brass(), ash = MAT.ash();
  const state = stateMat();
  const parts = { state, group: g, muzzle: new THREE.Object3D() };

  switch (id) {
    /* ---------------- SPLITTER: the honest rifle ---------------------- */
    case 'splitter': {
      mk(g, BOX(0.09, 0.115, 0.62), bone, 0, 0, -0.06);           // receiver slab
      mk(g, BOX(0.10, 0.035, 0.30), ash, 0, 0.075, -0.10);        // top rail
      // Brass heat-sink comb: seven fins, kept low so they read as a detail
      // on the receiver rather than as a second object sitting on top of it.
      for (let i = 0; i < 7; i++) {
        mk(g, BOX(0.066, 0.032, 0.014), brass, 0, 0.088, -0.19 + i * 0.036);
      }
      // The split barrel: two prongs that flare apart. This is the read, and
      // it is a literal picture of the game's premise -- one weapon, two paths.
      mk(g, BOX(0.026, 0.026, 0.40), ash, -0.023, 0.012, -0.46, 0, -0.045, 0);
      mk(g, BOX(0.026, 0.026, 0.40), ash, 0.023, 0.012, -0.46, 0, 0.045, 0);
      mk(g, BOX(0.085, 0.05, 0.07), bone, 0, 0.012, -0.30);       // prong yoke
      parts.state = mk(g, BOX(0.028, 0.055, 0.17), state, 0.048, 0.012, -0.02, 0, 0, 0);
      mk(g, BOX(0.075, 0.16, 0.085), dark, 0, -0.10, 0.06, 0.20, 0, 0);  // grip
      mk(g, BOX(0.085, 0.12, 0.17), bone, 0, -0.03, 0.22, -0.12, 0, 0);  // stock
      mk(g, BOX(0.07, 0.11, 0.07), dark, 0, -0.085, -0.19, -0.16, 0, 0); // foregrip
      parts.muzzle.position.set(0, 0.012, -0.66);
      break;
    }

    /* ---------------- REND: the brick ---------------------------------- */
    case 'rend': {
      mk(g, BOX(0.135, 0.145, 0.44), bone, 0, 0, -0.02);
      mk(g, BOX(0.155, 0.055, 0.20), dark, 0, 0.088, -0.02);
      // Twin drums, stacked off-axis. Asymmetry again: it reads as a machine
      // that was built around its ammunition, not styled around a shape.
      const d1 = mk(g, CYL(0.085, 0.085, 0.10, 12), dark, -0.045, -0.055, 0.02, 0, 0, Math.PI / 2);
      const d2 = mk(g, CYL(0.062, 0.062, 0.09, 12), dark, 0.055, -0.03, 0.05, 0, 0, Math.PI / 2);
      parts.drums = [d1, d2];
      mk(g, CYL(0.09, 0.09, 0.022, 12), brass, -0.10, -0.055, 0.02, 0, 0, Math.PI / 2);
      // Rectangular muzzle. Round muzzles read as "gun"; a rectangle reads as
      // "this fires a wave", which is exactly what REND does.
      mk(g, BOX(0.155, 0.10, 0.13), ash, 0, 0.005, -0.29);
      mk(g, BOX(0.115, 0.062, 0.03), dark, 0, 0.005, -0.355);
      parts.state = mk(g, BOX(0.02, 0.075, 0.02), state, 0.072, 0.02, -0.12);
      mk(g, BOX(0.08, 0.17, 0.09), dark, 0, -0.115, 0.14, 0.22, 0, 0);
      mk(g, BOX(0.10, 0.10, 0.16), bone, 0, -0.02, 0.26, -0.10, 0, 0);
      parts.muzzle.position.set(0, 0.005, -0.38);
      break;
    }

    /* ---------------- KETTLE: the clock ------------------------------- */
    case 'kettle': {
      mk(g, BOX(0.15, 0.15, 0.32), bone, 0, 0, 0.02);
      // Fat, short barrel: the projectile is slow and arcs, and the gun says so.
      mk(g, CYL(0.105, 0.115, 0.30, 12), ash, 0, 0.015, -0.24, Math.PI / 2, 0, 0);
      mk(g, CYL(0.125, 0.125, 0.045, 12), MAT.oxide(0.6), 0, 0.015, -0.38, Math.PI / 2, 0, 0);
      // The brass countdown drum, which actually rotates with the fuse. It is
      // the only diegetic readout in the game and it is on the weapon that
      // most needs one.
      const drum = mk(g, CYL(0.078, 0.078, 0.11, 14), brass, 0, 0.10, 0.02, 0, 0, Math.PI / 2);
      parts.drum = drum;
      for (let i = 0; i < 6; i++) {
        mk(drum, BOX(0.014, 0.115, 0.014), dark,
          Math.cos((i / 6) * Math.PI * 2) * 0.062, 0, Math.sin((i / 6) * Math.PI * 2) * 0.062);
      }
      parts.state = mk(g, BOX(0.026, 0.026, 0.13), state, 0.082, 0.02, -0.06);
      mk(g, BOX(0.085, 0.175, 0.095), dark, 0, -0.125, 0.10, 0.20, 0, 0);
      mk(g, BOX(0.11, 0.09, 0.14), bone, 0, -0.03, 0.22, -0.08, 0, 0);
      parts.muzzle.position.set(0, 0.015, -0.42);
      break;
    }

    /* ---------------- LATTICE: the instrument ------------------------- */
    case 'lattice': {
      mk(g, BOX(0.062, 0.085, 0.50), bone, 0, 0, 0.02);
      // A long open truss instead of a barrel: four thin rails with spacers.
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          mk(g, BOX(0.014, 0.014, 0.62), ash, sx * 0.038, sy * 0.032 + 0.01, -0.44);
        }
      }
      for (let i = 0; i < 4; i++) {
        mk(g, BOX(0.095, 0.085, 0.016), bone, 0, 0.01, -0.20 - i * 0.155);
      }
      // The prism. Violet, not cyan -- LATTICE is the one weapon that works
      // on the echo's side of the colour line, and the design admits it.
      const prism = mk(g, new THREE.OctahedronGeometry(0.062), new THREE.MeshBasicMaterial({
        color: PALETTE.echo, toneMapped: false, transparent: true, opacity: 0.92,
      }), 0, 0.01, -0.70);
      parts.prism = prism;
      mk(g, CYL(0.055, 0.02, 0.10, 10), brass, 0, 0.01, -0.62, Math.PI / 2, 0, 0);
      mk(g, BOX(0.05, 0.09, 0.16), ash, 0, 0.085, 0.0);           // scope body
      mk(g, CYL(0.036, 0.036, 0.055, 10), dark, 0, 0.085, -0.10, Math.PI / 2, 0, 0);
      parts.state = mk(g, BOX(0.018, 0.045, 0.10), state, 0.04, 0.0, 0.10);
      mk(g, BOX(0.07, 0.16, 0.08), dark, 0, -0.10, 0.16, 0.20, 0, 0);
      mk(g, BOX(0.075, 0.10, 0.20), bone, 0, -0.02, 0.32, -0.09, 0, 0);
      parts.muzzle.position.set(0, 0.01, -0.76);
      break;
    }

    /* ---------------- THRESH: the wedge ------------------------------- */
    case 'thresh': {
      // No guard, no fuller, no point: a flat ceramic wedge that widens toward
      // the tip. It is a tool for displacing things, and it looks like one.
      const blade = new THREE.BufferGeometry();
      const w0 = 0.035, w1 = 0.085, len = 0.72, th = 0.013;
      const v = [];
      const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
      const A = [-w0, 0, 0], B = [w0, 0, 0], C = [w1, 0, -len], D = [-w1, 0, -len];
      const A2 = [-w0, -th, 0], B2 = [w0, -th, 0], C2 = [w1, -th, -len], D2 = [-w1, -th, -len];
      quad(A, B, C, D); quad(D2, C2, B2, A2);
      quad(A2, B2, B, A); quad(B2, C2, C, B); quad(C2, D2, D, C); quad(D2, A2, A, D);
      blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      blade.computeVertexNormals();
      mk(g, blade, MAT.bone(), 0, 0.02, -0.06);
      mk(g, BOX(0.055, 0.055, 0.20), dark, 0, 0.005, 0.10);      // handle
      mk(g, BOX(0.07, 0.022, 0.07), brass, 0, 0.005, 0.005);     // collar
      parts.state = mk(g, BOX(0.014, 0.014, 0.66), state, 0.052, 0.024, -0.36);
      parts.muzzle.position.set(0, 0.02, -0.7);
      break;
    }
  }

  g.add(parts.muzzle);
  return parts;
}

/**
 * Muzzle flash: a flat quad plus a short cone, scaled by the weapon's kick.
 * Lasts two frames. Longer flashes feel like fire, and nothing in this game
 * is on fire.
 */
export function buildMuzzleFlash() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.flux, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 7, 1, true), mat);
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = -0.17;
  g.add(star, cone);
  g.visible = false;
  return { group: g, material: mat };
}
