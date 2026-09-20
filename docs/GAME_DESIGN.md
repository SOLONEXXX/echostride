# ECHOSTRIDE — Game Design Document

*Version 0.4 · playable prototype*

---

## 1. One paragraph

ECHOSTRIDE is a first-person shooter built around a single idea: **a copy of
you from three seconds ago fights at your side, and you can trade places with
it.** The echo walks where you walked and shoots what you shot. It deals real
damage and it can really die. Press `Q` and you snap back to where you stood
three seconds ago while your echo carries on down the route you just abandoned.
Hit the same enemy as your echo within half a second and you land a **Resonant
Strike** — double damage, and the only thing in the game that breaks heavy
armour. Every weapon, every enemy and every metre of every map exists to make
you better at fighting alongside your own past.

---

## 2. What it is developing from, and how

The user brief was: take FPS games that already exist and develop them
*optimally* further. Here is the honest accounting of what was taken and what
was changed.

| Taken from | What | What ECHOSTRIDE does differently |
|---|---|---|
| **Quake** | Directional air acceleration, strafe-jumping, timed map control | Kept almost verbatim, because nothing since has improved on it. Air accel is capped along the *wish direction*, not on total speed, which is why the skill ceiling on simply moving is real. |
| **Halo** | Sandbox variety, the 30-second loop, a weapon that is *situationally* best | Every weapon's situational identity is defined by its relationship to the echo rather than by an enemy-type rock-paper-scissors chart. |
| **Titanfall 2 / Apex** | Slide, wall-run, slide-hop chaining; movement as the joy | Kept, and then made *consequential*: the route you take is the route your echo will take, so sloppy movement produces a sloppy ally. |
| **DOOM Eternal** | Resource starvation forcing tool rotation; aggression as survival | Replaced the three-resource triangle (chainsaw/glory kill/flame) with **one** resource, Flux, earned by damage and by speed. One legible bar instead of three cooldowns and an ultimate meter. |
| **ULTRAKILL / DMC** | A style meter that rewards creativity | Replaced "be varied" with "be *coordinated*". Stride Rank counts Resonant Strikes — a skill with an objectively correct execution, not a subjective flourish. |
| **SUPERHOT** | Time as a mechanic you think in | Made it real-time. SUPERHOT's insight is that time is a resource; its cost is that the game is a puzzle, not a shooter. ECHOSTRIDE keeps the temporal thinking at full speed. |

**The synthesis claim.** Those games each perfected a different loop and then
bolted the others on. ECHOSTRIDE collapses four loops into one question —
*what will you have wanted to have done, three seconds from now?* — and lets
aggression, movement, style and sandbox reading all be answers to it. That is
the entire design thesis, and everything else in this document is a
consequence. The full argument is in
[ECHO_SHIFT.md](ECHO_SHIFT.md).

---

## 3. The core loop

```
          ┌──────────────────────────────────────────────┐
          │                                              │
          ▼                                              │
   MOVE FAST ──▶ earns FLUX ──▶ spend on SHIFT ──▶ new angle
      │                                              │
      │                                              ▼
      └──▶ your route becomes ──▶ ECHO ──▶ shoots what you shot
                                    │            │
                                    ▼            ▼
                              draws aggro   same target as you
                                    │        within 0.5 s
                                    │            │
                                    │            ▼
                                    │      RESONANT STRIKE
                                    │      ×2 dmg · breaks armour
                                    │            │
                                    │            ▼
                                    │      STRIDE RANK ▲
                                    │      faster · echo hits harder
                                    │            │
                                    └────────────┘
```

Three timescales run at once, which is what gives the game its texture:

- **0.2 s** — aim, fire, dodge
- **3.0 s** — the echo delay: what am I setting up?
- **30 s** — the wave: what does this arena look like, where is the Cantor?

---

## 4. Systems

### 4.1 Flux — one resource
Earned by dealing damage (0.16/dmg), by kills (+9), by Resonant Strikes (+7),
and by **moving fast** (5.5/s at sprint speed). It bleeds slowly if you are slow
and out of combat. Spent on SHIFT (35), COLLAPSE (100), PHASE-CATCH (50) and
retuning your delay (18).

One bar replaces ammo economy, ability cooldowns and ultimate charge. The game
pays you to stay in motion and to stay aggressive, which is what every good
shooter wants anyway — here it is stated directly instead of implied through
three separate systems.

### 4.2 Health
**No passive regeneration.** Health comes from Resonant kills (+6) and armour
from COLLAPSE (+25). This keeps you pushing forward instead of waiting behind a
crate, and it makes the core mechanic the *healing* mechanic too.

### 4.3 Stride Rank
DRIFT → STRIDE → CADENCE → HARMONY → RESONANT → SINGULAR, driven by consecutive
Resonant Strikes. Higher rank = faster movement (up to ×1.18) and harder-hitting
echo (up to ×1.45), which makes the next resonance easier. Taking a hit costs
**one rank**, not the whole chain: full resets punish learning, single-step
decay teaches recovery.

### 4.4 The Director
Waves are a **curriculum**, not a difficulty curve — one new idea per wave, then
a wave to practise it. Nothing is randomised until wave 7, because a curriculum
that shuffles sometimes teaches the final lesson first. Full table in
[CHARACTERS.md](CHARACTERS.md#wave-composition-is-a-curriculum).

---

## 5. Difficulty and the skill curve

The game teaches through **enemies, not tutorials**. Each enemy type is
unbeatable in a boring way if you ignore its lesson, which means the lesson is
not optional and also never explained.

| Hours | What a player is doing |
|---|---|
| 0–0.5 | Shooting. Noticing a violet thing that also shoots. Resonating by accident. |
| 0.5–2 | Using SHIFT as an escape. Learning that Wardens chase the echo. First deliberate resonance. |
| 2–6 | Meeting the MONOLITH and being *forced* to resonate on purpose. SHIFT becomes an attack. |
| 6–20 | Pre-aiming lanes for a future self. Chaining rank. Using the delay dial as a build. |
| 20+ | Choreography: planning three seconds of movement so that the echo covers an angle you are deliberately leaving open. |

The ceiling is high because the hard skill — aiming at a target you will be
fighting in three seconds — is *continuous*. There is no point at which you have
"learned" it; you only get more accurate.

---

## 6. Modes

**Implemented:** endless wave survival on CARILLON.

**Designed:**
- **Movement** — a time trial. No enemies; the echo is your own ghost and the
  gates open only when *both* of you have passed them.
- **Choir** — one arena, one Monolith, one bullet in every magazine. You cannot
  kill it alone; you must land a resonance. A three-minute exam on the thesis.
- **Duet (co-op)** — two players, four bodies. Untested and probably chaos, but
  the version where your teammate can SHIFT to *your* echo is worth prototyping.
- **Stillness (PvP)** — deliberately not planned. In a competitive setting the
  echo becomes information the enemy reads, and the mechanic inverts from an
  ally into a liability. That is an interesting game; it is not this one.

---

## 7. Technical design

| Decision | Why |
|---|---|
| **Three.js, browser, no engine** | The game loads from a link in under a second. For a game whose pitch requires *experiencing* the mechanic, a 4 GB download would be the design's biggest enemy. |
| **Zero assets** | No textures, no models, no audio files. Everything is procedural geometry and synthesised sound. The build is one JS file. |
| **Fixed 60 Hz simulation** | Required by the recorder: it indexes frames by tick count, and the echo's replay must be frame-rate independent. |
| **Replay state, not input** | Replaying inputs needs eternal bit-exact determinism. Replaying positions cannot desync. See [ECHO_SHIFT.md §5](ECHO_SHIFT.md#5-why-replay-state-not-replay-input). |
| **AABB brush collision** | Fast, exact, debuggable, and it gives *predictable* wall-run surfaces. Curved collision is where movement shooters go to die. |
| **Geometry and collision from one call** | Not a convenience — a correctness guarantee. Art and collision cannot drift apart if they are the same call. |
| **All tuning in one file** | `src/core/Tuning.js`. Balancing is a single-file activity, and the design docs quote the constant names directly, so they cannot go stale silently. |

### Testing
A headless smoke test ([`tools/smoke.mjs`](../tools/smoke.mjs)) boots the real
production build in Chromium, drives it with synthetic input, and asserts that
**the mechanic actually happened**: an echo came online, SHIFT landed exactly on
it, both selves dealt damage, a Resonant Strike fired and shattered Monolith
plating, all four weapons worked, and COLLAPSE consumed the echo.

It is not a unit-test suite. It answers the only question that matters for a
game — *is the thing playable right now* — and it has already caught two real
bugs that no amount of reading would have: a pause overlay covering the main
menu on load, and an arena boundary a sprinting player could walk straight
through.

---

## 8. Open problems

Honest list of what is not solved.

1. **The three-second horizon is genuinely hard to teach.** The path preview and
   the chevron fixed *perception*; they did not fix *planning*. A player's first
   two hours are spent reacting to their echo rather than directing it, and the
   game currently has no gentle on-ramp for that transition beyond the enemy
   curriculum.
2. **COLLAPSE is under-used in practice.** Players hoard it. The five-second
   lockout reads as too expensive even when the maths favours spending it. The
   likely fix is feedback, not numbers: the payoff needs to be more legible in
   the moment.
3. **Two echoes is unsolved.** ORRERY was cut for readability, but the fantasy
   of conducting several past selves is the most interesting unexplored space
   the mechanic has.
4. **Delay retuning is fiddly.** Two keys and a Flux cost for a build-defining
   decision. A radial menu at a checkpoint would probably be better than a dial
   during play.
5. **No boss yet.** THE CHOIRMASTER is designed and unimplemented, and until it
   exists the claim that the mechanic scales to a set-piece is untested.

---

## 9. Document map

| | |
|---|---|
| [ECHO_SHIFT.md](ECHO_SHIFT.md) | The mechanic: rules, tuning, what was cut, and why the readability work mattered more than the mechanic itself |
| [CHARACTERS.md](CHARACTERS.md) | The Strider, the five harness tunings, the Stillness bestiary |
| [WEAPONS.md](WEAPONS.md) | The arsenal and its Echo Synergies |
| [MAPS.md](MAPS.md) | The three laws of an ECHOSTRIDE map; CARILLON in detail |
| [CONTROLS.md](CONTROLS.md) | Full bindings for keyboard and gamepad, with rationale |
| [ART_DIRECTION.md](ART_DIRECTION.md) | Chromatic Brutalism: the colour law, form language, sound |
