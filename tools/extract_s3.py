"""Lift the section-3 artwork out of the supplied reference.

Two things come out of the poster:

  * the six card photographs, one per year. They are small in the source
    (~90-140px wide) and are graded warm; they are lifted at native detail and
    given a light clean-up rather than an upscale that invents nothing.

  * the central figure's silhouette, found with grabCut for the same reason as
    in scene two: he is nearly black against a nearly black floor, so no
    luminance threshold can separate them. Only his SHAPE is kept - the scene
    lights him at runtime.

Nothing here is redrawn or replaced.
"""

import json
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "section 3 image.jpg")
OUT = os.path.join(ROOT, "public", "years")

BASE_W = 1280.0
BASE_H = 720.0

PHOTOS_BASE = {
    2021: (219, 174, 305, 240),
    2022: (353, 228, 443, 286),
    2023: (488, 260, 600, 330),
    2024: (641, 302, 736, 358),
    2025: (839, 335, 930, 398),
    2026: (977, 342, 1118, 420),
}

FIGURE_REGION_BASE = (528, 386, 686, 705)
FIGURE_SEED = (0.08, 0.02, 0.92, 0.99)

OUT_W = 264

def photo(img: np.ndarray, year: int, box: tuple[int, int, int, int]) -> tuple[int, int]:
    x0, y0, x1, y1 = box
    c = img[y0:y1, x0:x1].astype(np.float32)

    lo, hi = np.percentile(c, [2, 99])
    c = np.clip((c - lo) / max(float(hi - lo), 1e-6), 0.0, 1.0)
    c = np.power(c, 0.86) * 255.0

    h = int(round(OUT_W * (y1 - y0) / max(x1 - x0, 1)))
    c = cv2.resize(c, (OUT_W, h), interpolation=cv2.INTER_LANCZOS4)
    c = cv2.bilateralFilter(np.clip(c, 0, 255).astype(np.uint8), 5, 30, 6)
    blur = cv2.GaussianBlur(c, (0, 0), 1.6)
    c = np.clip(c.astype(np.float32) * 1.35 - blur.astype(np.float32) * 0.35, 0, 255)

    path = os.path.join(OUT, "%d.jpg" % year)
    cv2.imwrite(path, c.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 88])
    return OUT_W, h

def figure(img: np.ndarray, region: tuple[int, int, int, int]) -> tuple[int, int, float]:
    x0, y0, x1, y1 = region
    crop = img[y0:y1, x0:x1]
    h, w = crop.shape[:2]

    lifted = np.clip(crop.astype(np.float32) * 3.0, 0, 255).astype(np.uint8)
    lifted = cv2.bilateralFilter(lifted, 7, 40, 12)

    mask = np.zeros((h, w), np.uint8)
    rect = (
        int(FIGURE_SEED[0] * w),
        int(FIGURE_SEED[1] * h),
        int((FIGURE_SEED[2] - FIGURE_SEED[0]) * w),
        int((FIGURE_SEED[3] - FIGURE_SEED[1]) * h),
    )
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(lifted, mask, rect, bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)

    n, lab, st, cen = cv2.connectedComponentsWithStats(m, connectivity=8)
    best, score = 0, -1e18
    for i in range(1, n):
        area = st[i, cv2.CC_STAT_AREA]
        if area < 0.02 * w * h:
            continue
        s = area * (1.0 - abs(cen[i][0] / w - 0.5))
        if s > score:
            best, score = i, s
    if best:
        m = (lab == best).astype(np.uint8)

    dark = (cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) < 50).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    m = np.bitwise_and(m, dark)

    n2, lab2, st2, _c2 = cv2.connectedComponentsWithStats(m, connectivity=8)
    if n2 > 1:
        keep = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
        m = (lab2 == keep).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))

    guard = np.zeros((h + 2, w + 2), np.uint8)
    inv = (1 - m).astype(np.uint8)
    cv2.floodFill(inv, guard, (0, 0), 2)
    holes = ((inv == 1) & (m == 0)).astype(np.uint8)
    if holes.any():
        hn, hlab, hst, _c = cv2.connectedComponentsWithStats(holes, connectivity=8)
        lim = 0.02 * float(m.sum())
        keep = [i for i in range(1, hn) if hst[i, cv2.CC_STAT_AREA] < lim]
        holes = np.isin(hlab, keep).astype(np.uint8) if keep else np.zeros_like(holes)
    m = ((m == 1) | (holes == 1)).astype(np.uint8)

    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.2)
    a = np.clip((a - 0.35) / 0.42, 0.0, 1.0)
    fade = np.clip(np.linspace(0.0, 1.0, a.shape[0]) * 12.0 - 10.4, 0.0, 1.0)[:, None]
    a *= (1.0 - fade)

    ys, xs = np.nonzero(a > 0.15)
    pad = 5
    cy0, cy1 = max(0, int(ys.min()) - pad), min(h, int(ys.max()) + pad)
    cx0, cx1 = max(0, int(xs.min()) - pad), min(w, int(xs.max()) + pad)
    a = a[cy0:cy1, cx0:cx1]
    body = crop[cy0:cy1, cx0:cx1]

    rgba = np.dstack([np.clip(body.astype(np.float32) * 1.4, 0, 255),
                      a * 255.0]).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, "figure.png"), rgba)
    return rgba.shape[1], rgba.shape[0], float((a > 0.5).mean())

def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(SRC):
        raise FileNotFoundError(f"Source artwork not found: {SRC}")

    img = cv2.imread(SRC)
    if img is None:
        raise ValueError(f"Could not load image: {SRC}")

    img_h, img_w = img.shape[:2]
    scale_x = img_w / BASE_W
    scale_y = img_h / BASE_H

    meta = {}
    for year, box in PHOTOS_BASE.items():
        scaled_box = (
            int(round(box[0] * scale_x)),
            int(round(box[1] * scale_y)),
            int(round(box[2] * scale_x)),
            int(round(box[3] * scale_y)),
        )
        w, h = photo(img, year, scaled_box)
        meta[str(year)] = {"w": w, "h": h}
        print("  photo %d  %dx%d" % (year, w, h))

    scaled_fig_region = (
        int(round(FIGURE_REGION_BASE[0] * scale_x)),
        int(round(FIGURE_REGION_BASE[1] * scale_y)),
        int(round(FIGURE_REGION_BASE[2] * scale_x)),
        int(round(FIGURE_REGION_BASE[3] * scale_y)),
    )
    fw, fh, cov = figure(img, scaled_fig_region)
    meta["figure"] = {"w": fw, "h": fh}
    print("  figure   %dx%d  coverage %.1f%%" % (fw, fh, cov * 100))

    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
    print("wrote ->", OUT)

if __name__ == "__main__":
    main()
