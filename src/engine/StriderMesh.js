import * as THREE from 'three';
import { PALETTE } from './Palette.js';

/**
 * ECHOSTRIDE — the Strider
 *
 * This file *is* the character design. It is written as geometry rather than
 * described in a document because the silhouette is the design, and a
 * silhouette you can rotate is worth more than a paragraph about one.
 *
 * The brief the shape has to satisfy:
 *
 *  - Readable at 60 m, in violet, additively blended, in motion. That rules
 *    out detail. Everything here is large planes and hard angles.
 *  - Unmistakable from the *back*, because in this game you spend a great
 *    deal of time looking at a version of yourself running away from you.
 *    Hence the Recursion Harness: a broken ring mounted off-centre behind
 *    the left shoulder. It is the one shape nothing else in the game has.
 *  - Asymmetric. A symmetrical character reads as a prop; an asymmetric one
 *    reads as a person who has been *using* their equipment. The left side
 *    carries the harness and a heavy pauldron; the right side is stripped
 *    bare so the weapon shoulder is clean.
 *  - Four planes in the head, no curves, one visor slit. A wedge with a
 *    light in it is a face. Anything more becomes a helmet.
 *
 * The tabard -- four hanging ceramic panels -- exists purely so the character
 * has movement. When you slide, the panels flare. It is the only "soft" thing
 * in the art direction and it is what stops the Strider reading as furniture.
 */

const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/**
 * @param {object} opts
 * @param {THREE.Material} opts.material  body material (echo shader, or solid)
 * @param {THREE.Material} [opts.accent]  emissive bits: visor, harness rim
 * @param {number} [opts.scale]
 */
export function buildStrider({ material, accent, scale = 1 }) {
  const g = new THREE.Group();
  const parts = {};
  const acc = accent ?? material;

  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  };

  /* ---------------- pelvis: the root everything hangs from --------------- */
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.95;
  g.add(pelvis);
  parts.pelvis = pelvis;
  add(pelvis, BOX(0.40, 0.24, 0.26), material, 0, 0, 0);

  /* ---------------- torso ------------------------------------------------ */
  const torso = new THREE.Group();
  torso.position.y = 0.12;
  pelvis.add(torso);
  parts.torso = torso;

  // Chest slab, raked forward 6 degrees: a vertical chest reads as standing
  // at attention, a raked one reads as leaning into a fight.
  const chest = add(torso, BOX(0.455, 0.46, 0.285), material, 0, 0.26, 0.01);
  chest.rotation.x = -0.10;
  // Sternum seam.
  add(torso, BOX(0.045, 0.40, 0.045), acc, 0, 0.27, 0.17);
  // Abdomen, narrower: the taper is what gives the figure a waist at distance.
  add(torso, BOX(0.34, 0.22, 0.22), material, 0, -0.02, 0);

  /* ---------------- the Recursion Harness -------------------------------- */
  // A ring with a 70-degree bite taken out of it, mounted behind the left
  // shoulder on a short strut, tilted out of plane. This is the read.
  const harness = new THREE.Group();
  // Sits high and proud of the left shoulder rather than tucked behind it.
  // Tucked, it vanished at every angle except one, which defeats the entire
  // purpose of having a signature shape.
  harness.position.set(-0.26, 0.50, -0.20);
  harness.rotation.set(0.26, 0.42, -0.44);
  torso.add(harness);
  parts.harness = harness;
  const ringGeo = new THREE.TorusGeometry(0.33, 0.038, 6, 26, Math.PI * 1.61);
  const ring = new THREE.Mesh(ringGeo, acc);
  harness.add(ring);
  parts.harnessRing = ring;
  // The two cut ends are capped with heavy blocks, so the break reads as
  // deliberate engineering rather than a modelling mistake.
  add(harness, BOX(0.09, 0.09, 0.12), material, 0.33, 0.0, 0);
  const capB = add(harness, BOX(0.09, 0.09, 0.12), material, 0, 0, 0);
  capB.position.set(Math.cos(Math.PI * 1.61) * 0.33, Math.sin(Math.PI * 1.61) * 0.33, 0);
  // Strut from the ring down to the back plate.
  add(torso, BOX(0.075, 0.24, 0.075), material, -0.24, 0.34, -0.14, 0.2, 0, -0.25);
  add(torso, BOX(0.11, 0.10, 0.20), material, -0.17, 0.26, -0.15);

  /* ---------------- shoulders (asymmetric) ------------------------------- */
  const shoulderL = new THREE.Group();
  shoulderL.position.set(-0.32, 0.42, 0);
  torso.add(shoulderL);
  parts.shoulderL = shoulderL;
  const pauldron = add(shoulderL, BOX(0.21, 0.17, 0.31), material, -0.035, 0.04, 0);
  pauldron.rotation.z = 0.26;
  add(shoulderL, BOX(0.15, 0.30, 0.15), material, -0.03, -0.18, 0); // upper arm
  const foreL = new THREE.Group();
  foreL.position.set(-0.03, -0.34, 0);
  shoulderL.add(foreL);
  parts.forearmL = foreL;
  add(foreL, BOX(0.155, 0.30, 0.155), material, 0, -0.14, 0);
  add(foreL, BOX(0.185, 0.13, 0.185), acc, 0, -0.05, 0); // bracer band

  const shoulderR = new THREE.Group();
  shoulderR.position.set(0.32, 0.42, 0);
  torso.add(shoulderR);
  parts.shoulderR = shoulderR;
  add(shoulderR, BOX(0.15, 0.18, 0.18), material, 0.02, 0.02, 0); // bare joint
  add(shoulderR, BOX(0.14, 0.30, 0.14), material, 0.02, -0.18, 0);
  const foreR = new THREE.Group();
  foreR.position.set(0.02, -0.34, 0);
  shoulderR.add(foreR);
  parts.forearmR = foreR;
  add(foreR, BOX(0.145, 0.30, 0.145), material, 0, -0.14, 0);

  /* ---------------- head: a four-plane wedge ----------------------------- */
  const neck = new THREE.Group();
  neck.position.set(0, 0.56, 0);
  torso.add(neck);
  parts.head = neck;
  add(neck, BOX(0.12, 0.10, 0.12), material, 0, 0.02, 0);
  const skull = add(neck, BOX(0.24, 0.24, 0.30), material, 0, 0.17, 0.01);
  skull.rotation.x = 0.08;
  // Forward rake: a jaw-wedge that juts, so the head has a direction even
  // as a pure silhouette.
  const jaw = add(neck, BOX(0.185, 0.115, 0.15), material, 0, 0.095, 0.145);
  jaw.rotation.x = 0.30;
  // The visor: one slit, always lit, always the accent colour.
  const visor = add(neck, BOX(0.215, 0.045, 0.045), acc, 0, 0.185, 0.165);
  parts.visor = visor;
  // Crest fin, off-centre by 3 cm. Breaks the symmetry of the skull.
  const fin = add(neck, BOX(0.035, 0.11, 0.26), material, -0.03, 0.30, -0.02);
  fin.rotation.x = -0.12;

  /* ---------------- tabard: four hanging panels -------------------------- */
  const tabard = new THREE.Group();
  tabard.position.y = -0.08;
  pelvis.add(tabard);
  parts.tabard = tabard;
  parts.tabardPanels = [];
  const panelDefs = [
    { x: 0.0,  z: 0.17, w: 0.30, rx: 0.06 },
    { x: 0.0,  z: -0.17, w: 0.34, rx: -0.06 },
    { x: -0.20, z: 0.0, w: 0.24, rz: -0.08 },
    { x: 0.20,  z: 0.0, w: 0.24, rz: 0.08 },
  ];
  for (const d of panelDefs) {
    const p = new THREE.Group();
    p.position.set(d.x, 0, d.z);
    p.rotation.x = d.rx ?? 0;
    p.rotation.z = d.rz ?? 0;
    tabard.add(p);
    const panel = add(p, BOX(d.w, 0.46, 0.045), material, 0, -0.23, 0);
    if (Math.abs(d.x) > 0.01) panel.rotation.y = Math.PI / 2;
    parts.tabardPanels.push(p);
  }

  /* ---------------- legs -------------------------------------------------- */
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(0.14 * side, -0.10, 0);
    pelvis.add(hip);
    add(hip, BOX(0.19, 0.40, 0.19), material, 0, -0.20, 0); // thigh
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    add(knee, BOX(0.165, 0.40, 0.165), material, 0, -0.20, 0); // shin
    // Blade shin-guard: a flat plate that overhangs the front of the shin.
    // It is what makes the leg silhouette read as armoured rather than thin.
    const guard = add(knee, BOX(0.20, 0.34, 0.05), material, 0, -0.17, 0.10);
    guard.rotation.x = -0.05;
    const foot = add(knee, BOX(0.18, 0.09, 0.30), material, 0, -0.415, 0.05);
    return { hip, knee, foot };
  };
  parts.legL = mkLeg(-1);
  parts.legR = mkLeg(1);

  g.scale.setScalar(scale);
  parts.root = g;
  return { group: g, parts };
}

const _v = new THREE.Vector3();

/**
 * Pose a Strider from motion state. Procedural, not keyframed: the echo has to
 * reproduce *your* motion exactly, and hand-authored animation would drift from
 * the recorded positions. A walk cycle driven by distance travelled always
 * matches the feet to the ground, whatever speed the replay runs at.
 */
export function poseStrider(parts, st) {
  const speed = st.speed ?? 0;
  const phase = (st.stepDistance ?? 0) * 1.55;
  const swing = Math.min(1, speed / 9) * 0.85;

  const lift = st.crouch ? -0.30 : st.sliding ? -0.58 : 0;
  parts.pelvis.position.y = 0.95 + lift + (st.grounded ? Math.sin(phase * 2) * 0.022 * swing : 0);

  // Legs: counter-phase swing, with the knee bending only on the back stroke
  // so the leg straightens as it reaches -- the cheapest trick there is for
  // making a two-joint leg look like it has weight.
  const sw = Math.sin(phase) * swing;
  const sw2 = Math.sin(phase + Math.PI) * swing;
  if (st.grounded && !st.sliding) {
    parts.legL.hip.rotation.x = sw * 0.75;
    parts.legR.hip.rotation.x = sw2 * 0.75;
    parts.legL.knee.rotation.x = Math.max(0, -sw) * 1.15;
    parts.legR.knee.rotation.x = Math.max(0, -sw2) * 1.15;
  } else if (st.sliding) {
    // Trailing-leg slide: front leg extended, back leg tucked. Instantly
    // readable from any angle as "that player is sliding".
    parts.legL.hip.rotation.x = 0.95;
    parts.legL.knee.rotation.x = 0.15;
    parts.legR.hip.rotation.x = -0.35;
    parts.legR.knee.rotation.x = 1.75;
  } else {
    // Airborne tuck.
    parts.legL.hip.rotation.x = -0.32;
    parts.legR.hip.rotation.x = 0.44;
    parts.legL.knee.rotation.x = 0.85;
    parts.legR.knee.rotation.x = 0.30;
  }

  // Torso: leans into speed, and banks on a wall-run.
  parts.torso.rotation.x = Math.min(0.30, speed * 0.016) + (st.sliding ? 0.42 : 0);
  parts.torso.rotation.z = (st.wallRunning ? (st.wallSide ?? 0) * 0.30 : 0);

  // Head holds the horizon: it counter-rotates the torso lean, then applies
  // the recorded pitch. A character whose head stays level looks alive.
  parts.head.rotation.x = -parts.torso.rotation.x + (st.pitch ?? 0) * 0.55;

  // Arms: the right arm holds the weapon toward the aim direction, the left
  // stabilises. Both are dampened so the echo does not look twitchy.
  const aimPitch = (st.pitch ?? 0);
  parts.shoulderR.rotation.x = -1.28 + aimPitch * 0.75;
  parts.shoulderR.rotation.z = -0.24;
  parts.forearmR.rotation.x = 0.30;
  parts.shoulderL.rotation.x = -1.02 + aimPitch * 0.62 + (st.sliding ? 0.5 : 0);
  parts.shoulderL.rotation.z = 0.40;
  parts.forearmL.rotation.x = 0.52;

  // Tabard panels flare backwards with speed and splay in a slide.
  const flare = Math.min(1, speed / 11);
  const t = st.time ?? 0;
  parts.tabardPanels.forEach((p, i) => {
    const sway = Math.sin(phase * 0.9 + i * 1.7) * 0.07 * flare;
    if (i === 0) p.rotation.x = 0.06 - flare * 0.55 + sway;        // front panel lifts
    else if (i === 1) p.rotation.x = -0.06 + flare * 0.30 + sway;  // rear trails
    else p.rotation.z = (i === 2 ? -1 : 1) * (0.08 + flare * 0.34) + sway;
  });

  // The harness ring spins, and spins faster the more Flux you hold. It is
  // the character's only idle animation and it doubles as a resource readout
  // you can see on your own echo from across the map.
  if (parts.harnessRing) {
    parts.harnessRing.rotation.z = t * (0.8 + (st.fluxRatio ?? 0.4) * 5.2);
  }
  return parts;
}

/** A first-person pair of arms + weapon mount. Much simpler: it is mostly gun. */
export function buildViewArms(material, accent) {
  const g = new THREE.Group();
  const mk = (x, rot) => {
    const arm = new THREE.Group();
    arm.position.set(x, -0.19, -0.12);
    arm.rotation.z = rot;
    const upper = new THREE.Mesh(BOX(0.085, 0.085, 0.30), material);
    upper.position.set(0, 0, 0.12);
    arm.add(upper);
    const band = new THREE.Mesh(BOX(0.098, 0.098, 0.05), accent ?? material);
    band.position.set(0, 0, 0.24);
    arm.add(band);
    g.add(arm);
    return arm;
  };
  const left = mk(-0.16, 0.22);
  const right = mk(0.17, -0.18);
  return { group: g, left, right };
}
