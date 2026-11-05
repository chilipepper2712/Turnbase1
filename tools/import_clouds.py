#!/usr/bin/env python3
"""Nhập ảnh mây nền trắng thành PNG nền trong suốt (assets/clouds/cloudN.png).

  python3 tools/import_clouds.py <thư mục chứa ảnh .jpg> [--width 360]

Bỏ nền trắng nối với mép ảnh (phần trắng bên trong viền mây được giữ đặc), cắt sát, thu về --width, làm mềm mép.
"""
import argparse, os, sys, glob
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("--width", type=int, default=360)
a = ap.parse_args()
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "clouds")
os.makedirs(out, exist_ok=True)
files = sorted(glob.glob(os.path.join(a.src, "*.jpg")))
for i, f in enumerate(files):
    rgb = np.array(Image.open(f).convert("RGB")).astype(int)
    white = rgb.min(2) > 238
    lab, _ = ndi.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # phần trắng ngoài viền nhưng nằm trong khe hở nhỏ giữa các nét: giữ nguyên (không đụng)
    al = (~bg).astype(np.uint8) * 255
    ys, xs = np.where(al > 0)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb.astype(np.uint8), al])[y0:y1, x0:x1]
    im = Image.fromarray(rgba, "RGBA")
    # nở mép 1px bằng alpha mềm để không răng cưa
    r, g, b, al_ = im.split()
    al_ = al_.filter(ImageFilter.GaussianBlur(0.8))
    im = Image.merge("RGBA", (r, g, b, al_))
    h = round(im.height * a.width / im.width)
    im = im.resize((a.width, h), Image.LANCZOS)
    im.save(os.path.join(out, f"cloud{i}.png"), optimize=True)
    print(os.path.basename(f), "->", f"cloud{i}.png", im.size)
