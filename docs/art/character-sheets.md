# Prompt character sheet cho trailer và cutscene

Dùng với Higgsfield `generate_image`, model `gpt_image_2_6`, **tỉ lệ 16:9, quality high**.
Mỗi prompt = **khối BỐ CỤC** + **khối NHÂN VẬT** của đơn vị + **khối PHONG CÁCH** + **khối LOẠI TRỪ**, ghép thành một đoạn theo đúng thứ tự đó
(model đọc phần đầu nặng hơn, nên bố cục và nhận dạng phải đứng trước).

**BẮT BUỘC khi chạy:** đính kèm **sprite trong game** của đơn vị đó (`assets/units/...png`, phóng to nearest-neighbor trên nền trắng) làm ảnh tham chiếu,
và mở đầu khối nhân vật bằng câu `redrawn faithfully from the reference pixel sprite, keep exactly its costume, colors and silhouette, add nothing foreign`.
Lần chạy đầu chỉ dùng chữ mô tả, model tự thêm mũ lông, ria, cung sừng nên cung thủ thành lính du mục; đính kèm sprite là sửa được.
Các khối nhân vật dưới đây **chỉ mô tả đúng những gì có trên sprite**, không thêm chi tiết.

Gợi ý khi chạy:
- Có thể đính kèm thêm **một** ảnh tham chiếu phong cách của mày, nhưng prompt dưới đây đã mô tả đủ phong cách bằng lời, không gọi tên nhân vật hay game nào.
- Có sheet ưng ý rồi thì dùng chính sheet đó làm tham chiếu cho mọi khung hình cutscene của nhân vật, đó là cách giữ nhân vật nhất quán.

---

## Phân tích ảnh tham chiếu (phong cách cần đạt)

| Yếu tố | Thấy trong ảnh | Viết vào prompt thành |
|---|---|---|
| Kỹ thuật vẽ | 2D vẽ tay kiểu concept art, mảng màu phẳng lớn, nét cọ khô (gouache) còn thấy, gần như **không có nét viền**: khối hình do mảng sáng tối tạo ra | painterly 2D, flat color blocks, dry gouache brush texture, shape-driven with almost no outlines |
| Hình khối | Phóng đại kiểu anh hùng: vai và ngực rất to, cẳng tay và nắm tay to, đầu nhỏ, chân thon dần, dáng tam giác ngược, silhouette rất rõ | heroic exaggerated proportions, massive shoulders and forearms, small head, tapered legs, strong readable silhouette |
| Đổ bóng | Bóng cắt sắc bằng 2–3 sắc độ, mảng tối hình học, có ánh màu ấm trong vùng tối | hard-edged cel shadows in 2–3 values, angular shadow shapes, warm bounce color in shadows |
| Bảng màu | Hạn chế: tông chủ đạo trầm (đen, xám, vải bạc màu) + **một màu nhấn** (tím phép thuật, đỏ biểu tượng) | limited palette, desaturated base, one strong accent color |
| Chất liệu vải | Vải rách tả tơi, mép rách có mảnh vụn bay ra, nếp gấp lớn và đơn giản | torn frayed cloth edges with small flying fragments, big simple folds |
| Hiệu ứng | Ngọn lửa/khói phép vẽ bằng một nét cọ lớn bán trong suốt | magic as a single large translucent brush-stroke flame |
| Trình bày sheet | Ảnh 2: một dáng toàn thân lớn, các góc trước/sau/nghiêng nhỏ, 3 đầu biểu cảm, một cận cảnh; nền trắng ngà, có bóng đổ dưới chân | model sheet layout: hero full-body + front/back/side + expression heads + close-up, off-white background, soft ground shadow |
| Nhân vật | Mặt người lớn, góc cạnh, nam tính, có tàn nhang và sẹo; không đẹp kiểu búp bê | mature angular faces, freckles, scars, not cute, not babyface |

**Lưu ý giữ bản sắc game:** phe người trong game mang nét quân Á Đông thời trung đại (giáp lá, mũ chùm lông đỏ, nón lá, mũ lông), Orc xanh lục mặc đồ thô ráp, âm binh giữ đồng phục phe gốc, necromancer kiểu Á. Các prompt dưới đây giữ đúng những chi tiết đó, chỉ đổi cách vẽ.

---

## Khối dùng chung

**BỐ CỤC** (đặt đầu tiên):
```
Character model sheet, one large heroic full-body view on the left, a row of three smaller full-body views on the right showing front, side profile and back, three head-and-shoulders expression studies (neutral, battle cry, grim) and one close-up of the face and weapon detail, identical original character in every view, single character only, off-white paper background with a soft ground shadow under the feet, professional character sheet presentation,
```

**PHONG CÁCH** (đặt sau phần nhân vật):
```
stylized painterly 2D concept art, flat color blocks with visible dry gouache brush texture, shape-driven rendering with almost no outlines, heroic exaggerated proportions, hard-edged cel shadows in two to three values with warm bounce color in the shadows, limited desaturated palette with one strong accent color, torn frayed cloth edges with small flying fragments, big simple cloth folds, mature angular face with natural skin marks, strong readable silhouette, even neutral studio lighting from the upper left, high-end game cinematic character art, 4K, sharp
```

**LOẠI TRỪ** (đặt cuối):
```
original character, does not resemble any existing character or real person, no text, no labels, no watermark, no logos, no frame borders, no background scenery, no extra characters, no duplicate figures in the hero view, no cute proportions, no babyface, no distorted hands, no extra fingers
```

Cho **sinh vật / quân cưỡi** (kỵ binh, kỵ lợn rừng, xác ngựa): thay câu "three smaller full-body views..." bằng `three smaller views of rider and mount showing front, side profile and back`.

---

## Khối nhân vật cho từng đơn vị

### Phe người

**Cảm hứng tạo hình phe người:** trộn nhà Đinh (thế kỷ 10) và nhà Trần (thế kỷ 13–14). Tư liệu rời rạc và không chắc chắn, chỉ lấy cảm hứng, không tái hiện nghiêm ngặt; vẫn bám sprite trong game. Thêm vào mọi khối người: `Vietnamese medieval warrior inspired by the Dinh and Tran dynasties (loosely, not a strict reconstruction)`.

**Trang bị chung của phe người** (ghép sau khối nhân vật; mày chốt):
- **Giáp lá xám** (bộ binh, kỵ binh, cung thủ, dân quân dùng bản "giáp vải bọc" như sprite; thủy binh không giáp):
```
the grey armor is layered steel lamellar made of small vertical rectangular plates laced together in staggered horizontal rows with visible lacing between rows,
```
- **Đoản kiếm bên hông** (mọi quân người trừ dân quân và thủy binh có rìu thì tuỳ; kỵ binh bắt buộc):
```
a short straight double-edged sword like a dirk worn at the left hip: tapering steel blade, brass ferrule and brass pommel cap, dark brown hardwood grip that swells in the middle, in a dark brown leather scabbard with a band of round brass studs,
```
- **Bộ binh**: vũ khí chính là **trường kiếm hoặc trường đao** (một thanh dài thẳng một lưỡi hoặc hai lưỡi, cán dài hai tay), không phải đoản kiếm; đoản kiếm ở hông là vũ khí phụ.
- **Kỵ binh**: mặc giáp lá xám như bộ binh (sprite chỉ thấy áo đỏ ở ngoài), có **kiếm bên hông**.

**Dân quân** (`human_militia.png`)
```
a medieval East Asian militia spearman, clean-shaven, black cloth cap, grey padded armored vest with tan trim and a black belt over dark long sleeves, long brown cotton robe, black boots, holding a long wooden spear with an iron blade diagonally across the body, accent color: tan trim,
```

**Bộ binh** (`human_infantry.png`)
```
a Vietnamese medieval heavy infantryman, small mustache, steel helmet with a red plume and a gilded brow ornament, grey layered steel lamellar armor (small vertical plates laced in staggered rows) with brown trim and layered shoulder guards, dark red under-robe, yellow-and-black patterned sash at the waist, black boots, wielding a long two-handed straight sword (truong kiem) held across the body, with a short dirk in a brown studded scabbard at the left hip, accent color: red plume and dark red robe,
```

**Quy tắc vật cứng (mọi sheet có đồ đeo):** ống tên, vỏ kiếm, chuôi kiếm là vật cứng có hình dạng cố định, không được cong hay ôm theo dáng người. Thêm vào prompt: `RIGID OBJECTS RULE: the scabbard is a perfectly straight tapered rigid case angled slightly away from the body, the hilt is a straight rod, the quiver is a stiffened rigid straight tapered tube hanging from a strap and standing off the hip, not a soft bag; none of them bend, curve or wrap around the hip, thigh or torso`.

**Mũ kỵ binh người** là *nón trận* (mũ chiến cứng, vành rộng phẳng, núm tròn trên đỉnh, quai cằm, tấm vải đỏ che gáy), không phải nón lá đan.

**Lưu ý giải phẫu và tỉ lệ (kiểm khi duyệt ảnh, mọi sheet):** tai đối xứng bằng nhau, đủ hai tay hai chân, năm ngón mỗi bàn tay, vũ khí đúng tỉ lệ cơ thể. Lỗi đã gặp: tai một dài một ngắn (do prompt tả "một tai dài" theo sprite nhìn nghiêng, phải viết `two pointed ears of exactly equal size`), cung quá nhỏ như đồ chơi, ống tên quá ngắn.

**Cung thủ** (`human_archer.png`)
```
a medieval East Asian foot archer, clean-shaven, short black hair, plain brown cloth cylindrical cap (not fur, no brim), grey padded armored vest with dark moss-green trim and a black belt over a long brown cotton robe with long sleeves, plain black boots, simple long wooden self bow with a dark red-brown stave, a LONG yellow-ochre leather quiver of realistic size (about 60-70 cm, tall tapered cylinder with many arrows whose fletching clearly sticks out above its opening, strap across the torso), accent color: yellow-ochre quiver,
```

**Kỵ binh** (`human_cavalry.png`)
```
a Vietnamese medieval banner cavalryman, a rigid war helmet (non tran): smooth hard domed pale-metal helmet with a wide flat sloped brim, a small round finial on top, a chin strap and a red cloth neck flap (NOT woven straw, NOT a conical rice-paddy hat), grey layered steel lamellar armor (small vertical plates laced in staggered rows) under a red-orange riding tunic and red cape, holding a tall blue war banner with a red-orange emblem and a white tail ribbon, a sword worn at the left hip in a dark brown studded scabbard, riding a chestnut-brown horse with simple dark tack, accent color: blue banner against red tunic,
```

**Thủy binh** (`human_marine.png`, `human_marineboat.png`)
```
a medieval East Asian river boatman soldier, clean-shaven, hair in a top bun with a white cloth headband with loose tails, light beige wrap-front shirt with rolled sleeves, grey cloth sash, dark rolled-up trousers, black shoes, coil of rope over the shoulder, woodcutter's axe in hand; in the close-up panel he stands in a narrow wooden rowboat drawing a long wooden bow, accent color: white headband,
```

### Phe Orc

**Vóc dáng Orc** (to và thô hơn người nhưng **không béo phì**; mày chốt):
- Chung (mọi Orc): `an orc body clearly larger and rougher than a human, broad shoulders, thick neck, long strong arms, big hands, coarse lumpy green skin, heavy jaw and brow, crude rough-hewn features,`
- **Orc chiến binh (bộ binh)**: thêm `hulking and massive, hunched powerful frame, enormous forearms`.
- **Orc cung thủ và Orc phỉ**: thêm `lean-muscled and wiry, agile and quick, taut sinewy build, light on his feet, ready to spring, no fat, no pot belly, not bulky`.
- Goblin vẫn nhỏ và gầy (luật này không áp dụng).

**Orc phỉ** (`orc_militia.png`)
```
a lean-muscled agile green-skinned orc raider with small tusks, plain iron skullcap helmet, single grey iron shoulder pauldron, brown leather tunic with straps, cloth-wrapped legs and arms, round wooden shield with an iron boss, long spear with a broad iron blade, accent color: iron grey,
```

**Orc chiến binh** (`orc_infantry.png`)
```
a huge hulking green-skinned orc brute with big lower tusks, spiked grey iron shoulder pauldron on one shoulder, diagonal leather chest strap, grey cloth loincloth with a belt, bare muscular arms and legs with cloth wraps, giant notched cleaver sword, accent color: steel grey cleaver,
```

**Orc cung thủ** (`orc_archer.png`)
```
a green-skinned orc archer with a long ear and small tusks, grey cloth hood and wrapped grey tunic, leather straps across the chest, orange-brown leather quiver on the back, a wooden bow about two thirds of his body height with an even curve and a straight string, clearly in scale (not a toy bow), cloth-wrapped legs, accent color: orange-brown quiver,
```

**Kỵ lợn rừng** (`orc_cavalry.png`)
```
an orc rider with a horned dark iron helmet, round shield painted red with a white fanged emblem, long spear with a broad blade, riding a big dark-brown bristled war boar with pink snout and curved white tusks, accent color: red shield,
```

**Goblin** (`orc_goblin.png`)
```
a small crouching forest goblin with bright green skin and big pointed ears, hood and cloak covered in leaves and moss, brown leather belt and pouch, holding a curved dagger and a small hand axe, wiry build (goblins stay small and wiry, the orc bulk rule does not apply), accent color: leaf green,
```

### Âm binh (màu nhấn: lửa ma xanh lục nhạt trong hốc mắt)

Âm binh **giữ nguyên đồng phục phe gốc**. Đính kèm sprite âm binh (`undead_human_*.png` / `undead_orc_*.png`) hoặc sprite lúc còn sống, lấy khối nhân vật của đơn vị sống tương ứng ở trên, rồi **thêm ngay sau nó** đoạn này:
```
now risen as an undead warrior: the same uniform, colors and accessories kept but torn, faded, dusty and rusted, flesh replaced by bare bone and dried grey-green skin where visible, empty eye sockets glowing with a faint pale green ghost flame, slow heavy menacing stance, accent color: pale green ghost light,
```
Với âm binh gốc người, nhân vật là **bộ xương**. Với âm binh gốc Orc, nhân vật là **xác Orc khô**, giữ ngà và vóc dáng to. Như vậy có 8 sheet (4 loại quân × 2 gốc).

**Necromancer (kiểu Á)**
```
an eerie East Asian dark-taoist necromancer commander, tall gaunt figure in a long layered black robe with tattered wide sleeves that dissolve into drifting black smoke at the hem, a tall black conical veil-hat hanging down to hide the face entirely, the veil embroidered with faded gold talisman calligraphy, strings of old square-holed copper coins and long red prayer-bead necklaces across the chest, pale bony hands with long dark nails, one hand raised casting a single large translucent green-violet brush-stroke flame, holding a tall staff wrapped in red talisman ribbons topped by a tattered black soul-banner canopy hung with small pale wailing ghost faces, accent color: red ribbons and green-violet spirit flame,
```
(Mặt bị che hoàn toàn, nên ở các đầu biểu cảm ghi thêm: `expression studies show the veil-hat from different angles and the glowing eyes faintly visible through the veil`.)

---

## Ví dụ đã chạy và đạt: Cung thủ người (kèm sprite `human_archer.png`)

Kết quả: `docs/art/sheets/archer_human.png` (đã có giáp lá + đoản kiếm), cung thủ Orc gầy nhanh nhẹn, hai tai đối xứng, cung đúng tỉ lệ: `docs/art/sheets/archer_orc.png` (tư thế đứng, dùng làm sheet chính) và `docs/art/sheets/archer_orc_action.png` (tư thế kéo cung), cung thủ người ống tên dài đúng cỡ đeo hông: `docs/art/sheets/archer_human.png`, bộ binh người: `docs/art/sheets/infantry_human.png`, kỵ binh người: `docs/art/sheets/cavalry_human.png`.
Prompt bản cuối của cung thủ người thêm khối "Trang bị chung của phe người" vào ngay sau phần mô tả áo.

```
Character model sheet of the archer shown in the reference pixel sprite, redrawn faithfully in a new painterly style: keep EXACTLY his costume, colors and silhouette from the reference and add nothing foreign. One large heroic full-body view on the left, a row of three smaller full-body views on the right showing front, side profile and back, three head-and-shoulders expression studies (neutral, battle cry, grim) and one close-up of the face and weapon detail, identical original character in every view, single character only, off-white paper background with a soft ground shadow under the feet, professional character sheet presentation. Character: a medieval East Asian foot archer in his thirties, clean-shaven face, short black hair, a plain brown cloth cylindrical cap (not fur, no brim, no ear flaps), a grey padded armored vest with dark moss-green trim edges and a black belt, worn over a long brown cotton robe with long sleeves, plain black boots, a simple long wooden self bow with a dark red-brown stave, a yellow-ochre leather quiver of arrows at the hip, athletic build. Stylized painterly 2D concept art, flat color blocks with visible dry gouache brush texture, shape-driven rendering with almost no outlines, hard-edged cel shadows in two to three values with warm bounce color, limited palette of brown, grey and moss green with a yellow-ochre accent, big simple cloth folds, mature angular face, strong readable silhouette, even neutral studio lighting, high-end game cinematic character art, sharp. Original character, not Mongolian, not nomadic, no fur hat, no mustache, no recurve horn bow, no text, no labels, no watermark, no logos, no frame borders, no background scenery, no extra characters, no babyface, no distorted hands, no extra fingers
```


## Danh sách sheet đã chạy (docs/art/sheets/)

- Người: `militia_human`, `infantry_human`, `archer_human`, `cavalry_human`, `marine_human`
- Orc: `militia_orc`, `infantry_orc`, `archer_orc` (+ `archer_orc_action`), `cavalry_orc`, `goblin`
- Necromancer: `necromancer`
- Âm binh gốc người: `undead_human_{militia,infantry,archer,cavalry}`
- Âm binh gốc orc: `undead_orc_{militia,infantry,archer,cavalry}`

Ghi chú còn lại: `marine_human` cận cảnh cầm cọc/chèo thay vì cung; `undead_human_archer` ống tên đeo hông hơi ngắn.

Ghi chú chạy lại: `undead_human_cavalry` đã thay bằng bản nón trận. Cung thủ và bộ binh âm binh người giữ bản cũ vì bản chạy lại bằng prompt dài bị "cartoon" và mất chi tiết. Bài học: khi sửa một chi tiết, giữ nguyên cấu trúc prompt cũ (tham chiếu là ảnh ghép sprite sống + sprite chết, mô tả ngắn "redrawn faithfully ... adding nothing foreign") và chỉ thay đúng chi tiết cần sửa, đừng viết lại cả prompt.

## Sheet bổ sung (đơn vị còn lại)

- `marine_archer_human_a` / `_b`: thủy binh hoá cung thủ, **không vẽ thuyền**, chân đất để đứng vững trên thuyền, giữ nguyên khăn, áo, quần như bản trên bờ, thêm cung và ống tên dài cứng; đã bỏ cuộn dây và rìu theo yêu cầu (theo sprite `human_marine`). Thay cho panel cận cảnh bị sai trong `marine_human` và bản thuyền đã bỏ.
- `camp_human`, `camp_orc`: trại mục tiêu của nhiệm vụ phá trại. Chưa có sprite pixel nên vẽ từ mô tả chữ; chi tiết như cờ rồng ở trại người là model tự thêm, cần đổi nếu muốn khớp biểu tượng trong game (mặt trời cam-đỏ trên nền xanh).

Toàn bộ sheet nằm trong `docs/art/sheets/` (24 file), lọc từ đây.
