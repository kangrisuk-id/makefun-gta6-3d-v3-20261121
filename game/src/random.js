// A small seeded random generator (mulberry32). One seed always grows the same
// Palmera Bay, which keeps the screenshot scenes and play-tests reproducible.
export function makeRandom(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** Integer in [min, max], both ends included. */
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** A random member of an array. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}
