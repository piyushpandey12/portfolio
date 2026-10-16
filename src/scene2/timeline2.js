import { clamp, span, lerp, smoothstep, easeOutCubic, easeOutExpo } from '../lib/ease.js';

export const T2 = {
  wake: 0.20,
  gather: 1.10,
  materialise: 2.50,
  matDur: 0.72,
  rise: 3.10,
  riseDur: 1.85,
  settle: 4.90,
  settleDur: 0.60,
  hold: 5.50,
  floatOn: 6.00,
  alive: 7.40,
};

export function sample2(t) {

  const wake = smoothstep(0, 1, span(t, T2.wake, T2.wake + 2.2));
  const gather = smoothstep(0, 1, span(t, T2.gather, T2.gather + 1.5));

  const mp = span(t, T2.materialise, T2.materialise + T2.matDur);
  const mat = easeOutCubic(mp);

  const rise = easeOutExpo(span(t, T2.rise, T2.rise + T2.riseDur));

  const sp = span(t, T2.settle, T2.settle + T2.settleDur);
  const settle = sp > 0 && sp < 1 ? Math.sin(sp * Math.PI) * (1 - sp) : 0;

  const float = smoothstep(0, 1, span(t, T2.floatOn, T2.floatOn + 1.6));

  const ribbonDraw = smoothstep(0, 1, span(t, T2.gather + 0.2, T2.rise + 1.4));
  const ribbonLife = smoothstep(0, 1, span(t, T2.floatOn - 0.6, T2.alive));

  const ring = lerp(0.10, 1.0, smoothstep(0, 1, span(t, T2.wake, T2.alive)));

  const burst = mp > 0 && mp < 1 ? Math.sin(mp * Math.PI) ** 2 : 0;

  return {
    wake,
    gather,
    mat,
    rise,
    settle,
    float,
    ribbonDraw,
    ribbonLife,
    ring,
    burst,

    converge: clamp(gather - smoothstep(0, 1, span(t, T2.materialise, T2.rise))),
    grain: lerp(0.085, 0.040, smoothstep(0, 1, span(t, 0.3, T2.floatOn))),
    interactive: t >= T2.alive,
    progress: clamp(t / T2.alive),
  };
}
