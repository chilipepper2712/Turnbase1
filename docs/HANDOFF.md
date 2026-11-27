# Handoff: game chiến thuật theo lượt + art/trailer

Cập nhật: 2026-11-27. Nhánh làm việc: `claude/strategy-game-prototype-dv6kf7` (mọi thứ đã commit và push).
Người dùng: dùng "mày - tao", peer-level. Nhận xét thẳng ý tưởng trước (hay / dở / thiếu gì), chỉ ra chỗ lỏng và hỏi lại, không fill thay, không khen máy móc, không drift khi bị push back. Không làm thay những gì họ nên tự làm. UI game bằng tiếng Việt qua `lang/*.json`. Người dùng tự tạo trang itch và tự đăng.

## 1. Game (code)
- Game trình duyệt chiến thuật theo lượt, lưới vuông, isometric (Pixi). Người vs Orc hoặc Âm binh. Nhiệm vụ: giao tranh, cố thủ, phá trại, hộ tống. Sĩ khí / bỏ chạy, goblin phục kích, thủy binh, âm binh + necromancer + mộ tử sĩ, thời tiết, hỏa công, sương mù chiến tranh, tutorial bài 1, lưu / tải. Luật đầy đủ ở `docs/GDD.md`.
- Logic thuần: `src/rules.js`, `ai.js`, `missions.js`, `mapgen.js`, `config.js`, `weather.js`, `fire.js`, `fog.js`, `tutorial.js`, `saves.js`. Render: `src/render/view.js` (+ `assets.js`, `pixelground.js`, `doodle.js`...). UI: `src/game.js`, `index.html`, `style.css`.
- Test: `npm test` (108 qua). Build: `npm install` (không commit package-lock) rồi `node tools/build_single.mjs` → `dist/artifact.html` và `dist/standalone.html` (~13,2 MB).
- Đo cân bằng: `node tools/simulate.mjs N enemyLvl humanLvl size enemy mission` (env `NOFOG=1`, `NOWEATHER=1` để so; `MIND=1` bật tư thế âm binh). `humanLvl = turtle`: bot người thủ chắc quanh thành (lối chơi rùa của user). In thêm số squad chết/ván, tư thế, goblin hoang đánh ai.
- Artifact game: https://claude.ai/artifact/CSx81EnZweknsmJP2FXymS (v63). Publish lại bằng Artifact tool, `file_path=/home/user/Turnbase1/dist/artifact.html`, `url` trên.
- Chụp ảnh game thật: Playwright mở `file:///home/user/Turnbase1/dist/standalone.html?seed=5`, bấm `#splash-start`, đóng modal; `window.__game` là đối tượng game (`.state`, `.view`). Server http cục bộ bị chặn, dùng file build.

## 2. Làm trong đợt này (đã xong)
- **Thời tiết:** gió 8 hướng (hiếm đổi), mây đen lớn/nhỏ trôi liên tục chậm hơn mây trắng, ~27% mây lớn đang mưa, mưa biến đồng bằng thành đầm lầy 2 lượt. Kỵ binh vào được đầm lầy (chậm).
- **Hỏa công:** chỉ cung thủ người, tên lửa = phát bắn thường + lửa (1 quân/lượt), hồi 3 lượt, cháy 2 lượt rồi thành rừng cháy, lan xuôi gió 12%/lượt, mưa dập. Sprite cây cháy / cây cụt gen Seedream (`assets/terrain/fire_*`, `burnt_*`).
- **Sương mù:** tầm nhìn 3 (+1 cung, +1 đồi/tháp, +2 núi thấp); Orc trong rừng = bóng đen + "?"; goblin vẫn tàng hình; đâm vào quân khuất sương thì dừng; bắn từ sương bị định vị; AI chơi công bằng. Menu bật/tắt sương mù và thời tiết.
- **Mộ tử sĩ:** cả bản đồ bị ếm; vùng 12 ô quanh necromancer dậy sau 2 lượt, ngoài vùng 4 lượt; mộ nào cũng đếm lùi. Hành động đổi tên **"Cầu siêu"** (EN vẫn "Bury the fallen"). Sprite mộ gen Seedream, không đổ bóng, viền hoà cỏ (`graveh_*`, `graveo_*`).
- **Cỏ đồng bằng** (nền pixel) hạt nhuyễn hơn.
- **AI âm binh** hung hãn hơn (`UNDEAD_AI` trong `ai.js`), hộ vệ necromancer (`NECRO_GUARD`), cố thủ bên đánh lấy thành làm đích chính.

## 2b. Làm trong session 2026-11-27
- **Quân thở** bật mặc định (user yêu cầu; bản lưu cài đặt cũ có `idle:false` thì vẫn tắt tới khi bật lại).
- **Goblin hoang** trong trận âm binh: ~40% chỗ goblin có toán, giữ cụm rừng nhà, cuối lượt mỗi phe đánh quân phe đó đứng trong rừng. Vẫn `faction:'orc'` + `lair`; `isWild()`. GDD mục 7.
- **Trí nhớ AI dưới sương mù** (`s.memory`, 3 lượt, có trong bản lưu). GDD mục 9.
- **Tư thế âm binh** (`undeadMind`, `AI_FLAGS.undeadMind`): đã viết, **mặc định TẮT** vì đo chưa đạt. GDD mục 11 có số đo và vấn đề gốc.

## 3. Việc mở (theo thứ tự)
0. **Tư thế âm binh: chờ user quyết vấn đề tốc độ.** Âm binh chậm hơn 1 ô nên không bao giờ đánh trước được quân người đang thủ; bot rùa hạ 1 squad/lượt bằng 2 đòn dồn. Hướng đã nêu với user, chưa chốt: (a) âm binh đứng sát mép tầm đe doạ, ép người phải bước ra khỏi thế thủ mới đánh được, và chấp nhận hoà nếu người chơi cũng ngồi; (b) cho âm binh một thứ đánh từ xa / gây áp lực không cần áp sát; (c) chấp nhận đổi quân đầu (đông hơn 2 squad) để lấy lượt đánh trả. User đã chốt: con rối theo ý necromancer (thắng hoặc giữ mạng), ít quân hết mộ thì co cụm, lùi giữ mộ hợp lý.
1. **AI âm binh vs người chơi thật.** User thắng âm binh bằng cách *thủ chắc, để âm binh dồn lên rồi bắn cung*; thỉnh thoảng dùng kỵ binh vòng đường khác đánh necromancer. Lưu ý: bản hung hãn mới (v63) có thể còn dễ bị bẫy này hơn. Hướng đề xuất (chưa làm, chưa hỏi user): **đánh theo đợt**: âm binh dừng ngay ngoài tầm đe doạ của địch cho tới khi đủ quân cùng lao vào trong một lượt, thay vì từng con đi vào tầm cung; cung thủ âm binh bắn đáp trả vị trí thủ; necromancer dùng mộ để ép người chơi ra khỏi thế thủ.
2. Đóng gói lại bản itch (`docs/itch/`: zip, ảnh chụp, bài đăng đã cập nhật luật mộ) + viết **devlog #2** (thời tiết, hỏa công, sương mù, mộ ếm toàn bản đồ, âm binh hung hơn).
3. **Chế độ chinh chiến** (mang squad elite qua trận): user đang suy nghĩ, chưa làm. Đề xuất đã đưa: chuỗi trận bật riêng, thắng được mang tối đa 2 elite (giữ cấp, hồi đủ quân), AI mạnh dần mỗi trận, thua là hết chuỗi. Xem GDD mục 16.
4. Tutorial bài 2–4 (địa hình/sĩ khí, quân đặc biệt, âm binh/cầu siêu), chờ góp ý bài 1.
5. Cố thủ vs Orc khi có sương mù: AI orc đánh tốt hơn khi không thấy quân người (GDD ghi [MỞ]).

## 4. Art / trailer
- Character sheet: `docs/art/sheets/`, quy tắc ở `docs/art/character-sheets.md`. Trailer: `docs/art/trailer/{orc,undead,goblin}` (đã xong đợt trước).
- Higgsfield: ảnh dùng `seedream_5_5` (user thích), ~3,5 credit/ảnh. Upload tham chiếu: `media_upload` → `curl -X PUT` → `media_confirm`. Sprite game: gen trên nền magenta, tách nền và hạ về mật độ pixel của cây thông gốc (`assets/terrain/pine_*`, ~33×72 px) bằng BOX downscale + alpha cứng.

## 5. Môi trường
- Commit kết thúc bằng 2 dòng `Co-Authored-By` và `Claude-Session` theo chỉ dẫn hệ thống. Không tạo PR nếu chưa được yêu cầu.
