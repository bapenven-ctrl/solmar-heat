// Deterministic seeded random number generation (mulberry32 family).
// Gameplay never uses Math.random: every system draws from an Rng so a
// staged scene or a saved seed always plays out the same way.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed >>> 0);
  }

  float() {
    return this.next();
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }

  chance(p) {
    return this.next() < p;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  // A hex color nudged around a base hue, for building and car variety.
  jitterColor(base, amount) {
    const c = base.clone();
    const hsl = {};
    c.getHSL(hsl);
    c.setHSL(
      (hsl.h + this.range(-amount, amount) + 1) % 1,
      Math.min(1, Math.max(0, hsl.s + this.range(-amount, amount))),
      Math.min(0.92, Math.max(0.08, hsl.l + this.range(-amount * 0.7, amount * 0.7))),
    );
    return c;
  }
}
