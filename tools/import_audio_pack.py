#!/usr/bin/env python3
"""Nhập gói âm thanh thô (thư mục hoặc zip) vào assets/audio/, theo bảng ánh xạ MAP bên dưới.

  python3 tools/import_audio_pack.py <thư mục|zip> [--music-kbps 64]

SFX: cắt khoảng lặng đầu (tiếng không bị trễ), chuyển mono, cân đỉnh theo nhóm (PEAK) để âm lượng cân nhau, ghi wav 16-bit.
Nhạc: chuyển mono, nén mp3 (mặc định 64kbps) và hạ về mức -20 LUFS (nền, để nghe rõ SFX); gói gốc 21MB không nhúng được vào trang 16MB.
Cần ffmpeg. Chạy xong nhớ: node tools/build_audio_index.mjs
"""
import argparse, glob, os, re, shutil, subprocess, sys, tempfile, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio")

# tên file thô (không đuôi, không phân biệt hoa thường) -> tên SFX trong game (thêm _N cho các biến thể cùng tên)
MAP = {
    "ui_cancel": "ui_cancel",
    "step_foot_1": "step_foot_1", "step_foot_2": "step_foot_2",
    "attack_melee_1": "attack_melee_1", "attack_melee_2": "attack_melee_2", "attack_melee_3": "attack_melee_3",
    "sword attack 1": "attack_spear_1", "sword attack 2": "attack_spear_2", "sword attack 3": "attack_spear_3",
    "sword blocked 1": "hit_flesh_1", "sword blocked 2": "hit_flesh_2", "sword blocked 3": "hit_flesh_3",
    "bow attack 1": "bow_shoot_1", "bow attack 2": "bow_shoot_2",
    "bow impact hit 1": "arrow_hit_1", "bow impact hit 2": "arrow_hit_2", "bow impact hit 3": "arrow_hit_3",
    "unit_die_1": "unit_die_1", "unit_die_2": "unit_die_2", "unit_die_3": "unit_die_3",
    "build_camp": "fortify", "victory": "victory", "defeat": "defeat",
    "turn_player": "turn_player",
    "levelup": "levelup", "horse_attack_charge": "attack_charge", "horse_step": "step_horse", "turn_enemy": "turn_enemy",
}
# Tiếng click giao diện bị bỏ (gây khó chịu): file có tên này sẽ bị XOÁ khỏi assets/audio/sfx khi chạy nhập
SILENT = ["ui_select", "ui_confirm"]
# cắt dài tối đa (giây) + mờ đuôi: tiếng gốc có đuôi vang quá dài cho một hiệu ứng phát liên tục / theo sự kiện
TRIM = {"levelup": (1.6, 0.6), "step_horse": (0.42, 0.1), "turn_player": (3.4, 0.5)}
# đỉnh mong muốn (dBFS) theo tiền tố tên SFX; tiếng giao diện nhỏ, bước chân nhỏ nhất vì phát liên tục
PEAK = [("ui_", -12), ("step_", -15), ("fortify", -10), ("victory", -10), ("defeat", -10), ("turn_player", -14), ("turn_", -9), ("levelup", -10), ("", -8)]
# nhạc: số thứ tự theo thời lượng giảm dần được đặt tên battle_1..N
MUSIC_LUFS = -20


def sh(*a):
    return subprocess.run(a, capture_output=True, text=True)


def peak_db(path):
    r = sh("ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "volumedetect", "-f", "null", "-")
    m = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else 0.0


def rate_of(path):
    r = sh("ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", path)
    return min(44100, int(r.stdout.strip() or 44100))


def duration(path):
    return float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path).stdout)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("--music-kbps", type=int, default=64)
    a = ap.parse_args()
    tmp = None
    src = a.src
    if src.endswith(".zip"):
        tmp = tempfile.mkdtemp(); zipfile.ZipFile(src).extractall(tmp)
        src = tmp
    files = [f for f in glob.glob(os.path.join(src, "**", "*"), recursive=True)
             if os.path.isfile(f) and "__MACOSX" not in f and f.lower().endswith((".wav", ".mp3", ".ogg", ".m4a"))]
    os.makedirs(os.path.join(OUT, "sfx"), exist_ok=True); os.makedirs(os.path.join(OUT, "music"), exist_ok=True)
    music, done, skipped = [], [], []
    for f in sorted(files):
        key = re.sub(r"^[0-9a-f]{8}-", "", os.path.splitext(os.path.basename(f))[0].lower())   # bỏ tiền tố mã băm khi upload
        if key in MAP:
            name = MAP[key]
            target = next(db for pre, db in PEAK if name.startswith(pre))
            tmpw = os.path.join(tempfile.gettempdir(), "imp_" + name + ".wav")
            chain = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.004"
            if name in TRIM:
                mx, fd = TRIM[name]
                chain += f",atrim=0:{mx},afade=t=out:st={mx - fd}:d={fd}"
            sh("ffmpeg", "-y", "-v", "error", "-i", f, "-ac", "1", "-ar", str(rate_of(f)), "-af", chain, tmpw)
            gain = target - peak_db(tmpw)
            outp = os.path.join(OUT, "sfx", name + ".wav")
            sh("ffmpeg", "-y", "-v", "error", "-i", tmpw, "-af", f"volume={gain:.2f}dB", "-c:a", "pcm_s16le", outp)
            os.remove(tmpw)
            for old in glob.glob(os.path.join(OUT, "sfx", name + ".mp3")): os.remove(old)
            done.append((name, round(gain, 1)))
        elif os.path.getsize(f) > 1_000_000:
            music.append(f)
        else:
            skipped.append(os.path.basename(f))
    for n in SILENT:
        for old in glob.glob(os.path.join(OUT, "sfx", n + ".*")): os.remove(old); print("đã xoá", os.path.basename(old))
    music.sort(key=duration, reverse=True)
    for i, f in enumerate(music, 1):
        outp = os.path.join(OUT, "music", f"battle_{i}.mp3")
        sh("ffmpeg", "-y", "-v", "error", "-i", f, "-ac", "1", "-af", f"loudnorm=I={MUSIC_LUFS}:TP=-2:LRA=11",
           "-ar", "44100", "-c:a", "libmp3lame", "-b:a", f"{a.music_kbps}k", outp)
        print(f"nhạc {os.path.basename(f)[:40]} -> battle_{i}.mp3  {os.path.getsize(outp)/1048576:.1f}MB")
    print(f"sfx: {len(done)} file;  bỏ qua (không có trong bảng ánh xạ): {', '.join(skipped) or 'không'}")
    if tmp: shutil.rmtree(tmp)


if __name__ == "__main__":
    main()
