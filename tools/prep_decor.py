#!/usr/bin/env python3
"""Cắt các sheet vật thể địa hình (docs/art/tiles/decor/*_sheet.png, nền trong suốt) thành sprite pixel art ở độ phân giải gốc:
lấy mẫu giữa mỗi ô pixel 4x4, lọc nhiễu, ép 22 màu, alpha cứng, bỏ ám tím từ nền magenta.
Kết quả: assets/terrain/<nhóm>_<n>.png (nhỏ, vài chục pixel). Game phóng lên bằng nearest.

  python3 tools/prep_decor.py
"""
import os
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs/art/tiles/decor")
OUT = os.path.join(ROOT, "assets/terrain")
B = 4


def comps(path, minarea):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)[:, :, 3]
    n, lab, st, cen = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8), connectivity=8)
    out = []
    for i in range(1, n):
        x, y, w, h, ar = st[i]
        if ar < minarea or w < 10:
            continue
        out.append((cen[i][1], cen[i][0], im.crop((x, y, x + w, y + h))))
    return out


def rows(cs):
    cs = sorted(cs, key=lambda c: c[0])
    groups = [[cs[0]]]
    for c in cs[1:]:
        if c[0] - groups[-1][-1][0] > 45:
            groups.append([c])
        else:
            groups[-1].append(c)
    return [[g[2] for g in sorted(gr, key=lambda c: c[1])] for gr in groups]


def crisp(img, colors=22):
    a = np.array(img.convert("RGBA"))
    h, w = a.shape[:2]
    gh, gw = h // B, w // B
    ys = np.arange(gh) * B + B // 2
    xs = np.arange(gw) * B + B // 2
    g = a[np.ix_(ys, xs)]
    alpha = g[:, :, 3] > 128
    rgb = cv2.medianBlur(np.ascontiguousarray(g[:, :, :3]), 3)
    pil = Image.fromarray(rgb).quantize(colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    q = np.array(pil).astype(int)
    r0 = g[:, :, :3].astype(int)
    warm = (r0[:, :, 0] > r0[:, :, 1] * 1.35) & (r0[:, :, 0] > 55) & (r0[:, :, 2] < r0[:, :, 0] * 0.85)
    q[warm] = r0[warm]                                   # giữ màu nâu thân cây, ép màu hay làm nó đen
    R, G, Bc = q[:, :, 0], q[:, :, 1], q[:, :, 2]
    spill = (R > G + 6) & (Bc > G + 6) & (np.maximum(np.maximum(R, G), Bc) < 150)
    q[spill] = (24, 34, 28)                              # viền ám tím do nền magenta -> viền tối
    out = np.dstack([q.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    im = Image.fromarray(out, "RGBA")
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def save(group, items):
    for i, im in enumerate(items):
        crisp(im).save(os.path.join(OUT, f"{group}_{i}.png"), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".png") and not f.startswith("hill_"):   # hill_0 do tools/prep_hill.py tạo
            os.remove(os.path.join(OUT, f))
    pines = [c[2] for c in sorted(comps(f"{SRC}/pines_sheet.png", 1500), key=lambda c: (round(c[0] / 300), c[1]))]
    save("pine", pines)
    tg = rows(comps(f"{SRC}/tufts_sheet.png", 150))
    save("tuft", tg[0] + tg[1])
    save("bush", tg[2])
    save("tiny", tg[4] if len(tg) > 4 else [])
    rg = rows(comps(f"{SRC}/rocks_sheet.png", 150))
    save("boulder", rg[0] + rg[1][:1])
    save("mound", rg[1][1:])
    save("reed", rg[2])
    save("shrub", rg[3][2:])
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(len(os.listdir(OUT)), "file,", total, "byte")


main()
