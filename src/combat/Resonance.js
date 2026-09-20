import { RESONANCE, FLUX, PLAYER } from '../core/Tuning.js';

/**
 * ECHOSTRIDE — Resonance
 *
 * The skill ceiling of the game in one rule:
 *
 *   If you and your echo damage the same enemy within half a second,
 *   that hit is a RESONANT STRIKE: double damage, and it is the only thing
 *   in the game that breaks Monolith plating.
 *
 * Why this is the right central rule:
 *
 *  - It is one sentence. Every player understands it immediately.
 *  - It is *hard*, because your echo's shots were fired three seconds ago.
 *    To resonate on purpose you must have decided, three seconds back, which
 *    enemy you would be shooting now. The mechanic asks you to aim into the
 *    future, which no other shooter asks of you.
 *  - It scales perfectly with skill. A beginner resonates by accident, in a
 *    corridor, against a crowd. An expert resonates on demand, on a named
 *    target, by pre-aiming a lane and coming back to it.
 *  - It gives armour a purpose beyond a bigger health bar. The Monolith is
 *    not "tanky"; it is *immune* until you do the thing the game is about.
 *
 * Stride Rank is the long-form expression of the same idea: chain resonant
 * strikes and you move faster and your echo hits harder, which makes the next
 * resonance easier, which is a feedback loop that rewards competence without
 * ever handing out a power spike the player did not earn. Taking a hit costs
 * exactly one rank -- enough to sting, never enough to erase a good run.
 */

export class ResonanceTracker {
  constructor(events) {
    this.events = events;
    this.chain = 0;
    this.rank = 0;
    this.lastResonanceAt = -999;
    this.totalResonances = 0;
    this.bestChain = 0;
  }

  get rankName() { return RESONANCE.rankNames[this.rank]; }
  get speedBonus() { return RESONANCE.rankSpeedBonus[this.rank]; }
  get echoDamageBonus() { return RESONANCE.rankEchoDamageBonus[this.rank]; }

  /** Progress toward the next rank, 0..1. Drives the HUD arc. */
  get rankProgress() {
    const th = RESONANCE.rankThresholds;
    if (this.rank >= th.length - 1) return 1;
    const lo = th[this.rank], hi = th[this.rank + 1];
    return Math.min(1, Math.max(0, (this.chain - lo) / (hi - lo)));
  }

  _recomputeRank() {
    let r = 0;
    for (let i = 0; i < RESONANCE.rankThresholds.length; i++) {
      if (this.chain >= RESONANCE.rankThresholds[i]) r = i;
    }
    if (r !== this.rank) {
      const up = r > this.rank;
      this.rank = r;
      this.events.emit('rank', { rank: r, name: this.rankName, up });
    }
  }

  onResonance(now) {
    this.chain++;
    this.totalResonances++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.lastResonanceAt = now;
    this._recomputeRank();
  }

  onPlayerHurt() {
    if (this.chain === 0) return;
    const th = RESONANCE.rankThresholds;
    const target = Math.max(0, this.rank - RESONANCE.rankLossOnHit);
    this.chain = th[target];
    this._recomputeRank();
  }

  step(now) {
    // The chain decays if you stop resonating, but only after a generous
    // window -- long enough to reposition, short enough that you cannot park.
    if (this.chain > 0 && now - this.lastResonanceAt > RESONANCE.chainTimeout) {
      this.chain = Math.max(0, this.chain - 1);
      this.lastResonanceAt = now - RESONANCE.chainTimeout * 0.5;
      this._recomputeRank();
    }
  }

  reset() {
    this.chain = 0; this.rank = 0; this.lastResonanceAt = -999;
  }
}

/**
 * The single point through which all damage to enemies flows.
 *
 * Centralising this is what makes resonance possible at all: every weapon,
 * every projectile, every explosion and the echo's shots all arrive here, so
 * the "did both of us just hit this thing" question is asked in exactly one
 * place and can never be forgotten by a new weapon.
 */
export class DamageSystem {
  /**
   * @param {{resonance:ResonanceTracker, events:any, player:any}} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * @param {object} target        an Enemy
   * @param {number} amount        base damage before modifiers
   * @param {'player'|'echo'} src
   * @param {object} opts          {now, headshot, point, weaponId, canResonate}
   * @returns {{dealt:number, resonant:boolean, killed:boolean}}
   */
  apply(target, amount, src, opts) {
    const { now } = opts;
    if (!target || target.dead) return { dealt: 0, resonant: false, killed: false };

    const res = this.ctx.resonance;
    let dmg = amount;
    if (src === 'echo') dmg *= res.echoDamageBonus;

    // --- resonance test -------------------------------------------------
    const other = src === 'player' ? target.lastEchoHitAt : target.lastPlayerHitAt;
    const canResonate = opts.canResonate !== false;
    const resonant = canResonate && other != null && (now - other) <= RESONANCE.window;

    if (src === 'player') target.lastPlayerHitAt = now;
    else target.lastEchoHitAt = now;

    if (resonant) {
      dmg *= RESONANCE.damageMultiplier;
      // Consume the window so one lucky burst cannot chain-resonate off a
      // single echo shot forever. Resonance must cost a fresh pair of hits.
      target.lastPlayerHitAt = null;
      target.lastEchoHitAt = null;
      res.onResonance(now);
      this.ctx.player.addFlux(FLUX.perResonantStrike);
      this.ctx.events.emit('resonance', { target, point: opts.point, amount: dmg });
    }

    if (opts.headshot) dmg *= 1.6;

    // --- armour ---------------------------------------------------------
    // Plating is not a damage reduction, it is a gate. Non-resonant damage
    // chips it; resonant damage shatters it outright. That is the whole
    // reason the Monolith exists as a teaching tool.
    //
    // Plating is also *directional*. An enemy that defines `isFrontal` only
    // protects the arc it is facing, so "get behind it" is a real, findable
    // answer alongside "resonate through it" -- and getting behind something
    // is much easier when a copy of you is holding its attention.
    const platedHere = target.armor > 0
      && (!target.isFrontal || !opts.point || target.isFrontal(opts.point));
    if (platedHere) {
      if (resonant && RESONANCE.breaksArmor) {
        target.armor = 0;
        this.ctx.events.emit('armorBreak', { target, point: opts.point });
      } else {
        const absorbed = Math.min(target.armor, dmg * target.armorAbsorb);
        target.armor -= absorbed;
        dmg -= absorbed;
        if (target.armor <= 0) {
          target.armor = 0;
          this.ctx.events.emit('armorBreak', { target, point: opts.point });
        }
      }
    }

    dmg = Math.max(0, dmg);
    target.health -= dmg;
    target.lastDamagedAt = now;
    target.onDamaged?.(dmg, src, opts);

    this.ctx.player.addFlux(dmg * FLUX.perDamageDealt);
    if (src === 'echo') this.ctx.player.echo.damageDealt += dmg;

    this.ctx.events.emit('damage', {
      target, amount: dmg, src, resonant, point: opts.point, headshot: !!opts.headshot,
    });

    let killed = false;
    if (target.health <= 0) {
      target.health = 0;
      killed = true;
      target.dead = true;
      this.ctx.player.addFlux(FLUX.perKill);
      if (resonant) this.ctx.player.heal(PLAYER.healOnResonantKill);
      this.ctx.events.emit('kill', { target, src, resonant, point: opts.point });
    }
    return { dealt: dmg, resonant, killed };
  }
}
