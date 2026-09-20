# ART DIRECTION — "Chromatic Brutalism"

> Cast ceramic and concrete under hard light, with exactly **four** emissive
> colours in the entire game.

---

## The colour law

This is the most important rule in the project, and it is enforced everywhere
from the shaders to the HUD CSS.

| | Hex | Means | Appears on |
|---|---|---|---|
| **FLUX CYAN** | `#39D7E0` | **You** | Your muzzle flash, your tracers, your Flux bar, your visor, weapon state lights, updrafts |
| **ECHO VIOLET** | `#8B6CF0` | **Your past** | The echo, its path line, its ground ring, the off-screen chevron, LATTICE tethers |
| **OXIDE** | `#E4572E` | **A threat** | Every hostile thing, without exception. Stillness sensors, enemy projectiles, damage indicators. |
| **GOLD** | `#F5C242` | **Resonance** | The instant of a Resonant Strike. Armour shattering. Nothing else. Ever. |

Everything else is material, not signal:

| | Hex | |
|---|---|---|
| Bone | `#EDE6DA` | Ceramic plate, the Strider, weapon shells |
| Ceramic | `#D6CEC0` | Piers, balconies |
| Ash | `#9A958C` | Structural steel, ramps, secondary forms |
| Slate | `#4A4E57` | Walls |
| Graphite | `#23262C` | Floors |
| Void | `#0B0C10` | Sky, background, the bottom of everything |
| Brass | `#B98A4C` | The one hot component per weapon; the bell |

**Why four and not more:** a player who has learned four colours can read any
frame of this game at a glance. In a game where you must simultaneously track
yourself, a violet copy of yourself, and a dozen hostiles across three vertical
tiers, that is not decoration — it is the difference between a mechanic and
noise. Adding a fifth signal colour would cost more than any effect it bought.

---

## Form language

**Monolithic. Cast. Silhouette first.**

- Large planes, hard angles, **no panel lines and no greebles**. If a shape
  needs detail to read, it is the wrong shape.
- **No textures at all.** Every surface in the game is flat colour plus light.
  This began as an engineering constraint (zero asset pipeline, instant load,
  the entire build under 1 MB gzipped, works offline) and turned out to be the
  right artistic answer: brutalist forms read better untextured, and the colour
  law stays uncontaminated.
- **Asymmetry with a reason.** The Strider's left side carries the harness and
  a heavy pauldron; the right is stripped bare because it is the weapon
  shoulder. Symmetrical characters read as props.
- **One curve per scene, maximum.** CARILLON's only curved object is the bell's
  clapper, which is precisely why it reads as the centre of the room.

### Us versus them

| | The Striders | The Stillness |
|---|---|---|
| Symmetry | Asymmetric | Symmetrical |
| Layers | Layered plate, hanging tabard | Sealed, single-form |
| Motion | Always moving; the tabard never settles | Hold still, then commit |
| Colour | Cyan and violet | Oxide |
| Silhouette | Broken ring, wedge head | Cones, slabs, boxes |

The Stillness is an order that wants a moment to happen once and then be over.
Their visual language is the negation of yours, stated in geometry.

---

## Lighting

- **A hard key** (2.35) from high up, plus **one dimmer back-key** (0.75) from
  the opposite side. Pure single-key lighting left every north-facing plane
  identically black, which destroyed the reading of the architecture — and
  readable architecture is how you find your echo.
- **A cool hemisphere fill** (0.85), never flat ambient. Flat ambient is what
  makes untextured geometry look like untextured geometry.
- **ACES filmic tone mapping** at 1.18 exposure. It keeps the bone whites from
  clipping flat under the hard key while leaving the blacks genuinely black,
  which is what this art direction lives on.
- **Low metalness on the brass.** There is no environment map in this game, and
  a physically-correct high-metalness surface with nothing to reflect renders as
  a black hole. Brushed numbers read as brass; correct ones read as a bug.

---

## The echo shader

The hardest rendering problem in the project. The echo has to satisfy three
contradictory requirements at once:

1. Instantly distinguishable from you *and* from enemies → **violet**
2. Clearly **not solid** — it is a replay, it does not block you
3. Still readable at 60 m across a bright arena

Solid transparency fails (3). Pure wireframe also fails (3). The answer is
**additive fresnel**:

- The silhouette edge blazes (`pow(1 - dot(N, V), 2.2)`), the interior stays
  open. You can see through your own past self, and still find it across the
  map.
- **World-space scanlines**, not screen-space. They stay put as the echo moves,
  so it reads as a *projection of a recording* rather than as painted-on
  texture.
- A rare horizontal dropout band: the tape glitching.
- Opacity tracks the echo's health, so a dying echo is visibly dying.

Source: [`makeEchoMaterial`](../src/engine/Materials.js).

---

## Sound

Every sound in this game is **synthesised at runtime**. There is not one audio
file in the repository.

The same opposition as the visuals, in the frequency domain:

- **Your sounds are struck** — short, bright, metallic, hard attack, long ring.
  Bells. The whole game is set in a carillon.
- **Their sounds are blown** — noise-based, low, no clear pitch, and they end
  abruptly.
- **Your echo's sounds are yours again, filtered** — the same synthesis through
  a lowpass and a reverb tail, so your past self is audibly *further away in
  time*. Players reliably report being able to hear which of them fired without
  looking, which was the entire goal.

Two deliberate compositional choices:

- **SHIFT is the only sound in the game that goes up.** A bell struck, with a
  rising partial layered under the falling one.
- **Resonance is a perfect fifth** (E5 + B5 + E6) — the only consonant interval
  in the whole sound design. A Resonant Strike literally *sounds correct*.

Source: [`src/engine/Audio.js`](../src/engine/Audio.js).

---

## UI

Hairlines, monospace, no rounding beyond 2 px, no skeuomorphism, no gradients
except as signal. The HUD is DOM rather than sprites, so it reflows and scales
to any resolution with zero assets.

Layout priority is set by one question: **what kills the player?**

In this game you rarely die from not knowing your health. You die from losing
track of your other self. So the echo panel takes the centre-bottom position —
nearest the crosshair — with its own colour, its own chevron, and a live
distance readout. Health is small, in a corner.

Every critical state is **redundantly coded**: colour *and* shape *and* position
*and* sound. No single channel ever carries information alone.

---

## The name

*Carillon*: a set of bells played from a keyboard, where every note you strike
keeps ringing while you play the next one. Strike a chord and you are
accompanying yourself with sounds you made seconds ago.

That is the game.
