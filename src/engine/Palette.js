/**
 * ECHOSTRIDE — Palette
 * "Chromatic Brutalism": cast ceramic and concrete under hard light, with
 * exactly four emissive colours allowed in the whole game. Restraint is the
 * art direction. If everything glows, nothing reads.
 *
 * The rule the whole game obeys:
 *   VIOLET is always the past. CYAN is always you. OXIDE is always a threat.
 *   GOLD only ever appears at the instant of a Resonant Strike.
 * A player who has learned those four colours can read any frame of this game
 * at a glance, which is the entire point.
 */
export const PALETTE = {
  bone:     0xEDE6DA,
  ceramic:  0xD6CEC0,
  ash:      0x9A958C,
  slate:    0x4A4E57,
  graphite: 0x23262C,
  void:     0x0B0C10,

  brass:    0xB98A4C,

  flux:     0x39D7E0, // you, your UI, your muzzle flash
  echo:     0x8B6CF0, // your past self, always
  oxide:    0xE4572E, // the Stillness -- every hostile thing
  gold:     0xF5C242, // resonance only. nothing else. ever.

  sky:      0x171A20,
  fog:      0x14171C,
};

/** Convert a palette entry to a CSS colour for the DOM HUD. */
export const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
