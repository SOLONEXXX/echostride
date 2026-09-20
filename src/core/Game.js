import * as THREE from 'three';
import { SIM_DT, CAMERA, MOVE, ECHO, SHIFT, FLUX, WORLD, PLAYER } from './Tuning.js';
import { Events } from './Events.js';
import { Input } from './Input.js';
import { PALETTE } from '../engine/Palette.js';
import { MAT } from '../engine/Materials.js';
import { Fx } from '../engine/Fx.js';
import { Audio } from '../engine/Audio.js';
import { buildWeaponModel, buildMuzzleFlash } from '../engine/WeaponMesh.js';
import { buildCarillon } from '../world/maps/carillon.js';
import { Player } from '../player/Player.js';
import { Director } from '../enemies/Director.js';
import { ResonanceTracker, DamageSystem } from '../combat/Resonance.js';
import { ProjectileSystem } from '../combat/Projectiles.js';
import { WEAPONS, MELEE } from '../weapons/Arsenal.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.events = new Events();
    this.paused = false;
    this.started = false;
    this.now = 0;
    this.accumulator = 0;
    this.lastFrame = performance.now() / 1000;
    this.frameTimes = [];

    /* ---------------- renderer ---------------- */
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(PALETTE.sky, 1);
    // ACES keeps the bone whites from clipping flat under the hard key light
    // while leaving the blacks genuinely black, which is what this art
    // direction lives on.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    // autoClear off so the view model can be drawn in a second pass with its
    // own near plane. The alternative -- one camera and a tiny near plane --
    // wrecks depth precision across a 300 m arena.
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PALETTE.fog, WORLD.fogNear, WORLD.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov, innerWidth / innerHeight, CAMERA.near, CAMERA.far);

    this.viewScene = new THREE.Scene();
    // A narrower FOV than the world camera. The world wants a wide 92 degrees
    // for speed and peripheral awareness; the weapon wants a long lens so it
    // does not distort into a fisheye slab at the bottom of the screen.
    this.viewCamera = new THREE.PerspectiveCamera(
      CAMERA.fov * 0.62, innerWidth / innerHeight, 0.01, 12);
    // The view camera goes INTO the view scene and the weapon is parented to
    // the camera, so the model's transform is camera-local. Parenting it to
    // the scene root instead leaves the gun sitting at the world origin --
    // which is exactly what happened, and cost a screenshot to notice.
    this.viewScene.add(this.viewCamera);
    const vl = new THREE.DirectionalLight(0xFFF2DC, 2.4);
    vl.position.set(0.6, 1.2, 1.0);
    // Lights ride the camera too, so the weapon is lit identically wherever
    // you stand. A view model that changes brightness as you walk reads as a
    // bug even when it is technically correct.
    this.viewCamera.add(vl, new THREE.AmbientLight(0x6A7280, 1.4));

    /* ---------------- systems ---------------- */
    this.input = new Input(canvas);
    this.fx = new Fx(this.scene);
    this.audio = new Audio();
    this.map = buildCarillon(this.scene);
    this.world = this.map.world;
    this.enemies = [];
    this.projectiles = new ProjectileSystem(this.scene, this.world);
    this.resonance = new ResonanceTracker(this.events);
    this.scheduled = [];
    this.tethers = [];

    // The context handed to every subsystem. One object, mutated in place, so
    // `ctx.now` is always the current simulation time without threading a
    // parameter through forty call sites.
    this.ctx = {
      scene: this.scene, world: this.world, enemies: this.enemies,
      events: this.events, fx: this.fx, audio: this.audio,
      projectiles: this.projectiles, resonance: this.resonance,
      map: this.map, now: 0,
      schedule: (delay, fn) => this.scheduled.push({ at: this.now + delay, fn }),
      hurtTarget: (t, amount, from) => this._hurtTarget(t, amount, from),
      hurtByName: (who, amount, from) => this._hurtByName(who, amount, from),
      splash: (pos, radius, damage, src, weaponId) => this._splash(pos, radius, damage, src, weaponId),
      linkTether: (enemy, src, life) => this._linkTether(enemy, src, life),
      weaponCtx: () => this.ctx,
      onPlayerShot: () => this.flashMuzzle(),
    };

    this.player = new Player(this.ctx);
    this.ctx.player = this.player;
    this.ctx.echo = this.player.echo;
    this.damage = new DamageSystem({
      resonance: this.resonance, events: this.events, player: this.player,
    });
    this.ctx.damage = this.damage;

    this.director = new Director(this.ctx);
    this.player.move.position.copy(this.map.spawns.player);

    this._buildViewModels();
    this._wireEvents();
    this._tetherLines();

    addEventListener('resize', () => this._resize());
    this._resize();
  }

  /* ================================================================== *
   * SETUP
   * ================================================================== */
  _buildViewModels() {
    this.viewRoot = new THREE.Group();
    this.viewCamera.add(this.viewRoot);
    this.viewModels = {};
    for (const id of Object.keys(WEAPONS)) {
      const parts = buildWeaponModel(id);
      parts.group.visible = false;
      this.viewRoot.add(parts.group);
      this.viewModels[id] = parts;
    }
    const thresh = buildWeaponModel('thresh');
    thresh.group.visible = false;
    this.viewRoot.add(thresh.group);
    this.viewModels.thresh = thresh;

    this.muzzle = buildMuzzleFlash();
    this.viewRoot.add(this.muzzle.group);
    this.muzzleTimer = 0;

    // Rest pose: low and to the right, far enough out that the barrel never
    // reaches the crosshair, and scaled so the model occupies well under a
    // fifth of the frame. Screen space is the scarcest resource in a game
    // where you must also track a violet copy of yourself.
    this.viewRoot.position.set(0.255, -0.200, -0.86);
    // Toed in toward the crosshair and rolled a few degrees, so the model is
    // seen in three-quarter profile rather than from straight above. A view
    // model you are looking down on reads as a prop on a table.
    this.viewRoot.rotation.set(0.040, -0.105, 0.050);
    this.viewRoot.scale.setScalar(0.70);
    this.viewRest = { x: 0.255, y: -0.200, z: -0.86 };
    this.viewRestRot = { x: 0.040, y: -0.105, z: 0.050 };
    this.viewSway = { x: 0, y: 0, kick: 0, switchT: 1 };
  }

  _wireEvents() {
    this.events.on('resonance', (e) => {
      this.fx.resonance(e.point ?? e.target.center);
      this.audio.play('resonance', null);
    });
    this.events.on('armorBreak', (e) => {
      this.fx.armorBreak(e.point ?? e.target.center);
      this.audio.play('armorBreak', e.target.position);
    });
    this.events.on('kill', (e) => {
      this.player.stats.kills++;
      this.director.totalKills++;
      this.audio.play('kill', e.target.position);
      this.fx.spark(e.target.center, V(0, 1, 0), 16, 'enemy', 8);
    });
    this.events.on('damage', (e) => { this.player.stats.damage += e.amount; });
    this.events.on('rank', (e) => { if (e.up) this.audio.play('rankUp', null); });
    this.events.on('playerHurt', () => this.audio.play('hurt', null));
    this.events.on('echoFrozen', () => this.audio.play('echoFrozen', this.player.echo.position));
    this.events.on('shift', () => {});
  }

  _tetherLines() {
    const geo = new THREE.BufferGeometry();
    this.tetherPos = new Float32Array(64 * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.tetherPos, 3));
    this.tetherGeo = geo;
    this.tetherMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: PALETTE.echo, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.tetherMesh.frustumCulled = false;
    this.scene.add(this.tetherMesh);
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.audio.resume();
    this.director.start(this.now);
    this.events.emit('gameStart', {});
  }

  /* ================================================================== *
   * COMBAT HELPERS
   * ================================================================== */
  _hurtTarget(t, amount, from) {
    if (!t) return;
    if (t.kind === 'player') this.player.hurt(amount, this.now, from);
    else if (t.kind === 'echo') this._hurtEcho(amount);
  }

  _hurtByName(who, amount, from) {
    if (who === 'player') this.player.hurt(amount, this.now, from);
    else if (who === 'echo') this._hurtEcho(amount);
  }

  _hurtEcho(amount) {
    const died = this.player.echo.damage(amount, this.now);
    if (died) {
      this.audio.play('echoDeath', this.player.echo.position);
      this.events.emit('echoDied', {});
    }
  }

  _splash(pos, radius, damage, src, weaponId) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = e.center.distanceTo(pos);
      if (d > radius) continue;
      // Quadratic falloff: the centre of a blast should be meaningfully
      // better than the edge, or splash weapons stop rewarding placement.
      const k = 1 - (d / radius) ** 2;
      this.damage.apply(e, damage * k, src, {
        now: this.now, point: e.center, weaponId,
      });
      const push = V().subVectors(e.position, pos).setY(0.3).normalize();
      e.velocity.addScaledVector(push, 9 * k);
    }
    // Self-damage is halved and cannot kill you outright, which keeps
    // rocket-jump-style tricks available without making them a death sentence.
    const dp = this.player.center.distanceTo(pos);
    if (dp < radius && src !== 'enemy') {
      const k = 1 - (dp / radius) ** 2;
      const self = Math.min(damage * k * 0.35, this.player.health - 1);
      if (self > 0) this.player.hurt(self, this.now, 'self');
      this.player.move.velocity.addScaledVector(
        V().subVectors(this.player.center, pos).normalize(), 15 * k);
    }
  }

  _linkTether(enemy, src, life) {
    const key = src === 'player' ? '_lastTetherPlayer' : '_lastTetherEcho';
    const prev = this[key];
    if (prev && prev !== enemy && !prev.dead) {
      this.tethers.push({ a: prev, b: enemy, until: this.now + life, src });
      enemy.tethers.add(prev);
      prev.tethers.add(enemy);
    }
    this[key] = enemy;
  }

  /* ================================================================== *
   * SIMULATION
   * ================================================================== */
  _buildCommand() {
    const i = this.input;
    return {
      move: i.moveAxis(),
      jump: i.pressed('jump') || (i.down('jump') && this.player.move.grounded),
      jumpHeld: i.down('jump'),
      crouch: i.down('crouch'),
      sprint: i.down('sprint'),
    };
  }

  _applyLook(dt) {
    if (!this.input.locked && !this.input.padConnected) return;
    const { yaw, pitch } = this.input.lookDelta(dt);
    this.player.move.yaw += yaw;
    this.player.move.pitch = THREE.MathUtils.clamp(
      this.player.move.pitch + pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  }

  _handleActions() {
    const i = this.input;
    const p = this.player;
    if (p.dead) {
      if (i.pressed('jump') || i.firePressed || i.pressed('restart')) this.restart();
      return;
    }

    if (i.pressed('shift')) p.doShift(this.now);
    if (i.pressed('collapse')) p.doCollapse(this.now);
    if (i.pressed('melee')) p.tryMelee(this.now);
    if (i.pressed('reload')) { p.weapon.beginReload(); this.audio.play('reload', null); }

    for (let k = 0; k < 4; k++) if (i.pressed('weapon' + (k + 1))) p.selectWeapon(k);
    if (i.pressed('weaponNext')) p.selectWeapon((p.weaponIndex + 1) % p.weapons.length);
    if (i.mouse.wheel) {
      p.selectWeapon((p.weaponIndex + (i.mouse.wheel > 0 ? 1 : -1) + p.weapons.length) % p.weapons.length);
    }

    // Echo delay dial. Locked while anything hostile can see you, so it is a
    // between-fights decision rather than a mid-fight escape button.
    const seen = this.enemies.some((e) => !e.dead
      && e.position.distanceTo(p.position) < 35
      && this.world.lineOfSight(e.center, p.center));
    if (i.pressed('delayUp') || i.pressed('delayDown')) {
      if (seen) {
        this.events.emit('retuneBlocked', {});
        this.audio.play('empty', null);
      } else if (p.spendFlux(ECHO.retuneFluxCost)) {
        p.echo.setDelay(p.echo.delay + (i.pressed('delayUp') ? ECHO.delayStep : -ECHO.delayStep));
        this.audio.play('echoSpawn', null);
        this.events.emit('retune', { delay: p.echo.delay });
      } else {
        this.audio.play('empty', null);
      }
    }

    const w = p.weapon;
    const auto = !w.def.burst;
    if (auto ? i.fireHeld : i.firePressed) p.tryFire(this.now);
  }

  _stepSim(dt) {
    this.now += dt;
    this.ctx.now = this.now;

    for (let k = this.scheduled.length - 1; k >= 0; k--) {
      if (this.now >= this.scheduled[k].at) {
        const s = this.scheduled[k];
        this.scheduled.splice(k, 1);
        s.fn();
      }
    }

    const cmd = this._buildCommand();
    this.player.step(dt, cmd, this.now);
    this.resonance.step(this.now);

    // The echo replays and fires. Its shots go through exactly the same
    // weapon code your shots do -- a different code path for the echo would
    // guarantee the two drift apart as the arsenal grows.
    const wasActive = this.player.echo.active;
    this.player.echo.step(dt, this.now, (ev) => {
      const def = WEAPONS[ev.weaponId];
      if (!def) return;
      def.fire(this.ctx, {
        origin: ev.origin,
        dir: ev.dir,
        src: 'echo',
        seed: ev.seed,
        charge: ev.charge,
      });
      this.audio.play(ev.weaponId, ev.origin, { src: 'echo' });
    });
    if (!wasActive && this.player.echo.active) {
      this.audio.play('echoSpawn', null);
      this.events.emit('echoOnline', {});
    }

    for (const e of this.enemies) {
      if (e.dead) continue;
      e.step(dt, this.ctx);
    }

    this.projectiles.followStuck();
    this.projectiles.step(
      dt, this.enemies, this.player.center,
      this.player.echo.active && this.player.echo.alive ? this.player.echo.center : null,
      this.now,
    );

    this._stepTethers(dt);
    this.director.step(dt, this.now);
    this._reapEnemies();
  }

  _stepTethers(dt) {
    let n = 0;
    for (let i = this.tethers.length - 1; i >= 0; i--) {
      const t = this.tethers[i];
      if (this.now > t.until || t.a.dead || t.b.dead) {
        t.a.tethers?.delete(t.b);
        t.b.tethers?.delete(t.a);
        this.tethers.splice(i, 1);
        continue;
      }
      if (n < 64) {
        const o = n * 6;
        const a = t.a.center, b = t.b.center;
        this.tetherPos[o + 0] = a.x; this.tetherPos[o + 1] = a.y; this.tetherPos[o + 2] = a.z;
        this.tetherPos[o + 3] = b.x; this.tetherPos[o + 4] = b.y; this.tetherPos[o + 5] = b.z;
        n++;
      }
    }
    this.tetherGeo.setDrawRange(0, n * 2);
    this.tetherGeo.attributes.position.needsUpdate = true;
  }

  _reapEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.dead) continue;
      // Keep the corpse around for a beat so the kill reads, then clean up.
      e._deadFor = (e._deadFor ?? 0) + SIM_DT;
      if (e.group) {
        e.group.position.y -= SIM_DT * 2.2;
        e.group.rotation.z += SIM_DT * 1.1;
        e.group.scale.multiplyScalar(1 - SIM_DT * 1.8);
      }
      if (e._deadFor > 0.55) {
        e.dispose(this.scene);
        this.enemies.splice(i, 1);
      }
    }
  }

  /* ================================================================== *
   * PRESENTATION
   * ================================================================== */
  _updateCamera(dt, alpha) {
    const m = this.player.move;
    const eye = m.eye;
    this.camera.position.copy(eye);

    // View bob, tied to distance travelled rather than to time, so it stops
    // dead when you stop and never desyncs from your feet.
    const sp = m.speed;
    if (m.grounded && !m.sliding && sp > 0.5) {
      const ph = m.stepDistance * 2.1;
      const amt = CAMERA.viewBobAmount * Math.min(1, sp / MOVE.sprintSpeed);
      this.camera.position.y += Math.sin(ph * 2) * amt;
      this.camera.position.x += Math.cos(ph) * amt * 0.6;
    }

    // Landing dip. A camera that does not acknowledge the ground makes a
    // 14 m drop feel like stepping off a kerb.
    this._dip = (this._dip ?? 0);
    if (m.landImpact > 3) this._dip = Math.min(CAMERA.landingDipMax, m.landImpact * 0.012);
    this._dip *= Math.max(0, 1 - dt * 7.5);
    this.camera.position.y -= this._dip;

    // Shake, from explosions and heavy weapons.
    const s = this.fx.shake;
    if (s > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * s * 0.22;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.22;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.22;
    }

    const yaw = m.yaw + this.player.recoilYaw;
    const pitch = m.pitch + this.player.recoilPitch;

    // Roll: a small tilt when strafing, a large one when wall-running. The
    // wall-run tilt is the single clearest signal that you are on a wall, and
    // it is worth more than any particle effect.
    const strafe = this.input.moveAxis().x;
    let roll = -strafe * THREE.MathUtils.degToRad(CAMERA.tiltOnStrafe);
    if (m.wallRunning) {
      const side = Math.sign(m.wallNormal.x * Math.cos(yaw) - m.wallNormal.z * Math.sin(yaw)) || 1;
      roll += side * THREE.MathUtils.degToRad(CAMERA.tiltOnWallRun);
    }
    if (m.sliding) roll += -strafe * THREE.MathUtils.degToRad(3);
    this._roll = (this._roll ?? 0) + (roll - (this._roll ?? 0)) * Math.min(1, dt * 8);

    const e = new THREE.Euler(pitch, yaw, this._roll, 'YXZ');
    this.camera.quaternion.setFromEuler(e);
    this.viewCamera.quaternion.copy(this.camera.quaternion);
    this.viewCamera.position.copy(this.camera.position);

    // FOV widens with speed. It is the cheapest and most effective speed cue
    // in first person, and it costs nothing.
    let targetFov = CAMERA.fov;
    if (sp > MOVE.walkSpeed + 0.5) targetFov += CAMERA.fovSprintBonus * Math.min(1, (sp - MOVE.walkSpeed) / 4);
    if (m.sliding) targetFov += CAMERA.fovSlideBonus;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * CAMERA.fovLerp);
    this.camera.updateProjectionMatrix();

    this.audio.listener.x = eye.x;
    this.audio.listener.y = eye.y;
    this.audio.listener.z = eye.z;
    this.audio.listener.yaw = yaw;
  }

  _updateViewModel(dt) {
    const p = this.player;
    for (const [id, vm] of Object.entries(this.viewModels)) {
      vm.group.visible = (id === p.weapon.id);
    }
    const vm = this.viewModels[p.weapon.id];
    if (!vm) return;

    // Sway lags the look input. The weapon is heavy; it should arrive late.
    const look = this.input.lookDelta(dt);
    this.viewSway.x += (-look.yaw * 2.4 - this.viewSway.x) * Math.min(1, dt * 9);
    this.viewSway.y += (-look.pitch * 2.0 - this.viewSway.y) * Math.min(1, dt * 9);
    this.viewSway.x = THREE.MathUtils.clamp(this.viewSway.x, -0.09, 0.09);
    this.viewSway.y = THREE.MathUtils.clamp(this.viewSway.y, -0.07, 0.07);

    const m = p.move;
    const sp = m.speed;
    const bobPh = m.stepDistance * 2.1;
    const bobAmt = Math.min(1, sp / MOVE.sprintSpeed);

    // Weapon lowers when sprinting. It signals "not ready to fire" honestly,
    // because with a 3-round burst the readiness matters.
    const sprinting = sp > MOVE.walkSpeed + 1 && m.grounded;
    this._lower = (this._lower ?? 0) + ((sprinting ? 1 : 0) - (this._lower ?? 0)) * Math.min(1, dt * 8);

    const rest = this.viewRest;
    this.viewRoot.position.set(
      rest.x + this.viewSway.x + Math.cos(bobPh) * 0.012 * bobAmt,
      rest.y + this.viewSway.y + Math.sin(bobPh * 2) * 0.009 * bobAmt - this._lower * 0.10,
      rest.z + this.viewSway.kick,
    );
    const rr = this.viewRestRot;
    this.viewRoot.rotation.set(
      rr.x - this.viewSway.y * 1.6 - this._lower * 0.42 + p.recoilPitch * 0.9,
      rr.y + this.viewSway.x * 1.4 + (m.sliding ? 0.14 : 0),
      rr.z + this._lower * 0.30 + (m.wallRunning ? 0.10 : 0),
    );
    this.viewSway.kick += (0 - this.viewSway.kick) * Math.min(1, dt * 13);

    // Ammo readout on the weapon itself. A player whose eyes are on their
    // enemy can still see how much is left in the magazine.
    if (vm.state?.material) {
      const r = p.weapon.magRatio;
      vm.state.material.color.setHex(r > 0.34 ? PALETTE.flux : r > 0 ? PALETTE.gold : PALETTE.oxide);
      vm.state.scale.y = p.weapon.reloading ? 0.2 + 0.8 * (1 - p.weapon.reloadTimer / p.weapon.def.reloadTime) : Math.max(0.05, r);
    }
    // The Kettle's brass drum counts down the fuse: a diegetic readout of the
    // echo delay, on the weapon whose whole identity is that number.
    if (vm.drum) vm.drum.rotation.x = -(this.now / Math.max(0.1, p.echo.delay)) * Math.PI * 2;
    if (vm.prism) {
      vm.prism.rotation.y = this.now * 1.7;
      vm.prism.rotation.x = this.now * 1.1;
    }
    if (vm.drums) for (const d of vm.drums) d.rotation.x = -p.weapon.ammo * 1.05;

    this.muzzleTimer -= dt;
    this.muzzle.group.visible = this.muzzleTimer > 0;
    if (this.muzzle.group.visible) {
      this.muzzle.group.position.copy(vm.muzzle.position);
      this.muzzle.group.rotation.z = Math.random() * 6.28;
      const k = Math.max(0, this.muzzleTimer / 0.045);
      this.muzzle.group.scale.setScalar(0.7 + k * 0.7);
      this.muzzle.material.opacity = k;
    }
  }

  flashMuzzle() {
    this.muzzleTimer = 0.045;
    this.viewSway.kick = 0.055;
  }

  /* ================================================================== *
   * FRAME
   * ================================================================== */
  frame() {
    const t = performance.now() / 1000;
    let dt = t - this.lastFrame;
    this.lastFrame = t;
    // Clamp: a tab that was backgrounded for 30 s must not run 1800 sim ticks
    // in one frame and teleport every enemy into your face.
    if (dt > 0.25) dt = 0.25;

    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();

    if (!this.paused && this.started) {
      this.input.pollPad();
      this._applyLook(dt);
      this._handleActions();

      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < 8) {
        this._stepSim(SIM_DT);
        this.accumulator -= SIM_DT;
        steps++;
      }
      if (steps === 8) this.accumulator = 0; // give up rather than spiral

      this._updateCamera(dt, this.accumulator / SIM_DT);
      this._updateViewModel(dt);
    }

    this.fx.step(dt, this.camera);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.viewScene, this.viewCamera);

    this.input.endFrame();
  }

  restart() {
    for (const e of this.enemies) e.dispose(this.scene);
    this.enemies.length = 0;
    this.projectiles.clear();
    this.tethers.length = 0;
    this.scheduled.length = 0;
    this.resonance.reset();
    this.director.reset();
    this.player.respawn(this.map.spawns.player);
    this.events.emit('restart', {});
  }

  get fps() {
    if (!this.frameTimes.length) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return Math.round(1 / Math.max(1e-5, avg));
  }
}
