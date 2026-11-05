#!/usr/bin/env python3
"""Nhập icon từ Kenney Cartography Pack (CC0) vào assets/buildings/.

  python3 tools/import_kenney.py <đường dẫn kenney_cartography-pack.zip>

Mỗi icon sinh ra: <tên>.png (nét mực, nền trong suốt, cắt sát) và <tên>_fill.png (mask vùng kín bên trong
để game tô màu phe / tô nền giấy che các đường lưới phía sau). Dùng bản Retina (128–256px) cho nét rõ.
Yêu cầu: pillow, numpy, scipy. Không giải nén zip ra đĩa, chỉ đọc từng file cần.
"""
import io, os, sys, zipfile
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "buildings")
INK = (27, 27, 27)

NAMES = [
    # thành, tường, tháp
    "castle", "castleTall", "castleWide", "castleWideLow", "gate", "wall", "towerLow", "tower", "towerTall",
    "towerWatch", "watchtower",
    # nhà, công trình khác
    "house", "houseChimney", "houseSmall", "houseTall", "houseViking", "houses", "church", "churchLarge",
    "mill", "mine", "stable", "tent", "tipi", "well", "campfire", "fence", "flag", "banner",
    # cây, bụi, đá, núi
    "bush", "treePine", "treePineLarge", "treePines", "treePinesSmall", "treeTall",
    "rocks", "rocksA", "rocksB", "rocksMountain", "rocksTall",
]


def fill_mask(alpha):
    ink = alpha > 0.4
    sealed = ndi.binary_dilation(ink, iterations=2)
    seed = np.zeros_like(sealed)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    outside = ndi.binary_propagation(seed & ~sealed, mask=~sealed)
    inside = ndi.binary_erosion(~outside, iterations=1) & ~ink
    return inside


def main(zip_path):
    os.makedirs(OUT, exist_ok=True)
    zf = zipfile.ZipFile(zip_path)
    members = {os.path.basename(n)[:-4]: n for n in zf.namelist() if n.startswith("PNG/Retina/") and n.endswith(".png")}
    done = 0
    for name in NAMES:
        if name not in members:
            print("thiếu:", name); continue
        im = Image.open(io.BytesIO(zf.read(members[name]))).convert("RGBA")
        a = np.array(im)
        alpha = a[..., 3].astype(float) / 255
        ys, xs = np.where(alpha > 0.15)
        pad = 3
        y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, a.shape[0])
        x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, a.shape[1])
        alpha = alpha[y0:y1, x0:x1]
        line = np.zeros(alpha.shape + (4,), np.uint8)
        line[..., :3] = INK
        line[..., 3] = (alpha * 255).astype(np.uint8)
        fill = np.zeros_like(line)
        fill[..., :3] = 255
        fill[..., 3] = (fill_mask(alpha) * 255).astype(np.uint8)
        Image.fromarray(line).save(os.path.join(OUT, name + ".png"), optimize=True)
        Image.fromarray(fill).save(os.path.join(OUT, name + "_fill.png"), optimize=True)
        done += 1
    lic = zf.read("License.txt").decode("utf8", "replace")
    with open(os.path.join(ROOT, "assets", "KENNEY_LICENSE.txt"), "w") as f:
        f.write("Cartography Pack by Kenney (www.kenney.nl), CC0 1.0. Tách và đổi màu nét bằng tools/import_kenney.py.\n\n" + lic)
    print(f"đã nhập {done}/{len(NAMES)} icon vào {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
