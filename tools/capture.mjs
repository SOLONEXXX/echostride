/**
 * Screenshot capture for the README. Boots the real game, poses it, shoots.
 * Runs against the production build so the images cannot flatter a dev-only
 * code path.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync } from 'node:fs';

const PORT = 4300 + Math.floor(Math.random() * 600);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
server.stdout.on('data', (d) => { out += d; });
server.stderr.on('data', (d) => { out += d; });

const shots = [];
try {
  mkdirSync('docs/shots', { recursive: true });
  for (let i = 0; i < 40 && !/localhost:|127\.0\.0\.1:/.test(out); i++) await sleep(250);

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.error('PAGE ERROR', e));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.ECHOSTRIDE, { timeout: 20000 });

  await sleep(600);
  await page.screenshot({ path: 'docs/shots/01-menu.png' });
  shots.push('01-menu.png');

  await page.click('#play');
  await sleep(500);

  // Pose the scene: put the player on the balcony looking across the shaft,
  // give them a filled tape so the echo is live, and set a fight in front.
  await page.evaluate(async () => {
    const { game: g, ENEMY_TYPES } = window.ECHOSTRIDE;
    g.input.lookDelta = () => ({ yaw: 0, pitch: 0 });
    g.input.moveAxis = () => ({ x: 0, y: 0 });
    g.input.down = () => false;
    g.input.pressed = () => false;
    Object.defineProperty(g.input, 'fireHeld', { get: () => false });
    Object.defineProperty(g.input, 'firePressed', { get: () => false });

    const tick = (n) => { for (let i = 0; i < n; i++) g._stepSim(1 / 60); };

    g.player.move.position.set(-19, 7.4, -19);
    g.player.move.yaw = Math.PI * 0.25;
    g.player.move.pitch = -0.06;
    // Walk the player along the balcony so the recorder holds a real path and
    // the echo trail has something to draw.
    for (let i = 0; i < 200; i++) {
      const a = Math.PI * 0.75 + i * 0.0042;
      g.player.move.position.set(Math.cos(a) * 26.2, 7.4, Math.sin(a) * 26.2);
      g.player.move.velocity.set(-Math.sin(a) * 9, 0, Math.cos(a) * 9);
      g.player.move.yaw = a + Math.PI * 0.5;
      g.player.move.grounded = true;
      g.player.move.stepDistance += 0.15;
      g.player.recorder.record(g.player.move, 'splitter', 1 / 60);
      g.player.echo.step(1 / 60, g.now, () => {});
      g.now += 1 / 60;
      g.ctx.now = g.now;
    }
    // Ground level, looking across the arena floor at the fight and the bell.
    g.player.move.position.set(-2, 1.0, 24);
    g.player.move.velocity.set(0, 0, 0);
    g.player.move.yaw = Math.PI * 0.02;
    g.player.move.pitch = 0.02;
    g.player.flux = 88;
    g.resonance.chain = 9;
    g.resonance.rank = 3;
    g.player.selectWeapon(0);

    // A fight worth photographing, placed in the shaft.
    const place = (T, x, y, z) => {
      const e = new ENEMY_TYPES[T](new (window.ECHOSTRIDE.game.player.position.constructor)(x, y, z), g.ctx);
      g.enemies.push(e);
      return e;
    };
    place('monolith', 1.5, 0.2, 2);
    place('warden', 8, 0.2, 9);
    place('warden', -8, 0.2, 6);
    place('psalm', -12, 0.2, -6);
    place('cantor', 13, 0.2, -3);
    place('hush', 6, 0.2, 15);
    g.director.wave = 5;
    g.director.state = 'fighting';
    tick(40);
    // Put the fight mid-exchange: tracers in the air, impacts on the plate,
    // and a Resonant Strike going off. A screenshot of a game standing still
    // is a screenshot of a level editor.
    const mono = g.enemies[0];
    const aim = mono.center.clone().sub(g.player.eye).normalize();
    for (let i = 0; i < 3; i++) {
      g.fx.tracer(g.player.eye.clone().addScaledVector(aim, 0.6), mono.center, 'player');
    }
    g.fx.tracer(g.player.echo.center.clone(), g.enemies[1].center, 'echo');
    g.fx.impact(mono.center, aim.clone().negate(), 'player', true);
    g.fx.resonance(mono.center);
    g.flashMuzzle?.();
  });
  await sleep(900);
  await page.screenshot({ path: 'docs/shots/02-arena.png' });
  shots.push('02-arena.png');

  // A second angle: from the ground floor, looking up the shaft at the bell.
  await page.evaluate(() => {
    const { game: g } = window.ECHOSTRIDE;
    g.player.move.position.set(0, 1, 20);
    g.player.move.yaw = Math.PI;
    g.player.move.pitch = 0.42;
    for (let i = 0; i < 6; i++) g._stepSim(1 / 60);
  });
  await sleep(700);
  await page.screenshot({ path: 'docs/shots/03-shaft.png' });
  shots.push('03-shaft.png');

  // Close on the echo. The simulation is frozen first and the camera is driven
  // directly: posing a camera and then letting three seconds of replay run
  // before the shutter is how the first attempt ended up photographing a wall.
  await page.evaluate(() => {
    const { game: g } = window.ECHOSTRIDE;
    g.paused = true;                       // rendering continues, simulation stops
    const e = g.player.echo;
    const p = e.center.clone();
    const off = { x: 2.6, y: 0.5, z: 2.6 };
    g.camera.position.set(p.x + off.x, p.y + off.y, p.z + off.z);
    g.camera.lookAt(p.x, p.y - 0.15, p.z);
    g.camera.fov = 44;
    g.camera.updateProjectionMatrix();
    g.viewCamera.position.copy(g.camera.position);
    g.viewCamera.quaternion.copy(g.camera.quaternion);
  });
  await sleep(600);
  await page.screenshot({ path: 'docs/shots/04-echo.png' });
  shots.push('04-echo.png');

  /* ---- the design gallery ---- */
  const gal = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const galErrors = [];
  gal.on('pageerror', (e) => galErrors.push(String(e)));
  await gal.goto(`http://127.0.0.1:${PORT}/gallery.html`, { waitUntil: 'networkidle' });
  await sleep(3500);
  if (galErrors.length) console.error('GALLERY ERRORS:', galErrors.slice(0, 5).join('\n'));
  const sections = await gal.$$('h2');
  const names = ['strider', 'stillness', 'arsenal', 'carillon'];
  await sleep(1200);
  for (let i = 0; i < sections.length && i < names.length; i++) {
    const h = sections[i];
    const grid = (await h.evaluateHandle((el) => el.nextElementSibling)).asElement();
    // The shared renderer only draws slots that are on screen, so the section
    // has to be scrolled into view and given a few frames before the shutter.
    await grid.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await sleep(1800);
    // A clipped page screenshot rather than an element screenshot: the page
    // animates every frame, so Playwright's "wait for the element to be
    // stable" check never settles and times out on the tall cards.
    const box = await grid.boundingBox();
    if (!box) continue;
    await gal.screenshot({
      path: `docs/shots/gallery-${names[i]}.png`,
      clip: {
        x: Math.max(0, box.x), y: Math.max(0, box.y),
        width: Math.min(box.width, 1500 - Math.max(0, box.x)),
        height: Math.min(box.height, 1100 - Math.max(0, box.y)),
      },
    });
    shots.push(`gallery-${names[i]}.png`);
  }
  await gal.close();

  console.log('captured:', shots.join(', '));
  await browser.close();
} catch (e) {
  console.error(e);
  console.error(out.slice(-1500));
} finally {
  try { server.kill('SIGTERM'); } catch {}
}
process.exit(0);
