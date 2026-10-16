import json
import os

import cv2
import numpy as np

SRC = os.path.join(os.path.dirname(__file__), "..", "Footer image.jpg")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "fin")
os.makedirs(OUT, exist_ok=True)

img = cv2.imread(SRC)
H, W = img.shape[:2]
assert (W, H) == (1600, 900), f"unexpected reference size {W}x{H}"

BOX = (580, 170, 1030, 900)

LABELS = [
    (36, 50, 235, 170),
    (36, 330, 235, 495),
    (36, 730, 190, 840),
    (1450, 50, 1580, 175),
    (1450, 730, 1580, 830),
]

x0, y0, x1, y1 = BOX
rect = (x0, y0, x1 - x0, y1 - y0)
gc = np.zeros((H, W), np.uint8)
bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(img, gc, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)

cv2.rectangle(gc, (815, 320), (890, 390), cv2.GC_FGD, -1)
cv2.line(gc, (865, 430), (900, 500), cv2.GC_FGD, 15)
cv2.line(gc, (880, 400), (985, 400), cv2.GC_FGD, 5)
cv2.line(gc, (780, 480), (780, 870), cv2.GC_FGD, 17)
cv2.line(gc, (700, 300), (860, 230), cv2.GC_FGD, 9)
cv2.line(gc, (990, 200), (1020, 320), cv2.GC_BGD, 11)
cv2.line(gc, (620, 200), (640, 300), cv2.GC_BGD, 9)
cv2.grabCut(img, gc, rect, bgd, fgd, 4, cv2.GC_INIT_WITH_MASK)
region = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0)
region = region.astype(np.uint8)

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
core = np.zeros((H, W), np.uint8)
core[y0:y1, x0:x1] = ((gray[y0:y1, x0:x1] < 78)).astype(np.uint8) * 255
merged = np.maximum(region, core)

n, lab, stats, _c = cv2.connectedComponentsWithStats(merged, 8)
keep = lab[600, 800]
if keep == 0:
    keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
alpha = np.where(lab == keep, 255, 0).astype(np.uint8)
alpha = cv2.morphologyEx(alpha, cv2.MORPH_OPEN,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
alpha = cv2.GaussianBlur(alpha, (5, 5), 0)
alpha[:y0, :] = 0
alpha[:, :x0] = 0
alpha[:, x1:] = 0

pa = alpha[y0:, x0:x1]
pc = img[y0:, x0:x1]
pc = cv2.addWeighted(pc, 1.30, cv2.GaussianBlur(pc, (0, 0), 1.1), -0.30, 0)
cv2.imwrite(os.path.join(OUT, "man.png"), np.dstack([pc, pa]))
print("man alpha px:", int((pa > 128).sum()))

plate = img.copy()
remove = cv2.dilate(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
for lx0, ly0, lx1, ly1 in LABELS:
    remove[ly0:ly1, lx0:lx1] = 255
remove = cv2.dilate(remove, np.ones((5, 5), np.uint8))

m = remove.astype(np.float32) / 255.0
out = plate.astype(np.float32)
keepm = (1.0 - m)[..., None]

def nconv(sig):
    wgt = cv2.GaussianBlur(1.0 - m, (0, 0), sig)
    val = cv2.GaussianBlur(out * keepm, (0, 0), sig)
    return val / np.maximum(wgt, 1e-4)[..., None], wgt

coarse, _wc = nconv(75)
fine, wf = nconv(17)
blend = np.clip(wf * 8.0, 0.0, 1.0)[..., None]
diff = fine * blend + coarse * (1.0 - blend)
out = out * keepm + diff * m[..., None]
noise = np.random.default_rng(3).normal(0, 2.0, out.shape).astype(np.float32)
plate = np.clip(out + noise * m[..., None], 0, 255).astype(np.uint8)

cv2.imwrite(os.path.join(OUT, "plate.jpg"), plate,
            [cv2.IMWRITE_JPEG_QUALITY, 90])

with open(os.path.join(OUT, "fin.json"), "w") as f:
    json.dump({"man": [x0, y0, x1 - x0, H - y0], "size": [W, H]}, f)

sizes = {f: os.path.getsize(os.path.join(OUT, f)) // 1024
         for f in sorted(os.listdir(OUT))}
print(json.dumps(sizes, indent=0))
