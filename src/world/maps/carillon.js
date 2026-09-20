import * as THREE from 'three';
import { MapBuilder } from '../MapBuilder.js';
import { PALETTE } from '../../engine/Palette.js';

/**
 * CARILLON — the first arena.
 *
 * A bell tower with the bells still in it. Three concentric tiers around an
 * open shaft, with a hanging bell the size of a house at the centre.
 *
 * ── Why it is shaped like this ──────────────────────────────────────────
 *
 * The design problem unique to this game: the player needs to be able to SEE
 * their echo. A conventional corridor arena hides it behind the first corner
 * and the core mechanic becomes invisible guesswork. So CARILLON is built on
 * three rules that every ECHOSTRIDE map follows (docs/MAPS.md states them in
 * full):
 *
 *  1. NO DEAD ENDS. Every space has at least two exits. Your echo is going to
 *     walk your route again; a route that ends in a corner is a route that
 *     gets your echo killed in a corner.
 *
 *  2. THE SHAFT. A single open volume that most of the map can see into. Wherever
 *     you are, there is a good chance you can glance across the void and find
 *     your violet twin. It is the map's readability backbone.
 *
 *  3. THREE-SECOND GEOMETRY. The distance between meaningful positions is
 *     tuned so a sprinting player covers it in roughly one echo delay. The
 *     ramp-to-balcony run is ~31 m: about 3 s at sprint speed. That means a
 *     player who sprints a lane and turns around finds their echo arriving at
 *     the lane's far end exactly as they line up the shot. The map is
 *     literally measured in echo delays.
 *
 * The bell is not decoration. It is a 9 m wide piece of hard cover floating in
 * the middle of the only open sightline, so the shaft is readable without being
 * a sniping gallery, and it gives the central updraft something to hide behind.
 */
export function buildCarillon(scene) {
  const b = new MapBuilder(scene);
  const R = 32;        // outer radius
  const TIER1 = 7.0;   // balcony height
  const TIER2 = 14.5;  // bell platforms

  /* ---------------- floor and outer shell ------------------------------ */
  // The floor is sized to the chamber, not larger: any floor outside the wall
  // is floor a player can end up standing on after a physics oddity, and a
  // player standing outside the level is a player who has stopped playing it.
  b.box(0, -0.5, 0, R * 2 + 8, 1, R * 2 + 8, 'floor');
  // Provably closed boundary (see MapBuilder.chamberWall), chamfered so it
  // still reads as the octagonal drum of a bell tower.
  b.chamberWall(R, 26, 2.2, 'wall', 9.0);
  // Buttresses on the inner face: the flat, predictable surfaces you wall-run.
  b.buttresses(0, 0, R - 2.6, 12, 4.2, 1.2, 22, 0, 'ash');

  // Ceiling, far enough up that the shaft reads as a tower rather than a room.
  b.box(0, 26.5, 0, R * 2.3, 1, R * 2.3, 'dark');

  /* ---------------- ground tier: eight piers --------------------------- */
  // Eight piers on a 19 m ring. They break every long sightline into a series
  // of short ones, which is what makes a round arena playable at all.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 19, z = Math.sin(a) * 19;
    b.box(x, TIER1 / 2, z, 2.6, TIER1, 2.6, 'pillar');
    // Capital: widens at the top so the balcony above has a visible support.
    b.box(x, TIER1 - 0.35, z, 3.4, 0.7, 3.4, 'bone');
  }

  // Waist-high cover, deliberately placed OFF the pier ring so that cover and
  // hard cover never coincide. Overlapping them produces one super-position
  // that every fight collapses onto.
  const coverAt = [
    [8, 4], [-9, 6], [4, -11], [-6, -8], [13, -3], [-14, -2], [2, 13], [-3, -15],
  ];
  for (const [x, z] of coverAt) {
    b.box(x, 0.6, z, 3.2, 1.2, 1.1, 'ash', 'nowallrun');
  }

  /* ---------------- the ramps ------------------------------------------ */
  // Two long ramps on opposite sides, built as stairs. Stairs beat a sloped
  // plane here: the step-up code makes them frictionless to run, and they
  // give the collision world flat, wall-runnable side walls for free.
  const ramp = (angle, dir) => {
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const rr = 27.5 - t * 6.5;
      const a = angle + dir * t * 0.92;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const y = (i + 1) * (TIER1 / steps);
      b.box(x, y - 0.35, z, 4.6, 0.7, 4.6, 'ash');
    }
  };
  ramp(Math.PI * 0.25, 1);
  ramp(Math.PI * 1.25, 1);

  /* ---------------- tier 1: the balcony ring --------------------------- */
  // A ring with FOUR GAPS. The gaps are the map's core movement lesson: the
  // balcony is a loop only if you can cross 5.5 m of nothing, which you can do
  // three different ways -- jump it, wall-run the outer wall past it, or drop
  // to the ground and take the updraft. Three answers to one question is the
  // ratio every obstacle in this game aims for.
  const GAPS = [0.5, Math.PI * 0.5 + 0.5, Math.PI + 0.5, Math.PI * 1.5 + 0.5];
  const GAP_HALF = 0.115; // radians
  const segs = 48;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    if (GAPS.some((g) => Math.abs(angleDiff(a0, g)) < GAP_HALF)) continue;
    const x = Math.cos(a0) * 26.5, z = Math.sin(a0) * 26.5;
    b.box(x, TIER1, z, 6.0, 0.7, 6.0, 'pillar');
  }
  // Balcony lip: low, so it is cover while crouched and a vault while sprinting.
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    if (GAPS.some((g) => Math.abs(angleDiff(a0, g)) < GAP_HALF)) continue;
    const x = Math.cos(a0) * 23.6, z = Math.sin(a0) * 23.6;
    b.box(x, TIER1 + 0.85, z, 3.4, 1.0, 3.4, 'bone', 'nowallrun');
  }

  /* ---------------- tier 2: four bell platforms ------------------------ */
  // Deliberately *separate*. Up here the map stops being a loop and becomes a
  // set of islands, so height is a real trade: the best sightlines in the
  // arena, and the worst escape routes. Players who camp them die to Wardens
  // that took the updraft, which is the correction the design wants.
  const platAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (const a of platAngles) {
    const x = Math.cos(a) * 20, z = Math.sin(a) * 20;
    b.box(x, TIER2, z, 9.0, 0.7, 9.0, 'pillar');
    b.box(x + Math.cos(a) * 4.2, TIER2 + 1.6, z + Math.sin(a) * 4.2, 9.0, 2.6, 1.0, 'bone');
    // A single tall fin per platform: a wall-run surface at the top tier, and
    // the thing that makes each island readable in silhouette from below.
    b.box(x - Math.cos(a) * 3.6, TIER2 + 3.2, z - Math.sin(a) * 3.6, 1.0, 6.0, 5.0, 'ash');
  }

  // Beams between adjacent platforms: 1.2 m wide. Crossable at a walk,
  // terrifying at a sprint, and a genuinely good place to put your echo.
  for (let i = 0; i < 4; i++) {
    const a0 = platAngles[i], a1 = platAngles[(i + 1) % 4];
    const x0 = Math.cos(a0) * 20, z0 = Math.sin(a0) * 20;
    const x1 = Math.cos(a1) * 20, z1 = Math.sin(a1) * 20;
    const steps = 7;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      // Bow the beam outward so it does not cut across the shaft.
      const bx = x0 + (x1 - x0) * t, bz = z0 + (z1 - z0) * t;
      const l = Math.hypot(bx, bz) || 1;
      const k = 22.5 / l;
      b.box(bx * k, TIER2, bz * k, 2.6, 0.5, 2.6, 'bone');
    }
  }

  /* ---------------- the bell ------------------------------------------- */
  // Hard cover in the middle of the shaft, hung from the ceiling. Nine metres
  // across: big enough to break the sightline, small enough to run around.
  const bellY = 11.5;
  b.box(0, bellY, 0, 8.6, 6.0, 8.6, 'brass');
  b.box(0, bellY + 3.6, 0, 5.0, 1.6, 5.0, 'brass');
  b.box(0, bellY + 8.0, 0, 1.0, 8.0, 1.0, 'ash'); // the headstock
  // The clapper, hanging below. Pure decoration, and the only curved shape
  // in the level, which is exactly why it reads as the centre of the room.
  const clapper = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 12, 8),
    new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.3, metalness: 0.9 }),
  );
  clapper.position.set(0, bellY - 4.0, 0);
  b.group.add(clapper);

  /* ---------------- the updraft ---------------------------------------- */
  // Dead centre, under the bell. Rides you from the floor to tier 2.
  b.updraft(0, 0, 4.2, 23.0, TIER2 + 3);

  /* ---------------- lighting ------------------------------------------- */
  // Hard key light from high up, plus four cold bounces. No ambient mush:
  // this art direction lives on the contrast between lit plane and black.
  const key = new THREE.DirectionalLight(0xFFF4E2, 2.35);
  key.position.set(28, 44, 16);
  scene.add(key);
  // A second, dimmer key from the opposite side. Pure single-key lighting
  // left every north-facing plane identically black, which destroyed the
  // reading of the architecture -- and readable architecture is how you
  // find your echo.
  const back = new THREE.DirectionalLight(0x9FB4D0, 0.75);
  back.position.set(-24, 30, -20);
  scene.add(back);
  const fill = new THREE.HemisphereLight(0x46505F, 0x14161C, 0.85);
  scene.add(fill);
  for (const a of platAngles) {
    b.light(Math.cos(a) * 20, TIER2 + 5.5, Math.sin(a) * 20, 0xFFE9C8, 42, 26);
  }
  // Lamps on the balcony ring. Without them the whole upper half of the shaft
  // was a black void: looking up, you only ever see undersides, and an
  // underside lit by nothing is an underside you cannot navigate by.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.light(Math.cos(a) * 24, TIER1 + 3.2, Math.sin(a) * 24, 0xFFE4BE, 30, 19);
  }
  // Under the bell, so the largest object in the room is never a silhouette
  // against nothing.
  b.light(0, bellY - 5.4, 0, 0xFFD9A0, 24, 16);
  // A cold uplight in the shaft. Kept dim and short-range: at full strength it
  // washed the undersides of every balcony a sickly green, which made the
  // ceramic read as mould instead of stone.
  b.light(0, 4, 0, 0x7FD8E4, 16, 15);
  b.light(0, 22, 0, 0xFFD9A0, 58, 34);

  /* ---------------- spawns --------------------------------------------- */
  b.spawns.player.set(0, 1.0, 22);
  // Ground ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.enemySpawn(Math.cos(a) * 24, 1.0, Math.sin(a) * 24, 1.0);
  }
  // Balcony
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    b.enemySpawn(Math.cos(a) * 26.5, TIER1 + 1.0, Math.sin(a) * 26.5, 0.7);
  }
  // Bell platforms -- used sparingly, for Psalms that want a commanding view.
  for (const a of platAngles) {
    b.enemySpawn(Math.cos(a) * 20, TIER2 + 1.0, Math.sin(a) * 20, 0.35);
  }

  b.finish();
  b.meta = {
    name: 'CARILLON',
    subtitle: 'Bell tower, third movement',
    tiers: [0, TIER1, TIER2],
    radius: R,
    updraftTop: TIER2 + 3,
    killZ: -14,        // fall out of the world? you are dead, not stuck
    halfExtent: R + 2, // the closed boundary; used by tests and by the minimap
  };
  return b;
}

function angleDiff(a, b) {
  let d = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
