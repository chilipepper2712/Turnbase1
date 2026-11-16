#!/usr/bin/env python3
"""Chuẩn bị sprite sinh từ Higgsfield (gpt_image) đã có nền trong suốt: làm sạch quầng mờ ở mép, cắt sát, thu về chiều cao.
Ảnh nền trắng đặc (không có alpha) thì đi qua tools/prep_sprite.py.

  python3 tools/prep_alpha_sprite.py <ảnh> --out assets/units/orc_goblin.png [--height 256] [--cut 0.5] [--flip]

--cut: ngưỡng alpha (tỉ lệ so với alpha lớn nhất) dưới đó coi là nền. Mô hình hay để một quầng sáng mờ quanh nhân vật.
"""
import argparse, os
import numpy as np
import cv2
from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("--out", required=True)
    ap.add_argument("--height", type=int, default=256)
    ap.add_argument("--cut", type=float, default=0.5)
    ap.add_argument("--flip", action="store_true")
    ap.add_argument("--pixel", type=int, default=0, help="pixel hoá: số điểm ảnh theo chiều cao (vd 100), 0 = tắt")
    ap.add_argument("--colors", type=int, default=32, help="số màu tối đa khi pixel hoá")
    a = ap.parse_args()
    im = np.array(Image.open(a.src).convert("RGBA"))
    rgb, al = im[:, :, :3], im[:, :, 3].astype(np.float32)
    mask = al >= al.max() * a.cut
    # bỏ các mảnh vụn rời khỏi thân chính (hạt sáng lẻ)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if n > 2:
        keep = np.zeros(n, bool)
        big = stats[1:, cv2.CC_STAT_AREA].max()
        keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= big * 0.01
        mask = keep[lab]
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, mask = rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    if a.flip:
        rgb, mask = rgb[:, ::-1], mask[:, ::-1]
    s = a.height / rgb.shape[0]
    w = max(1, int(round(rgb.shape[1] * s)))
    if a.pixel:
        # pixel art thật: thu về lưới nhỏ, gộp bảng màu, rồi phóng lại bằng nearest-neighbor (khối vuông, mép sắc)
        ph = a.pixel; pw = max(1, int(round(rgb.shape[1] * ph / rgb.shape[0])))
        small = cv2.resize(np.ascontiguousarray(rgb), (pw, ph), interpolation=cv2.INTER_AREA)
        sm = cv2.resize(mask.astype(np.uint8) * 255, (pw, ph), interpolation=cv2.INTER_AREA) >= 128
        pal = Image.fromarray(small).quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        small = np.array(pal.convert("RGB"))
        rgb = cv2.resize(small, (w, a.height), interpolation=cv2.INTER_NEAREST)
        alpha = cv2.resize(sm.astype(np.uint8) * 255, (w, a.height), interpolation=cv2.INTER_NEAREST)
    else:
        rgb = cv2.resize(np.ascontiguousarray(rgb), (w, a.height), interpolation=cv2.INTER_AREA)
        alpha = cv2.resize(mask.astype(np.uint8) * 255, (w, a.height), interpolation=cv2.INTER_AREA)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    Image.fromarray(np.dstack([rgb, alpha]), "RGBA").save(a.out, optimize=True)
    print(a.out, w, a.height)


if __name__ == "__main__":
    main()
