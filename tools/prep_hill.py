#!/usr/bin/env python3
"""Sprite đồi từ bản vẽ nháp (docs/art/tiles/decor/hill_user.png, ảnh chụp có nền xanh đặc):
tách vòm khỏi nền, bỏ dải đáy mờ, đáy cong nhẹ + dither để hoà vào nền, thu về lưới pixel gốc, ép màu.
  python3 tools/prep_hill.py   ->  assets/terrain/hill_0.png"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs/art/tiles/decor/hill_user.png")
OUT = os.path.join(ROOT, "assets/terrain/hill_0.png")
ART_W = 64          # chiều rộng theo pixel gốc
YB, DROP = 166, 14  # hàng đáy ở giữa và độ nâng của hai mép (đáy là cung elip)

im = Image.open(SRC).convert("RGB")
a = np.array(im).astype(int)
bg = np.array(a[2, 2])
d = np.abs(a - bg).sum(2)
dark = d > 70                                    # nét viền tối của vòm
H, W = d.shape
cols = np.where(dark.any(0))[0]
x0, x1 = cols.min(), cols.max()
xc, hw = (x0 + x1) / 2, (x1 - x0) / 2
alpha = np.zeros((H, W), np.uint8)
for x in range(x0, x1 + 1):
    ys = np.where(dark[:YB, x])[0]
    if not len(ys):
        continue
    t = min(1.0, abs(x - xc) / hw)
    ylow = int(YB - DROP * (1 - np.sqrt(1 - t * t)))
    alpha[ys.min():ylow, x] = 255
rgba = np.dstack([a.astype(np.uint8), alpha])
img = Image.fromarray(rgba, "RGBA")
img = img.crop(img.getbbox())
h = max(1, round(img.height * ART_W / img.width))
img = img.resize((ART_W, h), Image.BOX)        # PIL tính premultiplied cho RGBA
arr = np.array(img)
opaque = arr[:, :, 3] > 128
rgb = Image.fromarray(arr[:, :, :3]).quantize(14, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
out = np.dstack([np.array(rgb), (opaque * 255).astype(np.uint8)])
# đáy: dither hai hàng cuối để hoà vào nền
for x in range(out.shape[1]):
    ys = np.where(out[:, x, 3] > 0)[0]
    if len(ys):
        yl = ys.max()
        if x % 2 == 0:
            out[yl, x, 3] = 0
        if yl - 1 >= 0 and (x + 1) % 3 == 0:
            out[yl - 1, x, 3] = 0
# bỏ điểm lẻ không có láng giềng
al = out[:, :, 3] > 0
pad = np.pad(al, 1)
nb = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
out[al & ~nb, 3] = 0
res = Image.fromarray(out, "RGBA")
res = res.crop(res.getbbox())
os.makedirs(os.path.dirname(OUT), exist_ok=True)
res.save(OUT, optimize=True)
print(res.size)
