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

## Trạng thái hiện tại (đã nhập từ gói `doodle_battle_field.zip`)

Nhập bằng `python3 tools/import_audio_pack.py <zip>` (bảng ánh xạ tên nằm đầu file). Biến thể cùng tên (`attack_melee_1`, `_2`, `_3`...) được chọn ngẫu nhiên, không lặp liền bản vừa phát.

| Đã có | Nguồn trong gói |
|---|---|
| `ui_select`, `ui_confirm`, `ui_cancel` | cùng tên |
| `step_foot` ×2 | `step_foot_1,2` |
| `attack_melee` ×3 | `attack_melee_1..3` |
| `attack_spear` ×3 | `Sword Attack 1..3` |
| `hit_flesh` ×3 | `Sword Blocked 1..3` (tiếng đập vào khiên/giáp, tạm dùng cho "trúng đòn") |
| `bow_shoot` ×2 | `Bow Attack 1,2` |
| `arrow_hit` ×3 | `Bow Impact Hit 1..3` |
| `unit_die` ×3 | `unit_die_1..3` |
| `fortify` | `build_camp` |
| `victory`, `defeat` | cùng tên |
| nhạc `battle_1..4` | 4 bài dài, xếp theo thời lượng giảm dần |

**Chưa có, đang dùng tiếng thay thế:** `turn_player` và `turn_enemy` (đang dùng `ui_confirm`, rất ngắn nên không nổi bật, nên có một tiếng kèn/chuông riêng), `step_horse` (dùng bước chân), `attack_charge` (dùng `attack_melee`), `end_turn`, `merge`, `split`, `capture`, `levelup`, `heal`, `rout`, `ui_deny` (dùng `ui_confirm`/`hit_flesh`/`ui_cancel`).
**Chưa dùng:** `Bow Blocked 1..3` (game chưa có cơ chế đỡ đòn).

### Cách xử lý đã áp dụng khi nhập
- SFX: cắt khoảng lặng đầu (`unit_die_1` có 0.58 giây lặng đầu nên bị trễ), đổi mono, cân đỉnh theo nhóm (giao diện −12 dB, bước chân −15 dB, còn lại −8 dB). `ui_confirm` gốc vượt 0 dB (+4.8) nên bị méo, đã hạ xuống.
- Nhạc: đổi mono, nén `mp3` 64kbps, hạ về −20 LUFS (nền), tổng gói từ 21MB còn 5.3MB.
- Nhạc mặc định ở mức 35% còn SFX 80%, để nghe rõ tiếng hiệu ứng; chỉnh trong menu ☰.

## Nhạc nền (music)

| Tên file | Dùng |
|---|---|
| `battle_1`, `battle_2`, `battle_3`, ... | Nhạc trong ván, tên bắt đầu bằng `battle` |

- Game **không loop một bài**: phát lần lượt cả danh sách (xáo ngẫu nhiên), đoạn cuối mỗi bài mờ chéo (3.5 giây) sang bài kế. Cách này xử lý được cả những bài có đoạn cuối tắt dần và đầu bài vào nhỏ (4 bài hiện tại đều vậy). Chỉ có một bài thì nó tự nối lại chính nó.
- Chỉ bài đang phát được giữ trong bộ nhớ (giải mã một bài dài tốn khoảng 45MB), bài trước được giải phóng sau khi mờ xong.
- Thời lượng tuỳ ý (bài hiện tại 1.7–4.2 phút). Nhúng vào bản một file thì nên mono 64kbps; stereo 128kbps cho chất lượng tốt hơn nhưng tốn gấp 4 dung lượng.
- **Dung lượng:** bản chơi một file (cái bạn mở trên iPad) nhúng toàn bộ âm thanh vào trang, mà trang tối đa 16MB. Tổng âm thanh nên **dưới 7MB** (ví dụ 3 bài × 2 phút × 128kbps ≈ 5.7MB, cộng SFX). Vượt thì `build:single` sẽ cảnh báo.
- Lưu ý `mp3` có khoảng đệm ở đầu và cuối do bộ mã hoá, nên có thể nghe một nhịp hụt khi loop. Nếu mày nghe thấy thì đổi sang `ogg` hoặc báo tao thêm cách nối mờ ở điểm loop.

## Trình duyệt
- Âm thanh chỉ bật sau cú bấm đầu tiên. Màn mở đầu có nút **Bắt đầu** để làm việc đó.
- iPad khoá màn hình hoặc chuyển tab sẽ tự treo âm thanh; game mở lại ở lần chạm kế tiếp.
- Nút 🔊 trên thanh trên cùng tắt/bật toàn bộ; menu ☰ có hai thanh trượt âm lượng riêng cho nhạc và hiệu ứng (đã lưu).
