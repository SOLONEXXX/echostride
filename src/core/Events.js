/** Smallest possible event bus. Systems emit, the HUD and audio listen. */
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    let a = this.map.get(name);
    if (!a) this.map.set(name, (a = []));
    a.push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const a = this.map.get(name);
    if (a) {
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    }
  }
  emit(name, payload) {
    const a = this.map.get(name);
    if (!a) return;
    // Iterate a copy: a handler that unsubscribes itself must not make the
    // loop skip the next handler.
    for (const fn of a.slice()) fn(payload);
  }
}
