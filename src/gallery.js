import * as THREE from 'three';
import { PALETTE } from './engine/Palette.js';
import { MAT, makeEchoMaterial } from './engine/Materials.js';
import { buildStrider, poseStrider } from './engine/StriderMesh.js';
import { buildWeaponModel } from './engine/WeaponMesh.js';
import { ENEMY_TYPES } from './enemies/Enemies.js';
import { WEAPONS, MELEE } from './weapons/Arsenal.js';
import { buildCarillon } from './world/maps/carillon.js';

/**
 * The design gallery.
 *
 * It renders characters, weapons and the arena from the *same* code the game
 * uses. That is the point: a design document that can drift from the build is
 * a design document that will. Here, if the Strider's harness changes, this
 * page changes with it on the next reload.
 */

const out = document.getElementById('out');

function section(title) {
  const h = document.createElement('h2');
  h.textContent = title;
  out.appendChild(h);
  const g = document.createElement('div');
  g.className = 'grid';
  out.appendChild(g);
  return g;
}

function card(grid, name, role, synergy, wide = false) {
  const c = document.createElement('div');
  c.className = 'card' + (wide ? ' wide' : '');
  const canvas = document.createElement('div');
  canvas.className = 'slot';
  c.appendChild(canvas);
  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.innerHTML = `<div class="n">${name}</div><div class="r">${role ?? ''}</div>`
    + (synergy ? `<div class="s">${synergy}</div>` : '');
  c.appendChild(cap);
  grid.appendChild(c);
  return canvas;
}

/* ------------------------------------------------------------------ *
 * One renderer for the entire page.
 *
 * Every card is a transparent slot in the layout; the shared renderer walks
 * the list each frame, sets a scissor rectangle to the slot's on-screen
 * position, and draws that card's scene into it. This is the three.js
 * "multiple views" pattern, and here it is not an optimisation: seventeen
 * separate WebGLRenderers exceeded the browser's context limit, the oldest
 * contexts were silently evicted, and the first cards on the page rendered
 * as blank white rectangles.
 * ------------------------------------------------------------------ */
const glCanvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x0E1015, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.localClippingEnabled = true;
renderer.setScissorTest(true);

const views = [];

function addLights(scene) {
  // Three-point: hard key, cool fill, and a rim that separates the silhouette
  // from the background. This art direction is silhouettes, so the rim light
  // is not optional.
  const key = new THREE.DirectionalLight(0xFFF4E2, 2.6); key.position.set(3, 5, 4);
  const fill = new THREE.DirectionalLight(0x7F93AE, 0.9); fill.position.set(-4, 2, 2);
  const rim = new THREE.DirectionalLight(0xBFD8FF, 2.4); rim.position.set(-2, 3, -6);
  scene.add(key, fill, rim, new THREE.HemisphereLight(0x3A4250, 0x0A0B0F, 0.6));
}

/**
 * Register one card view. Framing is automatic: measure the model's bounding
 * box and solve for the camera distance. Hand-tuned distances for fourteen
 * very differently sized objects is fourteen numbers that go stale the moment
 * a model changes.
 */
function view(slot, build, opts = {}) {
  const scene = new THREE.Scene();
  addLights(scene);
  const pivot = new THREE.Group();
  const subject = new THREE.Group();
  pivot.add(subject);
  scene.add(pivot);
  const info = build(subject, scene) ?? {};

  const box = new THREE.Box3().setFromObject(subject);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  subject.position.sub(centre);
  const sphere = Math.max(0.2, Math.hypot(size.x, size.y, size.z) * 0.5);

  views.push({ slot, scene, info, opts, size, centre, sphere, cam: null, t: 0 });
}

function cameraFor(v, aspect) {
  const { opts, size, sphere, centre } = v;
  if (opts.plan) {
    const half = Math.max(size.x, size.z) * 0.52;
    const cam = new THREE.OrthographicCamera(
      -half * Math.max(1, aspect), half * Math.max(1, aspect),
      half / Math.min(1, aspect), -half / Math.min(1, aspect), 0.1, 800);
    cam.position.set(0, 200, 0.001);
    cam.lookAt(0, 0, 0);
    return cam;
  }
  const fov = opts.fov ?? 32;
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.02, 800);
  const vFov = (fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const dist = (sphere / Math.sin(Math.min(vFov, hFov) / 2)) * (opts.margin ?? 1.06);
  const az = opts.az ?? 0.62;
  const el = opts.el ?? 0.20;
  cam.position.set(
    Math.sin(az) * Math.cos(el) * dist,
    Math.sin(el) * dist,
    Math.cos(az) * Math.cos(el) * dist,
  );
  cam.lookAt(0, 0, 0);
  return cam;
}

function loop() {
  requestAnimationFrame(loop);
  const w = innerWidth, h = innerHeight;
  if (glCanvas.width !== w * renderer.getPixelRatio()) renderer.setSize(w, h, false);

  for (const v of views) {
    const r = v.slot.getBoundingClientRect();
    // Skip anything scrolled off screen: no point drawing a Monolith nobody
    // can see, and it keeps a seventeen-view page at a sane frame rate.
    if (r.bottom < 0 || r.top > h || r.width < 2 || r.height < 2) continue;

    const aspect = r.width / r.height;
    if (!v.cam || Math.abs(v.cam.userData.aspect - aspect) > 1e-3) {
      v.cam = cameraFor(v, aspect);
      v.cam.userData.aspect = aspect;
    }

    v.t += 1 / 60;
    const pivot = v.scene.children.find((c) => c.type === 'Group');
    if (pivot) pivot.rotation.y = v.opts.yaw ?? (v.opts.spin === false ? 0 : v.t * 0.5);
    v.info.update?.(v.t);

    // Clipping planes are per-renderer, so they have to be set per view.
    renderer.clippingPlanes = v.opts.clipBelow != null
      ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), v.opts.clipBelow - v.centre.y)]
      : [];

    const x = r.left;
    const y = h - r.bottom;
    renderer.setViewport(x, y, r.width, r.height);
    renderer.setScissor(x, y, r.width, r.height);
    renderer.render(v.scene, v.cam);
  }
}
requestAnimationFrame(loop);

/* ================= Striders ================= */
{
  const g = section('STRIDERS — the player character, and the thing that follows you');
  const solid = new THREE.MeshStandardMaterial({ color: PALETTE.bone, roughness: 0.55, metalness: 0.05 });
  const accent = new THREE.MeshBasicMaterial({ color: PALETTE.flux, toneMapped: false });

  view(card(g, 'STRIDER — body', 'ceramic plate, recursion harness, four-panel tabard'), (root) => {
    const { parts } = buildStrider({ material: solid, accent });
    root.add(parts.root);
    return {
      update: (t) => poseStrider(parts, {
        speed: 8, stepDistance: t * 8, grounded: true, pitch: 0, time: t, fluxRatio: 0.8,
      }),
    };
  }, { yaw: -0.55, spin: false, fov: 30 });

  const echoMat = makeEchoMaterial();
  view(card(g, 'STRIDER — echo', 'additive fresnel, world-space scanlines', 'ALWAYS VIOLET. ALWAYS THE PAST.'), (root) => {
    const { parts } = buildStrider({ material: echoMat });
    root.add(parts.root);
    return {
      update: (t) => {
        echoMat.uniforms.uTime.value = t;
        poseStrider(parts, { speed: 9, stepDistance: t * 9, grounded: true, pitch: 0, time: t, fluxRatio: 0.9 });
      },
    };
  }, { yaw: 2.5, spin: false, fov: 30 });

  view(card(g, 'STRIDER — slide', 'trailing-leg pose, tabard splayed'), (root) => {
    const { parts } = buildStrider({ material: solid, accent });
    root.add(parts.root);
    return {
      update: (t) => poseStrider(parts, {
        speed: 13, stepDistance: t * 13, grounded: true, sliding: true, pitch: 0, time: t, fluxRatio: 1,
      }),
    };
  }, { yaw: -1.25, spin: false, fov: 30 });
}

/* ================= The Stillness ================= */
{
  const g = section('THE STILLNESS — each enemy teaches one lesson about the echo');
  const lessons = {
    warden: ['WARDEN', 'rusher · quadruped', 'Your echo is a body. They will chase it.'],
    psalm: ['PSALM', 'ranged · leads its shots', 'Things can predict you. So can you.'],
    monolith: ['MONOLITH', 'heavy · frontal plating', 'ONLY Resonance breaks plating.'],
    hush: ['HUSH', 'assassin · invisible', 'Read an echo that is not yours.'],
    cantor: ['CANTOR', 'support · stillness field', 'Your echo can be taken. Protect it.'],
  };
  const ctx = { scene: new THREE.Scene(), now: 0 };
  for (const [id, [name, role, lesson]] of Object.entries(lessons)) {
    view(card(g, name, role, lesson), (root, scene) => {
      const stub = { scene: root, now: 0 };
      const e = new ENEMY_TYPES[id](new THREE.Vector3(0, 0, 0), stub);
      return { update: (t) => { e.updateMesh({ now: t, player: null }); } };
    // A three-quarter front view: every one of these enemies puts its read on
    // the front (slit, head, plate, core), so a turntable that happens to stop
    // behind them documents nothing.
    }, { yaw: Math.PI - 0.7, spin: false, fov: 30, el: 0.18 });
  }
}

/* ================= Arsenal ================= */
{
  const g = section('ARSENAL — every weapon is good alone and means something different in your echo\'s hands');
  for (const id of ['splitter', 'rend', 'kettle', 'lattice']) {
    const def = WEAPONS[id];
    view(card(g, def.name, def.role, def.echoSynergy), (root) => {
      const parts = buildWeaponModel(id);
      parts.group.visible = true;
      parts.group.position.set(0, 0, 0.1);
      root.add(parts.group);
      return {};
    // Side-on, slightly above: the reading angle for a gun.
    }, { yaw: Math.PI * 0.5 + 0.22, spin: false, fov: 26, el: 0.22, margin: 1.12 });
  }
  view(card(g, MELEE.name, MELEE.role, MELEE.echoSynergy), (root) => {
    const parts = buildWeaponModel('thresh');
    parts.group.visible = true;
    root.add(parts.group);
    return {};
  }, { yaw: Math.PI * 0.5 + 0.22, spin: false, fov: 26, el: 0.26, margin: 1.12 });
}

/* ================= The arena ================= */
{
  const g = section('CARILLON — the first arena, cut open one tier at a time');
  const plans = [
    ['CARILLON — full plan', 'everything below the roof · 64 m across', 24],
    ['TIER 0 — the floor', 'sectioned at 3 m: eight piers, scattered cover, two ramps, the updraft', 3.0],
    ['TIER 1 — the balcony', 'sectioned at 9.5 m: a ring with four 5.5 m gaps — jump, wall-run, or drop', 9.5],
    ['TIER 2 — the bell platforms', 'sectioned at 17 m: four islands, narrow beams, the best sightlines and the worst exits', 17.0],
  ];
  for (const [name, role, clip] of plans) {
    view(card(g, name, role, '', clip === 24), (root, scene) => {
      const b = buildCarillon(scene);
      root.add(b.group);
      // Clipping a solid reveals its interior, and back faces are not drawn by
      // default -- so a cut wall simply vanished from the plan. Double-siding
      // the level materials fills the cut surfaces, which is exactly what an
      // architectural section is supposed to show.
      root.traverse((o) => { if (o.material) o.material.side = THREE.DoubleSide; });
      return {};
    }, { plan: true, clipBelow: clip, spin: false });
  }
}
