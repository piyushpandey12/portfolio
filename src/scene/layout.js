import { TARGET_RATIO } from './type.js';

export const REF = {
  wordWidth: 0.9344,
  capHeight: 0.5320,
  vCentre: 0.5361,
  legend: { x: 0.8812, y: 0.2678, h: 0.0422 },
  artist: { x: 0.0150, y: 0.6878, h: 0.0367 },
  dotsBR: { x: 0.9844, y: 0.9500 },
  arrows: { left: 0.0181, right: 0.9750, top: 0.345, bottom: 0.625, count: 5 },
};

export function computeLayout(w, h) {
  const portrait = h / w > 1.05;
  const narrow = w < 760;

  const byWidth = (REF.wordWidth * w) / TARGET_RATIO;
  const byHeight = REF.capHeight * h;
  let capH = Math.min(byWidth, byHeight);

  if (portrait) capH = Math.min(byWidth * 1.0, h * 0.30);

  const wordW = capH * TARGET_RATIO;
  const cx = w * 0.5;
  const vCentre = portrait ? h * 0.50 : h * REF.vCentre;
  const capTop = vCentre - capH * 0.5;
  const baseline = vCentre + capH * 0.5;

  const word = {
    x: cx - wordW * 0.5,
    y: capTop,
    w: wordW,
    h: capH,
    capH,
    baseline,
  };

  let heroH = capH * 1.35;
  let feet = baseline + capH * 0.22;

  if (portrait) {

    heroH = h * 0.54;
    feet = h * 0.885;
  }

  return {
    w,
    h,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    portrait,
    narrow,
    word,
    hero: { h: heroH, cx, feet },

    welcomeY: portrait ? (feet - heroH) - h * 0.075 : h * 0.175,
    legend: portrait
      ? { x: w * 0.955, y: capTop - h * 0.052, h: 20, alignRight: true }
      : { x: w * REF.legend.x, y: h * REF.legend.y,
          h: Math.max(18, h * REF.legend.h) },
    artist: portrait
      ? { x: w * 0.045, y: baseline + h * 0.055, h: 19 }
      : { x: w * REF.artist.x, y: h * REF.artist.y,
          h: Math.max(16, h * REF.artist.h) },
    ember: { x: 0.5, y: vCentre / h },
  };
}

export function fitSubject(track, frameAspect, opts) {
  const [x0, y0, x1, y1] = track;
  const subH = Math.max(y1 - y0, 1e-3);
  const subCX = (x0 + x1) * 0.5;

  const quadH = opts.height / subH;
  const quadW = quadH * frameAspect;

  const footY = opts.feet !== undefined ? opts.feet : opts.top + opts.height;
  return {
    x: opts.cx - quadW * subCX,
    y: footY - quadH * y1,
    w: quadW,
    h: quadH,
  };
}
