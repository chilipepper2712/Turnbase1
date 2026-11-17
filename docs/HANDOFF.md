# Handoff: game chiến thuật theo lượt + art/trailer

Cập nhật: 2026-11-17. Nhánh làm việc: `claude/strategy-game-prototype-dv6kf7` (mọi thứ đã commit và push, commit cuối `ff5bd4f`).
Người dùng: dùng "mày - tao", peer-level. Nhận xét thẳng ý tưởng trước (hay / dở / thiếu gì), chỉ ra chỗ lỏng và hỏi lại, không fill thay, không khen máy móc, không drift khi bị push back. Không làm thay những gì họ nên tự làm. UI game bằng tiếng Việt qua `lang/*.json`.

## 1. Game (code)
- Game trình duyệt chiến thuật theo lượt, lưới vuông, nhìn isometric. Người vs Orc hoặc Âm binh (thay Orc). AI hai mức. Có nhiệm vụ (đánh nhau, cố thủ, phá trại, hộ tống), sĩ khí và bỏ chạy, goblin phục kích, âm binh (necromancer), thủy binh, lưu / tải ván. Chi tiết luật ở `docs/GDD.md` (đã publish artifact v21; chưa cập nhật phần nền pixel).
- Logic thuần: `src/rules.js`, `src/ai.js`, `src/missions.js`, `src/mapgen.js`, `src/config.js`. Render Pixi: `src/render/view.js`, `assets.js`, `pixelground.js`, `pixelcloud.js`, `doodle.js`. UI: `src/game.js`, `index.html`, `style.css`.
- Test: `npm test` (73 qua). Build một file: `node tools/build_single.mjs` → `dist/artifact.html` (~13,1 MB; trần Artifact 16 MB, âm thanh chiếm ~7,6 MB).
- Artifact game: https://claude.ai/artifact/CSx81EnZweknsmJP2FXymS (v55 lúc cuối). Publish lại bằng Artifact tool với `file_path=/home/user/Turnbase1/dist/artifact.html` và `url` trên.
- Playwright có sẵn để chụp ảnh game thật (`python3 -m http.server 8099`, mở `index.html?seed=21&tiles=1&clouds=0`, bấm `#splash-start`).

## 2. Nền pixel art (đã vào game, mặc định bật)
- Nút bật/tắt `#btn-tiles` trên thanh trên + công tắc trong menu; `?tiles=0|1` trên URL; lưu `settings.pixelTiles`. Nền cũ (giấy vẽ tay) vẫn còn khi tắt.
- Nền phẳng theo địa hình vẽ bằng code (`pixelground.js`), vật thể là sprite pixel `assets/terrain/<nhóm>_<n>.png` (pine, tuft, bush, tiny, boulder, mound, reed, shrub, hill, house, tower, mine, castle, camp). Sprite sinh từ sheet Higgsfield (nền magenta) rồi `tools/prep_decor.py`, `prep_buildings.py`, `prep_hill.py`. Đồi dùng bản vẽ nháp của user (`docs/art/tiles/decor/hill_user.png`).
- Nước lấp lánh (loop 0,2 s), mây pixel sinh bằng code, nền chấm bi đứng yên theo màn hình, chân dung đơn vị trong thẻ thông tin lấy từ sheet trailer (`assets/portraits`, `tools/prep_portraits.py`).
- **Việc user đang tự làm:** vẽ bóng chân cho công trình (nhà, tháp, mỏ, thành, trại). Họ sẽ gửi file `<nhóm>_<n>_shadow.png`, game đã có chỗ nhận (xem `docs/art/tiles/README.md`). Khi nhận, đặt vào `assets/terrain/` và build lại.
- Chưa kiểm: hiệu năng bản đồ lớn / điện thoại thật, chân dung trên màn hẹp, bóng chân camp/castle trên mọi địa hình. Chuyển tiếp giữa các loại đất còn hơi lốm đốm.
- Bản đồ ~30% không có sông; user đã hỏi nhưng chưa quyết có ép bản đồ nào cũng có nước không (đụng cân bằng và seed lưu, cần hỏi lại).

## 3. Character sheet (trailer/cutscene)
- 24 sheet trong `docs/art/sheets/`, prompt và quy tắc ở `docs/art/character-sheets.md` (đọc kỹ: luôn đính kèm sprite làm tham chiếu và chỉ mô tả cái sprite thấy; giáp lá xám, đoản kiếm ở hông; tai orc đối xứng; vật cứng như ống tên / vỏ kiếm không được cong ôm người).
- Lỗi đã biết, chưa sửa: **kỵ binh người cần mũ nón trận** (vành rộng phẳng, núm tròn, vải đỏ che gáy, KHÔNG phải nón lá đan; sheet `cavalry_human.png` và các cảnh trailer có kỵ binh đang đội nón vàng giống nón lá); `undead_human_archer` ống tên ngắn / vỏ kiếm hơi ôm hông; `undead_human_infantry` vỏ kiếm hơi ôm hông; marine chưa chọn A hay B (`marine_archer_human_a|b`).
- Quy tắc rút ra: khi sửa một chi tiết, giữ nguyên prompt cũ và chỉ đổi đúng chi tiết đó. Viết lại cả prompt dài làm ảnh bị cartoon và mất chi tiết.

## 4. Trailer phe người (15 giây, 16:9)
- Ý tưởng user: rừng yên tĩnh → loạt tên của cung thủ orc → bộ binh gạt tên, va chạm orc → cung thủ người → dân quân xung phong, kỵ binh bay qua đầu (worm's-eye) → kỵ binh đâm vào orc, toàn cảnh. Chỉ đánh với orc (đã chốt bỏ âm binh), có thể cài tia lửa ma xanh làm hook cuối.
- Công cụ: Higgsfield MCP. Ảnh: `gpt_image_2_6`. Video: **`seedance_2_5` mode `omni_reference` 720p** (35 credit / 5 s); Kling 3.0 thử rồi bỏ (quay lưng, không chạm tên). Dùng skill `seedance-director` để viết prompt EN+ZH. Prompt lưu ở `docs/art/trailer/prompts/`.
- Clip nằm ở `docs/art/trailer/shots/`; bản cắt thô `trailer_human_roughcut.mp4` do `docs/art/trailer/edit.py` dựng (ffmpeg). **User đã tự edit bản cuối ngoài session**, nên cắt thô chỉ để tham khảo.
- Cảnh gạt tên sai (2 tên bay tới, ra 5 cây) đã gen lại: `docs/art/trailer/fix/s03_slash_2arrows_B.mp4` (nên dùng) và `_A`.
- Lỗi còn lại: cận mắt chưa đủ góc cao; worm's-eye chưa chĩa thẳng lên trời; nón kỵ binh (xem mục 3); style lệch nhẹ giữa các cảnh; cảnh orc đầu có hàng rào khiên gỗ model tự thêm. Seedance đếm số lượng không tuyệt đối, ghi rõ "EXACTLY N" và cắt dựng tránh đoạn mảnh vụn rơi.
- Âm thanh (nhạc, dây cung, tên, va chạm, vó ngựa) chưa có.
- **Credit Higgsfield hết hạn 20/11/2026** (còn ~1.128 lúc cuối); user bảo cứ dùng. Kế hoạch dùng nốt: reroll sheet kỵ binh (nón trận) → gen lại cảnh có kỵ binh → gen lại cận mắt → render 1080p (~80 credit / cảnh) cho các cảnh giữ lại. Hỏi user cảnh nào giữ trước khi tốn credit.
- Rate limit 429 khi gửi 3+ video cùng lúc; gửi ít một và dùng `jobs_wait` poll. Muốn xem clip thì trích khung bằng ffmpeg (`fps=3`) ghép thành strip.

## 5. Môi trường
- Mạng đã được user cho phép thêm host Higgsfield (upload, cloudfront). Upload ảnh: `media_upload` → `curl -X PUT` → `media_confirm` rồi mới dùng `media_id`.
- Commit kết thúc bằng 2 dòng `Co-Authored-By` và `Claude-Session` theo chỉ dẫn hệ thống hiện tại. Không tạo PR nếu chưa được yêu cầu.

## 6. Việc mở (theo thứ tự gợi ý)
1. Hỏi user: còn muốn gen gì trước 20/11 (kỵ binh nón trận, cận mắt, 1080p)?
2. Nhận bóng chân công trình từ user và tích hợp.
3. Cập nhật `docs/GDD.md` phần nền pixel / nút bật tắt / chân dung rồi publish lại.
4. Gameplay còn dở: AI chưa dùng thuyền và chưa chủ động đánh trại; cố thủ vs âm binh quá dễ; chiến dịch (lưu squad tinh nhuệ qua màn) chưa làm.
5. Quyết định chưa chốt: bộ binh người dùng trường kiếm hay trường đao; mọi bản đồ có sông hay không.
