#!/usr/bin/env python3
"""Chuẩn bị sprite đã vẽ xong: chỉ bỏ nền, cắt sát, thu về chiều cao mong muốn. KHÔNG đổi màu, không gộp màu.

  python3 tools/prep_sprite.py <ảnh> --out assets/units/human_infantry.png [--height 256] [--flip] [--checker] [--holes 4000]

--flip: ảnh quay mặt sang trái (game quy ước quay sang phải). --checker: ảnh có ô cờ giả trong suốt vẽ sẵn.
--holes N: bỏ vùng nền kín >= N px (khoảng trống trong vòng cung...).
"""
import argparse, os, sys
import numpy as np
import cv2
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from simplify_sprite import remove_bg  # dùng lại đúng phần bỏ nền


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("--out", required=True)
    ap.add_argument("--height", type=int, default=256)
    ap.add_argument("--flip", action="store_true")
    ap.add_argument("--checker", action="store_true")
    ap.add_argument("--holes", type=int, default=0)
    a = ap.parse_args()
    rgb = np.array(Image.open(a.src).convert("RGB"))
    alpha = remove_bg(rgb, a.holes, a.checker)
    ys, xs = np.where(alpha)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, alpha = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    if a.flip:
        rgb, alpha = rgb[:, ::-1], alpha[:, ::-1]
    s = a.height / rgb.shape[0]
    w = max(1, int(round(rgb.shape[1] * s)))
    # thu nhỏ bằng INTER_AREA; alpha mềm ở mép để không răng cưa
    rgb = cv2.resize(np.ascontiguousarray(rgb), (w, a.height), interpolation=cv2.INTER_AREA)
    al = cv2.resize(alpha.astype(np.uint8) * 255, (w, a.height), interpolation=cv2.INTER_AREA)
    out = np.dstack([rgb, al])
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    Image.fromarray(out, "RGBA").save(a.out, optimize=True)
    print(f"{os.path.basename(a.src)} -> {a.out}  {w}x{a.height}")


if __name__ == "__main__":
    main()
