const T = {
  wake: [0.0, 0.85],
  ring: [0.5, 1.55],
  floor: [0.85, 1.95],
  deck: [1.25, 3.4],
  person: [2.75, 3.85],
  labels: [3.3, 4.35],
  live: 4.1,
};

export const T4 = T;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const span = ([a, b], t) => clamp01((t - a) / (b - a));
const ease = (v) => v * v * (3 - 2 * v);

export function sample4(t) {
  const wake = ease(span(T.wake, t));
  const ringIn = span(T.ring, t);

  const flicker = ringIn >= 1 ? 1
    : ringIn * (0.55 + 0.45 * Math.abs(Math.sin(ringIn * 21.0)));
  const floor = ease(span(T.floor, t));
  const deck = span(T.deck, t);
  const person = ease(span(T.person, t));
  const labels = span(T.labels, t);
  return {
    wake: 0.30 * wake + 0.70 * ease(deck),
    ring: ease(ringIn) * 0.4 + flicker * 0.6,
    floor,
    spark: floor,
    deck,
    person,
    labels,
    live: t >= T.live,
    grain: 0.05 + 0.03 * wake,
  };
}

export function cardIn(deck, order, n) {
  const spread = 0.55;
  const start = (order / Math.max(1, n - 1)) * spread;
  const dur = 1 - spread;
  return clamp01((deck - start) / dur);
}

export function popEase(v) {
  const s = 1.35;
  const u = v - 1;
  return 1 + u * u * ((s + 1) * u + s);
}
