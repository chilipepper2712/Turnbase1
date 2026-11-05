# Checklist âm thanh

Thả file vào `assets/audio/sfx/` (hiệu ứng) và `assets/audio/music/` (nhạc), **đúng tên bên dưới**, định dạng `mp3`, `ogg`, `m4a` hoặc `wav`.
Không cần sửa code. Game tự nhận file; file nào chưa có thì im lặng, hoặc dùng tiếng thay thế (cột "Thay thế").
Sau khi thả file chạy `node tools/build_audio_index.mjs` (lệnh `npm run build:single` tự chạy lại bước này).

## Hiệu ứng (sfx)

Ưu tiên: **A** = cần có trước, **B** = nên có, **C** = có thì tốt.

| Tên file | Phát khi | Gợi ý | Ưu tiên | Thay thế nếu thiếu |
|---|---|---|---|---|
| `ui_select` | Chạm chọn quân, chạm ô đích | tick nhẹ, ngắn | A | không |
| `ui_confirm` | Bấm "Tới đây", xác nhận đòn đánh, bấm Bắt đầu | tick rõ hơn, hơi trầm | A | không |
| `ui_cancel` | Bấm ✕, "Đi lại" | tick thấp | A | không |
| `ui_deny` | Thao tác không hợp lệ (không gộp được, không tách được) | tiếng "bùp" ngắn | C | `ui_cancel` |
| `turn_player` | Đầu lượt của mày | chuông/kèn ngắn, sáng | A | không |
| `turn_enemy` | Đầu lượt Orc | tiếng trống/kèn trầm, đe doạ | B | `turn_player` |
| `end_turn` | Bấm Kết thúc lượt | tiếng xác nhận trầm | B | `ui_confirm` |
| `step_foot` | **Mỗi ô** bộ binh, cung thủ, dân quân bước qua | bước chân khô, rất ngắn (~0.15s) | A | không |
| `step_horse` | **Mỗi ô** kỵ binh đi qua | vó ngựa, ngắn (~0.2s) | B | `step_foot` |
| `attack_melee` | Bộ binh ra đòn (kiếm, rìu) | vung/chém, ~0.4s | A | không |
| `attack_spear` | Dân quân đâm giáo | đâm/xỉa, ~0.3s | B | `attack_melee` |
| `attack_charge` | Kỵ binh xung phong (đi ≥3 ô rồi đánh) | tiếng hô + va chạm, ~0.6s | B | `attack_melee` |
| `bow_shoot` | Cung thủ bắn (cả lúc phản công) | dây cung + mũi tên bay, ~0.4s | A | không |
| `arrow_hit` | Mũi tên trúng | cắm "phập", ngắn | B | `hit_flesh` |
| `hit_flesh` | Squad trúng đòn (cận chiến) | va đập/đau, ~0.3s | A | không |
| `unit_die` | Squad bị tiêu diệt | ngã/rên, ~0.6s | A | không |
| `rout` | Squad tan vỡ | tiếng hoảng loạn/kèn rút lui, ~0.8s | B | `hit_flesh` |
| `heal` | Squad hồi quân ở làng/thành | tiếng nhẹ sáng, ~0.5s | C | `levelup` |
| `merge` | Gộp quân | tiếng chắc, ghép lại, ~0.4s | B | `ui_confirm` |
| `split` | Tách quân | tiếng tách, ~0.4s | B | `ui_confirm` |
| `fortify` | Hạ trại | búa đóng cọc/gỗ, ~0.5s | B | không |
| `levelup` | Lên cấp | tiếng sáng, đi lên, ~0.8s | B | không |
| `capture` | Mỗi lượt giữ thành địch | cờ/chuông trầm, ~0.8s | C | `ui_confirm` |
| `victory` | Thắng | kèn chiến thắng, 2–3s | A | không |
| `defeat` | Thua | kèn trầm buồn, 2–3s | A | `unit_die` |

**Tối thiểu để thấy khác biệt:** 11 file loại A. 25 tên tất cả.

### Quy cách hiệu ứng
- Mono, 44.1kHz. `wav` 16-bit hoặc `mp3` 128kbps đều được. File ngắn thì `wav` không tốn nhiều.
- **Cắt khoảng lặng ở đầu file** (nếu lệch vài chục ms thì tiếng bị trễ so với hình).
- Chuẩn hoá đỉnh khoảng −3 dB, các tiếng cùng nhóm có độ to gần nhau (game tự chỉnh âm lượng chung bằng thanh trượt).
- Tiếng bước và tick giao diện phải **rất ngắn** (dưới 0.2s), vì chúng phát liên tục.
- Game tự lệch cao độ ±4% mỗi lần phát để đỡ lặp, nên không cần nhiều biến thể cùng tên.

## Nhạc nền (music)

| Tên file | Dùng |
|---|---|
| `battle_1`, `battle_2`, `battle_3`, ... | Nhạc trong ván, tên bắt đầu bằng `battle` |

- Mỗi bài **phải loop liền mạch** (đoạn cuối nối đoạn đầu không giật, không có khoảng lặng).
- Game chọn ngẫu nhiên một bài khi vào ván và **loop bài đó**; nếu có từ 2 bài trở lên thì cứ khoảng 4 phút chuyển sang bài khác bằng cách mờ dần (crossfade 2 giây).
- Thời lượng mỗi bài 1–3 phút. `mp3` 96–128kbps là đủ.
- **Dung lượng:** bản chơi một file (cái bạn mở trên iPad) nhúng toàn bộ âm thanh vào trang, mà trang tối đa 16MB. Tổng âm thanh nên **dưới 7MB** (ví dụ 3 bài × 2 phút × 128kbps ≈ 5.7MB, cộng SFX). Vượt thì `build:single` sẽ cảnh báo.
- Lưu ý `mp3` có khoảng đệm ở đầu và cuối do bộ mã hoá, nên có thể nghe một nhịp hụt khi loop. Nếu mày nghe thấy thì đổi sang `ogg` hoặc báo tao thêm cách nối mờ ở điểm loop.

## Trình duyệt
- Âm thanh chỉ bật sau cú bấm đầu tiên. Màn mở đầu có nút **Bắt đầu** để làm việc đó.
- iPad khoá màn hình hoặc chuyển tab sẽ tự treo âm thanh; game mở lại ở lần chạm kế tiếp.
- Nút 🔊 trên thanh trên cùng tắt/bật toàn bộ; menu ☰ có hai thanh trượt âm lượng riêng cho nhạc và hiệu ứng (đã lưu).
