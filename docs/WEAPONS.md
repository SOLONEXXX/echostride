# WEAPONS

![The arsenal](shots/gallery-arsenal.png)

> **The design rule for every weapon in this game:**
> a weapon must be good on its own, **and** it must mean something *different*
> when your echo is holding it.

That second clause is what stops the echo from being a damage multiplier bolted
onto an ordinary shooter. Each weapon has an **Echo Synergy** that only fires on
the interaction between a shot you take now and a shot you took three seconds
ago — and each one asks a different question:

| | The question it asks |
|---|---|
| **SPLITTER** | Can you hit the same target twice, three seconds apart? |
| **REND** | Can you get to the *other side* of a target in three seconds? |
| **KETTLE** | Can you predict where a fight will be in three seconds? |
| **LATTICE** | Can you plan a *shape* instead of a shot? |
| **THRESH** | Can you give your past self a gift? |

Four different skills, one mechanic. Definitions:
[`src/weapons/Arsenal.js`](../src/weapons/Arsenal.js).
Models: [`src/engine/WeaponMesh.js`](../src/engine/WeaponMesh.js).

---

## Shared design language

Four rules keep very different guns reading as one armoury:

1. A **bone-white cast ceramic shell**, in slabs, with no panel lines.
2. **Exactly one brass component** per weapon — the part that gets hot.
3. **One cyan element that is functional**: it shows the weapon's state.
   Ammunition is legible off the model, so a player whose eyes are on an enemy
   can still see how much is left.
4. **Flat-bottomed.** Every gun in this game looks like it could be set down.

And one framing rule: the view model sits low and to the right and occupies
**under a fifth of the screen**. A view model that fills the frame competes with
the enemy you are trying to shoot — and in a game where you also have to track a
violet copy of yourself, screen space is the scarcest resource there is.

---

## 1 · SPLITTER Mk.II — Dual-Phase Rifle
**17 dmg · 3-round burst · 320 RPM · 27/162 · 1.45 s reload**

### Echo Synergy — CONVERGE
A round that lands on a target your echo has hit within the last **0.35 s**
braids into a lance and **pierces the enemy behind it**.

### Why a burst
Three rounds is long enough to reward tracking and short enough that the burst
*ends*. That ending is the point: it creates a rhythmic gap, and you fill the
gap with movement. Fully automatic weapons remove the gap, and with it the
reason to move at all.

### The model
A slab-sided receiver with a brass heat-sink comb along the top, and a **barrel
that splits into two prongs** joined by a yoke. The split barrel is the read,
and it is a literal picture of the game's premise: one weapon, two paths.

---

## 2 · REND — Harmonic Shotgun
**9 pellets × 11 dmg · 96 RPM · 6 shells · shell-by-shell reload**

### Echo Synergy — STANDING WAVE
If your echo hit the same target within 0.6 s **from an angle greater than 110°
to your own shot**, the pellets resonate: **+80% damage on every pellet**.

This is the best spatial teacher in the arsenal. To use REND at its ceiling you
must think about where you will be relative to where you *were* — which is the
sentence the whole game is built on. Flank yourself.

REND also refunds Flux on a kill: it is the aggression engine, so it pays you
for being where the danger is.

### Reload
Shell by shell, and **cancellable by firing**. The classic pump-shotgun tension
of "do I top up or do I commit" costs nothing to implement and adds a real
decision to every lull.

### The model
Twin drums stacked off-axis, one brass end cap, and a **rectangular muzzle**.
Round muzzles read as "gun"; a rectangle reads as "this fires a wave", which is
exactly what REND does.

---

## 3 · KETTLE — Delayed Charge Launcher
**96 dmg · 5.2 m splash · 68 RPM · 4 charges · sticky**

### Echo Synergy — SYNCHRONY
**The fuse always equals your echo delay.** Not a number a designer picked —
the actual live value of `ECHO.delay`. Whatever you dial your echo to, the
KETTLE re-tunes itself to match, so a charge detonates at the instant your echo
walks into the room. Your echo's own charges land on the same beat one delay
later: seed a room once, it burns twice.

This is the weapon that *is* the mechanic. It is also the only weapon in the
game whose identity changes completely based on a setting:

| Your delay | What the KETTLE becomes |
|---|---|
| 1.5 s | A brutally fast breaching tool |
| 3.0 s | A grenade launcher with a tell |
| 5.0 s | Area denial you set up a corridor ahead |

### The model
Stubby, fat-barrelled, with an oxide muzzle ring — the gun says "slow arcing
projectile" before you fire it once. Its brass component is a **countdown drum
that actually rotates with the fuse**: the only diegetic readout in the game, on
the weapon that most needs one. Charges stuck to the floor also pulse faster as
their fuse burns down, so the detonation timing is readable off the arena floor
without ever looking at the HUD.

---

## 4 · LATTICE — Tether Rifle
**34 dmg · 74 RPM · 8/40 · 40% bleed · 7 s tethers**

### Echo Synergy — WEB
Every hit **links the target to your previous one**. Damage to any tethered
enemy bleeds 40% along every link.

The synergy required no new rule at all, which is the most elegant thing in the
arsenal: **your echo is also laying tethers.** The web you are fighting inside
is always three seconds larger than the one you have personally drawn.

LATTICE does mediocre damage on purpose. It turns the arena into a graph problem
you solve while sprinting.

### The model
The instrument of the set: a long open truss of four thin rails with spacers
instead of a barrel, a brass collar, and a **violet prism** at the muzzle.
Violet, not cyan — LATTICE is the one weapon that works on the echo's side of
the colour line, and the design admits it.

---

## 5 · THRESH — Kinetic Blade *(always in your other hand)*
**58 dmg · 3.1 m · 0.52 s cooldown · 0.24 s parry window**

### Echo Synergy — RETURN
A parried projectile is not destroyed. It is **pushed into your echo's
timeline** and comes back one delay later, aimed at whoever fired it.

Parrying is how you give your past self a weapon. It is the only mechanic in the
game that sends something *forward* in time rather than receiving it, and it
closes the loop the rest of the arsenal opens.

### The model
No guard, no fuller, no point: a flat ceramic wedge that **widens toward the
tip**. It is a tool for displacing things and it looks like one.

---

## 6 · CHORUS — Loop Cannon *(designed, not implemented)*
The rare heavy. It cannot be fired until it is charged, and it charges **only
from damage your echo deals** — so it is a weapon you load by fighting well
several seconds ago. When it fires, every enemy killed by the beam for the next
`delay` seconds spawns a hostile-to-the-Stillness echo of itself.

It is deliberately absurd, and it is the one weapon whose ammunition is *your
own competence*.

---

## Balance summary

| Weapon | DPS (sustained) | Burst | Range | Role |
|---|---|---|---|---|
| SPLITTER | ~163 | 51 | 60–150 m falloff | Generalist, always correct |
| REND | ~158 | 99 (297 w/ STANDING WAVE) | 7–24 m falloff | Deletes things you are standing next to |
| KETTLE | ~109 | 96 + splash | arc, fuse-limited | Space control, on a timer you set |
| LATTICE | ~42 direct | 34 | effectively unlimited | Force multiplier on crowds |
| THRESH | ~112 | 58 | 3.1 m | Punish, parry, panic |

Falloff is linear between the two listed ranges and floors rather than reaching
zero, so no weapon ever becomes literally useless — it just becomes the wrong
choice, which is a decision rather than a punishment.

Every number above lives in [`src/weapons/Arsenal.js`](../src/weapons/Arsenal.js)
and nowhere else.
