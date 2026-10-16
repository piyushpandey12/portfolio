import json
import os

import cv2
import numpy as np

SRC = os.path.join(os.path.dirname(__file__), "..", "section 4 image.jpg")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "projects")
os.makedirs(OUT, exist_ok=True)

img = cv2.imread(SRC)
H, W = img.shape[:2]
if (W, H) != (1600, 900):
    img = cv2.resize(img, (1600, 900), interpolation=cv2.INTER_LANCZOS4)
    H, W = img.shape[:2]

CARDS = [
    ("timeless", [(245, 102), (400, 123), (567, 190), (553, 315),
                  (400, 301), (243, 268)], 0.45),
    ("game",     [(143, 281), (461, 355), (437, 490), (93, 462)], 0.25),
    ("build",    [(597, 86), (800, 71), (1005, 82), (1007, 282),
                  (800, 299), (596, 299)], 0.60),
    ("driven",   [(1028, 205), (1362, 125), (1428, 442), (1240, 435),
                  (1030, 345)], 0.45),
    ("ideas",    [(424, 396), (594, 388), (596, 516), (426, 526)], 0.80),
    ("sound",    [(598, 398), (709, 394), (711, 532), (599, 537)], 0.90),
    ("food",     [(728, 400), (879, 396), (876, 536), (731, 540)], 1.00),
    ("travel",   [(874, 406), (1009, 400), (1006, 542), (876, 546)], 0.90),
    ("space",    [(1018, 404), (1189, 394), (1187, 534), (1020, 542)], 0.80),
    ("play",     [(1211, 350), (1471, 281), (1506, 453), (1219, 463)], 0.30),
    ("cleaner",  [(148, 504), (290, 497), (431, 535), (433, 669),
                  (163, 680)], 0.10),
    ("steps",    [(1169, 528), (1427, 508), (1434, 665), (1318, 682),
                  (1175, 670)], 0.10),
]

GROW = 16
FEATHER = 9
PAD = 30

PERSON = (703, 330, 880, 741)

LABELS = [
    (30, 24, 240, 92),
    (30, 136, 250, 252),
    (1470, 30, 1585, 130),
    (30, 740, 200, 852),
    (1470, 752, 1590, 820),
    (586, 50, 640, 80),
]

def quad_mask(quad, grow, feather, shape):
    """Filled quad, grown outward by `grow`, feathered by `feather`."""
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.array(quad, np.int32)], 255)
    if grow > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (grow * 2 + 1,) * 2)
        m = cv2.dilate(m, k)
    if feather > 0:
        m = cv2.GaussianBlur(m, (feather * 2 + 1,) * 2, 0)
    return m

meta = {"cards": [], "person": PERSON, "size": [W, H]}

x0, y0, x1, y1 = PERSON
rect = (x0, y0, x1 - x0, y1 - y0)
gc_mask = np.zeros(img.shape[:2], np.uint8)
bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(img, gc_mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
cv2.line(gc_mask, (792, 335), (792, 600), cv2.GC_FGD, 12)
cv2.line(gc_mask, (760, 420), (838, 420), cv2.GC_FGD, 10)
cv2.line(gc_mask, (755, 620), (750, 730), cv2.GC_FGD, 8)
cv2.line(gc_mask, (830, 620), (835, 730), cv2.GC_FGD, 8)
cv2.line(gc_mask, (792, 630), (792, 735), cv2.GC_BGD, 8)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
bright = (gray > 105) & (gc_mask != cv2.GC_FGD)
gc_mask[bright & (gc_mask == cv2.GC_PR_FGD)] = cv2.GC_PR_BGD
cv2.grabCut(img, gc_mask, rect, bgd, fgd, 4, cv2.GC_INIT_WITH_MASK)
region = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0)
region = region.astype(np.uint8)

core = ((gray < 62) & (region > 0)).astype(np.uint8) * 255
core = cv2.morphologyEx(core, cv2.MORPH_OPEN,
                        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
n, lab = cv2.connectedComponents(core)
core = np.where(lab == lab[650, 797], 255, 0).astype(np.uint8)
core[813:, :] = 0
core[640:813, :] = np.where(gray[640:813, :] < 48, core[640:813, :], 0)
core[660:813, :750] = 0
core[660:813, 852:] = 0
core[772:, :746] = 0
core[772:, 853:] = 0
alpha = cv2.dilate(core,
                   cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
alpha = cv2.GaussianBlur(alpha, (5, 5), 0)
pc = img[y0:y1, x0:x1]
pa = alpha[y0:y1, x0:x1]
cv2.imwrite(os.path.join(OUT, "person.png"), np.dstack([pc, pa]))
print("person alpha px:", int((pa > 128).sum()))

person_sub = cv2.GaussianBlur(
    cv2.dilate(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))),
    (7, 7), 0).astype(np.float32) / 255

for i, (name, quad, depth) in enumerate(CARDS, 1):
    q = np.array(quad, np.int32)
    x0 = max(0, q[:, 0].min() - PAD)
    y0 = max(0, q[:, 1].min() - PAD)
    x1 = min(W, q[:, 0].max() + PAD)
    y1 = min(H, q[:, 1].max() + PAD)
    a = quad_mask(quad, GROW, FEATHER, img.shape).astype(np.float32)
    for oname, oquad, odepth in CARDS:
        if oname != name and odepth < depth:
            a *= 1.0 - quad_mask(oquad, 0, 5, img.shape).astype(np.float32) / 255
    a = a[y0:y1, x0:x1].astype(np.uint8)
    crop = img[y0:y1, x0:x1].copy()
    crop = cv2.addWeighted(crop, 1.42,
                           cv2.GaussianBlur(crop, (0, 0), 1.1), -0.42, 0)
    psub = person_sub[y0:y1, x0:x1] > 0.15
    if psub.any():
        filled = cv2.inpaint(crop, (psub * 255).astype(np.uint8), 6,
                             cv2.INPAINT_TELEA)
        wgt = (a.astype(np.float32) / 255)[..., None]
        crop = (filled * wgt + crop * (1 - wgt)).astype(np.uint8)
    out = np.dstack([crop, a])
    cv2.imwrite(os.path.join(OUT, f"p{i:02d}_{name}.png"), out)

    face = cv2.bitwise_and(crop, crop, mask=(a > 128).astype(np.uint8) * 255)
    px = face.reshape(-1, 3).astype(np.float32)
    px = px[px.sum(1) > 90]
    tint = px.mean(0)[::-1] if len(px) else np.array([200, 120, 60])
    meta["cards"].append({
        "name": name, "box": [int(x0), int(y0), int(x1 - x0), int(y1 - y0)],
        "quad": [[int(x), int(y)] for x, y in quad], "depth": depth,
        "tint": [round(float(c) / 255, 3) for c in tint],
    })

plate = img.copy()

pm = np.zeros(img.shape[:2], np.uint8)
x0, y0, x1, y1 = PERSON
pm[y0:y1, x0:x1] = (pa > 40).astype(np.uint8) * 255
pm = cv2.dilate(pm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
fill = plate.astype(np.float32)
for r in np.unique(np.where(pm > 0)[0]):
    row = pm[r] > 0
    d = np.diff(row.astype(np.int8))
    starts = np.where(d == 1)[0] + 1
    ends = np.where(d == -1)[0] + 1
    if row[0]:
        starts = np.r_[0, starts]
    if row[-1]:
        ends = np.r_[ends, W]
    for lo, hi in zip(starts, ends):
        a = fill[r, max(0, lo - 4)]
        b = fill[r, min(W - 1, hi + 3)]
        t = np.linspace(0, 1, hi - lo)[:, None]
        fill[r, lo:hi] = a * (1 - t) + b * t
plate = fill.astype(np.uint8)
band = cv2.GaussianBlur(plate, (0, 0), 3)
m3 = (cv2.GaussianBlur(pm, (31, 31), 0).astype(np.float32) / 255)[..., None]
plate = (plate * (1 - m3) + band * m3).astype(np.uint8)
noise = np.random.default_rng(7).normal(0, 2.2, plate.shape).astype(np.float32)
plate = np.clip(plate.astype(np.float32) + noise * m3, 0, 255).astype(np.uint8)

for name, quad, depth in CARDS:
    hole = quad_mask(quad, 12, 15, img.shape).astype(np.float32) / 255
    halo = quad_mask(quad, 56, 51, img.shape).astype(np.float32) / 255
    damp = 1.0 - hole[..., None] * 0.99 - (halo - hole)[..., None] * 0.30
    plate = (plate.astype(np.float32) * np.clip(damp, 0, 1)).astype(np.uint8)

for lx0, ly0, lx1, ly1 in LABELS:
    roi = plate[ly0:ly1, lx0:lx1].astype(np.float32)
    plate[ly0:ly1, lx0:lx1] = (roi * 0.06).astype(np.uint8)

cv2.imwrite(os.path.join(OUT, "plate.jpg"), plate,
            [cv2.IMWRITE_JPEG_QUALITY, 88])

with open(os.path.join(OUT, "layout4.json"), "w") as f:
    json.dump(meta, f, indent=1)

sizes = {f: os.path.getsize(os.path.join(OUT, f)) // 1024
         for f in sorted(os.listdir(OUT))}
print(json.dumps(sizes, indent=0))
print("total KB:", sum(sizes.values()))
