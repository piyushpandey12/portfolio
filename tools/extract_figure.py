"""Lift the central figure's silhouette out of the supplied section-2 artwork.

He is a back-lit silhouette: nearly black, standing against a background that is
itself nearly black in places. A luminance key cannot separate those, so the
shape is found with grabCut, which models foreground and background as colour
distributions rather than thresholds.

Only the SHAPE is kept. The figure is then re-lit inside the scene - the red rim
along his shoulder is generated at runtime from the position of the scene's own
light, so he responds to the ribbon passing behind him instead of carrying a
baked highlight from a photograph. That is what stops him reading as a cut-out
pasted over the background.
"""

import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "section 2 image.jpg")
OUT = os.path.join(ROOT, "public", "tools")

REGION = (520, 215, 762, 707)
SEED = (0.16, 0.03, 0.86, 0.99)

def main():
    img = cv2.imread(SRC)
    x0, y0, x1, y1 = REGION
    crop = img[y0:y1, x0:x1]
    h, w = crop.shape[:2]

    lifted = np.clip(crop.astype(np.float32) * 3.2, 0, 255).astype(np.uint8)
    lifted = cv2.bilateralFilter(lifted, 7, 40, 12)

    mask = np.zeros((h, w), np.uint8)
    rx0, ry0, rx1, ry1 = (int(SEED[0] * w), int(SEED[1] * h),
                          int(SEED[2] * w), int(SEED[3] * h))
    rect = (rx0, ry0, rx1 - rx0, ry1 - ry0)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(lifted, mask, rect, bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)

    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
    best, score = 0, -1e18
    for i in range(1, n):
        area = st[i, cv2.CC_STAT_AREA]
        if area < 0.02 * w * h:
            continue
        cx = abs(cen[i][0] / w - 0.5)
        reaches_floor = (st[i, cv2.CC_STAT_TOP] + st[i, cv2.CC_STAT_HEIGHT]) / h
        s = area * (1.0 - cx) * (1.0 if reaches_floor > 0.8 else 0.35)
        if s > score:
            best, score = i, s
    if best:
        m = (lab == best).astype(np.uint8)

    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

    guard = np.zeros((h + 2, w + 2), np.uint8)
    inv = (1 - m).astype(np.uint8)
    cv2.floodFill(inv, guard, (0, 0), 2)
    holes = ((inv == 1) & (m == 0)).astype(np.uint8)
    if holes.any():
        hn, hlab, hst, _c = cv2.connectedComponentsWithStats(holes, 8)
        limit = 0.02 * float(m.sum())
        small = [i for i in range(1, hn) if hst[i, cv2.CC_STAT_AREA] < limit]
        holes = np.isin(hlab, small).astype(np.uint8) if small else np.zeros_like(holes)
    m = ((m == 1) | (holes == 1)).astype(np.uint8)

    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.3)
    a = np.clip((a - 0.35) / 0.42, 0, 1)

    fade = np.clip(np.linspace(0.0, 1.0, a.shape[0]) * 11.0 - 9.4, 0, 1)[:, None]
    a *= (1.0 - fade)

    ys, xs = np.nonzero(a > 0.15)
    pad = 6
    cy0, cy1 = max(0, ys.min() - pad), min(h, ys.max() + pad)
    cx0, cx1 = max(0, xs.min() - pad), min(w, xs.max() + pad)
    a = a[cy0:cy1, cx0:cx1]
    body = crop[cy0:cy1, cx0:cx1]

    tex = np.clip(body.astype(np.float32) * 1.5, 0, 255)
    rgba = np.dstack([tex, a * 255]).astype(np.uint8)
    os.makedirs(OUT, exist_ok=True)
    cv2.imwrite(os.path.join(OUT, "figure.png"), rgba)

    print("figure %dx%d  coverage %.1f%%  (from region %s)"
          % (rgba.shape[1], rgba.shape[0], (a > 0.5).mean() * 100, REGION))
    chk = np.full(rgba.shape[:2] + (3,), 90, np.float32)
    comp = tex * a[..., None] + chk * (1 - a[..., None])
    cv2.imwrite(os.path.join(OUT, "_qa_figure.png"), comp.astype(np.uint8))

if __name__ == "__main__":
    main()
