#!/usr/bin/env python3
"""Đơn giản hoá sprite AI (nhiều chi tiết) thành vài mảng màu lớn, viền đen dày, nền trong suốt.

  python3 tools/simplify_sprite.py <ảnh> --out assets/units/infantry.png [--height 160] [--colors 7]
         [--flip] [--team 3,4] [--team-hue blue|red|both] [--preview palette.png]

Các bước:
  1. bỏ nền trắng (flood fill từ mép), cắt sát, thu nhỏ về --height (chống nhiễu ô cờ của AI);
  2. làm mịn giữ cạnh (mean-shift) để các mảng cùng màu hoà vào nhau;
  3. gộp về --colors màu bằng k-means trong không gian Lab;
  4. bỏ đốm: mảnh nhỏ hơn --min-area bị nuốt vào mảng lớn kế bên;
  5. viền đen dày quanh hình bóng.
  --team: các cụm màu (đánh số theo ảnh --preview) sẽ đổi sang màu phe (xanh dương / đỏ), giữ độ sáng.
  --team-hue both sinh luôn hai bản <out>_blue.png và <out>_red.png (tên human_/orc_ nếu dùng --pair).

Yêu cầu: opencv-python-headless, pillow, numpy, scipy.
"""
import argparse, colorsys, os
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

INK = np.array([27, 27, 27], np.uint8)
TEAM_HUE = {"blue": 0.60, "red": 0.01}


def remove_bg(rgb, holes=0, checker=False):
    """Bỏ nền nối với mép ảnh. Nền trắng thường; checker=True cho ảnh có ô cờ "giả trong suốt" vẽ sẵn
    (các ô trắng và xám nhạt trung tính). holes>0: bỏ luôn vùng nền kín có diện tích >= holes px."""
    if checker:
        near_white = (rgb.min(2) > 190) & ((rgb.max(2) - rgb.min(2)) < 16)
    else:
        near_white = rgb.min(2) > 235
    lab, n = ndi.label(near_white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    if holes:
        sizes = ndi.sum(near_white, lab, range(1, n + 1))
        for i, sz in enumerate(sizes, 1):
            if sz >= holes:
                bg |= lab == i
    return ndi.binary_opening(~bg, iterations=1)


def crop_resize(rgb, alpha, height, flip):
    ys, xs = np.where(alpha)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, alpha = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    if flip:
        rgb, alpha = rgb[:, ::-1], alpha[:, ::-1]
    s = height / rgb.shape[0]
    w = max(1, int(round(rgb.shape[1] * s)))
    rgb = cv2.resize(rgb, (w, height), interpolation=cv2.INTER_AREA)
    a = cv2.resize(alpha.astype(np.uint8) * 255, (w, height), interpolation=cv2.INTER_AREA) > 127
    return rgb, a


def quantize(rgb, alpha, k, sp=5, sr=16, merge_de=9.0):
    sm = cv2.pyrMeanShiftFiltering(np.ascontiguousarray(rgb), sp=sp, sr=sr)
    lab = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).astype(np.float32)
    px = lab[alpha]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5)
    _, labels, centers = cv2.kmeans(px, k, None, crit, 4, cv2.KMEANS_PP_CENTERS)
    out = np.full(alpha.shape, -1, np.int32)
    out[alpha] = labels.ravel()
    pal = cv2.cvtColor(centers.astype(np.uint8).reshape(1, -1, 3), cv2.COLOR_LAB2RGB).reshape(-1, 3)
    # gộp các cụm gần nhau (ΔE nhỏ): đỡ phí màu cho hai sắc gần đen / gần trắng
    parent = list(range(k))
    for i in range(k):
        for j in range(i + 1, k):
            if np.linalg.norm(centers[i] - centers[j]) < merge_de:
                parent[j] = parent[i]
    remap = {c: n for n, c in enumerate(sorted(set(parent)))}
    out2 = out.copy()
    for old in range(k):
        out2[out == old] = remap[parent[old]]
    keep = sorted(set(parent))
    return out2, pal[keep]


def despeckle(lab, alpha, min_area, passes=2):
    for _ in range(passes):
        # lọc đa số 3x3 để bỏ nhiễu 1px
        mode = lab.copy()
        for c in np.unique(lab[alpha]):
            pass
        k = lab.max() + 1
        cnt = np.stack([ndi.uniform_filter((lab == c).astype(np.float32), 3) for c in range(k)])
        maj = cnt.argmax(0)
        mode[alpha] = maj[alpha]
        lab = mode
        # nuốt mảnh nhỏ vào mảng kế bên
        for c in range(k):
            comp, n = ndi.label(lab == c)
            for i in range(1, n + 1):
                m = comp == i
                if m.sum() >= min_area:
                    continue
                ring = ndi.binary_dilation(m, iterations=2) & ~m & alpha
                if ring.any():
                    vals = lab[ring]
                    lab[m] = np.bincount(vals[vals >= 0]).argmax() if (vals >= 0).any() else c
    return lab


TEAM_RGB = {"blue": (58, 120, 216), "red": (216, 64, 47)}   # đúng màu phe trong game (FACTIONS.fill)


def recolor_team(pal, team_idx, name):
    """Đổi các cụm vải sang màu phe của game. Cụm sáng nhất lấy đúng màu phe, các cụm tối hơn
    giữ tương quan sáng tối (để nếp vải vẫn đọc được)."""
    pal = pal.copy()
    base = np.array(TEAM_RGB[name], float)
    lum = lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    top = max(lum(pal[i]) for i in team_idx)
    for i in team_idx:
        k = min(1.0, (lum(pal[i]) / max(top, 1)) ** 0.8)
        pal[i] = np.clip(base * (0.55 + 0.45 * k), 0, 255).astype(np.uint8)
    return pal


def render(lab, alpha, pal, outline):
    h, w = lab.shape
    img = np.zeros((h, w, 4), np.uint8)
    m = alpha & (lab >= 0)
    img[m, :3] = pal[lab[m]]
    img[m, 3] = 255
    # viền đen dày quanh hình bóng (nở ra ngoài)
    edge = ndi.binary_dilation(alpha, iterations=outline) & ~alpha
    img[edge, :3] = INK
    img[edge, 3] = 255
    return img


def save_preview(path, lab, pal):
    sw = 40
    im = np.full((len(pal) * sw, 120, 3), 255, np.uint8)
    for i, c in enumerate(pal):
        im[i * sw:(i + 1) * sw, :60] = c
    out = Image.fromarray(im)
    from PIL import ImageDraw
    d = ImageDraw.Draw(out)
    for i in range(len(pal)):
        n = int((lab == i).sum())
        d.text((66, i * sw + 12), f"{i}: {n}px", fill=(0, 0, 0))
    out.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("--out", required=True)
    ap.add_argument("--height", type=int, default=160)
    ap.add_argument("--colors", type=int, default=11)
    ap.add_argument("--min-area", type=int, default=28)
    ap.add_argument("--outline", type=int, default=2)
    ap.add_argument("--flip", action="store_true")
    ap.add_argument("--team", default="")
    ap.add_argument("--team-hue", default="")
    ap.add_argument("--preview", default="")
    ap.add_argument("--checker", action="store_true", help="ảnh có ô cờ giả trong suốt vẽ sẵn")
    ap.add_argument("--holes", type=int, default=0, help="bỏ vùng trắng kín >= số px này (ảnh gốc)")
    a = ap.parse_args()

    rgb = np.array(Image.open(a.src).convert("RGB"))
    alpha = remove_bg(rgb, a.holes, a.checker)
    rgb, alpha = crop_resize(rgb, alpha, a.height, a.flip)
    lab, pal = quantize(rgb, alpha, a.colors)
    lab = despeckle(lab, alpha, a.min_area)
    # làm đậm viền đen: các cụm gần đen được ép về mực
    dark = int(np.argmin(pal.sum(1)))
    for i in range(len(pal)):
        if pal[i].astype(int).sum() < 120:
            pal[i] = INK
    team = [int(x) for x in a.team.split(",") if x != ""]
    base, ext = os.path.splitext(a.out)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    if a.preview:
        save_preview(a.preview, lab, pal)
    if a.team_hue and team:
        for name in (["blue", "red"] if a.team_hue == "both" else [a.team_hue]):
            p = recolor_team(pal, team, name)
            Image.fromarray(render(lab, alpha, p, a.outline)).save(f"{base}_{name}{ext}")
    Image.fromarray(render(lab, alpha, pal, a.outline)).save(a.out)
    print(f"{a.src} -> {a.out}  {alpha.shape[1]}x{alpha.shape[0]}  {len(pal)} màu  tối nhất=cụm {dark}")


if __name__ == "__main__":
    main()
