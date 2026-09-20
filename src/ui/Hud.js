import * as THREE from 'three';
import { PALETTE, css } from '../engine/Palette.js';
import { FLUX, SHIFT, ECHO, PLAYER, RESONANCE } from '../core/Tuning.js';

/**
 * ECHOSTRIDE — HUD
 *
 * Built from DOM, not sprites, because a HUD that reflows is a HUD that works
 * on a phone and at 4K without a single asset.
 *
 * The one design problem this HUD exists to solve:
 *
 *   The player must always know where their echo is, what it is doing, and
 *   whether SHIFT is available -- without looking away from the fight.
 *
 * Everything else is secondary. So the echo gets the centre-bottom position
 * (nearest the crosshair), an off-screen chevron that tracks it around the
 * screen edge, and its own colour that appears nowhere else. Health is small
 * and in the corner, because in this game you rarely die from not knowing
 * your health -- you die from losing track of your other self.
 */
export class Hud {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.feed = [];
    this.hitMarkers = [];
    this.damageDirs = [];
    this.resonanceFlash = 0;
    this.hurtFlash = 0;
    this.build();
    this.wire();
  }

  build() {
    this.root.innerHTML = `
      <div id="hud">
        <div id="vignette"></div>
        <div id="resFlash"></div>
        <div id="hurtFlash"></div>

        <div id="crosshair">
          <div class="ch ch-t"></div><div class="ch ch-b"></div>
          <div class="ch ch-l"></div><div class="ch ch-r"></div>
          <div class="ch-dot"></div>
          <div id="hitmark"><span></span><span></span><span></span><span></span></div>
        </div>

        <div id="echoChevron"><svg viewBox="0 0 24 24"><path d="M12 3 L22 20 L12 15 L2 20 Z"/></svg></div>

        <!-- bottom centre: the echo panel -->
        <div id="echoPanel">
          <div id="echoState">ECHO OFFLINE</div>
          <div id="echoBarWrap"><div id="echoBar"></div></div>
          <div id="echoMeta">
            <span id="echoDelay">3.00s</span>
            <span id="echoDist">--</span>
          </div>
        </div>

        <!-- bottom left: body -->
        <div id="left">
          <div id="rankLine"><span id="rankName">DRIFT</span><span id="rankChain"></span></div>
          <div id="rankBarWrap"><div id="rankBar"></div></div>
          <div id="vitals">
            <div class="vrow"><label>HP</label><div class="bar"><div id="hpBar"></div></div><span id="hpNum">100</span></div>
            <div class="vrow"><label>AR</label><div class="bar"><div id="arBar"></div></div><span id="arNum">0</span></div>
          </div>
          <div id="fluxWrap">
            <div id="fluxBar"></div>
            <div id="fluxTicks"><i style="left:35%"></i><i style="left:50%"></i><i class="major" style="left:100%"></i></div>
          </div>
          <div id="fluxLabel">FLUX <span id="fluxNum">45</span></div>
        </div>

        <!-- bottom right: weapon -->
        <div id="right">
          <div id="wName">SPLITTER Mk.II</div>
          <div id="wRole">Dual-Phase Rifle</div>
          <div id="ammo"><span id="ammoMag">27</span><span id="ammoSep">/</span><span id="ammoRes">162</span></div>
          <div id="wSyn"></div>
          <div id="slots"></div>
        </div>

        <!-- top: abilities -->
        <div id="abilities">
          <div class="ab" id="abShift"><b>Q</b><span>SHIFT</span><div class="abBar"><i></i></div></div>
          <div class="ab" id="abCollapse"><b>F</b><span>COLLAPSE</span><div class="abBar"><i></i></div></div>
        </div>

        <div id="wave"><span id="waveNum">WAVE 1</span><span id="waveLeft"></span></div>
        <div id="feed"></div>
        <div id="toast"></div>
        <div id="dmgDirs"></div>
        <div id="deadScreen"><h1>STILLED</h1><p></p><small>Press <b>SPACE</b> or <b>FIRE</b> to stride again</small></div>
        <div id="perf"></div>
      </div>`;
    const $ = (id) => this.root.querySelector('#' + id);
    this.el = {
      crosshair: $('crosshair'), chs: [...this.root.querySelectorAll('.ch')],
      hitmark: $('hitmark'),
      echoPanel: $('echoPanel'), echoState: $('echoState'), echoBar: $('echoBar'),
      echoDelay: $('echoDelay'), echoDist: $('echoDist'), chevron: $('echoChevron'),
      hpBar: $('hpBar'), hpNum: $('hpNum'), arBar: $('arBar'), arNum: $('arNum'),
      fluxBar: $('fluxBar'), fluxNum: $('fluxNum'),
      rankName: $('rankName'), rankChain: $('rankChain'), rankBar: $('rankBar'),
      wName: $('wName'), wRole: $('wRole'), wSyn: $('wSyn'),
      ammoMag: $('ammoMag'), ammoRes: $('ammoRes'), slots: $('slots'),
      abShift: $('abShift'), abCollapse: $('abCollapse'),
      waveNum: $('waveNum'), waveLeft: $('waveLeft'),
      feed: $('feed'), toast: $('toast'), dead: $('deadScreen'),
      resFlash: $('resFlash'), hurtFlash: $('hurtFlash'), perf: $('perf'),
      dmgDirs: $('dmgDirs'),
    };

    this.el.slots.innerHTML = this.game.player.weapons
      .map((w, i) => `<span data-i="${i}">${i + 1}</span>`).join('');
  }

  wire() {
    const ev = this.game.events;
    ev.on('damage', (e) => {
      if (e.src === 'player') this.hit(e.resonant);
    });
    ev.on('resonance', () => { this.resonanceFlash = 1; this.toast('RESONANT STRIKE', PALETTE.gold); });
    ev.on('armorBreak', () => this.toast('PLATING SHATTERED', PALETTE.gold));
    ev.on('kill', (e) => this.push(`${(e.target.constructor.displayName ?? 'TARGET')} ${e.resonant ? 'RESONATED' : 'DOWN'}`, e.resonant ? PALETTE.gold : PALETTE.flux));
    ev.on('rank', (e) => { if (e.up) this.toast(e.name, PALETTE.gold); });
    ev.on('shift', () => this.push('SHIFT', PALETTE.echo));
    ev.on('collapse', (e) => this.toast(`COLLAPSE — ${Math.round(e.damage)}`, PALETTE.echo));
    ev.on('phaseCatch', () => this.toast('PHASE-CATCH', PALETTE.echo));
    ev.on('echoOnline', () => this.push('ECHO ONLINE', PALETTE.echo));
    ev.on('echoDied', () => this.push('ECHO LOST', PALETTE.oxide));
    ev.on('retune', (e) => this.push(`DELAY ${e.delay.toFixed(2)}s`, PALETTE.echo));
    ev.on('retuneBlocked', () => this.toast('CANNOT RETUNE UNDER OBSERVATION', PALETTE.oxide));
    ev.on('waveStart', (e) => this.toast(`WAVE ${e.wave}`, PALETTE.bone));
    ev.on('waveCleared', (e) => this.toast(`WAVE ${e.wave} CLEAR — ${e.time.toFixed(1)}s`, PALETTE.flux));
    ev.on('weaponSwitch', (e) => this.setWeapon(e.weapon));
    ev.on('playerHurt', (e) => {
      this.hurtFlash = 1;
      if (e.from?.position) this.damageDirs.push({ pos: e.from.position.clone(), life: 1.2 });
    });
    ev.on('playerDied', () => { this.el.dead.classList.add('on'); });
    ev.on('restart', () => { this.el.dead.classList.remove('on'); this.feed.length = 0; });
    this.setWeapon(this.game.player.weapon.def);
  }

  setWeapon(def) {
    this.el.wName.textContent = def.name;
    this.el.wRole.textContent = def.role;
    this.el.wSyn.innerHTML = `<b>${def.echoSynergy}</b>`;
    [...this.el.slots.children].forEach((s, i) => {
      s.classList.toggle('on', i === this.game.player.weaponIndex);
    });
  }

  hit(resonant) {
    this.hitMarkers.push({ life: resonant ? 0.28 : 0.16, resonant });
  }

  push(text, color) {
    this.feed.unshift({ text, color, life: 4.2 });
    if (this.feed.length > 6) this.feed.pop();
  }

  toast(text, color) {
    this.el.toast.textContent = text;
    this.el.toast.style.color = css(color ?? PALETTE.bone);
    this.el.toast.classList.remove('on');
    void this.el.toast.offsetWidth; // restart the CSS animation
    this.el.toast.classList.add('on');
  }

  update(dt) {
    const g = this.game, p = g.player, e = p.echo;

    /* ---- vitals ---- */
    const hp = Math.max(0, p.health) / PLAYER.maxHealth;
    this.el.hpBar.style.width = (hp * 100) + '%';
    this.el.hpBar.style.background = hp > 0.5 ? css(PALETTE.bone) : hp > 0.25 ? css(PALETTE.gold) : css(PALETTE.oxide);
    this.el.hpNum.textContent = Math.ceil(Math.max(0, p.health));
    this.el.arBar.style.width = (p.armor / PLAYER.maxArmor * 100) + '%';
    this.el.arNum.textContent = Math.ceil(p.armor);

    /* ---- flux ---- */
    const fr = p.fluxRatio;
    this.el.fluxBar.style.width = (fr * 100) + '%';
    this.el.fluxBar.classList.toggle('full', p.flux >= SHIFT.collapseFluxCost - 0.01);
    this.el.fluxNum.textContent = Math.floor(p.flux);

    /* ---- rank ---- */
    const r = g.resonance;
    this.el.rankName.textContent = r.rankName;
    this.el.rankName.style.color = r.rank >= 3 ? css(PALETTE.gold) : css(PALETTE.bone);
    this.el.rankChain.textContent = r.chain > 0 ? `×${r.chain}` : '';
    this.el.rankBar.style.width = (r.rankProgress * 100) + '%';

    /* ---- weapon ---- */
    const w = p.weapon;
    this.el.ammoMag.textContent = w.ammo;
    this.el.ammoRes.textContent = w.reserve;
    this.el.ammoMag.style.color = w.ammo === 0 ? css(PALETTE.oxide)
      : w.magRatio < 0.34 ? css(PALETTE.gold) : css(PALETTE.bone);
    [...this.el.slots.children].forEach((s, i) => s.classList.toggle('on', i === p.weaponIndex));

    /* ---- abilities ---- */
    const canShift = p.canShift(g.now);
    this.el.abShift.classList.toggle('ready', canShift);
    this.el.abShift.querySelector('i').style.width =
      Math.min(100, (p.flux / SHIFT.fluxCost) * 100) + '%';
    const canCollapse = p.canCollapse();
    this.el.abCollapse.classList.toggle('ready', canCollapse);
    this.el.abCollapse.querySelector('i').style.width =
      Math.min(100, (p.flux / SHIFT.collapseFluxCost) * 100) + '%';

    /* ---- the echo panel ---- */
    this.el.echoDelay.textContent = e.delay.toFixed(2) + 's';
    let state = 'ECHO OFFLINE', color = PALETTE.ash;
    if (e.active && e.alive) {
      if (g.now < e.frozenUntil) { state = 'ECHO STILLED'; color = PALETTE.oxide; }
      else { state = 'ECHO ONLINE'; color = PALETTE.echo; }
    } else if (!e.alive && g.now < e.lockedOutUntil) {
      state = `COLLAPSED ${(e.lockedOutUntil - g.now).toFixed(1)}s`; color = PALETTE.oxide;
    } else if (!e.alive) {
      state = `REFORMING ${Math.max(0, e.deadUntil - g.now).toFixed(1)}s`; color = PALETTE.oxide;
    } else {
      state = `SPOOLING ${Math.max(0, e.delay - g.player.recorder.span).toFixed(1)}s`;
      color = PALETTE.ash;
    }
    this.el.echoState.textContent = state;
    this.el.echoState.style.color = css(color);
    this.el.echoBar.style.width = (e.health / ECHO.maxHealth * 100) + '%';
    this.el.echoBar.style.background = css(color);
    this.el.echoPanel.classList.toggle('alert', !e.alive || g.now < e.frozenUntil);

    if (e.active && e.alive) {
      this.el.echoDist.textContent = Math.round(e.position.distanceTo(p.position)) + 'm';
    } else this.el.echoDist.textContent = '--';

    this._updateChevron(e, p);

    /* ---- crosshair spread tracks actual accuracy ---- */
    const def = w.def;
    const moveSpread = Math.min(1, p.move.speed / 12) * 8;
    const spr = 6 + (def.spread ?? 0) * 900 + moveSpread + Math.abs(p.recoilPitch) * 260;
    for (const ch of this.el.chs) ch.style.setProperty('--sp', spr.toFixed(1) + 'px');

    /* ---- hit markers ---- */
    let strongest = null;
    for (let i = this.hitMarkers.length - 1; i >= 0; i--) {
      const h = this.hitMarkers[i];
      h.life -= dt;
      if (h.life <= 0) { this.hitMarkers.splice(i, 1); continue; }
      if (!strongest || h.resonant) strongest = h;
    }
    this.el.hitmark.style.opacity = strongest ? Math.min(1, strongest.life * 6) : 0;
    this.el.hitmark.classList.toggle('res', !!strongest?.resonant);

    /* ---- flashes ---- */
    this.resonanceFlash = Math.max(0, this.resonanceFlash - dt * 3.4);
    this.el.resFlash.style.opacity = this.resonanceFlash * 0.26;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.6);
    this.el.hurtFlash.style.opacity = this.hurtFlash * 0.34;

    // Low health pushes a permanent vignette, so a player at 12 HP knows it
    // without reading a number. Capped, because vignette plus hurt flash plus
    // the death overlay used to stack into an unreadable red wash.
    this.root.querySelector('#vignette').style.opacity = Math.min(
      0.62, (hp < 0.35 ? (0.35 - hp) * 1.9 : 0) + (p.dead ? 0.42 : 0));

    /* ---- directional damage ---- */
    this._updateDamageDirs(dt, p);

    /* ---- wave ---- */
    const d = g.director;
    this.el.waveNum.textContent = d.wave > 0 ? `WAVE ${d.wave}` : 'STANDBY';
    const alive = d.alive;
    this.el.waveLeft.textContent = d.state === 'idle' && d.wave > 0
      ? `NEXT IN ${Math.max(0, d.betweenWaves).toFixed(1)}s`
      : alive > 0 ? `${alive} HOSTILE` : '';

    /* ---- feed ---- */
    let feedDirty = false;
    for (let i = this.feed.length - 1; i >= 0; i--) {
      this.feed[i].life -= dt;
      if (this.feed[i].life <= 0) { this.feed.splice(i, 1); feedDirty = true; }
    }
    if (feedDirty || this._feedLen !== this.feed.length) {
      this._feedLen = this.feed.length;
      this.el.feed.innerHTML = this.feed
        .map((f) => `<div style="color:${css(f.color)};opacity:${Math.min(1, f.life)}">${f.text}</div>`)
        .join('');
    }

    if (p.dead) {
      this.el.dead.querySelector('p').textContent =
        `WAVE ${d.wave} · ${p.stats.kills} STILLED · ${g.resonance.totalResonances} RESONANCES · BEST CHAIN ×${g.resonance.bestChain}`;
    }

    this.el.perf.textContent = `${g.fps} fps · ${g.enemies.length} entities`;
  }

  /**
   * The off-screen echo chevron.
   *
   * Without this, the mechanic is unusable in a vertical arena: your echo
   * spends half its life behind you or two floors down. The chevron pins to
   * the screen edge, points at the echo, and fades when the echo is actually
   * visible on screen so it never clutters a fight you can already read.
   */
  _updateChevron(echo, player) {
    const el = this.el.chevron;
    if (!echo.active || !echo.alive) { el.style.opacity = 0; return; }

    const cam = this.game.camera;
    const v = echo.center.clone().project(cam);
    const behind = v.z > 1;
    const onScreen = !behind && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.9;
    if (onScreen) {
      el.style.opacity = 0;
      return;
    }
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const len = Math.max(Math.abs(x), Math.abs(y)) || 1;
    // Clamp onto the screen edge, keeping the direction.
    x = (x / len) * 0.86;
    y = (y / len) * 0.86;
    const px = (x * 0.5 + 0.5) * innerWidth;
    const py = (-y * 0.5 + 0.5) * innerHeight;
    const ang = Math.atan2(-y, x) - Math.PI / 2;
    el.style.opacity = 0.92;
    el.style.transform = `translate(${px}px, ${py}px) translate(-50%,-50%) rotate(${ang}rad)`;
  }

  _updateDamageDirs(dt, p) {
    let dirty = false;
    for (let i = this.damageDirs.length - 1; i >= 0; i--) {
      this.damageDirs[i].life -= dt;
      if (this.damageDirs[i].life <= 0) { this.damageDirs.splice(i, 1); dirty = true; }
    }
    const yaw = p.move.yaw;
    const html = this.damageDirs.map((d) => {
      const dx = d.pos.x - p.position.x, dz = d.pos.z - p.position.z;
      // Angle relative to facing: 0 is straight ahead, positive is to the right.
      const a = Math.atan2(dx, dz) - (yaw + Math.PI);
      return `<i style="transform:rotate(${a}rad);opacity:${Math.min(1, d.life)}"></i>`;
    }).join('');
    if (dirty || html !== this._dmgHtml) {
      this._dmgHtml = html;
      this.el.dmgDirs.innerHTML = html;
    }
  }
}
