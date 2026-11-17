#!/usr/bin/env python3
"""Dựng bản cắt thô trailer phe người từ các clip trong docs/art/trailer/shots/.
EDL = danh sách (clip, giây vào, giây ra). Cắt cứng, chuẩn hoá về 1280x720 24fps, ghép nối, mờ dần 0.4 giây cuối.
  python3 docs/art/trailer/edit.py  ->  docs/art/trailer/trailer_human_roughcut.mp4"""
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")
OUT = os.path.join(HERE, "trailer_human_roughcut.mp4")

EDL = [
    ("s01_forest_calm.mp4", 0.3, 1.2),            # rừng sương trên cao
    ("s01_forest_calm.mp4", 2.9, 3.5),            # chim giật mình bay đi
    ("s02_volley_arrow_pov.mp4", 0.7, 1.6),       # cung thủ orc nhả loạt tên
    ("s02_volley_arrow_pov.mp4", 3.4, 4.9),       # góc nhìn mũi tên lao tới bộ binh
    ("s03_eyes.mp4", 0.4, 1.0),                   # cận mắt góc cao
    ("s03_eyes_slash.mp4", 2.2, 3.5),             # chém văng mũi tên
    ("s04_clash_orc.mp4", 2.5, 4.0),              # va chạm orc brute
    ("s07_broll.mp4", 0.2, 0.6),                  # b-roll giáp lá
    ("s05_archer.mp4", 1.2, 2.4),                 # cung thủ ngắm, chuyển nét ra orc
    ("s07_broll.mp4", 2.1, 2.5),                  # b-roll dây cung rung
    ("s06_militia_cavalry_leap.mp4", 0.8, 1.6),   # dân quân xung phong (máy chạy ngang)
    ("s06b_wormseye_leap.mp4", 3.1, 4.4),         # góc thấp: kỵ binh bay qua đầu dân quân đang cúi
    ("s08_climax.mp4", 0.6, 2.2),                 # kỵ binh đâm vào tuyến orc
    ("s09_army_wide.mp4", 2.4, 4.4),              # drone lùi xa: hai tuyến va nhau, mặt trời lên
]


def main():
    tmp = tempfile.mkdtemp()
    parts = []
    for i, (clip, a, b) in enumerate(EDL):
        src = os.path.join(SHOTS, clip)
        if not os.path.exists(src):
            print("thiếu", clip, "- bỏ qua")
            continue
        p = os.path.join(tmp, f"{i:02d}.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-i", src, "-t", str(b - a),
                        "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,format=yuv420p",
                        "-an", "-c:v", "libx264", "-crf", "18", "-preset", "fast", p], check=True)
        parts.append(p)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    joined = os.path.join(tmp, "joined.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined], check=True)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", joined]).decode())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", joined, "-vf", f"fade=t=out:st={dur - 0.4:.2f}:d=0.4",
                    "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-movflags", "+faststart", OUT], check=True)
    print(OUT, f"{dur:.2f}s", len(parts), "đoạn")


if __name__ == "__main__":
    main()
