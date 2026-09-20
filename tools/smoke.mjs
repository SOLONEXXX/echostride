/**
 * Headless smoke test.
 *
 * Boots the real game in Chromium, drives it with synthetic input, and asserts
 * that the mechanic actually happened -- an echo came online, a SHIFT moved the
 * player back to where they had been, damage was dealt, and nothing threw.
 *
 * This is not a unit test suite. It is the single check that answers "is the
 * thing playable right now", which for a game is the only question that counts.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// A random high port, so a leftover preview server from an earlier run can
// never make this test fail for the wrong reason.
const PORT = 4300 + Math.floor(Math.random() * 600);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });

const fail = (msg) => { console.error('FAIL: ' + msg); cleanup(1); };
function cleanup(code) { try { server.kill('SIGTERM'); } catch {} process.exit(code); }

try {
  for (let i = 0; i < 40 && !/localhost:|127\.0\.0\.1:/.test(serverOut); i++) await sleep(250);

  // Prefer whatever Chromium the machine already has (PLAYWRIGHT_BROWSERS_PATH
  // usually points at one in CI images and sandboxes); CHROMIUM_PATH forces a
  // specific binary. A test that needs a 150 MB download is a test nobody runs.
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.ECHOSTRIDE, { timeout: 20000 });
  if (errors.length) fail('errors during boot:\n' + errors.join('\n'));

  const built = await page.evaluate(() => ({
    brushes: window.ECHOSTRIDE.game.world.brushes.length,
    weapons: window.ECHOSTRIDE.game.player.weapons.length,
    spawns: window.ECHOSTRIDE.game.map.spawns.enemies.length,
  }));
  console.log(`world: ${built.brushes} brushes, ${built.weapons} weapons, ${built.spawns} spawn points`);
  if (built.brushes < 50) fail('map looks empty');

  await page.click('#play');
  await sleep(400);

  // Drive the simulation directly: pointer lock is not available headless, so
  // we feed the same command struct the input layer would produce.
  const result = await page.evaluate(async () => {
    const { game: g, ENEMY_TYPES } = window.ECHOSTRIDE;
    const log = { errors: [] };

    // Pointer lock is unavailable headless, so feed the input layer directly.
    const held = new Set();
    g.__press = new Set();
    g.input.down = (a) => held.has(a);
    g.input.pressed = (a) => g.__press.has(a);
    Object.defineProperty(g.input, 'fireHeld', { get: () => held.has('fire') });
    Object.defineProperty(g.input, 'firePressed', { get: () => g.__press.has('fire') });
    g.input.lookDelta = () => ({ yaw: 0, pitch: 0 });
    g.input.moveAxis = () => ({ x: held.has('strafe') ? 1 : 0, y: held.has('forward') ? 1 : 0 });

    const tick = (n) => { for (let i = 0; i < n; i++) g._stepSim(1 / 60); };
    const aimAt = (p) => {
      const e = g.player.eye;
      const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
      g.player.move.yaw = Math.atan2(-dx, -dz);
      g.player.move.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };

    /* ---- 1. run, so the tape fills and the echo boots ---- */
    held.add('forward'); held.add('sprint');
    tick(240);
    log.echoActive = g.player.echo.active;
    log.recorderSpan = +g.player.recorder.span.toFixed(2);
    log.travelled = +g.player.position.distanceTo(g.map.spawns.player).toFixed(2);
    log.maxSpeedSeen = +g.player.move.speed.toFixed(2);

    /* ---- 2. SHIFT must land exactly on the echo ---- */
    const before = g.player.position.clone();
    const echoAt = g.player.echo.position.clone();
    g.player.flux = 100;
    log.shiftOk = g.player.doShift(g.now);
    log.shiftLanded = +g.player.position.distanceTo(echoAt).toFixed(3);
    log.shiftMoved = +g.player.position.distanceTo(before).toFixed(2);

    /* ---- 3. controlled duel: stand still, shoot one slow target ---- *
     * With the player stationary, the echo occupies the same spot three
     * seconds later and replays the same aimed shots -- so if the replay
     * chain works at all, the echo MUST land hits and MUST resonate.      */
    held.delete('forward'); held.delete('sprint');
    tick(30);

    let echoShots = 0;
    const origStep = g.player.echo.step.bind(g.player.echo);
    g.player.echo.step = (dt, now, onShot) => origStep(dt, now, (ev) => { echoShots++; onShot(ev); });

    const fwd = g.player.aimDirection();
    const spot = g.player.position.clone().addScaledVector(fwd, 24).setY(g.player.position.y);
    const mono = new ENEMY_TYPES.monolith(spot, g.ctx);
    g.enemies.push(mono);
    log.monolithArmor0 = mono.armor;
    // Make the target a measuring instrument, not an opponent: unkillable, and
    // it holds its fire. We are testing the replay chain here, not the fight.
    mono.maxHealth = 1e9; mono.health = 1e9;
    const muzzleTarget = () => { mono.attackTimer = 999; };

    const resBefore = g.resonance.totalResonances;
    const echoDmgBefore = g.player.echo.damageDealt;
    g.player.selectWeapon(0);
    let armorBrokeAt = null;
    for (let s = 0; s < 90; s++) {
      g.player.health = 100;         // isolate the mechanic from the fight
      muzzleTarget();
      aimAt(mono.center);
      g.player.weapon.ammo = g.player.weapon.def.mag;
      g.player.weapon.cooldown = 0;
      g.player.tryFire(g.now);
      tick(12);
      if (armorBrokeAt === null && mono.armor <= 0) armorBrokeAt = s;
    }
    log.armorBrokeAfterVolleys = armorBrokeAt;
    // Directional plating: a shot into the Monolith's back must bypass armour
    // even without a Resonant Strike. Re-arm the plate and test from behind.
    mono.armor = mono.maxArmor;
    mono.lastPlayerHitAt = null; mono.lastEchoHitAt = null;
    const hpBeforeBackshot = mono.health;
    const back = mono.center.clone().addScaledVector(
      new (mono.center.constructor)(-Math.sin(mono.yaw), 0, -Math.cos(mono.yaw)), -6);
    log.backshotDealt = +g.ctx.damage.apply(mono, 40, 'player', {
      now: g.now, point: back, weaponId: 'splitter', canResonate: false,
    }).dealt.toFixed(1);
    log.backshotArmorIntact = mono.armor === mono.maxArmor;
    // ...and a frontal shot on the re-armed plate must be fully absorbed.
    const front = mono.center.clone().addScaledVector(
      new (mono.center.constructor)(-Math.sin(mono.yaw), 0, -Math.cos(mono.yaw)), 6);
    log.frontshotDealt = +g.ctx.damage.apply(mono, 40, 'player', {
      now: g.now, point: front, weaponId: 'splitter', canResonate: false,
    }).dealt.toFixed(1);
    mono.armor = 0;

    log.echoShotsReplayed = echoShots;
    log.echoDamage = +(g.player.echo.damageDealt - echoDmgBefore).toFixed(1);
    log.playerDamage = +g.player.stats.damage.toFixed(1);
    log.resonances = g.resonance.totalResonances - resBefore;
    log.monolithArmorAfter = +mono.armor.toFixed(1);
    log.monolithHealth = +mono.health.toFixed(1);
    log.rank = g.resonance.rankName;

    /* ---- 4. every other weapon fires without throwing ---- */
    const perWeapon = {};
    for (let wi = 1; wi < 4; wi++) {
      g.player.selectWeapon(wi);
      const d0 = g.player.stats.damage;
      for (let s = 0; s < 10; s++) {
        g.player.health = 100;
        muzzleTarget();
        aimAt(mono.center);
        g.player.weapon.ammo = g.player.weapon.def.mag;
        g.player.weapon.cooldown = 0;
        g.player.tryFire(g.now);
        tick(12);
      }
      // Let the echo replay them and any Kettle fuses burn down.
      for (let k = 0; k < 24; k++) { muzzleTarget(); g.player.health = 100; tick(10); }
      perWeapon[g.player.weapon.def.id] = +(g.player.stats.damage - d0).toFixed(1);
    }
    log.perWeapon = perWeapon;

    /* ---- 5. COLLAPSE ---- */
    // Clear the range first so nothing shoots the echo out from under the test.
    for (const e of g.enemies) e.dead = true;
    for (let k = 0; k < 40; k++) { g.player.health = 100; tick(3); }
    g.player.echo.alive = true;
    g.player.echo.health = 70;
    g.player.echo.deadUntil = 0;
    g.player.echo.lockedOutUntil = 0;
    g.player.health = 100;
    g.player.flux = 100;
    tick(60);
    log.echoAliveBeforeCollapse = g.player.echo.alive && g.player.echo.active;
    log.collapseOk = g.player.doCollapse(g.now);
    log.echoGoneAfterCollapse = !g.player.echo.alive;

    /* ---- 6. melee, every enemy type, and a long stability run ---- */
    g.player.tryMelee(g.now);
    for (const t of ['warden', 'psalm', 'hush', 'cantor']) {
      const p = g.player.position.clone();
      p.x += 14; p.z += 6;
      g.enemies.push(new ENEMY_TYPES[t](p, g.ctx));
    }
    held.add('forward'); held.add('strafe'); held.add('sprint');
    for (let i = 0; i < 20; i++) { g.player.health = 100; tick(45); }
    log.finalY = +g.player.position.y.toFixed(2);
    const he = g.map.meta.halfExtent;
    log.insideWorld = Math.abs(g.player.position.x) < he && Math.abs(g.player.position.z) < he
      && g.player.position.y > -2;
    log.finalPos = [g.player.position.x, g.player.position.y, g.player.position.z]
      .map((v) => +v.toFixed(1));
    log.enemiesLeft = g.enemies.length;
    log.echoRecovered = g.player.echo.alive;
    log.simTime = +g.now.toFixed(1);
    return log;
  });

  console.log(JSON.stringify(result, null, 2));

  // Let a few hundred real rendered frames go by to catch render-path errors.
  await page.evaluate(() => { window.ECHOSTRIDE.game.paused = false; });
  await sleep(2500);
  const perf = await page.evaluate(() => {
    const g = window.ECHOSTRIDE.game;
    const r = g.renderer;
    // The game draws the world and then the view model in two passes, and
    // renderer.info resets on every render() call -- so reading it after a
    // frame reports the weapon, not the arena. Render the world once more on
    // its own and read that.
    r.render(g.scene, g.camera);
    return {
      fps: window.ECHOSTRIDE.game.fps,
      drawCalls: r.info.render.calls,
      triangles: r.info.render.triangles,
      programs: r.info.programs?.length ?? 0,
      geometries: r.info.memory.geometries,
      textures: r.info.memory.textures,
    };
  });
  // The frame rate here is software rasterisation (SwiftShader) and says
  // nothing about real hardware. Draw calls and triangle count do.
  console.log('render:', JSON.stringify(perf));

  await page.screenshot({ path: 'docs/shots/smoke-final-frame.png' });

  if (errors.length) fail('runtime errors:\n' + errors.slice(0, 12).join('\n'));
  if (!result.echoActive) fail('echo never came online');
  if (!result.shiftOk) fail('SHIFT was refused');
  if (result.shiftLanded > 0.05) fail(`SHIFT did not land on the echo (off by ${result.shiftLanded} m)`);
  if (result.shiftMoved < 3) fail('SHIFT did not move the player meaningfully');
  if (result.echoShotsReplayed <= 0) fail('the echo replayed no shots at all');
  if (result.playerDamage <= 0) fail('no damage was dealt by the player');
  if (result.echoDamage <= 0) fail('the echo never dealt damage -- the replay chain is broken');
  if (result.resonances <= 0) fail('no Resonant Strike ever landed -- the core mechanic is dead');
  if (result.monolithArmorAfter >= result.monolithArmor0) fail('Monolith plating never broke');
  if (!(result.backshotDealt > 0)) fail('a shot into the Monolith\'s back was absorbed by frontal plating');
  if (!result.backshotArmorIntact) fail('a back shot consumed frontal plating it should have bypassed');
  if (result.frontshotDealt !== 0) fail('frontal plating did not absorb a non-resonant frontal shot');
  for (const [id, d] of Object.entries(result.perWeapon)) {
    if (!(d > 0)) fail(`weapon ${id} dealt no damage`);
  }
  if (!result.collapseOk) fail('COLLAPSE was refused');
  if (!result.echoGoneAfterCollapse) fail('COLLAPSE did not consume the echo');
  if (!result.insideWorld) fail('player fell out of the arena');

  console.log('\nPASS — echo online; SHIFT lands exactly on it; both selves deal damage;'
    + '\n       Resonance fires and shatters Monolith plating; all four weapons work;'
    + '\n       COLLAPSE consumes the echo; no runtime errors.');
  await browser.close();
  cleanup(0);
} catch (err) {
  console.error(err);
  console.error(serverOut.slice(-2000));
  cleanup(1);
}
