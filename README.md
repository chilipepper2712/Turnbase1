# Chiến Địa Doodle (prototype)

Game chiến thuật theo lượt trên **lưới vuông**, hiển thị **isometric** theo phong cách doodle vẽ tay.
Chạy trên trình duyệt (chuột + touch, landscape). Người chơi (quân ta, màu xanh) đấu AI (Orc, màu đỏ).

## Chạy

```bash
python3 -m http.server 8080      # hoặc: npm run serve
# mở http://localhost:8080
```

Tham số URL: `?seed=123` (map cố định) · `?ai=easy|tactical` · `?speed=normal|fast|instant` · `?lang=vi|en` · `?idle=1` (bật hoạt ảnh thở, mặc định tắt) · `?clouds=0` (tắt mây) · `?size=small|medium|large`.
Không cần build; PixiJS được vendor sẵn ở `vendor/pixi.min.js`.

## Luật tóm tắt (bản test: chỉ có phần core, chưa có kinh tế)

- **Lượt**: mỗi đội quân (squad) di chuyển rồi hành động một lần. Đi vào ô kề địch thì phải dừng (ZOC).
- **Squad**: một hình vẽ = một squad, quân số 1–10. Quân số càng thấp, đòn đánh càng yếu.
- **4 loại**: dân quân, bộ binh, cung thủ (tầm 2–3, không đánh được khi bị áp sát), kỵ binh (xung phong +20% nếu đi ≥3 ô).
- **Chiến đấu deterministic** (không random): xem trước kết quả trước khi xác nhận. Có phản công, giáp công (+15%/đồng đội kề mục tiêu, tối đa 2), khắc chế loại quân.
- **Địa hình**:
  - Thiên nhiên (rừng, đồi, núi thấp) lợi cho **Orc**; công trình (làng, hầm mỏ, tháp, thành) lợi cho **người**.
  - **Núi cao**: không leo, không vượt, phải đi vòng. **Núi thấp / đồi**: đi được, thủ cao, đứng trên đó đánh mạnh hơn (thế cao).
  - **Đầm lầy**: bất lợi cho cả hai phe (đi chậm, giảm thủ, giảm sức đánh, kỵ binh không vào).
  - Sông chỉ qua cầu. Cung thủ trên đồi bắn xa thêm 1 ô.
- **Kỷ luật & tinh thần**: người có bonus đội hình, ngưỡng tan vỡ thấp; Orc không có đội hình, dễ tan vỡ. Squad tan vỡ tự rút lui cho tới khi hồi tinh thần.
- **Kinh nghiệm**: gây sát thương, hạ địch, sống sót sau khi bị đánh đều cho xp. 3 cấp (có trần): mỗi cấp +8% sát thương, +4% thủ.
- **Hạ trại**: thay cho cả lượt hành động, **có hiệu lực ngay**. Mức cố định (người +15%, Orc +12%) nhân với hệ số địa hình (ô cộng thủ thì mạnh hơn, ô trừ thủ thì yếu hơn). Di chuyển hoặc tấn công thì mất trại. Cấp bậc không đổi mức này; hạ trại giữ nguyên cho tới khi quân di chuyển, tấn công, gộp/tách hoặc tan vỡ.
- **Gộp / tách**: dân quân gộp vào bộ binh/cung thủ để bù quân (xp lấy trung bình theo quân số); tách một squad làm đôi.
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

## Credit asset

Công trình, cây, đá/núi, lều, hàng rào dùng **Kenney Cartography Pack** (CC0, www.kenney.nl). Giấy phép gốc: `assets/KENNEY_LICENSE.txt`.
Nhập lại hoặc thêm icon: `python3 tools/import_kenney.py <kenney_cartography-pack.zip>` (sửa danh sách `NAMES` trong tool).
Sprite quân là của tác giả game. Công trình cũ (`castle_town`, `stronghold`, `village_a`...) vẫn nằm trong `assets/buildings/` và được dùng làm fallback nếu file Kenney bị thiếu.

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

## Làm sprite quân từ ảnh AI

`tools/simplify_sprite.py` biến ảnh AI nhiều chi tiết thành sprite phẳng vài mảng màu: bỏ nền, thu nhỏ, làm mịn giữ cạnh, gộp màu (k-means Lab), xoá đốm, viền đen dày.
Có thể tô màu phe: `--preview p.png` in palette đánh số cụm; chọn cụm vải/áo bằng `--team 3,8 --team-hue both` để sinh `<tên>_blue.png` và `<tên>_red.png`.

```
python3 tools/simplify_sprite.py anh.webp --out assets/units/human_militia.png --height 176 --colors 11 \
        --team 3,8 --team-hue both --preview /tmp/pal.png        # --flip nếu ảnh quay mặt sang trái; --holes 4000 bỏ khoảng trắng kín
```

Giới hạn: tool chỉ làm gọn những gì ảnh gốc đã có. Nếu người và ngựa cùng tông nâu thì sẽ dính vào nhau; khi đó nên sinh lại ảnh bằng prompt đơn giản hơn.

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

Map **không đối xứng**: sông uốn lượn, thành đặt ngẫu nhiên trong dải của mỗi phe. Sau khi sinh, `assess()` loại map vi phạm bất kỳ điều nào:
đường bộ không thông (cả kỵ binh) · vùng ảnh hưởng lệch ngoài 42–58% · thiếu làng / chỗ ẩn nấp · quá nhiều núi cao hoặc đồi núi · rừng quá ít / quá nhiều ·
rừng hoặc đồi núi dồn về một phía · đầm lầy / đồi / núi / hầm mỏ kề đầu cầu · thành bị nhốt (ít ô đi được quanh thành). Các ngưỡng nằm ở `MAPGEN` trong `src/config.js`.
Khoảng 80% map sinh thô bị loại; sinh lại cho tới khi đạt (trung bình vài ms). Đây là bộ lọc thô, seed vẫn có thể hơi lệch.

## Xem thông tin trên cảm ứng

Chạm ô trống để xem địa hình (tốn di chuyển, phòng thủ cộng thêm, tầm bắn...). Giữ ngón tay ~0.5s lên **bất kỳ** ô nào (kể cả ô đang trong vùng di chuyển) để xem.
Chọn cung thủ: vùng xanh lá là tầm bắn. Chạm vào địch: vùng đỏ nhạt là nơi nó có thể đánh tới lượt sau.

## Quy ước hiển thị

Mỗi ô một địa hình, sprite nằm gọn trong ô. Màu ô: **vàng** đi được · **đỏ** đánh được · **xanh lá** gộp quân · **xanh dương** chỗ đặt đội tách ·
**chấm tròn đỏ ở giữa ô** tầm bắn (chồng lên ô vàng vẫn đọc được cả hai) · **đỏ nhạt** vùng địch có thể đánh tới.
Khi chạm: ô đang là hành động hợp lệ (đi / đánh / gộp / tách) được ưu tiên, nên quân đứng phía trước che ô không cản việc chọn ô phía sau.
