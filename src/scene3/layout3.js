export const YEARS = [
  {
    year: 2021,
    key: 'Beginning',
    lines: ['New City', 'New Chapter', 'Bigger Dreams'],
  },
  {
    year: 2022,
    key: 'Exploration',
    lines: ['Learned Design', 'Found Direction'],
  },
  {
    year: 2023,
    key: 'Practice',
    lines: ['Built Skills', 'Made Projects', 'Kept Going'],
  },
  {
    year: 2024,
    key: 'Growth',
    lines: ['Real Projects', 'Real People', 'Real Learning'],
  },
  {
    year: 2025,
    key: 'Opportunities',
    lines: ['Collaborated', 'Solved Problems', 'Stepped Up'],
  },
  {
    year: 2026,
    key: 'Next Chapter',
    lines: ['Bigger Goals', 'More Impact', 'Still Designing'],
  },
];

const REF = {
  nodes: [
    [0.2226, 0.1456],
    [0.3201, 0.2319],
    [0.4245, 0.2940],
    [0.5373, 0.3382],
    [0.6648, 0.3683],
    [0.8064, 0.3776],
  ],

  cards: [
    [0.2047, 0.2875, 0.081],
    [0.3109, 0.3569, 0.088],
    [0.4250, 0.4097, 0.095],
    [0.5375, 0.4583, 0.102],
    [0.6906, 0.5083, 0.110],
    [0.8180, 0.5292, 0.124],
  ],
  pivot: [0.6991, 0.0483],

  dial: [0.0, -0.20, 0.47],

  figure: [0.4742, 0.9780, 0.440],
  floor: [0.4742, 0.9550],
};

export function fitScene(w, h) {
  const refAspect = 16 / 9;
  const aspect = w / h;
  const portrait = aspect < 0.95;

  let scale;
  let ox = 0;
  let oy = 0;
  if (aspect >= refAspect) {
    scale = h / 720;
    ox = (w - 1280 * scale) * 0.5;
  } else {
    scale = w / 1280;
    oy = (h - 720 * scale) * 0.5;
  }

  const P = ([fx, fy]) => [ox + fx * 1280 * scale, oy + fy * 720 * scale];

  let nodes;
  let cards;
  let pivot;
  let floor;
  let figure;

  if (portrait) {

    const railX = w * 0.155;
    const top = h * 0.255;
    const step = h * 0.088;
    nodes = REF.nodes.map((_, i) => [railX + i * w * 0.006, top + i * step]);
    const cw = Math.min(w * 0.62, 330);
    cards = REF.nodes.map((_, i) => ({
      x: w * 0.60, y: h * 0.50, w: cw, i,
    }));
    pivot = [w * 0.52, h * 0.075];
    floor = [w * 0.5, h * 0.965];
    figure = { cx: w * 0.5, feet: h * 0.965, h: h * 0.30 };
  } else {
    nodes = REF.nodes.map(P);
    cards = REF.cards.map(([fx, fy, fw], i) => {
      const [x, y] = P([fx, fy]);
      return { x, y, w: fw * 1280 * scale, i };
    });
    pivot = P(REF.pivot);
    floor = P(REF.floor);
    figure = {
      cx: P([REF.figure[0], 0])[0],
      feet: P([0, REF.figure[1]])[1],
      h: REF.figure[2] * 720 * scale,
    };
  }

  const arc = fitCircle(nodes);
  const angles = nodes.map((n) => Math.atan2(n[1] - arc.cy, n[0] - arc.cx));

  const handAngles = nodes.map((n) =>
    Math.atan2(n[1] - pivot[1], n[0] - pivot[0]));

  const dial = portrait
    ? { cx: pivot[0], cy: pivot[1] - h * 0.30, r: h * 0.40 }
    : {
      cx: pivot[0] + REF.dial[0] * 720 * scale,
      cy: pivot[1] + REF.dial[1] * 720 * scale,
      r: REF.dial[2] * 720 * scale,
    };

  return {
    w, h, scale, portrait,
    nodes, cards, pivot, dial, floor, figure, arc, angles, handAngles,
  };
}

function fitCircle(pts) {
  const A = pts.map((p) => [p[0], p[1], 1]);
  const b = pts.map((p) => -(p[0] * p[0] + p[1] * p[1]));
  const [D, E, F] = solve3(A, b);
  const cx = -D / 2;
  const cy = -E / 2;
  return { cx, cy, r: Math.sqrt(Math.max(cx * cx + cy * cy - F, 1)) };
}

function solve3(A, b) {
  const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const r = [0, 0, 0];
  for (let k = 0; k < A.length; k++) {
    for (let i = 0; i < 3; i++) {
      r[i] += A[k][i] * b[k];
      for (let j = 0; j < 3; j++) N[i][j] += A[k][i] * A[k][j];
    }
  }

  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(N[k][i]) > Math.abs(N[p][i])) p = k;
    [N[i], N[p]] = [N[p], N[i]];
    [r[i], r[p]] = [r[p], r[i]];
    const d = N[i][i] || 1e-9;
    for (let k = i + 1; k < 3; k++) {
      const f = N[k][i] / d;
      for (let j = i; j < 3; j++) N[k][j] -= f * N[i][j];
      r[k] -= f * r[i];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = r[i];
    for (let j = i + 1; j < 3; j++) s -= N[i][j] * x[j];
    x[i] = s / (N[i][i] || 1e-9);
  }
  return x;
}

export function timeAt(layout, px, py) {

  const pts = layout.portrait
    ? layout.nodes.map((n) => [n[0], n[1]])
    : layout.cards.map((c) => [c.x, c.y]);
  let best = 0;
  let bestD = Infinity;

  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const d = (px - qx) ** 2 + (py - qy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i + t;
    }
  }
  return { u: best, dist: Math.sqrt(bestD) };
}

export function angleAt(list, u) {
  const i = Math.max(0, Math.min(list.length - 2, Math.floor(u)));
  const t = Math.max(0, Math.min(1, u - i));
  let a = list[i];
  let b = list[i + 1];
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
