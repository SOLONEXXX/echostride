# MAPS

![CARILLON plans](shots/gallery-carillon.png)

---

## The three laws of an ECHOSTRIDE map

This game has a level-design problem no other shooter has: **the player needs
to be able to see their echo.** An arena that hides it behind the first corner
turns the core mechanic into guesswork. Three rules follow, and every map in
this game obeys all three.

### Law 1 — No dead ends
Every space has at least two exits. Your echo is going to walk your route again,
three seconds later, without thinking. A route that ends in a corner is a route
that gets your echo killed in a corner — and unlike you, it cannot change its
mind.

This makes ECHOSTRIDE maps **loops all the way down**. Even the vertical
connections loop: there is never only one way back up.

### Law 2 — The shaft
Every map has one open volume that most of the level can see into. Wherever you
are, there is a good chance you can glance across the void and find your violet
twin. It is the readability backbone, and it is worth losing some cover for.

### Law 3 — Three-second geometry
**The distance between meaningful positions is tuned so a sprinting player
covers it in roughly one echo delay.**

This is the rule that makes ECHOSTRIDE maps different from every other arena
shooter, and it is measurable. At the default 3.0 s delay and 11.2 m/s sprint,
one delay is **33.6 metres**. So the map is laid out on a ~33 m module:

- CARILLON's ramp-to-balcony run is **~31 m**.
- Opposite bell platforms are **~40 m** apart (a delay plus a beat).
- Piers sit on a **19 m** ring: half a delay, so a pier-to-pier reposition puts
  your echo arriving as you settle.

The consequence in play: sprint a lane and turn around, and your echo arrives at
the lane's far end exactly as you line up the shot. **The map is measured in
echo delays**, not in metres. Change the delay dial and you are, in a real
sense, playing a different map.

---

## CARILLON — the first arena *(implemented)*
*Bell tower, third movement. 64 m across, three tiers, one shaft.*

![Arena](shots/02-arena.png)

A bell tower with the bells still in it.

### Structure

| Tier | Height | What it is |
|---|---|---|
| **0** | 0 m | The floor: eight piers on a 19 m ring, scattered waist-high cover, two long stair-ramps, and the updraft at dead centre |
| **1** | 7 m | The balcony ring at radius 26.5 m — **with four gaps** |
| **2** | 14.5 m | Four separate bell platforms, joined by 2.6 m beams |

### The four decisions that make it work

**1. The balcony has gaps.**
The ring is a loop only if you can cross 5.5 m of nothing. You can do that three
ways: jump it, wall-run the outer wall past it, or drop to the floor and take
the updraft back up. *Three answers to one question* is the ratio every obstacle
in this game aims for — it keeps the skill floor low without lowering the
ceiling.

**2. The top tier is islands, not a loop.**
Tier 2 deliberately breaks Law 1, and it is the only place that does. Up there
you get the best sightlines in the arena and the worst escape routes. Height is
a genuine trade rather than a free advantage, and players who camp a platform
die to Wardens that took the updraft — which is exactly the correction the
design wants to deliver.

**3. The bell is hard cover in the middle of the only open sightline.**
Nine metres across, hung from the ceiling at 11.5 m. It breaks the shaft into
readable halves so the map's best sightline is not a sniping gallery, and it
gives the central updraft something to hide behind. It is also the only curved
shape in the level (its clapper), which is why it reads as the centre of the
room without any signposting.

**4. Cover never sits on the pier ring.**
Waist-high cover is placed deliberately *off* the 19 m pier ring. Overlapping
soft cover with hard cover produces one super-position that every fight
collapses onto. Separating them means the strong position for a duel is never
the strong position for a retreat.

### Wall-running
Twelve buttresses on the inner face of the outer wall give flat, predictable,
axis-aligned surfaces at a constant radius. Curved collision is where movement
shooters go to die — every wall in ECHOSTRIDE is flat, and you can feel it in
your hands. Waist-high cover is tagged `nowallrun`, so you can never wall-run a
crate.

### Spawning
Sixteen spawn points, weighted: eight on the ground ring, four on the balcony,
four on the bell platforms. Two hard rules, both learned by being cheap-shotted
in playtest:
- never within **11 m** of the player
- never inside the player's view cone at short range

Enemies should arrive **from** somewhere, not appear. Placement is also
type-aware: Psalms prefer height and sightlines, Monoliths never spawn on a
beam, Wardens want the floor.

Implementation: [`src/world/maps/carillon.js`](../src/world/maps/carillon.js).

---

## The other four *(designed, not implemented)*

Each exists to stress a different part of the mechanic, and together they cover
the whole delay dial.

### THE LONG NOW
*A single 400 m colonnade. One axis, ribbed cover, no verticality.*

The map that teaches **long delay**. At 5.0 s your echo is a genuinely separate
front 56 m down the hall, and the KETTLE's fuse stretches to match, turning it
into artillery you walk ahead of. There is nowhere to hide and nothing to flank
— only the question of where the fight will be in five seconds.

### SALT WORKS
*Low-gravity evaporation pans under a white sky.*

The map that teaches **echo reading**. The pans are mirror-flat and reflective,
so you can see your echo *through the floor* even when it is behind cover. It
is the only map where the echo is never lost, which makes it the right place to
learn to plan with one. Reduced gravity stretches the airborne phase so a single
jump spans one full delay.

### REVERB
*Tight indoor ceramic maze. Claustrophobic, dark, loud.*

The map that breaks Law 2 on purpose, and compensates with **phase doors** —
apertures your echo can pass and you cannot (the `phase` brush tag already
exists in the collision system). Puzzle-combat: the only way to hit the thing
behind the wall is to have walked a route three seconds ago that sends your echo
through the gap. Short delays only; the map clamps you to 1.5–2.5 s.

### STILL HARBOUR
*The boss arena. Huge, open, four Stillness Pylons.*

Each pylon nulls your echo inside its radius. The fight against THE CHOIRMASTER
is therefore a fight to *restore your own mechanic*: destroy the pylons, in
order, while something with three echoes of its own hunts you. The finale is the
only time the game takes the echo away and asks you to earn it back.

---

## How maps are built

Geometry and collision come from **one call**:

```js
b.box(cx, cy, cz, sx, sy, sz, 'pillar', 'solid');
```

This is not a convenience, it is a correctness guarantee. Levels where art and
collision are separate assets are levels where a player eventually wall-runs on
a wall that is not there — and in a movement shooter that single class of bug
destroys trust in the entire game.

Brush tags drive behaviour, not just rendering:

| Tag | Meaning |
|---|---|
| `solid` | Normal geometry |
| `nowallrun` | Solid, but movement refuses to attach — used on all waist-high cover |
| `phase` | Not solid to the player at all (REVERB's phase doors) |

Everything is merged per-material at build time, so a 181-brush arena is a
handful of draw calls.

### One thing that went wrong, and what it taught

The outer wall was originally a ring of eight boxes placed around a circle. It
*looked* like an octagon. It leaked like a sieve — axis-aligned boxes cannot
tile a diagonal, so the "octagon" was really a pinwheel with eight gaps, and a
sprinting player walked straight out of the arena and fell forever. The headless
smoke test caught it by holding forward and strafe for fifteen seconds.

The fix was to **build only what an AABB world can actually express**: four
straight walls, each spanning the full width including the corners so they
overlap at every junction, making the boundary provably closed. The octagonal
read was then restored with four chamfer blocks on the diagonals — decoration
sitting inside a seal it cannot break.

The general lesson: when your collision representation cannot express a shape,
do not approximate the shape. Express a different shape and decorate it.
