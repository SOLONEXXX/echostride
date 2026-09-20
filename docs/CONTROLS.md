# CONTROLS

Full rationale, because in a game whose core verb is a *button*, the layout is
part of the mechanic.

---

## Keyboard & mouse (default)

### Move
| Action | Key | Note |
|---|---|---|
| Run | `W` `A` `S` `D` | |
| Jump / wall-jump | `Space` | Hold on landing to auto-hop and keep speed |
| Slide | `Ctrl` *(or `C`)* | Only while moving ≥ 5.5 m/s. Adds speed on entry. |
| Sprint | `Left Shift` | |
| Crouch | `Ctrl` | Same key as slide; the game picks by your speed |

### Echo
| Action | Key | Note |
|---|---|---|
| **SHIFT — trade places with your echo** | `Q` | 35 Flux, 0.55 s cooldown |
| **COLLAPSE — detonate your echo** | `F` | 100 Flux. You are alone for 5 s. |
| Echo delay + / − | `=` / `-` | 18 Flux. Locked while observed. |

### Fight
| Action | Key |
|---|---|
| Fire | `Left Mouse` |
| Blade (THRESH) | `V` |
| Reload | `R` |
| Weapons | `1` `2` `3` `4`, `Tab`, or mouse wheel |
| Scoreboard | `B` |
| Pause | `Esc` |
| Restart | `P` |

---

## Why these keys

**SHIFT is `Q`, not a modifier and not a mouse button.**
In a normal fight SHIFT is pressed more often than reload. That gives it three
hard requirements: reachable without the hand leaving `WASD`; never shared with
anything you might hit by accident under pressure; and not on the mouse, where
it would compete with aiming at the exact moment your aim matters most. `Q` is
the only key that satisfies all three. `E` stays free for interaction because a
player who presses the wrong one of those two should not lose their position.

**COLLAPSE is `F`, one key over.**
Adjacent to SHIFT because they are the same family of decision, but a deliberate
stretch of the finger, because COLLAPSE costs you your partner and should never
be pressed reflexively.

**Slide and crouch share `Ctrl`.**
The game chooses by your speed: above 5.5 m/s you slide, below it you crouch.
A separate slide key is a key players forget they have. One key that does the
obviously-correct thing at any speed is one fewer thing to learn and zero lost
expressiveness.

**Jump is forgiving on purpose.** Three separate systems make `Space` feel
honest rather than strict:
- **Coyote time (0.11 s)** — jump still works just after you leave a ledge.
- **Jump buffering (0.13 s)** — pressing just before you land still jumps.
- **Auto-hop** — holding jump on landing hops again, preserving momentum up to
  15.5 m/s. Bunny hopping is a feature here, not an exploit, but it is capped so
  it is a *technique* rather than an unbounded speed exploit.

**The delay dial is on `+`/`-`, deliberately awkward.**
Retuning your echo is a between-fights decision that reshapes your build. It is
locked whenever an enemy has line of sight on you, and putting it on the number
row keeps it off the fingers you fight with.

---

## Gamepad

Standard mapping, fully supported, auto-detected.

| Action | Xbox | PlayStation |
|---|---|---|
| Move | Left stick | Left stick |
| Look | Right stick | Right stick |
| Fire | `RT` | `R2` |
| **SHIFT** | **`RB`** | **`R1`** |
| COLLAPSE | `LT` | `L2` |
| Jump | `A` | `✕` |
| Slide / crouch | `B` | `○` |
| Blade | `X` | `□` |
| Ping | `Y` | `△` |
| Weapon next | `LB` | `L1` |
| Sprint | `L3` | `L3` |
| Reload | `R3` | `R3` |

**SHIFT gets `RB` — the best button on the pad.** It is a movement verb pressed
under fire, so it belongs on a bumper the trigger finger can reach without
leaving the trigger. COLLAPSE goes to `LT` because it is rare and deliberate.

### Stick handling
- **Radial deadzone (16%) with a power curve (2.0).** Precise near centre, fast
  at the edge, and no square-deadzone artefact where diagonals feel different
  from cardinals.
- **Aim friction, not aim magnetism.** Near a target the look speed is damped to
  55% within 3.2°. The game slows your crosshair down; it never moves it for
  you. Friction rewards a player who was already nearly correct. Magnetism
  rewards nobody and teaches nothing.

---

## Accessibility

Implemented:
- **Every binding is remappable** at runtime (`Input.rebind`). Actions are
  abstract throughout the codebase — no system ever asks about a key — so
  remapping is a data change and gamepad parity is free.
- **Slide is press-and-hold or tap**, whichever you use.
- **Invert Y**, separate mouse and stick sensitivity.
- **No flashing beyond one frame.** Muzzle flashes last two frames; nothing in
  the game strobes.
- **Every critical state is redundantly coded** — colour *and* shape *and*
  position *and* sound. The echo is violet, and it also has a chevron, a ground
  ring, a path line, a distance readout and a distinct audio filter. No single
  channel carries information alone.
- **The HUD is DOM**, so it reflows and scales to any resolution without assets.

Designed, not yet implemented:
- Hold-to-toggle for sprint and crouch.
- A high-contrast palette variant for the four state colours.
- Camera-shake and view-bob sliders (both already single constants in
  `Tuning.js`, so this is a settings screen away).
- Subtitled audio cues for the four sounds that carry information: echo online,
  echo lost, Cantor field, Resonant Strike.

---

## The feel constants

Every number that defines how the game feels is in
[`src/core/Tuning.js`](../src/core/Tuning.js) — one file, no exceptions.

| | Value |
|---|---|
| Walk / sprint / crouch | 7.4 / 11.2 / 3.6 m/s |
| Ground accel | 92 (Quake-style directional accel) |
| Air accel | 16, capped at 1.9 m/s along current velocity |
| Gravity | 24 m/s² |
| Jump velocity | 8.4 m/s |
| Slide entry impulse | +5.0 m/s, 1.15 s max |
| Wall-run | 6.0 m/s² gravity, 1.6 s max, 0.45 s same-wall lockout |
| FOV | 92°, +8 sprinting, +12 sliding |
| Wall-run camera tilt | 13° |

The air-acceleration model is deliberately Quake-descended: acceleration is
capped **along the wish direction**, not on total speed. That is precisely why
air-strafing gains speed, and why there is a genuine skill ceiling in simply
moving.
