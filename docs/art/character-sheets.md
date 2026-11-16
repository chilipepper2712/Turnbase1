# Prompt character sheet cho trailer và cutscene

Dùng với Higgsfield `generate_image`, model `gpt_image_2_6`, **tỉ lệ 16:9, quality high**.
Mỗi prompt = **khối BỐ CỤC** + **khối NHÂN VẬT** của đơn vị + **khối PHONG CÁCH** + **khối LOẠI TRỪ**, ghép thành một đoạn theo đúng thứ tự đó
(model đọc phần đầu nặng hơn, nên bố cục và nhận dạng phải đứng trước).

Gợi ý khi chạy:
- Đính kèm **sprite trong game** của đơn vị đó (`assets/units/...png`) làm ảnh tham chiếu để giữ đúng đồng phục và màu.
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

### Phe người (màu nhấn: đỏ thẫm)

**Dân quân**
```
a hardened peasant militiaman in his forties, weathered tanned skin, deep-set tired eyes, short stubble, black cloth cap, grey quilted padded vest over a long brown wool robe, rope belt, cloth wrapped shins and straw sandals, holding a long simple wooden spear with an iron leaf blade, stocky farmer's build with thick forearms, accent color: a faded red cloth tied around the spear,
```

**Bộ binh**
```
a veteran heavy infantryman in his thirties, square jaw, scar across the cheekbone, stern narrow eyes, steel helmet with a tall red horsehair plume and gilded brow guard, grey steel lamellar armor with red lacquered trim, layered shoulder plates, patterned gold sash at the waist, dark red under-robe, black boots, straight double-edged sword held low, broad-shouldered powerful build, accent color: crimson plume and trim,
```

**Cung thủ**
```
a lean seasoned archer in his thirties, sharp watchful eyes, thin mustache, brown fur-lined hat, grey-green padded vest over a long brown robe, leather bracer on the bow arm, quiver of red-fletched arrows at the hip, drawing a recurve horn bow, wiry athletic build with long arms, accent color: red arrow fletching,
```

**Kỵ binh**
```
a proud cavalry banner-rider in his thirties, confident grin, straw conical hat tied under the chin, red quilted riding tunic with brass studs, carrying a tall blue war banner with a red emblem, curved saber at the belt, riding a muscular chestnut warhorse with simple leather tack and red tassels, accent color: red tunic and tassels,
```

**Thủy binh (trên bộ và trên thuyền: hai sheet, hoặc gộp)**
```
a rugged river marine boatman in his late twenties, sun-darkened skin, cheerful but tough face, white cloth headband, sleeveless light hemp shirt, rolled-up dark trousers, coil of rope over the shoulder, woodcutter's axe in hand; in the close-up panel he stands in a narrow wooden river boat drawing a recurve bow, accent color: red headband tails,
```

### Phe Orc (màu nhấn: đỏ máu và xanh lục)

**Orc phỉ (dân quân)**
```
a scrappy orc raider, green-olive skin, short lower tusks, heavy brow, battered iron skullcap helmet, single grey iron shoulder pauldron, leather wraps on arms and legs, round wooden shield with nail studs, long crude spear, lean wiry build, accent color: red war paint stripe across the eyes,
```

**Orc chiến binh**
```
a massive orc brute warrior, deep green skin, huge lower tusks, small fierce eyes under a heavy brow, spiked iron shoulder pauldron, thick leather chest strap, grey hide loincloth, iron chain around the waist, giant notched cleaver sword, enormous hunched muscular build with gigantic forearms, accent color: red-painted handprint on the chest,
```

**Orc cung thủ**
```
a gaunt orc hunter-archer, green skin, long pointed ears, narrow cunning eyes, grey hooded cloak, leather straps across the chest, quiver of black-feathered arrows on the back, short heavy bow, lean sinewy build, accent color: red bone beads on the hood,
```

**Kỵ lợn rừng**
```
an orc boar-rider, green skin, horned iron helmet, round shield painted with a red skull emblem, barbed spear, riding a huge dark bristled war boar with long curved tusks and iron-studded leather harness, accent color: red skull emblem,
```

**Goblin**
```
a small sly forest goblin skirmisher, bright green skin, oversized pointed ears, sharp yellow eyes, crooked grin, ragged hood and cloak made of leaves, moss and bark for forest camouflage, crouching ambush pose, curved dagger in one hand and a small hand axe in the other, wiry tiny build, accent color: bright leaf green against dark bark brown,
```

### Âm binh (màu nhấn: lửa ma xanh lục nhạt trong hốc mắt)

Âm binh **giữ nguyên đồng phục phe gốc**. Lấy khối nhân vật của đơn vị sống tương ứng ở trên, rồi **thêm ngay sau nó** đoạn này:
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

## Ví dụ ghép hoàn chỉnh: Bộ binh phe người

```
Character model sheet, one large heroic full-body view on the left, a row of three smaller full-body views on the right showing front, side profile and back, three head-and-shoulders expression studies (neutral, battle cry, grim) and one close-up of the face and weapon detail, identical original character in every view, single character only, off-white paper background with a soft ground shadow under the feet, professional character sheet presentation, a veteran heavy infantryman in his thirties, square jaw, scar across the cheekbone, stern narrow eyes, steel helmet with a tall red horsehair plume and gilded brow guard, grey steel lamellar armor with red lacquered trim, layered shoulder plates, patterned gold sash at the waist, dark red under-robe, black boots, straight double-edged sword held low, broad-shouldered powerful build, accent color: crimson plume and trim, stylized painterly 2D concept art, flat color blocks with visible dry gouache brush texture, shape-driven rendering with almost no outlines, heroic exaggerated proportions, hard-edged cel shadows in two to three values with warm bounce color in the shadows, limited desaturated palette with one strong accent color, torn frayed cloth edges with small flying fragments, big simple cloth folds, mature angular face with natural skin marks, strong readable silhouette, even neutral studio lighting from the upper left, high-end game cinematic character art, 4K, sharp, original character, does not resemble any existing character or real person, no text, no labels, no watermark, no logos, no frame borders, no background scenery, no extra characters, no duplicate figures in the hero view, no cute proportions, no babyface, no distorted hands, no extra fingers
```
