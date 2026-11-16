#!/usr/bin/env python3
"""Chân dung cho khung thông tin đơn vị: cắt đầu "neutral" từ các character sheet trailer (docs/art/sheets/*.png).
Mỗi mục: tên chân dung -> (sheet, hộp đầu trong sheet). Tên theo quy ước của game (Assets.portraitName):
  <phe>_<quân>, undead_<gốc>_<quân>, undead_necromancer, human_marine, human_marineboat, camp_<phe>.
  python3 tools/prep_portraits.py   ->  assets/portraits/<tên>.png (128x128)
Chưa có sheet cho trại âm binh: game dùng sprite pixel của trại thay thế."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SH = os.path.join(ROOT, "docs/art/sheets")
OUT = os.path.join(ROOT, "assets/portraits")
SIZE = 128

# name -> (sheet, (x, y, w, h)) hộp đầu "neutral"
HEADS = {
 'human_archer':('archer_human.png',(380,437,226,264)),
 'orc_archer':('archer_orc.png',(360,428,208,269)),
 'human_cavalry':('cavalry_human.png',(459,440,208,271)),
 'orc_cavalry':('cavalry_orc.png',(492,478,186,218)),
 'orc_goblin':('goblin.png',(468,350,205,300)),
 'human_infantry':('infantry_human.png',(403,436,214,281)),
 'orc_infantry':('infantry_orc.png',(506,484,146,174)),
 'human_marineboat':('marine_archer_human_a.png',(441,452,217,256)),
 'human_marine':('marine_human.png',(345,453,201,258)),
 'human_militia':('militia_human.png',(427,411,193,243)),
 'orc_militia':('militia_orc.png',(426,436,194,236)),
 'undead_necromancer':('necromancer.png',(486,399,209,295)),
 'undead_human_archer':('undead_human_archer.png',(436,9,220,243)),
 'undead_human_cavalry':('undead_human_cavalry.png',(459,441,198,272)),
 'undead_human_infantry':('undead_human_infantry.png',(409,416,215,313)),
 'undead_human_militia':('undead_human_militia.png',(395,26,205,248)),
 'undead_orc_archer':('undead_orc_archer.png',(460,9,285,278)),
 'undead_orc_cavalry':('undead_orc_cavalry.png',(505,472,188,188)),
 'undead_orc_infantry':('undead_orc_infantry.png',(476,462,165,200)),
 'undead_orc_militia':('undead_orc_militia.png',(407,446,192,269)),
 'camp_human':('camp_human.png',(120,40,700,420)),
 'camp_orc':('camp_orc.png',(60,40,880,420)),
}


def square(box, k=0.9):
    x, y, w, h = box
    s = min(w, h * k) if h * k < w * 1.3 else w
    s = max(s, min(w, h))
    return (int(x + w / 2 - s / 2), int(y), int(s), int(s))


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (f, box) in HEADS.items():
        im = Image.open(os.path.join(SH, f)).convert("RGB")
        x, y, s, _ = square(box)
        c = im.crop((x, y, x + s, y + s)).resize((SIZE, SIZE), Image.LANCZOS)
        c = c.quantize(160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)   # bảng 160 màu cho nhẹ (tranh phẳng nên ít mất chi tiết)
        c.save(os.path.join(OUT, name + ".png"), optimize=True)
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(len(HEADS), "chân dung,", tot // 1024, "KB")


if __name__ == "__main__":
    main()
