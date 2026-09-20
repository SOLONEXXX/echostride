# CHARACTERS

![Striders](shots/gallery-strider.png)

Every model in this document is the geometry the game actually renders. The
shapes are defined in [`src/engine/StriderMesh.js`](../src/engine/StriderMesh.js)
and [`src/enemies/Enemies.js`](../src/enemies/Enemies.js), and the gallery page
renders them from that same code — so a design document here can never drift
from the build.

---

## THE STRIDER — the player

A soldier fitted with a **Recursion Harness**: a device that continuously leaks
a copy of its wearer into the present, three seconds late. Striders do not
consider this a weapon. They consider it a condition.

### The design brief

The Strider silhouette has to satisfy four requirements that fight each other:

1. **Readable at 60 m, in violet, additively blended, in motion.** That rules
   out detail. Everything is large planes and hard angles.
2. **Unmistakable from behind.** In this game you spend a great deal of time
   looking at a version of yourself running away from you. Most character
   designs are fronts. This one had to be a back.
3. **Asymmetric.** A symmetrical character reads as a prop. An asymmetric one
   reads as a person who has been *using* their equipment.
4. **In motion even when standing still**, or the figure reads as furniture.

### The answer

| Element | What it is | Why |
|---|---|---|
| **The Recursion Harness** | A broken ring — 290° of a torus, capped at both cut ends — mounted high and proud of the left shoulder on a strut, tilted out of plane | The whole design. Nothing else in the game has this shape, so it is identifiable from any angle, including from directly behind. It also **spins faster the more Flux you hold**, which makes it a resource readout you can read off your own echo from across the arena. |
| **The head** | A four-plane wedge with a forward-raked jaw and one horizontal visor slit | A wedge with a light in it is a face. Anything more becomes a helmet. The rake gives the head a direction in pure silhouette. |
| **The crest fin** | Offset 3 cm from centre | Breaks the symmetry of the skull. Three centimetres is enough. |
| **Shoulders** | Left: heavy angled pauldron. Right: stripped to the joint | The left carries the harness; the right is the weapon shoulder and must stay clean. Asymmetry with a stated reason. |
| **The chest** | A ceramic slab raked forward 6°, with a lit sternum seam | A vertical chest reads as standing at attention. A raked one reads as leaning into a fight. |
| **The tabard** | Four hanging ceramic panels: front, rear, and two hips | The only soft thing in the art direction. It flares backwards with speed and splays in a slide, and it is the single reason the Strider has movement rather than pose. |
| **The legs** | Human proportions with a flat blade shin-guard overhanging the front of each shin | Makes a thin leg read as armoured without adding geometry. |

### Animation

Entirely procedural, and it has to be. The echo reproduces *your* recorded
motion, so hand-authored clips would drift out of sync with the replayed
positions within a second. A walk cycle driven by **distance travelled** always
matches the feet to the ground at any replay speed.

Details that carry the weight:

- Legs swing in counter-phase; the knee bends only on the back stroke, so the
  leg straightens as it reaches. Cheapest possible trick for giving a two-joint
  leg mass.
- The torso leans into speed and banks on a wall-run.
- **The head holds the horizon**, counter-rotating the torso lean. A character
  whose head stays level looks alive; one whose head follows the spine looks
  like a puppet.
- The slide is a trailing-leg pose — front leg extended, back leg tucked — so
  "that player is sliding" is legible from any angle at any distance.

---

## THE STRIDERS — five harness tunings

Only **VESPER** is implemented in the prototype. The other four are the design
space, and every one of them is *the same mechanic with a different number*:
each is a default and a clamp on the echo delay. A class system that is really
one dial is a class system that cannot drift out of balance.

| | Delay | Echo damage | Move | Identity |
|---|---|---|---|---|
| **VESPER** *(implemented)* | 3.00 s, free range | 60% | 100% | The baseline. Long coat, fraying hem. Every lesson in the game is taught on her. |
| **HOLLOWAY** | 5.00 s, locked 4.0–5.0 | 100% | 88% | Two fronts. Heavy plate, harness worn on the back like a pack. The echo is a second soldier holding a different room. |
| **MIRE** | 1.50 s, locked 1.5–2.5 | 45% | 118% | The echo overlaps you almost perfectly: near-double DPS at knife range, nothing to flank with. Stripped-down frame, no tabard, harness fused to the spine. |
| **ORRERY** | Two echoes, 2.0 s and 4.0 s | 35% each | 94% | The conductor. Three harness rings on a gimbal. *Cut from the prototype for readability* — see [ECHO_SHIFT.md §7](ECHO_SHIFT.md#7-what-was-cut) — kept here because the fantasy is worth revisiting. |
| **SABLE** | 3.00 s | 60% | 100% | The echo replays your movement **mirrored across your facing axis**. Automatic pincers, chaotic spacing. The expert pick, and the only one that changes the rules rather than the numbers. |

---

## THE STILLNESS — the enemies

![The Stillness](shots/gallery-stillness.png)

An order that believes recursion is a disease: they want a world where a moment
happens once and is then *over*. Everything about them is the visual opposite of
you. You are asymmetric, layered and always moving. They are symmetrical,
sealed, and hold still until they commit. You glow cyan and trail violet; they
burn oxide orange.

**The rule every enemy obeys:** each type teaches one specific lesson about the
echo, and is unbeatable *in a boring way* if you ignore that lesson.

### WARDEN — rusher
> **Lesson: your echo is a body. Enemies will chase it. Use that.**

A headless ceramic quadruped with a sensor slit that wraps its front corners.
Fast (9.2 m/s), fragile (58 HP), and it commits to a ballistic **leap** you
dodge by moving sideways at the right moment rather than by holding a direction.

It will happily chase your echo across the entire arena. The first time a player
notices a pack of Wardens sprinting at a violet ghost while they reload in
peace is the moment the mechanic clicks.

### PSALM — ranged
> **Lesson: things can predict a moving target. So can you.**

Tall, robed, floating, holding a slab it aims over. It **leads its shots** — it
fires at where you *will* be. The tell is the slab tilting during a 0.55 s
charge, and the counterplay is to change your mind, which is thematically
perfect for this game.

Being shot at by something that predicts you is the fastest way to teach a
player that prediction is a thing they can do too.

### MONOLITH — heavy
> **Lesson: ONLY Resonance breaks plating.**

The most important enemy in the game. A slab walker whose frontal plate absorbs
**all** ordinary damage. Not reduced — absorbed. The plate is a *gate*, not a
buffer, and it is a different colour from the rest of the body so that "the
orange part is the problem" needs no tutorial.

There is no way through it from the front except a Resonant Strike. This is the
moment the player stops treating the echo as a bonus and starts treating it as a
weapon. The plating covers only the front 150°, so "get behind it" is the other
valid answer — and getting behind something is much easier when a copy of you is
holding its attention.

### HUSH — assassin
> **Lesson: reading an echo is a skill. Here is one pointed at you.**

The game's cleverest idea, turned around. The Hush itself is 12% opacity — in a
firefight you will not see it. What you *can* see is **the Hush's own echo**,
three seconds behind it, drawn as a hard oxide wireframe.

To kill a Hush you must read its echo's path and shoot three seconds *ahead* of
it. It is precisely the skill the player has been practising all game, tested in
reverse. Players who have internalised their own echo kill a Hush on reflex.
Players who have not cannot touch it, and no tutorial would help them.

### CANTOR — support
> **Lesson: your echo can be taken away. Protect it.**

An inverted cone — the only enemy that points *down* — with three orbiting tines
holding open a 13 m **Stillness Field**. The field does no damage. It **freezes
your echo's replay**. The tape stops; your partner stands still in the middle of
a firefight.

54 HP, because the threat is not its damage, it is the removal of the thing you
built your entire fight around. Kill it first. That is the lesson: target
priority is about capability, not health bars.

### THE CHOIRMASTER — boss *(designed, not implemented)*
> **Lesson: everything above, at once.**

Carries **three echoes of itself** at 2 s, 4 s and 6 s delay. Only the real one
can be hurt, and the only thing distinguishing it is that it casts a shadow and
holds full colour saturation. It fights on STILL HARBOUR, whose four Stillness
Pylons null *your* echo inside their radius — so the boss fight is you learning
to fight without the mechanic while reading three copies of something else.

---

## Wave composition is a curriculum

Enemies arrive in the order in which their lessons build on each other. Nothing
is randomised until wave 7, because a curriculum that shuffles is a curriculum
that sometimes teaches the final lesson first.

| Wave | Composition | Introduces |
|---|---|---|
| 1 | 4 × WARDEN | You exist, you move, you shoot |
| 2 | 7 × WARDEN | Your echo has arrived. Notice that it fights. |
| 3 | 5 WARDEN, 3 PSALM | Ranged pressure. You cannot stand still. |
| 4 | 6 WARDEN, 2 PSALM, 1 CANTOR | Your echo can be taken away |
| 5 | 5 WARDEN, 3 PSALM, 1 MONOLITH | **You must resonate.** The thesis, enforced. |
| 6 | + 2 HUSH | Read an echo that is not yours |
| 7+ | everything, scaling | — |

Past wave 8 the composition scales sublinearly and caps at 34 enemies. Forty
enemies is not harder than twenty; it is just slower, and a horde mode that
becomes a slideshow has stopped being a test of skill.

Implementation: [`src/enemies/Director.js`](../src/enemies/Director.js).
