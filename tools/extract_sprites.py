#!/usr/bin/env python3
"""Tách sprite từ sheet gốc (assets/src) -> PNG nền trong suốt.

Mỗi sprite sinh ra 2 file:
  <name>.png       : nét mực đen, nền trong suốt (alpha = độ đậm của nét)
  <name>_fill.png  : mask vùng kín bên trong nét (để game tô màu phe)

Chạy: python3 tools/extract_sprites.py
Yêu cầu: pillow, numpy, scipy
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "src")

# (tên, x0, y0, x1, y1) trong ảnh gốc
# (tên, x0, y0, x1, y1, y_cắt): vạch mặt đất nghiêng nên mỗi hình cắt ở một hàng riêng,
# ngay dưới gót chân (đo từ histogram hàng ảnh gốc).
UNITS = [
    ("militia",  140, 95, 310, 272, 271),
    ("infantry", 335, 95, 480, 272, 271),
    ("archer",   500, 95, 650, 272, 266),
    ("cavalry",  715, 40, 960, 272, 266),
]
BUILDINGS = [
    ("stronghold", 100, 36, 215, 152),   # thành lớn
    ("castle_town", 238, 60, 380, 148),
    ("fortress",   104, 452, 266, 549),  # thành luỹ
    ("village_a",  306, 475, 398, 540),
    ("village_b",  428, 476, 520, 542),
    ("tower_a",    535, 466, 602, 550),
    ("tower_b",    440, 583, 498, 673),
    ("tower_c",    478, 1008, 540, 1088),
    ("manor",      311, 589, 405, 665),
    ("keep",       129, 570, 263, 681),
    ("town",       122, 717, 257, 808),
    ("inn",        429, 734, 499, 802),
    ("hamlet",     315, 738, 381, 807),
    ("city",       113, 854, 265, 948),
    ("cottages",   321, 866, 403, 941),
    ("domed",      113, 1001, 254, 1093),
    ("ruin_a",     664, 155, 770, 281),
    ("ruin_b",     409, 166, 514, 270),
    ("ruin_c",     111, 171, 214, 268),
    ("ruin_d",     545, 174, 653, 274),
    ("ruin_e",     241, 187, 324, 250),
]


def process(img, box, out_base, erase_below=None):
    x0, y0, x1, y1 = box
    g = np.array(img.convert("L")).astype(float)
    if erase_below is not None:
        g[erase_below:, :] = 255
    g = g[y0:y1, x0:x1]
    alpha = np.clip((235 - g) / (235 - 90), 0, 1)  # nét đen -> 1
    ink = alpha > 0.45
    # bỏ đốm nhiễu nhỏ
    lab, n = ndi.label(ndi.binary_dilation(ink, iterations=2))
    if n:
        sizes = ndi.sum(ink, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes > 12
        mask = keep[lab]
        alpha = alpha * mask
        ink = ink & mask
    # crop sát
    ys, xs = np.where(ink)
    if len(ys) == 0:
        return None
    pad = 4
    ya, yb = max(ys.min() - pad, 0), min(ys.max() + pad + 1, ink.shape[0])
    xa, xb = max(xs.min() - pad, 0), min(xs.max() + pad + 1, ink.shape[1])
    alpha, ink = alpha[ya:yb, xa:xb], ink[ya:yb, xa:xb]
    # vùng kín: không-nét mà không nối với biên (sau khi nong nét để bịt khe hở nhỏ)
    sealed = ndi.binary_dilation(ink, iterations=2)
    seed = np.zeros_like(sealed)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    outside = ndi.binary_propagation(seed & ~sealed, mask=~sealed)
    inside = ~outside
    inside = ndi.binary_erosion(inside, iterations=1) & ~ink
    h, w = alpha.shape
    line = np.zeros((h, w, 4), np.uint8)
    line[..., 3] = (alpha * 255).astype(np.uint8)
    fill = np.zeros((h, w, 4), np.uint8)
    fill[..., :3] = 255
    fill[..., 3] = (inside * 255).astype(np.uint8)
    Image.fromarray(line).save(out_base + ".png")
    Image.fromarray(fill).save(out_base + "_fill.png")
    return (w, h)


def main():
    os.makedirs(os.path.join(ROOT, "assets", "units"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "assets", "buildings"), exist_ok=True)
    us = Image.open(os.path.join(SRC, "units_sheet.jpg"))
    for name, *box, cut in UNITS:
        # xoá vạch mặt đất dưới chân
        r = process(us, box, os.path.join(ROOT, "assets", "units", name), erase_below=cut)
        print("unit", name, r)
    bs = Image.open(os.path.join(SRC, "buildings_sheet.jpg"))
    for name, *box in BUILDINGS:
        r = process(bs, box, os.path.join(ROOT, "assets", "buildings", name))
        print("building", name, r)


if __name__ == "__main__":
    main()
