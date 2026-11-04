# Chiến Địa Doodle (prototype)

Game chiến thuật theo lượt trên **lưới vuông**, hiển thị **isometric** theo phong cách doodle vẽ tay.
Chạy trên trình duyệt (chuột + touch, landscape). Người chơi (quân ta, màu xanh) đấu AI (Orc, màu đỏ).

## Chạy

```bash
python3 -m http.server 8080      # hoặc: npm run serve
# mở http://localhost:8080
```

Tham số URL: `?seed=123` (map cố định) · `?ai=easy|tactical` · `?speed=normal|fast|instant` · `?lang=vi|en`.
Không cần build; PixiJS được vendor sẵn ở `vendor/pixi.min.js`.

## Luật tóm tắt (bản test: chỉ có phần core, chưa có kinh tế)

- **Lượt**: mỗi đội quân (squad) di chuyển rồi hành động một lần. Đi vào ô kề địch thì phải dừng (ZOC).
- **Squad**: một hình vẽ = một squad, quân số 1–10. Quân số càng thấp, đòn đánh càng yếu.
- **4 loại**: dân quân, bộ binh, cung thủ (tầm 2–3, không đánh được khi bị áp sát), kỵ binh (xung phong +20% nếu đi ≥3 ô).
- **Chiến đấu deterministic** (không random): xem trước kết quả trước khi xác nhận. Có phản công, giáp công (+15%/đồng đội kề mục tiêu, tối đa 2), khắc chế loại quân.
- **Địa hình**: rừng/đồi/núi (thiên nhiên) lợi cho **Orc**; làng/hầm mỏ/tháp/thành (công trình) lợi cho **người**. Sông chỉ qua cầu. Kỵ binh không lên núi. Cung thủ trên đồi bắn xa thêm 1 ô.
- **Kỷ luật & tinh thần**: người có bonus đội hình, ngưỡng tan vỡ thấp; Orc không có đội hình, dễ tan vỡ. Squad tan vỡ tự rút lui cho tới khi hồi tinh thần.
- **Gộp / tách**: dân quân gộp vào bộ binh/cung thủ để bù quân; tách một squad làm đôi.
- **Làng** hồi 2 quân/lượt cho squad đứng trong. **Thắng** khi giữ thành địch đủ 2 lượt (hoặc diệt hết địch).

Mọi con số cân bằng nằm trong `src/config.js`.

## Cấu trúc

```
src/config.js      số liệu (địa hình, chỉ số, hệ số)
src/rules.js       luật thuần logic, không đụng DOM/Pixi (có test)
src/mapgen.js      map procedural không đối xứng, có seed; công bằng được kiểm tra sau khi sinh (assess)
src/ai.js          AI 2 mức: easy / tactical
src/actions.js     thực thi một hành động AI lên state
src/game.js        điều khiển ván, UI, preview, menu
src/render/        Pixi: view (iso, camera, animation), assets, doodle (vẽ bằng code)
src/i18n.js, lang/ chuỗi UI, mỗi ngôn ngữ một file JSON
tools/             extract_sprites.py (tách sprite từ sheet), simulate.mjs (AI vs AI)
tests/             node --test
```

## Thay asset thật dần

`src/render/assets.js` là registry có fallback. Asset nào có file thì dùng, không có thì vẽ bằng code.

| Muốn thay | Thả file vào |
|---|---|
| Sprite đơn vị chung | `assets/units/<role>.png` + `<role>_fill.png` |
| Sprite riêng cho một phe | `assets/units/<phe>_<role>.png` (+ `_fill.png`) — ưu tiên cao nhất |
| Công trình | `assets/buildings/<tên>.png` (+ `_fill.png`) |

`role`: `militia`, `infantry`, `archer`, `cavalry`. `phe`: `human`, `orc`. Tên công trình xem `BUILDING_WIDTH` trong `assets.js`.

Định dạng: **nét đen trên nền trong suốt**, outline khép kín. `_fill.png` là mask (alpha) vùng được tô màu phe;
nếu thiếu `_fill` thì sprite không được tô màu. `python3 tools/extract_sprites.py` tách tự động từ `assets/src/*.jpg`.
Orc hiện dùng sprite người tô đỏ + sừng vẽ bằng code (toạ độ ở `ORC_FEATURES`).
Trình duyệt sẽ in vài lỗi 404 trong console khi dò các file override tuỳ chọn; vô hại.

## Ngôn ngữ

Sửa/dịch chuỗi ở `lang/vi.json`. Thêm ngôn ngữ: tạo `lang/<mã>.json` (copy `vi.json`), thêm mã vào `LANGS` trong `src/i18n.js`.
Chuỗi thiếu key sẽ lùi về tiếng Việt.

## Hiệu năng

Nền bản đồ được bake thành texture theo chunk 8×8 ô; chỉ vẽ lại khi có thay đổi (render-on-demand, không chạy vòng lặp liên tục).
`?speed=instant` hoặc menu để tăng tốc hoạt ảnh.

## Test & mô phỏng

```bash
npm test                            # luật, map generator, ZOC, morale, gộp/tách, chiếm thành
node tools/simulate.mjs 60 tactical tactical   # AI vs AI headless: số ván, tỉ lệ thắng, số lượt
```

Cân bằng hiện chỉ được kiểm bằng AI đấu AI; cần chơi thử bằng tay để chỉnh số.

## Map & công bằng

Map **không đối xứng**: sông uốn lượn, thành đặt ngẫu nhiên trong dải của mỗi phe. Sau khi sinh, `assess()` kiểm tra
(1) đường bộ thông cho cả kỵ binh, (2) vùng "ai tới ô nào trước" chia 42–58%, (3) mỗi bên có làng và >= 4 ô địa hình ẩn nấp.
Map lệch quá sẽ bị bỏ và sinh lại. Đây là bộ lọc thô; seed vẫn có thể hơi lệch, hãy báo seed nếu thấy bất công.

## Xem thông tin trên cảm ứng

Chạm ô trống để xem địa hình (tốn di chuyển, phòng thủ cộng thêm, tầm bắn...). Giữ ngón tay ~0.5s lên **bất kỳ** ô nào (kể cả ô đang trong vùng di chuyển) để xem.
Chọn cung thủ: vùng cam là tầm bắn. Chạm vào địch: vùng đỏ nhạt là nơi nó có thể đánh tới lượt sau.
