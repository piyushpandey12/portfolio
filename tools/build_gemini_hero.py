import json
import os
import subprocess
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets_src", "v1.mp4")
MEDIA = os.path.join(ROOT, "public", "media")
OUT_MP4 = os.path.join(MEDIA, "hero.mp4")
OUT_WEBM = os.path.join(MEDIA, "hero.webm")
OUT_JPG = os.path.join(MEDIA, "hero.jpg")
MANIFEST = os.path.join(MEDIA, "manifest.json")

def get_ffmpeg():
    import shutil
    cmd = shutil.which("ffmpeg")
    if cmd: return cmd
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"

def process_frame(fr, k_vert):
    h, w = fr.shape[:2]
    gray = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
    
    fg = (gray >= 4).astype(np.uint8)
    fg_closed = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k_vert)
    
    inv = (1 - fg_closed).astype(np.uint8)
    guard = np.zeros((h + 2, w + 2), np.uint8)
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        cv2.floodFill(inv, guard, (sx, sy), 2)
    holes = ((inv == 1) & (fg_closed == 0)).astype(np.uint8)
    solid = ((fg_closed == 1) | (holes == 1)).astype(np.uint8)
    
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(solid, 8)
    if num_labels <= 1:
        return np.zeros((h, w), dtype=np.uint8), [0.35, 0.05, 0.65, 0.95]
        
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    person = (labels == largest).astype(np.uint8)
    
    top_fade = np.clip(np.linspace(0.0, 1.0, 24)[:, None] * 1.5, 0.0, 1.0)
    person[:24, :] = (person[:24, :].astype(np.float32) * top_fade).astype(np.uint8)
    
    alpha = cv2.GaussianBlur(person.astype(np.float32), (5, 5), 0.8)
    alpha = np.clip(alpha, 0.0, 1.0)
    
    row_widths = person.sum(axis=1)
    wide_rows = np.nonzero(row_widths >= 90)[0]
    head_y = wide_rows[0] if len(wide_rows) > 0 else stats[largest, cv2.CC_STAT_TOP]
    
    nz_rows = np.nonzero(person.any(axis=1))[0]
    feet_y = nz_rows[-1] if len(nz_rows) > 0 else h
    
    nz_cols = np.nonzero(person.any(axis=0))[0]
    col_x0 = nz_cols[0] if len(nz_cols) > 0 else 0
    col_x1 = nz_cols[-1] if len(nz_cols) > 0 else w
    
    box = [round(col_x0 / w, 4), round(head_y / h, 4), round((col_x1 + 1) / w, 4), round((feet_y + 1) / h, 4)]
    
    matte = (alpha * 255.0).astype(np.uint8)
    return matte, box

def main():
    ffmpeg = get_ffmpeg()
    cap = cv2.VideoCapture(SRC)
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    
    k_vert = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 27))
    
    pipe_mp4 = subprocess.Popen([
        ffmpeg, "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-s", f"{w * 2}x{h}", "-pix_fmt", "bgr24", "-r", str(fps),
        "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
        "-preset", "medium", "-movflags", "+faststart",
        OUT_MP4
    ], stdin=subprocess.PIPE)
    
    pipe_webm = subprocess.Popen([
        ffmpeg, "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-s", f"{w * 2}x{h}", "-pix_fmt", "bgr24", "-r", str(fps),
        "-i", "-",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", "24",
        "-b:v", "0", "-deadline", "good", "-cpu-used", "2",
        OUT_WEBM
    ], stdin=subprocess.PIPE)
    
    boxes = []
    first_frame_saved = False
    
    for fr_idx in range(n_frames):
        ret, fr = cap.read()
        if not ret: break
        
        matte, box = process_frame(fr, k_vert)
        boxes.append(box)
        
        if not first_frame_saved:
            cv2.imwrite(OUT_JPG, fr, [cv2.IMWRITE_JPEG_QUALITY, 85])
            first_frame_saved = True
            
        m3 = cv2.merge([matte, matte, matte])
        packed = np.hstack([fr, m3])
        packed_bytes = packed.tobytes()
        pipe_mp4.stdin.write(packed_bytes)
        pipe_webm.stdin.write(packed_bytes)
        
    cap.release()
    pipe_mp4.stdin.close()
    pipe_mp4.wait()
    pipe_webm.stdin.close()
    pipe_webm.wait()
    
    arr = np.array(boxes, dtype=np.float32)
    k = 9
    pad = np.pad(arr, ((k // 2, k // 2), (0, 0)), mode="edge")
    smoothed = np.stack([np.convolve(pad[:, i], np.ones(k) / k, "valid") for i in range(4)], 1)
    clean_track = np.round(smoothed, 4).tolist()
    
    with open(MANIFEST, "r", encoding="utf-8") as f:
        manifest = json.load(f)
        
    manifest["clips"]["hero"]["track"] = clean_track
    manifest["clips"]["hero"]["w"] = w
    manifest["clips"]["hero"]["h"] = h
    manifest["clips"]["hero"]["frames"] = len(clean_track)
    manifest["clips"]["hero"]["fps"] = fps
    
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
        
    print("Successfully built hero.mp4, hero.webm, hero.jpg and updated manifest.json")

if __name__ == "__main__":
    main()
