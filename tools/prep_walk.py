#!/usr/bin/env python3
"""Tách sprite sheet (lưới đều) thành một dải ngang các frame, nền trong suốt, cùng một khung cắt cho mọi frame
(nên chân đứng yên giữa các frame). Dùng cho animation đi bộ.

  python3 tools/prep_walk.py sheet.png --cols 4 --rows 4 --out assets/units/human_militia_walk.png [--scale 3] [--flip] [--checker]

Đăng ký số frame trong WALK ở src/render/assets.js.
"""
import argparse, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from simplify_sprite import remove_bg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, required=True); ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--scale", type=int, default=3, help="phóng nguyên số (nearest) để giữ pixel sắc nét")
    ap.add_argument("--flip", action="store_true"); ap.add_argument("--checker", action="store_true")
    ap.add_argument("--max-frames", type=int, default=0)
    a = ap.parse_args()
    im = np.array(Image.open(a.src).convert("RGB"))
    ch, cw = im.shape[0] // a.rows, im.shape[1] // a.cols
    cells, alphas = [], []
    for r in range(a.rows):
        for c in range(a.cols):
            cell = im[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            cells.append(cell); alphas.append(remove_bg(cell, 0, a.checker))
    if a.max_frames:
        cells, alphas = cells[:a.max_frames], alphas[:a.max_frames]
    union = np.any(alphas, axis=0)
    ys, xs = np.where(union)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    frames = []
    for cell, al in zip(cells, alphas):
        rgba = np.dstack([cell, al.astype(np.uint8) * 255])[y0:y1, x0:x1]
        if a.flip:
            rgba = rgba[:, ::-1]
        f = Image.fromarray(rgba, "RGBA").resize(((x1 - x0) * a.scale, (y1 - y0) * a.scale), Image.NEAREST)
        frames.append(f)
    w, h = frames[0].size
    strip = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f, (i * w, 0))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    strip.save(a.out, optimize=True)
    print(f"{len(frames)} frame, mỗi frame {w}x{h} -> {a.out}")


if __name__ == "__main__":
    main()
