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
    """Hình bóng đặc của icon, để lót một lớp nền giấy solid che đường lưới phía sau.

    Icon của Kenney chỉ là nét; nhiều icon hở đáy (hầm mỏ, núi, đá) hoặc có khe hở nhỏ trên nét nên
    "vùng kín" không đủ. Cách làm: nối đáy bằng một đường ảo, bịt khe hở bằng closing, lấp lỗ, rồi nở nhẹ
    để lớp nền nằm dưới cả nét vẽ (không để lộ viền trong suốt cạnh nét)."""
    ink = alpha > 0.35
    closed = ink.copy()
    ys, xs = np.where(ink)
    ybot = ys.max()
    band = ink[max(ybot - 2, 0): ybot + 1]      # chỉ xét vài hàng cuối: cây có thân hẹp ở đáy, núi/hầm mỏ thì đáy rộng
    bx = np.where(band.any(0))[0]
    # chỉ bịt đáy khi đáy thật sự rộng (núi, hầm mỏ, đá); cây có thân hẹp thì bỏ qua, kẻo vệt trắng thừa dưới gốc
    if (bx.max() - bx.min() + 1) > 0.5 * ink.shape[1]:
        closed[ybot, bx.min(): bx.max() + 1] = True
    closed = ndi.binary_closing(closed, structure=np.ones((3, 3), bool), iterations=3)
    filled = ndi.binary_fill_holes(closed)
    return ndi.binary_dilation(filled, iterations=1)


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
