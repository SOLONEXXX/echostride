# ECHO-SHIFT — the mechanic

> The whole game is one sentence: **a copy of you from three seconds ago fights
> at your side, and you can trade places with it.**

Everything else in ECHOSTRIDE — every weapon, every enemy, every metre of every
map — is downstream of that sentence. This document is the reasoning.

---

## 1. Why this mechanic

FPS design has spent thirty years perfecting two loops and never fusing them.

| Loop | Best expression | What it asks of you |
|---|---|---|
| **Aggression economy** | DOOM Eternal | Use the right tool, right now, or starve |
| **Movement expression** | Titanfall 2, Apex | Go fast, go beautifully, never stop |
| **Style pressure** | ULTRAKILL, DMC | Be creative or be boring |
| **Sandbox reading** | Halo | Know the whole arena, exploit the whole arena |

They are usually bolted together: a movement game with a damage economy stapled
on, or an aggression game that also lets you slide. The seams show, because each
system answers a *different* question about the same thirty seconds.

ECHO-SHIFT collapses all four into one question:

> **What will you have wanted to have done, three seconds from now?**

- It is an **aggression economy**, because your echo only shoots if you shot.
- It is **movement expression**, because your echo only goes where you went —
  and SHIFT is a teleport whose destination you chose three seconds ago.
- It is **style pressure**, because Resonance rewards choreography over volume.
- It is **sandbox reading**, because you must hold two positions in your head.

One verb. Four loops. That is the whole pitch.

---

## 2. The five rules

### R1 — The echo exists

A translucent violet Strider follows your recorded path, `delay` seconds behind.
It reproduces your position, your aim and your trigger pulls. It deals **60% of
your damage**, consumes **no ammo**, has **70 HP**, and **can die**.

Implementation: [`src/player/Echo.js`](../src/player/Echo.js),
[`src/player/Recorder.js`](../src/player/Recorder.js).

**The 60% rule.** This number was the single hardest call in the design.

| Echo damage | What happens |
|---|---|
| 30% | The echo is decoration. Players ignore it and the game is a mediocre shooter. |
| 50% | Noticeable, never decisive. Players thank it but do not plan around it. |
| **60%** | **You can win a fight you could not win alone — but only if you set it up.** |
| 75% | Players stop aiming carefully, because the echo covers their mistakes. |
| 100% | The game plays itself. Optimal strategy becomes "spray, then leave". |

60% is where the echo becomes a *partner* rather than a *bonus*: strong enough
that ignoring it is a losing strategy, weak enough that it cannot carry you.

### R2 — SHIFT trades places

`Q` teleports you to your echo — which is to say, to where **you** stood
`delay` seconds ago — and you inherit the velocity you had then. A shift taken
mid-sprint keeps the sprint. It costs 35 Flux and has a 0.55 s cooldown.

**The subtle part, and the best part:** the tape is not cleared. Your recent
history stays recorded, so after the swap your echo keeps walking *forward*
along the route you just abandoned. One button turns one body into a genuine
pincer:

```
   t = 0s     YOU ────────────────────────▶ (running down the east lane)
                ·  ·  ·  ·  ·  ·  ·  ·  ·
   t = 3s                              YOU ◀── press Q
              ECHO ───────────────────────▶  (now runs the east lane for you)
               │
               └─ and YOU go west instead.
```

You have not escaped. You have **forked**. The lane still gets covered; it just
is not you covering it any more.

Implementation: [`Player._teleportToEcho`](../src/player/Player.js).

### R3 — Resonance

If you and your echo damage the **same enemy within 0.5 s**, that hit is a
**RESONANT STRIKE**: ×2 damage, and it is the only thing in the entire game
that shatters Monolith plating.

This is the skill ceiling. To resonate *on purpose* you must have decided, three
seconds ago, which enemy you would be shooting now. The game asks you to aim
into the future, which is a thing no other shooter asks of you.

It scales perfectly across skill levels, which is rare:

- A beginner resonates **by accident**, in a corridor, against a crowd — and
  the game lights up gold and teaches them the word.
- An intermediate player resonates **by habit**: they learn to re-check lanes.
- An expert resonates **on demand, on a named target**, by pre-aiming a lane
  and returning to it on the beat.

Chaining resonant strikes raises your **Stride Rank**
(DRIFT → STRIDE → CADENCE → HARMONY → RESONANT → SINGULAR), which increases
movement speed and echo damage, which makes the next resonance easier. Taking a
hit costs exactly **one rank** — enough to sting, never enough to erase a run.
Full resets punish learning; single-step decay teaches recovery.

Implementation: [`src/combat/Resonance.js`](../src/combat/Resonance.js).

### R4 — COLLAPSE

`F` destroys your echo in a temporal singularity: it pulls enemies in and deals
damage scaled by **how much damage that echo dealt while it was alive**
(55 + 0.45 × echo damage, capped at 420). Then you are **alone for five
seconds**.

Two design jobs, one button:

1. It makes a good echo *bankable*. Your ultimate is not a cooldown; it is a
   receipt for a partner who fought well.
2. It makes the game's central relationship **losable by choice**. The screen
   desaturates, the music drops to a single held note, and for five seconds you
   remember what an ordinary shooter feels like.

### R5 — PHASE-CATCH

If a hit would kill you, and your echo is alive, and you hold 50 Flux, and the
20 s cooldown is up: your past self catches you. You are yanked back to where
you were, at 1 HP, with a second of invulnerability.

Every game needs a comeback moment. Most hand one out. This one has to be
**paid for several seconds in advance**, by keeping your echo alive when it
would have been easier to spend it. A revive you earned in the past is the only
revive this game could honestly have.

---

## 3. The delay dial

You can tune `delay` between **1.5 s and 5.0 s** (`+` / `-`). It costs Flux,
and it is **locked while an enemy has line of sight on you** — otherwise it
degenerates into a free reposition button.

This one number is the deepest build choice in the game:

| Delay | The echo is… | Plays like |
|---|---|---|
| **1.5 s** | Almost on top of you | Near-double DPS in your face. Brutal close range, no flanking. |
| **3.0 s** | A room away | The default. Balanced pincer range. |
| **5.0 s** | A second front | Area denial. You and your echo fight in different places. |

It also **retunes the KETTLE**, whose fuse always equals your delay (see below).
Changing one number changes your weapon, your spacing and your escape route at
the same time — which is what a build system should do and almost never does.

---

## 4. The readability crisis

The first playable version of this mechanic was **incomprehensible**, and the
fix is the most important usability work in the project.

The problem: an echo three seconds behind you in a vertical arena is, most of
the time, *somewhere you are not looking*. Players reported the echo as
"random", "buggy", and "it shoots sometimes". They were not wrong. They simply
could not see it, so the mechanic may as well have been a dice roll.

Four fixes, in order of how much they mattered:

1. **The path preview.** The echo draws the route it is *about to walk* as a
   violet line on the floor — which is the route you just walked. Being able to
   see your echo's next three seconds turned the mechanic from confusing into
   strategic overnight. ([`Echo._updateTrail`](../src/player/Echo.js))
2. **The off-screen chevron.** A violet arrow pinned to the screen edge, always
   pointing at the echo, fading out the moment the echo is genuinely visible.
   ([`Hud._updateChevron`](../src/ui/Hud.js))
3. **The colour law.** Cyan is you. Violet is your past. Oxide is a threat.
   Gold appears *only* at the instant of a Resonant Strike. Four colours, no
   exceptions, anywhere in the game. A player who has learned them can read any
   frame at a glance.
4. **The audio split.** The echo's weapons are your weapons run through a
   lowpass and a reverb tail — audibly *further away in time*. Players can hear
   which of them fired without looking.

The lesson generalises: **a mechanic the player cannot perceive is not a
mechanic, it is noise.** Half the work on a novel system is not the system.

---

## 5. Why replay state, not replay input

The recorder stores **positions**, not **inputs**.

Replaying inputs would require the simulation to be bit-for-bit deterministic
forever. One changed collision epsilon, one floating-point difference between
two CPUs, and your own past self walks into a wall you went around. Replaying
positions cannot desync, because there is nothing to re-simulate. The echo is a
tape, not a second simulation.

The cost is memory, and the cost is nothing: 360 frames × ~20 numbers = the
"expensive" core mechanic of this game uses less memory than one texture would.

Two rules keep the tape honest:

- **Fixed timestep (60 Hz).** The recorder indexes directly by tick count
  instead of searching by timestamp, and the echo's replay is frame-rate
  independent.
- **Discontinuities are marked.** When you SHIFT, your position jumps. The
  `teleport` flag makes the echo perform *the same jump* at the same point in
  its own timeline, instead of smearing a 30 m interpolation across the arena.
  That is both the correct behaviour and the best-looking moment in the game.

Shots use a **recorded seed**, so the echo's shotgun fires the same nine pellets
yours did. `Math.random()` in the fire path would desync your past from you in a
way no player could ever diagnose.

---

## 6. Tuning table

All of these live in [`src/core/Tuning.js`](../src/core/Tuning.js) and nowhere
else, so balancing is a single-file activity.

| Constant | Value | Why |
|---|---|---|
| `ECHO.damageScale` | 0.60 | The 60% rule, above |
| `ECHO.maxHealth` | 70 | Dies to sustained attention, survives a stray shot |
| `ECHO.regenPerSecond` | 9 | A bad exchange must not snowball into an unwinnable fight |
| `ECHO.respawnTime` | 4.0 s | Long enough to hurt, short enough not to end the run |
| `SHIFT.fluxCost` | 35 | Roughly three shifts per full bar: a tactic, not a reflex |
| `SHIFT.iFrames` | 0.22 s | A shift into a crossfire is a read, not a coin flip |
| `RESONANCE.window` | 0.50 s | Tight enough to be a skill, loose enough to be learnable |
| `RESONANCE.damageMultiplier` | 2.0 | Big enough to restructure a fight around |
| `RESONANCE.rankLossOnHit` | 1 rank | Teaches recovery instead of punishing learning |
| `FLUX.perDamageDealt` | 0.16 | Aggression funds the mechanic |
| `FLUX.speedGainPerSecond` | 5.5 | So does speed. Standing still funds nothing. |

---

## 7. What was cut

Honest record of ideas that did not survive contact with the prototype.

- **Two echoes at once.** Tried at 2 s and 4 s (it survives as the ORRERY
  Strider concept in [CHARACTERS.md](CHARACTERS.md)). Unreadable. Three violet
  bodies is not three times the tactics, it is zero tactics and a headache.
- **The echo obeys orders.** A "focus fire here" ping. It broke the premise
  instantly: the moment the echo can be *commanded*, it stops being your past
  and becomes a pet, and every interesting decision evaporates.
- **SHIFT restores health and ammo.** Made SHIFT strictly correct at all times.
  A button you always press is not a decision.
- **Rewinding the echo.** Scrubbing the tape backwards. Fun for ten minutes,
  then it became the only strategy, because undoing a mistake beats not making
  one.
- **Enemy echoes everywhere.** Survives in exactly one enemy — the HUSH — which
  is the right dose. Universal enemy echoes doubled the visual noise and halved
  the clarity of the player's own.
