#!/usr/bin/env python3
"""Cắt sheet công trình và mây (docs/art/tiles/decor/*_raw.png, nền magenta/tối có quầng sáng do model tự thêm)
thành sprite pixel art ở độ phân giải gốc, ghi vào assets/terrain/:
  house_0..7  nhà làng (0-2 mái tranh, 3-4 mái ngói, 5 ống khói, 6 giếng, 7 vựa lúa)
  tower_0..4  tháp canh (0-2 gỗ, 3 đá, 4 cổng thành)     mine_0  cửa hầm mỏ
  castle_0..2 thành (người, orc, âm binh)                camp_0..2  trại (người, orc, âm binh)
  (mây pixel được sinh bằng code: src/render/pixelcloud.js)
  python3 tools/prep_buildings.py"""
import os
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
from prep_decor import crisp, OUT, rows, B

SRC = os.path.join(os.path.dirname(OUT), "..", "docs/art/tiles/decor")
SRC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs/art/tiles/decor"))


def cut_hp(path, minarea=1500, thr=14):
    im = np.array(Image.open(path).convert("RGB"))
    f = im.astype(np.float32)
    hp = np.abs(f - cv2.GaussianBlur(f, (0, 0), 5)).sum(2)
    m = (hp > thr).astype(np.uint8)
    m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=2)
    m = cv2.erode(m, np.ones((3, 3), np.uint8), iterations=1)
    m = ndi.binary_fill_holes(m).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, connectivity=8)
    out = []
    for i in range(1, n):
        x, y, w, h, ar = st[i]
        if ar < minarea:
            continue
        a = np.dstack([im, (lab == i).astype(np.uint8) * 255])
        out.append((cen[i][1], cen[i][0], Image.fromarray(a, "RGBA").crop((x, y, x + w, y + h))))
    return out


def ordered(cs):
    return [im for r in rows(cs) for im in r]


def save(group, items, colors=26):
    for i, im in enumerate(items):
        crisp(im, colors).save(os.path.join(OUT, f"{group}_{i}.png"), optimize=True)
    print(group, len(items))


save("house", ordered(cut_hp(f"{SRC}/village_raw.png")))
mil = ordered(cut_hp(f"{SRC}/military_raw.png"))
save("tower", mil[:5])
save("mine", mil[5:6])
st = ordered(cut_hp(f"{SRC}/strong_raw.png", 3000))
save("castle", st[:3])
save("camp", st[3:6])
