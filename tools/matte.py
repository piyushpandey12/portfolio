"""
matte.py - offline background removal for the PIYUSH hero videos.

Studio white-cyclorama footage -> per-pixel alpha matte -> "packed alpha" video
(colour on the left half, matte on the right half of a double-width frame).

The packed layout is decoded by the WebGL compositor at runtime, which gives us
true per-pixel transparency in EVERY browser (plain H.264), instead of relying
on WebM/VP9 alpha, which Safari does not support.

Pipeline per frame
  1  edge-preserving denoise
  2  background plate estimate (quadratic surface fit on the border ring, so the
     cyclorama light falloff is modelled instead of assumed flat)
  3  distance to plate in Lab -> soft alpha
  4  border-seeded flood fill => "background connected to the frame edge".
     This is what saves video 2 WHITE SNEAKERS: they are colour-identical to the
     backdrop, but they are not connected to it, so they survive.
  5  largest-component keep + hole fill
  6  guided-filter refine against the colour frame (recovers hair detail)
  7  temporal EMA to remove matte flicker
  8  spill suppression on the rim
"""

import argparse
import gc
import json
import os
import shutil
import subprocess

import cv2
import numpy as np

def get_ffmpeg_bin():
    cmd = shutil.which("ffmpeg")
    if cmd:
        return cmd
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"

def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

def _guided_filter_fallback(I, p, r, eps, s=2):
    """Memory-efficient Fast Guided Filter (He & Sun) using OpenCV core boxFilter."""
    h, w = I.shape
    small_size = (w // s, h // s)
    s_I = cv2.resize(I, small_size, interpolation=cv2.INTER_AREA)
    s_p = cv2.resize(p, small_size, interpolation=cv2.INTER_AREA)
    small_r = max(1, r // s)
    ksize = (2 * small_r + 1, 2 * small_r + 1)

    mean_I = cv2.boxFilter(s_I, cv2.CV_32F, ksize)
    mean_p = cv2.boxFilter(s_p, cv2.CV_32F, ksize)
    mean_Ip = cv2.boxFilter(s_I * s_p, cv2.CV_32F, ksize)
    cov_Ip = mean_Ip - mean_I * mean_p
    del mean_Ip

    mean_II = cv2.boxFilter(s_I * s_I, cv2.CV_32F, ksize)
    var_I = mean_II - mean_I * mean_I
    del mean_II, s_I, s_p

    a = cov_Ip / (var_I + eps)
    b = mean_p - a * mean_I
    del cov_Ip, var_I, mean_I, mean_p

    mean_a = cv2.resize(cv2.boxFilter(a, cv2.CV_32F, ksize), (w, h), interpolation=cv2.INTER_LINEAR)
    del a
    mean_b = cv2.resize(cv2.boxFilter(b, cv2.CV_32F, ksize), (w, h), interpolation=cv2.INTER_LINEAR)
    del b

    np.multiply(mean_a, I, out=mean_a)
    np.add(mean_a, mean_b, out=mean_a)
    del mean_b
    return mean_a

def guided_filter(guide, src, r, eps):
    return _guided_filter_fallback(guide, src, r, eps)

def fit_bg_plate(L, ring, order=2):
    """Least-squares quadratic surface through the border-ring luminance."""
    h, w = L.shape
    ys, xs = np.nonzero(ring)
    if len(ys) < 64:
        return np.full((h, w), float(np.median(L)), np.float32)
    if len(ys) > 10000:
        idx = np.random.default_rng(7).choice(len(ys), 10000, replace=False)
        ys, xs = ys[idx], xs[idx]
    x = (xs / w).astype(np.float32)
    y = (ys / h).astype(np.float32)
    if order == 2:
        cols = [np.ones_like(x), x, y, x * x, x * y, y * y]
    else:
        cols = [np.ones_like(x), x, y]
    A = np.stack(cols, 1)
    z = L[ys, xs].astype(np.float32)
    coef, *_ = np.linalg.lstsq(A, z, rcond=None)

    gx = (np.arange(w, dtype=np.float32) / w)[None, :]
    gy = (np.arange(h, dtype=np.float32) / h)[:, None]
    c = coef.astype(np.float32)
    if order == 2:
        plate = (c[0] + c[1] * gx + c[3] * (gx * gx)) + gy * (c[2] + c[4] * gx) + (c[5] * (gy * gy))
    else:
        plate = c[0] + c[1] * gx + c[2] * gy
    return plate.astype(np.float32)

def border_ring(shape, px):
    h, w = shape
    m = np.zeros((h, w), np.uint8)
    m[:px, :] = 1
    m[-px:, :] = 1
    m[:, :px] = 1
    m[:, -px:] = 1
    return m

def keep_border_connected(mask_bg, seed_edges="ltrb"):
    """Keep only background blobs that touch a chosen frame edge."""
    n, lab, _stats, _c = cv2.connectedComponentsWithStats(mask_bg, connectivity=8)
    if n <= 1:
        return mask_bg
    touching = set()
    if "t" in seed_edges:
        touching |= set(np.unique(lab[0, :]).tolist())
    if "b" in seed_edges:
        touching |= set(np.unique(lab[-1, :]).tolist())
    if "l" in seed_edges:
        touching |= set(np.unique(lab[:, 0]).tolist())
    if "r" in seed_edges:
        touching |= set(np.unique(lab[:, -1]).tolist())
    touching.discard(0)
    if not touching:
        return np.zeros_like(mask_bg)
    return np.isin(lab, list(touching)).astype(np.uint8)

def largest_component(mask_fg, min_frac=0.004):
    n, lab, stats, _c = cv2.connectedComponentsWithStats(mask_fg, connectivity=8)
    if n <= 1:
        return mask_fg
    areas = stats[1:, cv2.CC_STAT_AREA]
    keep = 1 + int(np.argmax(areas))
    total = mask_fg.size
    ids = [keep] + [i + 1 for i, a in enumerate(areas)
                    if (i + 1) != keep and a > total * min_frac]
    return np.isin(lab, ids).astype(np.uint8)

def fill_holes(mask, min_area=0):
    """Flood from the border on the inverse; anything unreached is a hole.

    Only holes of at least ``min_area`` are filled. That distinction matters: the
    big enclosed region of a white sneaker must be filled, but the small gaps
    between strands of hair must stay transparent - filling those is what pastes
    backdrop-white flecks through the curls.
    """
    h, w = mask.shape
    inv = (1 - mask).astype(np.uint8)
    ff = inv.copy()
    guard = np.zeros((h + 2, w + 2), np.uint8)
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if ff[sy, sx] == 1:
            cv2.floodFill(ff, guard, (sx, sy), 2)
    holes = ((inv == 1) & (ff != 2)).astype(np.uint8)
    if min_area > 0 and holes.any():
        n, lab, stats, _c = cv2.connectedComponentsWithStats(holes, connectivity=8)
        keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_area]
        holes = np.isin(lab, keep).astype(np.uint8) if keep else np.zeros_like(holes)
    return (mask.astype(bool) | holes.astype(bool)).astype(np.uint8)

def drop_small(mask, min_area):
    """Remove connected components below ``min_area``."""
    if min_area <= 0 or not mask.any():
        return mask
    n, lab, stats, _c = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_area]
    return (np.isin(lab, keep).astype(np.uint8) if keep
            else np.zeros_like(mask, np.uint8))

def frame_alpha(bgr, cfg):
    h, w = bgr.shape[:2]
    sm = cv2.bilateralFilter(bgr, 5, 28, 7)
    lab = cv2.cvtColor(sm, cv2.COLOR_BGR2LAB).astype(np.float32)
    del sm
    L = lab[:, :, 0].copy()
    A = lab[:, :, 1] - 128.0
    B = lab[:, :, 2] - 128.0
    del lab

    ring = border_ring((h, w), cfg["ring"])
    ring_ok = ring.copy()
    ring_ok[L < cfg["ring_min_L"]] = 0
    plate = fit_bg_plate(L, ring_ok)
    has_ring = ring_ok.any()
    aR = float(np.median(A[ring_ok > 0])) if has_ring else 0.0
    bR = float(np.median(B[ring_ok > 0])) if has_ring else 0.0

    if cfg.get("lum_sign", 1) >= 0:
        dL = np.maximum(plate - L, 0.0)
    else:
        dL = np.maximum(L - plate, 0.0)
    dC = np.hypot(A - aR, B - bR)
    dist = dL * cfg["w_lum"] + dC * cfg["w_chroma"]

    soft = smoothstep(cfg["lo"], cfg["hi"], dist).astype(np.float32)
    bg_bgr = cv2.cvtColor(
        cv2.merge([np.clip(plate, 0, 255),
                   np.full((h, w), aR + 128.0, dtype=np.float32),
                   np.full((h, w), bR + 128.0, dtype=np.float32)]).astype(np.uint8),
        cv2.COLOR_LAB2BGR).astype(np.float32)

    bg_bin = (dist < cfg["bg_thr"]).astype(np.uint8)
    if cfg["edge_barrier"] > 0:
        gx = cv2.Sobel(L, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(L, cv2.CV_32F, 0, 1, ksize=3)
        grad = cv2.magnitude(gx, gy)
        bg_bin[grad > cfg["edge_barrier"]] = 0
    bg_bin = cv2.morphologyEx(bg_bin, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    reachable = keep_border_connected(bg_bin, cfg["seed_edges"])
    reachable = cv2.morphologyEx(reachable, cv2.MORPH_CLOSE,
                                 np.ones((3, 3), np.uint8)).astype(bool)

    fg_bin = (dist > cfg["fg_thr"]).astype(np.uint8)
    fg_bin = cv2.morphologyEx(fg_bin, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    fg_bin = largest_component(fg_bin, cfg.get("min_frac", 0.004))

    if cfg["hole_min"] > 0:
        sealed = cv2.morphologyEx(fg_bin, cv2.MORPH_CLOSE,
                                  np.ones((cfg["seal"], cfg["seal"]), np.uint8))
        holes = (fill_holes(sealed, cfg["hole_min"]).astype(bool)
                 & ~sealed.astype(bool))
        solid = fg_bin.astype(bool) | holes
    else:
        solid = fg_bin.astype(bool)

    k = np.ones((cfg["est_win"], cfg["est_win"]), np.uint8)
    if cfg.get("lum_sign", 1) >= 0:
        L_fg = cv2.erode(L, k)
        a_lum = np.clip((plate - L) / np.maximum(plate - L_fg, 12.0), 0.0, 1.0)
    else:
        L_fg = cv2.dilate(L, k)
        a_lum = np.clip((L - plate) / np.maximum(L_fg - plate, 12.0), 0.0, 1.0)
    C_fg = cv2.dilate(dC, k)
    a_chr = np.clip(dC / np.maximum(C_fg, 6.0), 0.0, 1.0)
    ratio = np.maximum(a_lum, a_chr).astype(np.float32)

    r = cfg["band"]
    grown = cv2.dilate(solid.astype(np.uint8),
                       cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                                 (2 * r + 1, 2 * r + 1)))
    unknown = grown.astype(bool) & ~solid
    a = np.zeros_like(ratio)
    a[solid] = 1.0
    a[unknown] = ratio[unknown]
    a[unknown & (dist < cfg["bg_thr"])] = 0.0
    a[reachable & ~solid] = np.minimum(a[reachable & ~solid], ratio[reachable & ~solid])

    guide = (cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0)
    a = guided_filter(guide, a.astype(np.float32),
                      cfg["gf_radius"], cfg["gf_eps"])
    a = np.nan_to_num(a, nan=0.0, posinf=1.0, neginf=0.0)
    a = np.clip(a, 0.0, 1.0)
    a = np.clip((a - cfg["choke"]) / max(1e-6, 1.0 - cfg["choke"]), 0.0, 1.0)
    a = smoothstep(cfg["out_lo"], cfg["out_hi"], a).astype(np.float32)

    fg = cfg.get("floor_guard", 0.0)
    if fg > 0:
        y0 = int(h * (1.0 - fg))
        band = a[y0:, :]
        gate = smoothstep(0.30, 0.72, band)
        depth = np.linspace(0.0, 1.0, band.shape[0], dtype=np.float32)[:, None]
        a[y0:, :] = band * (1.0 - depth * (1.0 - gate))

    if cfg.get("solidify", 0) > 0:
        sil = (a > 0.06).astype(np.uint8)
        k = cfg["solidify"]
        sil = cv2.morphologyEx(
            sil, cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        n_c, lab_c, stats_c, _cc = cv2.connectedComponentsWithStats(sil, connectivity=8)
        if n_c > 1:
            big = 1 + int(np.argmax(stats_c[1:, cv2.CC_STAT_AREA]))
            sil = (lab_c == big).astype(np.uint8)
        torso = a[int(h * 0.42) : int(h * 0.88), :]
        cols = (torso > 0.5).sum(0).astype(np.float32)
        cx = float((cols * np.arange(w)).sum() / max(cols.sum(), 1.0))
        xs = np.arange(w, dtype=np.float32)[None, :]
        ys = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
        halfw = w * (0.085 + 0.085 * np.clip((ys - 0.24) / 0.12, 0.0, 1.0))
        corridor = np.clip(1.0 - (np.abs(xs - cx) - halfw) / (w * 0.05),
                           0.0, 1.0)
        sil = fill_holes(sil)
        guard = cv2.GaussianBlur(
            cv2.dilate(sil, cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (15, 15))).astype(np.float32),
            (13, 13), 0)
        sil = cv2.erode(sil, cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (5, 5)))
        soft_sil = cv2.GaussianBlur(sil.astype(np.float32), (7, 7), 0)
        body = soft_sil * corridor
        a = np.maximum(a, body * 0.985)

        lum_keep = smoothstep(18.0, 110.0, L) ** 0.9
        outside = np.clip(1.0 - np.maximum(body, guard), 0.0, 1.0)
        a = a * (1.0 - outside + outside * lum_keep)
    return a, bg_bgr

def despill(bgr, a, bg_bgr, cfg):
    """Un-premultiply the backdrop out of partially covered pixels.

    Observed = a*F + (1-a)*B, so the true subject colour is (Observed-(1-a)B)/a.
    Without this the hair edge keeps its milky backdrop tint.
    """
    out = bgr.astype(np.float32)
    if cfg["despill"] <= 0:
        return out
    a3 = a[..., None]
    est = (out - (1.0 - a3) * bg_bgr) / np.maximum(a3, cfg["unmul_floor"])
    est = np.clip(est, 0, 255)
    w = (a < 0.995).astype(np.float32)[..., None] * cfg["despill"]
    return out * (1.0 - w) + est * w

PRESETS = {
    "v1": dict(ring=14, ring_min_L=150, w_lum=1.0, w_chroma=1.6, lo=12, hi=46,
               bg_thr=10, fg_thr=52, edge_barrier=0, seed_edges="ltrb",
               band=26, seal=9, hole_min=0, gf_radius=4, gf_eps=1e-4, choke=0.06,
               out_lo=0.14, out_hi=0.96, despill=1.0, unmul_floor=0.22,
               est_win=17, ema=0.55, floor_guard=0.14),
    "v2": dict(ring=10, ring_min_L=200, w_lum=1.0, w_chroma=2.6, lo=15, hi=32,
               bg_thr=13, fg_thr=34, edge_barrier=26, seed_edges="ltr",
               band=26, seal=9, hole_min=2500, gf_radius=4, gf_eps=1e-4, choke=0.06,
               out_lo=0.14, out_hi=0.96, despill=1.0, unmul_floor=0.22,
               est_win=17, ema=0.55),
    "v5": dict(ring=12, ring_min_L=0, lum_sign=-1, w_lum=1.0, w_chroma=1.4,
               lo=2.5, hi=10, bg_thr=3, fg_thr=6, edge_barrier=0,
               seed_edges="ltrb", band=22, seal=13, hole_min=900,
               min_frac=0.0006, gf_radius=4, gf_eps=1e-4, choke=0.035,
               out_lo=0.10, out_hi=0.97, despill=0.0, unmul_floor=0.22,
               est_win=17, ema=0.55, floor_guard=0.12, solidify=25),
    "v3": dict(ring=14, ring_min_L=150, w_lum=1.0, w_chroma=1.6, lo=11, hi=42,
               bg_thr=9, fg_thr=48, edge_barrier=0, seed_edges="ltrb",
               band=26, seal=9, hole_min=0, gf_radius=4, gf_eps=1e-4, choke=0.06,
               out_lo=0.14, out_hi=0.96, despill=1.0, unmul_floor=0.22,
               est_win=17, ema=0.55),
}

def qa_sheet(shots, path):
    tiles = []
    for _idx, fr, a in shots:
        h, w = a.shape
        yy = np.arange(h)[:, None]
        xx = np.arange(w)[None, :]
        checker = (((yy // 24 + xx // 24) % 2) * 55 + 20).astype(np.float32)
        comp = fr.astype(np.float32) * a[..., None] + \
            (1.0 - a[..., None]) * checker[..., None]
        tiles.append(cv2.resize(comp, (260, 462)))
    if tiles:
        cv2.imwrite(path, np.concatenate(tiles, 1).astype(np.uint8))

def process(src, preset, out_w, out_h, outdir, name, trim=None, qa=None,
            fps=24, crf=18, overrides=None) -> dict[str, object]:
    cfg = dict(PRESETS[preset])
    cfg.update(overrides or {})
    cap = cv2.VideoCapture(src)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    start, end = trim or (0, total)
    end = min(end, total)

    pw, ph = out_w * 2, out_h
    mp4 = os.path.join(outdir, name + ".mp4")
    webm = os.path.join(outdir, name + ".webm")
    cmd = [
        get_ffmpeg_bin(), "-v", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", "%dx%d" % (pw, ph),
        "-r", str(fps), "-i", "-",
        "-an", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(crf),
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
        "-color_range", "pc", "-movflags", "+faststart", mp4,
    ]
    frame_bytes = pw * ph * 3
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, bufsize=frame_bytes)
    assert proc.stdin is not None

    prev = None
    shots = []
    written = 0
    for i in range(end):
        ok, fr = cap.read()
        if not ok:
            break
        if i < start:
            continue
        a, bg_bgr = frame_alpha(fr, cfg)
        if prev is not None:
            w = np.clip(cfg["ema"] + np.abs(a - prev) * 2.5, 0.0, 1.0)
            a = w * a + (1.0 - w) * prev
        prev = a

        col = despill(fr, a, bg_bgr, cfg) * a[..., None]
        del bg_bgr
        col = cv2.resize(col, (out_w, out_h), interpolation=cv2.INTER_AREA)
        m = cv2.resize(a, (out_w, out_h), interpolation=cv2.INTER_AREA)
        mat = np.repeat((m * 255.0)[..., None], 3, axis=2)
        del m
        packed = np.concatenate([np.clip(col, 0, 255), np.clip(mat, 0, 255)], 1)
        del col, mat
        proc.stdin.write(packed.astype(np.uint8).tobytes())
        del packed
        proc.stdin.flush()

        if qa and i in qa:
            shots.append((i, fr.copy(), a.copy()))
        del fr, a

        written += 1
        if written % 2 == 0:
            gc.collect()

    proc.stdin.close()
    proc.wait()
    cap.release()

    ff = get_ffmpeg_bin()
    try:
        subprocess.run([
            ff, "-v", "error", "-y", "-i", mp4,
            "-an", "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0",
            "-row-mt", "1", "-cpu-used", "4", "-pix_fmt", "yuv420p", webm
        ], check=True)
    except Exception as e:
        print("  warning: webm conversion failed:", e)

    if shots:
        qa_sheet(shots, os.path.join(outdir, "_qa_" + name + ".png"))
    return dict(name=name, frames=written, w=out_w, h=out_h,
                mp4=os.path.basename(mp4), webm=os.path.basename(webm))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--preset", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--w", type=int, required=True)
    ap.add_argument("--h", type=int, required=True)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--end", type=int, default=10 ** 9)
    ap.add_argument("--qa", default="")
    ap.add_argument("--set", default="", help="k=v,k=v preset overrides")
    args = ap.parse_args()

    qa = set(int(x) for x in args.qa.split(",") if x.strip()) if args.qa else None
    ov = {}
    for kv in filter(None, args.set.split(",")):
        k, v = kv.split("=")
        ov[k.strip()] = float(v) if "." in v or "e" in v.lower() else int(v)
    os.makedirs(args.out, exist_ok=True)
    print(json.dumps(process(args.src, args.preset, args.w, args.h, args.out,
                             args.name, trim=(args.start, args.end), qa=qa,
                             overrides=ov)))

if __name__ == "__main__":
    main()
