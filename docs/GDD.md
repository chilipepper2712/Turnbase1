# Chiến Địa Doodle: Game Design Document

*Tên game là tên tạm. Cập nhật lần cuối: 2026-11-04. Trạng thái code: mốc 1 (core gameplay), chưa có kinh tế.*

## Cách đọc tài liệu này

Mỗi quyết định có một nhãn:

| Nhãn | Nghĩa |
|---|---|
| **[CHỐT]** | Đã thảo luận và đồng ý với nhau. |
| **[MẶC ĐỊNH]** | Dev (Claude) tự chọn khi code, chưa được review. Dễ bị đổi, đặc biệt các con số. |
| **[MỞ]** | Chưa quyết, cần thảo luận. |

Mọi con số cân bằng nằm trong `src/config.js` và là nguồn sự thật. Nếu GDD và config lệch nhau thì config đúng, GDD cần cập nhật.

---

## 1. Tầm nhìn

Game chiến thuật theo lượt trên **lưới vuông**, hiển thị **isometric**, phong cách **doodle vẽ tay** (nét mực đen trên nền giấy). Bối cảnh fantasy trung cổ: **con người đấu Orc**. Câu chuyện chưa viết; định hướng dài hạn là **chiến dịch có cốt truyện kiểu Warcraft / Fire Emblem** với đội quân giữ lại qua các màn (mục 16). **[CHỐT]**

**Trụ cột thiết kế:**

1. **Địa hình là vũ khí.** Người chơi giỏi biến mọi địa hình thành lợi thế; địa hình tạo ra "lực cản" và cơ hội, không chỉ là trang trí. **[CHỐT]**
2. **Dàn trận hơn là bấm nhanh.** Vị trí, đội hình, hướng tiếp cận, phòng tuyến quyết định thắng thua. **[CHỐT]**
3. **Dễ học.** Luật phổ biến, kết quả xem trước được, không dựa may rủi. **[CHỐT]**
4. **Mở rộng được.** Kiến trúc phải sống được ở chiến trường lớn hơn và nhiều quân hơn, chơi lâu không nóng máy. **[CHỐT]**

**Chưa làm:** câu chuyện và chiến dịch, lưu/tải, sương mù, kinh tế, hệ kỹ năng cho squad tinh nhuệ.

## 2. Phạm vi và nền tảng

| Hạng mục | Quyết định | Nhãn |
|---|---|---|
| Nền tảng | Web, chạy trên browser | CHỐT |
| Màn hình | Landscape; cầm dọc vẫn chơi được | CHỐT |
| Input | Chuột và cảm ứng (tap, giữ ngón tay, kéo, chụm hai ngón) | CHỐT |
| Ngôn ngữ | Tiếng Việt trước, chuỗi tách file để chuốt từ và dịch | CHỐT |
| Chế độ | Người vs AI (2 mức). Sau này: người vs người, nhiều người | CHỐT |
| Số màn | Một màn trước | CHỐT |
| Fog of war | Tắt ở bản test | CHỐT |
| Hiệu năng | Không lag, không nóng máy khi chơi lâu | CHỐT |
| Âm thanh | Nhạc nền loop (tác giả chuẩn bị, nhiều bài, xoay vòng ~4 phút) và hiệu ứng (checklist 25 tiếng ở `docs/AUDIO.md`, tác giả kiếm bên Kenney). Có thanh âm lượng riêng cho nhạc và hiệu ứng, nút tắt tiếng. Thiếu file thì im lặng | CHỐT |
| Màn mở đầu | Trước khi vào ván có màn mở đầu với nút **Bắt đầu**, bản đồ hiện mờ phía sau; cú bấm đó mở khoá âm thanh (quy định của trình duyệt) và bắt đầu lượt đầu | CHỐT |

**Phân mốc phát triển:**

1. **Mốc 1: core gameplay** (đang làm): dàn trận, di chuyển, chiến đấu. **[CHỐT]**
2. **Mốc 2: kinh tế** (xem mục 14).
3. **Mốc 3:** AI khó, cân bằng, hoàn thiện UI. Xem mục 15.

## 3. Phong cách hình ảnh

| Hạng mục | Quyết định | Nhãn |
|---|---|---|
| Góc nhìn | Isometric, logic trên lưới vuông | CHỐT |
| Màu | Đen trắng doodle. Phe ta tô nền xanh dương lên áo, Orc tô đỏ, nét viền luôn đen | CHỐT |
| Sprite quân | Dùng ảnh tham chiếu 3 của mày | CHỐT |
| Công trình, cây, đá/núi, hàng rào | **Kenney Cartography Pack** (CC0), bản Retina; thay sprite công trình cũ vì nét dày hơn quân nhiều gây chênh. Đồi và sông vẫn vẽ bằng code; thành tô nhạt (pha 55% với giấy) để quân cùng màu không lẫn | CHỐT |
| Asset chưa có | Dựng bằng code, thay dần khi có asset thật | CHỐT |
| Orc | Tô đỏ sprite người và thêm chi tiết bằng code (sừng, tai) cho tới khi có sprite riêng | CHỐT |
| Chữ UI | Sans-serif cho dễ đọc ở cỡ nhỏ; nội dung ngắn gọn, dùng icon thay chữ khi hiểu được. **Một bộ icon SVG nét phẳng duy nhất** (`src/icons.js`), không dùng emoji (mỗi hệ điều hành vẽ emoji một kiểu). Thang cỡ chữ 6 bậc (12/13/14/16/20/36), khoảng cách và viền theo token trong `style.css` | CHỐT |
| Handwriting | Không còn dùng trong UI; banner qua lượt và tiêu đề menu dùng chung font sans của bảng thông tin, cỡ nhỏ | CHỐT |
| Hộp thông tin | Gọn, trong suốt hơn (alpha ~0.74) để dành chỗ cho bản đồ | CHỐT |
| Mỗi ô một địa hình | Sprite nằm gọn trong ô, không chồng sang ô khác | CHỐT |
| Quân đứng trong núi thấp / đồi | Quân vẫn phải thấy được (núi hạ thấp, nằm sau quân) | CHỐT |

**Quy ước màu ô** (chỉ tô ô, không viền nét đứt) **[CHỐT]**:

| Màu | Nghĩa |
|---|---|
| Vàng | Ô di chuyển được |
| Đỏ | Mục tiêu đánh được |
| Xanh lá | Ô gộp quân |
| Xanh dương | Chỗ đặt đội khi tách quân |
| Chấm tròn đỏ giữa ô | Tầm bắn của cung thủ / pháo binh (chồng lên ô vàng vẫn đọc được cả hai) |
| Đỏ nhạt | Vùng địch có thể đánh tới ở lượt sau |

## 4. Vòng lặp ván chơi

**Phase-based (IGOUGO):** phe này đi hết lượt, rồi tới phe kia. Trong lượt, mỗi đội quân **di chuyển rồi hành động một lần** (đánh, đứng yên, hạ trại, gộp, tách). Lý do chọn: phổ biến nhất (Advance Wars, Fire Emblem, Wargroove, Wesnoth), dễ học, hợp AI và nhiều quân. **[CHỐT]**

- Di chuyển có điểm di chuyển; địa hình tốn điểm khác nhau. **[CHỐT]**
- Đi vào ô kề địch thì phải dừng (ZOC), không đi tiếp qua ô đó, không đi xuyên địch. **[MẶC ĐỊNH]**
- Đi qua quân mình được nhưng không đứng chồng lên. **[MẶC ĐỊNH]**
- Không thể di chuyển sau khi đã tấn công. **[MẶC ĐỊNH]**
- Hoàn tác di chuyển được nếu chưa hành động. **[MẶC ĐỊNH]**
- Đầu lượt: hồi quân ở làng/thành nhà, hồi tinh thần, quân bỏ chạy tự rút lui, cập nhật tiến độ chiếm thành. **[MẶC ĐỊNH]**

## 5. Bản đồ

| Hạng mục | Quyết định | Nhãn |
|---|---|---|
| Kích thước | Người chơi chọn 1 trong 3 cỡ, khung chữ nhật dọc: **Nhỏ 16×20, Vừa 22×28, Lớn 26×36**. Số squad mỗi bên (7 / 13 / 20), làng, tháp, hầm mỏ tăng theo diện tích | CHỐT |
| Sinh map | Procedural có seed, hiển thị seed để replay | CHỐT |
| Đối xứng | **Không** đối xứng (đối xứng làm game giống cờ vua / cờ tướng). Công bằng được kiểm tra sau khi sinh | CHỐT |
| Vị trí thành | Orc ở phía trên, người ở phía dưới; vị trí ngang ngẫu nhiên | MẶC ĐỊNH |
| Nước | **Ngẫu nhiên hoàn toàn**: có thể không có nước (~20–35%), một sông đi từ mép này sang mép kia theo hướng bất kỳ, sông rẽ nhánh chia map thành nhiều vùng, hồ, hoặc kết hợp. Cầu chỉ đặt ở chỗ nước hẹp (tối đa 3 ô) và **hai đầu phải là đất đi được**, bắc đúng hướng ngang dòng nước, không bao giờ nằm trơ giữa nước. Ý "sông cắt ngang giữa map" ban đầu chỉ là di sản của map đối xứng, không phải quyết định thiết kế | CHỐT |
| Cù lao | Vùng đất nhỏ giữa sông hoặc hồ. Có làng, tháp hoặc mỏ thì được bắc cầu nối vào đất liền; không nối được thì công trình bị dọn đi. Cù lao hoang không công trình thì để nguyên (không ai tới được) | CHỐT |
| Hộp tạo màn | Chỉ cho chọn **cỡ bản đồ** (menu, áp dụng cho map mới). Không cho chọn tỉ lệ địa hình: để ngẫu nhiên hoàn toàn cho đơn giản. Kiểu menu Civilization (chọn nhiều thông số) đã cân nhắc và bỏ | CHỐT |
| Đầu cầu | Không được có đầm lầy, đồi, núi (thấp lẫn cao), hầm mỏ ngay cạnh cầu | CHỐT |
| Ruộng, hầm mỏ ở bản test | Chỉ là địa hình (ruộng như đồng bằng) | CHỐT |

**Bộ lọc công bằng (`assess`)**: map bị loại nếu vi phạm bất kỳ điều nào, rồi sinh lại (khoảng 80% map thô bị loại, trung bình ~4ms): **[CHỐT ý tưởng, MẶC ĐỊNH ngưỡng]**

- đường bộ không thông giữa hai thành, kể cả kỵ binh;
- vùng "ai tới ô nào trước" lệch ngoài 42–58%;
- thiếu làng hoặc thiếu chỗ ẩn nấp (≥ 4 ô rừng/đồi/núi thấp) ở một phía;
- núi cao > 5%, đồi núi > 28% tổng ô; rừng ngoài 6–24%;
- rừng hoặc đồi núi dồn về một phía (chênh > 12%);
- thành bị nhốt (ít hơn 26 ô đi được trong tầm 8 điểm di chuyển quanh thành);
- đầu cầu bị chắn.

Lý do: tránh các map kỳ quặc kiểu "thành bị nhốt trong núi, bên kia toàn rừng". Đây là bộ lọc thô; một seed riêng lẻ vẫn có thể hơi lệch.

## 6. Địa hình

Hai loại phòng thủ: **thiên nhiên** (rừng, đồi, núi thấp) và **công trình** (làng, hầm mỏ, tháp, thành). **Orc hưởng 100% thiên nhiên và 50% công trình; người hưởng 50% thiên nhiên và 100% công trình.** **[CHỐT]**

| Địa hình | Điểm đi | Thủ (người / Orc) | Khác | Nhãn |
|---|---|---|---|---|
| Đồng bằng, ruộng | 1 | 0 / 0 | Đất cày không phạt di chuyển | CHỐT |
| Rừng | 2 (Orc 1, kỵ binh +1) | +8% / +15% | | MẶC ĐỊNH |
| Đồi | 2 (Orc 1) | +10% / +20% | Đứng trên đồi đánh +8%; cung thủ bắn xa thêm 1 ô | CHỐT hướng, MẶC ĐỊNH số |
| Núi thấp | 3 (Orc 2) | +15% / +30% | Đánh +12% (thế cao); kỵ binh không vào | CHỐT hướng, MẶC ĐỊNH số |
| Núi cao | Không đi qua được | | Không leo, không vượt, phải đi vòng | CHỐT |
| Đầm lầy | 3 | −10% / −10% | Đánh −10%; kỵ binh không vào; Orc không được hưởng gì | CHỐT hướng, MẶC ĐỊNH số |
| Sông | Không đi qua được | | Chỉ qua cầu | MẶC ĐỊNH |
| Cầu | 1 | 0 / 0 | | MẶC ĐỊNH |
| Làng | 1 | +15% / +8% | Hồi 2 quân/lượt cho squad đứng cuối lượt | CHỐT hướng, MẶC ĐỊNH số |
| Hầm mỏ | 1 | +20% / +10% | Chỉ là địa hình ở bản test | MẶC ĐỊNH |
| Tháp canh / cứ điểm | 1 | +25% / +13% | | MẶC ĐỊNH |
| Thành | 1 | +30% / +15% | Hồi 2 quân/lượt cho chủ thành; mục tiêu chiếm | MẶC ĐỊNH |

Thưởng thủ công trình đang **xếp bậc** (làng 15, hầm mỏ 20, tháp 25, thành 30 cho người; Orc bằng một nửa). Con số "19%" từng nêu thực ra là thưởng **hạ trại** trên tháp (15% × hệ số địa hình 1.25), không phải thưởng của ô. **[MẶC ĐỊNH]**. Nếu muốn các công trình bằng nhau thì đổi `str` trong `TERRAIN`.

## 7. Đơn vị

Một hình vẽ là một **squad**; quân số 1–10 (số hiển thị trên huy hiệu), quân càng ít đòn đánh càng yếu. **[CHỐT]**

| Vai trò | Người | Orc | Đặc điểm |
|---|---|---|---|
| Dân quân | Dân quân | Orc phỉ | Rẻ, trang bị kém, **giáo khắc kỵ binh**; gộp vào đội chính quy để bù quân **[CHỐT]** |
| Bộ binh | Bộ binh | Orc chiến binh | Chủ lực cận chiến, thủ tốt |
| Cung thủ | Cung thủ | Orc cung thủ | Tầm 2–3; **không đánh được khi bị áp sát** |
| Kỵ binh | Kỵ binh | Kỵ sói | Cơ động 7; xung phong +20% nếu đi ≥ 3 ô; không lên núi, không vào đầm lầy |

**Chỉ số (người / Orc)** **[MẶC ĐỊNH]**:

| | Sức đánh | Thủ nền | Di chuyển | Tầm |
|---|---|---|---|---|
| Dân quân | 4 / 4.2 | 0 / 3 | 3 / 4 | 1 |
| Bộ binh | 6 / 6.5 | 20 / 20 | 4 / 4 | 1 |
| Cung thủ | 5 / 5.2 | 5 / 6 | 4 / 4 | 2–3 |
| Kỵ binh | 7 / 7.4 | 10 / 11 | 7 / 7 | 1 |

Orc **mạnh hơn nhưng không kỷ luật** **[CHỐT]**, thể hiện bằng: sức đánh và thủ nền cao hơn chút; **không có bonus đội hình**; **ngưỡng bỏ chạy cao hơn** (tinh thần ≤ 45 thì vỡ, người ≤ 25). Người có **bonus đội hình** +6% thủ cho mỗi đồng đội kề, tối đa 3. **[MẶC ĐỊNH số]**

**Khắc chế** (nhân vào sát thương) **[MẶC ĐỊNH]**:

| Tấn công → Phòng thủ | Dân quân | Bộ binh | Cung thủ | Kỵ binh |
|---|---|---|---|---|
| Dân quân | 1.0 | 0.8 | 1.1 | **1.5** |
| Bộ binh | 1.2 | 1.0 | 1.2 | 0.9 |
| Cung thủ | 1.2 | 1.0 | 1.0 | 0.8 |
| Kỵ binh | 1.3 | 0.9 | **1.4** | 1.0 |

Đội hình xuất phát: 2 bộ binh, 2 cung thủ, 2 dân quân, 1 kỵ binh mỗi bên, đứng quanh thành (cách 2–5 ô, hướng về phía địch). **[CHỐT ý "quanh cứ điểm"]**

## 8. Chiến đấu

**Deterministic, không random.** Luôn xem trước kết quả (sát thương gây ra, sát thương nhận lại, có tiêu diệt không) trước khi xác nhận. **[CHỐT]**

Sát thương = `sức đánh × cấp bậc × thế cao × (quân số/10) × khắc chế × (1 + giáp công) × xung phong × (1 − thủ%)`, làm tròn, tối thiểu 1. **[MẶC ĐỊNH công thức]**

- **Phản công:** bên bị đánh còn sống và đối thủ nằm trong tầm của nó thì đánh trả, theo quân số còn lại. Cung thủ không phản công cận chiến vì tầm tối thiểu 2. **[CHỐT]**
- **Giáp công:** +15% cho mỗi đồng đội khác của kẻ tấn công đang kề mục tiêu, tối đa 2. Chỉ áp dụng cho cận chiến. **[CHỐT ý, MẶC ĐỊNH số]**
- **Thủ%** gồm thủ nền, cấp bậc, địa hình, đội hình, hạ trại. Giới hạn từ −30% đến +70%.
- **Tinh thần:** mỗi squad có tinh thần 0–100. Mất theo % quân bị mất (và khi đồng đội kề chết); tăng khi đánh và khi hạ địch. Dưới ngưỡng thì **bỏ chạy**: mất hành động, đầu lượt tự rút lui, mất trại, không chiếm thành được; hồi tỉnh khi tinh thần vượt ngưỡng + 15. **[CHỐT ý, MẶC ĐỊNH số]**

**Tinh thần và bỏ chạy: định hướng (chưa làm)**

- Trạng thái đổi tên: **bỏ chạy** (trước là "tan vỡ"), **hồi tỉnh** (trước là "tỉnh lại"). **[CHỐT]**
- Thanh sĩ khí đã có (0–100) nhưng hiện chỉ quyết định ngưỡng bỏ chạy. Định hướng: **sĩ khí cao thì tự tin, xông lên nhiều hơn; sĩ khí thấp thì dễ bỏ chạy.** **[CHỐT ý]**
- Một số squad bỏ chạy **ra khỏi bản đồ luôn** thay vì kẹt lại trên bản đồ (cảm hứng: quân tan chạy trong Đông Chu Liệt Quốc); không phải squad nào cũng vậy, trường hợp này phải hiếm. **[CHỐT ý]**
- **Sĩ khí với người chơi chỉ đổi chỉ số** (cộng/trừ sức đánh, di chuyển, ngưỡng bỏ chạy), **không ép hành động**; chỉ trạng thái bỏ chạy mới bị ép. Với **AI** thì sĩ khí đổi cả hành vi. **[CHỐT]**
- **Đích bỏ chạy theo thứ tự ưu tiên, xác định (không xác suất):** **[CHỐT ý, chi tiết cần chốt khi làm]**
  1. Thành nhà **đủ gần** thì chạy về thành (thành còn hồi quân 2/lượt).
  2. Không thì chạy về phía **hậu quân** nếu hướng đó có **quân tiếp viện** (squad cùng phe không bỏ chạy).
  3. Không có cả hai thì **chạy ra khỏi bản đồ**: đi về mép bản đồ phía sau lưng, ra khỏi khi chạm mép.
- Chạy ra khỏi bản đồ là một hành trình **nhiều lượt**, hiện đích chạy lên bản đồ để người chơi thấy trước và can thiệp (chặn đường, hồi tỉnh nó bằng cách cứu). Mỗi lượt xét lại đích; nếu hồi tỉnh giữa đường thì quay lại chiến đấu. Nhờ vậy "hiếm" mà **không cần xác suất**, không phá trụ cột "không may rủi".
- Squad bỏ chạy ra khỏi bản đồ **không tính là chết**: nó rời màn, không bị tính vào tiêu diệt. Đây là cách giảm thương vong cho permadeath. **[CHỐT ý]**
- Quay lại màn sau với **hình phạt**, nhưng hình phạt chỉ có nghĩa với squad **tinh nhuệ** (vì chỉ squad tinh nhuệ mang qua màn). Squad thường bỏ chạy hẳn chỉ đơn giản là mất khỏi màn đó. **[CHỐT; phạt = giáng 1 cấp, xem mục 16]**
- **[MỞ]** "Đủ gần" thành bao nhiêu (đề xuất: đường đi tới thành trong ≤ 2 lượt di chuyển của squad đó, tính theo chi phí đường đi chứ không phải khoảng cách thẳng), và "hậu quân có tiếp viện" cụ thể là gì (đề xuất: có ít nhất 1 squad cùng phe không bỏ chạy trong bán kính 3 ô quanh ô đích).

### Kinh nghiệm và cấp bậc **[CHỐT ý, MẶC ĐỊNH số]**

Giống cách Civilization làm: quân tồn tại lâu thì lão luyện, bền bỉ hơn, nhưng có **trần**.

- xp = sát thương gây ra, +4 khi hạ một squad, +1 khi bị đánh mà còn sống.
- Mốc lên cấp: **18 / 40 / 70** xp (nâng từ 12 / 30 / 55). Tối đa **cấp 3**. Đo 60 ván cỡ nhỏ: khoảng 3 squad (trên 14) đạt cấp 1 mỗi ván, cấp 2 hiếm, cấp 3 gần như không đạt trong một ván, chỉ đạt qua nhiều màn. **[CHỐT ý, MẶC ĐỊNH số]**
- Tên cấp: **cấp 1 Cựu binh, cấp 2 Lão luyện, cấp 3 Tinh nhuệ.** **[CHỐT]**
- Mỗi cấp: **+8% sát thương, +4% thủ.**
- Gộp squad: **pha loãng một phần** ("thay máu" quân đội là chuyện thường trong chiến trận): `xp_mới = xp_nhận + 0,5 × (xp_trung_bình − xp_nhận)`, cấp không tụt vì gộp; hệ số 0,5 là `mergeXpBlend` trong config. **[CHỐT ý, MẶC ĐỊNH số; đã làm]** Tách squad: **phần tách ra là squad thường, xp về 0**, squad gốc giữ xp. **[CHỐT, đã làm]**
- Hiển thị bằng **vạch ^ xếp chồng** (1 / 2 / 3 vạch, kiểu quân hàm) cạnh squad, không dùng ngôi sao vì sao chiếm chỗ. **[CHỐT]**

## 9. Hành động đặc biệt

**Gộp quân** **[CHỐT]**: dân quân gộp vào bộ binh hoặc cung thủ để bù quân (đội chính quy được bù, dân quân hao dần hoặc biến mất); hai squad cùng loại gộp thành một. Quân số tối đa 10; phần dư ở lại.

**Tách quân** **[CHỐT]**: chia một squad làm đôi, đặt đội mới ở ô kề. Cả hai hết hành động trong lượt đó.

**Hạ trại phòng thủ** **[CHỐT]** (lập phòng tuyến, công sự, canh phòng):

- Thay cho cả lượt hành động (không đi, không đánh), **có hiệu lực ngay lập tức**.
- Cộng thủ **cố định**: người **+15%**, Orc **+12%** (Orc thấp hơn vì đã mạnh sẵn). Không tăng theo thời gian.
- Nhân với hệ số địa hình: ô cộng thủ nhiều thì mạnh hơn (tối đa ×1.6), ô trừ thủ thì yếu đi (tối thiểu ×0.5). Cấp bậc không đổi mức này, chỉ cấp bậc làm thủ nền cao hơn.
- Giữ nguyên khi đứng yên. Mất khi di chuyển, tấn công, gộp/tách hoặc bỏ chạy.
- Hiển thị bằng hàng rào (sprite Kenney) trước chân.

### Biến đổi địa hình: định hướng (chưa làm)

Dân quân ngoài việc bổ sung quân còn có thể **đốt rừng, đặt bẫy, xây cầu**. **[CHỐT ý]** Hợp trụ cột "địa hình là vũ khí".

- **[MỞ]** Bẫy **ẩn hay hiện**? Game chưa có sương mù nên bẫy ẩn nghĩa là AI phải biết hoặc bị coi là gian lận.
- **[MỞ]** Tốn một hành động hay nhiều lượt, đốt rừng cháy lan theo gió (hướng mây trôi) hay chỉ một ô, cầu xây xong có phá được không.
- **[MỞ]** Orc có làm được không? Tao khuyên bất đối xứng: người **xây** (cầu, bẫy, chướng ngại), orc **đốt**, hợp với hướng bất đối xứng ở cấp luật.

## 10. Điều kiện thắng

- **Chiếm thành địch:** đứng trên thành địch (không bỏ chạy) và giữ **2 lượt** của mình. **[CHỐT]**
- **Tiêu diệt toàn bộ** quân địch. **[MẶC ĐỊNH]**
- Thành của mình bị chiếm thì thua. **[MẶC ĐỊNH]**
- **Mục tiêu về lâu dài là mix, tuỳ màn, tuỳ chiến dịch.** **[CHỐT]**

**Loại nhiệm vụ (chọn trong menu, áp dụng cho map mới; người chơi luôn là phe người):** **[CHỐT ba loại và luật; số liệu MẶC ĐỊNH]**

| Nhiệm vụ | Thắng | Thua | Đặc điểm |
|---|---|---|---|
| **Giao tranh** (cũ) | Chiếm thành địch giữ 2 lượt, hoặc quét sạch địch | Ngược lại | Hai bên như nhau |
| **Cố thủ** | Giữ tới hết N lượt (12 ở cỡ nhỏ), **hoặc chiếm thành địch giữ 2 lượt**, hoặc quét sạch địch | Địch chiếm thành ta giữ 2 lượt, hoặc quân ta bị quét sạch | Địch đông hơn 1 squad từ đầu; địch có 2 đợt tiếp viện (lượt 5, 9), **ta có 1 đợt (lượt 7)**; lượt hiện sẵn trên HUD |
| **Phá thành** | **Phá thành địch** (thành là mục tiêu 10 máu), hoặc quét sạch địch | Thành ta bị địch phá, hoặc quân ta bị quét sạch | **Không chiếm đóng, không hạn giờ.** Thành của **cả hai bên** đều là mục tiêu; không còn công trình riêng (lều) |
| **Hộ tống** | Đưa tướng tới điểm rút (ô có cờ vàng), hoặc quét sạch địch | Tướng chết, hoặc quân ta bị quét sạch | **Không có thành của cả hai phe**, quân xuất hiện sẵn giữa map; không chiếm đóng, không hạn giờ. Tướng = squad bộ binh cờ vàng, sẵn cấp cựu binh, không gộp vào squad khác |

- Số lượt ghi cho cỡ nhỏ; cỡ vừa / lớn nhân với (chiều dài / 20)^0,6. Số squad thêm là số tuyệt đối, không theo tỉ lệ.
- **Thành trong Phá thành** là một "đơn vị tĩnh" nằm đúng trên ô thành: 10 máu, thủ 25% cộng địa hình (người 30%, Orc 15%), không đánh trả, không gây ZOC, không bỏ chạy, không lên cấp, không ai đứng lên được (nên không hồi quân trong thành). Cung thủ và kỵ binh phá kém (×0,6). Nhờ vậy dùng lại trọn bộ đánh / xem trước / hoạt ảnh / chết có sẵn. Hình thành vẽ sẵn của map, đơn vị tĩnh chỉ hiện huy hiệu máu.
- Luật thắng thua nằm trong `rules.js` (`checkVictory`, `checkTimeLimit`, `canCapture`); `missions.js` chỉ đặt công trình / tướng / ô đích lên map.

## 11. AI

| Mức | Hành vi | Nhãn |
|---|---|---|
| **Dễ** | Đơn vị gần địch nhất đi trước; chọn đòn gây nhiều sát thương nhất; không tính địa hình, phản công, mối đe doạ; không hạ trại | CHỐT 2 mức |
| **Chiến thuật** | Chấm điểm mỗi lựa chọn theo sát thương gây ra, hạ địch, phản công, mối đe doạ ở ô đến, địa hình, đội hình, tiến về mục tiêu, giữ thành nhà; biết dùng dân quân bù quân; biết hạ trại khi bị đe doạ và đứng chỗ đáng giữ; không bỏ chỗ đã dựng trại nếu không có lý do | CHỐT mục tiêu, MẶC ĐỊNH chi tiết |

AI chiến thuật có áp lực tiến công tăng dần theo lượt để không bế tắc. **[MẶC ĐỊNH]**

**AI theo nhiệm vụ** **[MẶC ĐỊNH]**: bên giữ trong Cố thủ giảm lực tiến công và bám quanh thành nhà; đánh vào thành mục tiêu (Phá thành) được cộng điểm thêm; bên săn tướng ưu tiên đánh tướng (điểm cộng thêm, hạ được tướng thưởng gấp đôi); tướng do AI điều khiển chỉ nhìn về ô đích và tránh nguy hiểm gấp 2,2 lần quân thường, các squad còn lại vừa dọn đường vừa theo về đích.

**Cân bằng đo bằng AI chiến thuật đấu AI chiến thuật (30 ván):** cỡ nhỏ: Cố thủ ~90% bên giữ thắng, Phá thành ~43% người thắng (đối xứng nên ~50% là mong đợi; phần lớn ván AI vẫn kết thúc bằng quét sạch vì AI chưa ưu tiên phá thành), Hộ tống ~63% bên hộ tống thắng. Cỡ vừa: Cố thủ ~77%, Phá thành ~47%, Hộ tống ~37%. **Cố thủ đang nghiêng về bên giữ theo AI**, nhưng người chơi đánh khác AI nên chưa biết thực tế khó hay dễ; cần chơi thử rồi chỉnh số lượt / số quân. Cỡ lớn chưa đo lại sau đợt đổi luật.

## 12. Giao diện và điều khiển

- **Chọn quân → ô vàng di chuyển → chạm ô để đánh dấu đích → bấm nút "✓ Tới đây" nổi trên ô đó thì quân mới đi** (tránh trượt tay trên cảm ứng). Chạm ô khác thì đổi đích; sau khi đi vẫn có nút "↶ Đi lại" để về chỗ cũ nếu chưa hành động. Nút hủy trong thanh hành động là ✕. **[CHỐT]**
- **(cũ)** Chọn quân → ô vàng di chuyển → chạm ô để đi. Chạm địch có ô đỏ thì hiện **preview**; chạm lần nữa hoặc bấm Tấn công để xác nhận (di chuyển và đánh trong một thao tác nếu cần). **[CHỐT]**
- **Xem địa hình trên cảm ứng:** chạm ô trống, hoặc **giữ ngón tay ~0.5 giây lên bất kỳ ô nào**. Chuột thì rê. Nội dung nêu rõ: tốn bao nhiêu điểm đi theo từng loại quân, thủ cộng thêm theo từng phe, thế cao, tầm bắn, hồi quân. **[CHỐT]**
- **Chọn ô:** ô đang có hành động hợp lệ (đi, đánh, gộp, tách) được ưu tiên, nên quân đứng phía trước che ô phía sau không cản chọn. Muốn chọn chính quân đó thì chạm vào chân nó. Chạm vào hình công trình, núi, đồi thì xem đúng ô của nó (hình cao hơn ô). **[CHỐT]**
- **Tầm bắn cung thủ** hiện bằng chấm tròn đỏ giữa ô; **vùng nguy hiểm** của địch hiện khi chạm vào địch. **[CHỐT]**
- **Panel thông tin:** tên, quân số, tinh thần, xp/cấp, thủ, sức đánh, di chuyển, tầm, địa hình đang đứng, trạng thái, hạ trại. **[CHỐT ý]**
- **Cầm dọc:** vẫn chơi được, layout riêng. **[CHỐT]**
- Kết thúc lượt: nếu còn quân chưa hành động thì bấm hai lần để xác nhận. **[MẶC ĐỊNH]**
- Tốc độ hoạt ảnh: thường / nhanh / tức thì. **[MẶC ĐỊNH]**

## 13. Kỹ thuật

- **Không bước build khi dev:** ES modules + PixiJS 8 (đóng gói sẵn). `npm run build:single` gộp thành một file HTML (JS, CSS, ngôn ngữ, sprite nhúng sẵn) cho host không phục vụ tốt file phụ; cần dùng khi chạy trong khung Artifact trên iOS.
- **Tách luật khỏi hiển thị:** `src/rules.js` là logic thuần (không DOM, không Pixi), có test; `src/render/` chỉ vẽ.
- **Render-on-demand:** không vòng lặp liên tục; nền bản đồ được bake thành texture theo chunk 8×8 ô; chỉ vẽ lại khi có thay đổi. **[CHỐT lý do: không nóng máy khi chơi lâu]**
- **Asset có fallback:** thả file đúng tên vào `assets/units/` hoặc `assets/buildings/` để thay sprite code-vẽ bằng sprite thật, không cần sửa code. **[CHỐT]**
- **Đa ngôn ngữ:** mỗi ngôn ngữ một file JSON phẳng trong `lang/`; thiếu key thì lùi về tiếng Việt. **[CHỐT]**
- **Kiểm thử:** `npm test` (23 test: luật, map, địa hình, cấp bậc, hạ trại, ràng buộc map). `node tools/simulate.mjs` chạy AI vs AI headless để đo cân bằng.
- **Nơi lưu seed, cài đặt:** URL (`?seed=`, `?ai=`, `?speed=`, `?lang=`) và localStorage.

## 14. Kinh tế (mốc 2, chưa làm)

Mô tả mày đã đưa ra **[CHỐT ý, chưa chốt chi tiết]**:

- **Hầm mỏ ra quặng:** mỏ vàng ra tiền, mỏ sắt ra nguyên liệu làm vũ khí.
- **Lò rèn** làm vũ khí, cần nguyên liệu từ mỏ sắt và gỗ.
- **Tuyển mộ** tốn lương thực, tiền và vũ khí.
- **Người và Orc dùng chung** các nguồn tài nguyên.
- **Tuyển mộ tại địa phương để hồi máu** cho đơn vị, và có **chuyển quân**.
- Công trình có chức năng thật (không chỉ trang trí).

**Nên làm sau khi core ổn:** cân bằng kinh tế khi chưa biết một squad đáng giá bao nhiêu thì chỉ đoán mò.

**[MỞ]**

- Làng hồi quân thụ động (bản test) sẽ chuyển thành tuyển mộ thế nào?
- Chiếm công trình có đổi chủ không? Công trình nào cần chiếm?
- "Chuyển quân" cụ thể là gì (gộp/tách đã có; còn vận chuyển giữa nơi này và nơi khác)?
- AI quản lý kinh tế (build order) đến mức nào ở mức dễ / chiến thuật?

## 15. Cân bằng (kết quả đo)

Đo bằng AI vs AI (200–250 ván, nhiều seed), **chỉ là chỉ báo thô**: người chơi thật sẽ khác.

| Cặp | Người thắng | Orc thắng |
|---|---|---|
| Tactical vs Tactical | ~48% | ~52% |
| Người Tactical vs Orc Easy | ~58% | ~42% |
| Orc Tactical vs Người Easy | ~9% | ~91% |

Ván trung bình: ~16 lượt (tactical vs tactical), ~10 lượt (có AI dễ). Thời gian ván thật khi người chơi đang suy nghĩ chưa đo. **Cần playtest bằng tay.**

### Số đo gameplay (AI chiến thuật đấu AI chiến thuật, 120 ván cỡ nhỏ, 60 ván cỡ vừa)

- Kết thúc bằng **diệt hết địch khoảng 85–88%**, chiếm thành chỉ khoảng 12–17% số ván: mục tiêu chiếm thành gần như không quyết định.
- Trung vị 13 lượt (nhỏ), 17 lượt (vừa). Khoảng 24 đòn đánh mỗi ván nhỏ; 9 trên 14 squad bị diệt.
- Bên dẫn quân số sau lượt 5 thắng khoảng 62–65% (mẫu nhỏ, sai số khoảng ±15%); bên hạ squad đầu tiên thắng 57–63%.
- 64–69% đòn đánh trúng mục tiêu đang có thủ ≥15%; giáp công 15–16% số đòn, xung phong 6–12%. Cung thủ chiếm 42–48% số đòn.
- Chưa đủ mẫu để kết luận Orc mạnh hơn (55% ở cỡ nhỏ, 52% ở cỡ vừa).
- **Người chơi thật:** tác giả chơi khoảng 20 ván, thắng 12–14, và càng về sau càng đoán được AI nên thắng nhiều hơn. **AI dễ đoán là điểm yếu lớn nhất của chế độ chơi đơn.**

## 16. Chiến dịch và đội quân tinh nhuệ (định hướng dài hạn)

**Đã chốt:**

- Chiến dịch có **cốt truyện kiểu Warcraft / Fire Emblem**, nhiều màn, **mục tiêu đa dạng** (giữ N lượt, hộ tống, phá công trình, chống đợt tiếp viện...). **[CHỐT]**
- **Độ dài mỗi màn:** hiện tại hoặc dài hơn một chút, cỡ một ván cờ vua / cờ tướng hoặc nhỉnh hơn. **[CHỐT ý]**
- **Chơi đơn trước.** Chiến dịch **có cả bên Orc.** **[CHỐT]**
- **Squad tinh nhuệ** (không gọi là "hero" vì quá cá nhân): chỉ số cao hơn; đến một cấp nào đó thì mở **kỹ năng hoặc bonus đặc biệt**, theo hệ kỹ năng của từng loại quân. Kỹ năng ảnh hưởng chính squad đó **hoặc các squad xung quanh** (aura), hoặc phát huy khi **hạ trại** (thưởng sĩ khí, sĩ khí khó giảm), và nhiều cách khác. **[CHỐT]**
- **Mang squad qua các màn.** Squad tinh nhuệ sống sót càng lâu càng tiến hoá. **[CHỐT]**
- **Chết trận là mất luôn:** squad chết khi quân số về 0. **[CHỐT]**

**Chưa chốt:**

- **[MỞ]** Bao nhiêu cấp, cấp nào mở kỹ năng, danh sách kỹ năng cho từng vai trò. Hiện trần là cấp 3 ("tinh nhuệ").
- **Pha loãng kinh nghiệm khi gộp: pha loãng một phần.** **[CHỐT ý; công thức là đề xuất]** Hiện xp lấy trung bình theo quân số nên bơm dân quân vào squad tinh nhuệ làm nó mất cấp (ví dụ 5 quân xp 40 nhận 3 dân quân: còn xp 25, từ cấp 2 xuống cấp 1). Đề xuất: `xp_mới = xp_nhận + d × (xp_trung_bình − xp_nhận)` với `d = 0,5` (số trong config), và **cấp không bao giờ tụt vì gộp** (xp không xuống dưới mốc cấp hiện tại). Ví dụ trên ra xp 32,5, vẫn cấp 2.
- **Tách squad tinh nhuệ:** phần tách ra là squad thường, xp về 0 (chặn lỗ hổng nhân đôi cấp và kỹ năng). **[CHỐT, đã làm]**
- **Elite = mọi squad đã có ít nhất 1 vạch (cấp ≥ 1)**, trần là 3 vạch. Mang qua màn, hình phạt khi bỏ chạy và kỹ năng đều tính trên nhóm này. **[CHỐT]** Số elite không nhiều (mốc xp đã nâng, xem mục 8). **Người chơi tự chọn mang bao nhiêu squad elite sang màn mới**: đó là quyết định chiến lược (mang nhiều thì mạnh nhưng rủi ro mất, mang ít thì giữ lại nuôi tiếp...). **[CHỐT ý]** **[MỞ]** Giới hạn trên của lựa chọn (có trần số slot không, trần phụ thuộc màn hay không) và các squad elite không được chọn thì sao (nghỉ ở hậu phương, vẫn giữ cấp?).
- **Hình phạt khi squad elite bỏ chạy ra khỏi bản đồ: bị giáng 1 cấp** (xp về mốc của cấp thấp hơn; cấp 1 giáng xuống 0 thì mất vạch, hết là elite). Quay lại màn sau với cấp đã giáng. Một phạt duy nhất, dễ hiểu. **[CHỐT]** Cần xét: squad cấp 1 bỏ chạy hẳn thì mất luôn tư cách elite; có đúng ý không thì thử trong chơi.
- **[MỞ]** Nếu sau này cho người chơi **chủ động rút quân**, mức phạt phải nặng hơn rủi ro chết, nếu không thì rút quân thành chiêu thắng mọi trận.
- **[MỞ]** **Tỉ lệ thương vong hiện tại quá cao cho permadeath** (khoảng 4–5 squad bị diệt mỗi bên mỗi ván). Cần đổi luật cho nghiêng về làm bỏ chạy hơn là diệt, và mục tiêu màn không buộc phải đánh đến cùng.
- **[MỞ]** Chống vòng xoáy thua (mất tinh nhuệ, màn sau yếu đi, càng mất thêm): tặng quân, màn dễ xen kẽ, thưởng sau màn.
- **[MỞ]** **Lưu/tải chưa có.** Chiến dịch với permadeath cần lưu liên tục và đáng tin. Bản Artifact lưu bằng trình duyệt có thể mất (cửa sổ riêng tư, xoá dữ liệu trang, đổi máy), cần chỗ lưu tốt hơn hoặc xuất/nhập file lưu.
- **[MỞ]** Bất đối xứng ở cấp luật giữa người và Orc (xem mục 17).

## 17. Roadmap đề xuất

*Đây là đề xuất của dev, chưa được đồng ý. Thứ tự là ý kiến, đảo lại được.*

1. **Đa dạng mục tiêu** và cấu trúc màn chơi (đòn bẩy rẻ nhất; sửa điểm yếu "chiếm thành không quyết định"; cần trước chiến dịch). **Đã làm lát cắt đầu: cố thủ, phá công trình, hộ tống (mục 10).** Đã làm thêm **đợt tiếp viện** cho Cố thủ cho cả hai bên (cơ chế chung `mission.waves`, sinh quân quanh thành nhà ở đầu lượt phe đó, có hoạt ảnh hiện dần). Chưa làm: mục tiêu ghép (nhiều giai đoạn), tiếp viện cho các nhiệm vụ khác, và tiếp viện do sự kiện (không chỉ theo vòng).
2. **Lưu và tải** (cần trước permadeath và chiến dịch), kèm quyết định chỗ lưu đáng tin.
3. **Tinh thần có hệ trạng thái** (hăng hái, vững, dao động, bỏ chạy), bỏ chạy ra khỏi bản đồ có điều kiện xác định, hồi tỉnh.
4. **Giảm thương vong và hệ squad tinh nhuệ:** luật gộp không phá kinh nghiệm, cấp và kỹ năng theo vai trò, mang quân qua màn.
5. **AI bớt dễ đoán:** mỗi màn một tính cách, thỉnh thoảng đổi nước đi, phục kích. Đo bằng việc người chơi thắng bao nhiêu phần trăm.
6. **Biến đổi địa hình bằng dân quân** (đốt, bẫy, cầu).
7. **Bất đối xứng ở cấp luật** giữa người và Orc, chuẩn bị chơi bên Orc.
8. **Kinh tế / tuyển quân tại chỗ** (mục 14), **cốt truyện, chiến dịch**, nội dung màn.
9. Hình ảnh: **hoãn** art 3D isometric; có thể làm sau khi gameplay vững.

## 18. Nhật ký quyết định

| Chủ đề | Quyết định | Thay đổi so với trước |
|---|---|---|
| Kiểu lượt | Phase-based | Chọn trong 4 kiểu |
| Chiến đấu | Deterministic, preview, phản công, giáp công, tinh thần | |
| Orc "không kỷ luật" | Không đội hình, dễ bỏ chạy hơn. Orc **bám địa hình thiên nhiên**, người bám công trình | Mày đảo ý ban đầu của dev ("dễ bị kéo ra khỏi vị trí") |
| Kinh tế | Làm sau core | Mày đã mô tả ý đầy đủ |
| Kích thước map | 64×64 → 32×32 → **16×20** | Thu nhỏ để test nhanh |
| Mirror map | **Bỏ**; thay bằng kiểm tra công bằng sau khi sinh | Mày phản đối đối xứng |
| Núi | Thêm **núi cao** (không qua được), núi thấp đi được và có thế cao | Mày đề xuất |
| Đầm lầy | Thêm, bất lợi cho cả hai phe | Mày gật "nên làm từ đầu" |
| Hạ trại | Mức cố định, nhân hệ số địa hình, Orc thấp hơn; **có hiệu lực ngay** | Ban đầu dev đề xuất chuẩn bị một lượt; mày đổi sang tức thì |
| Kinh nghiệm | Có, 3 cấp có trần | Mày đề xuất |
| Tầm bắn | Chấm tròn đỏ giữa ô (không phải bán kính tròn, vì tầm tính theo số ô đi nên vùng thật là hình thoi) | Xanh lá → đỏ |
| Màu gộp quân | Xanh lá | Tím → xanh lá |
| Viền ô | Bỏ nét đứt, chỉ tô ô | Mày đề xuất |
| Font | Sans-serif | Handwriting → sans |
| Asset công trình / cây / núi | Dùng Kenney Cartography Pack thay sprite công trình cũ (nét dày hơn quân) | Mày đề xuất, sau khi xem gói gốc |
| Mây trôi | Dùng bộ mây doodle của tác giả (đục 75%, bay cao), bóng là oval xám mép mềm, đục 28%, nhỏ hơn mây, trên nền; trôi chậm theo hướng gió, mờ dần ở mép bản đồ rồi quay lại; có nút tắt trong menu (mặc định bật). Tốn khoảng 10 lần vẽ mỗi giây. Giấy phép bộ mây chưa rõ | CHỐT |
| Idle thở | Thử và bỏ vì nhìn lạ; còn nút trong menu, mặc định tắt | Mày quyết |
| Hosting | Một file HTML duy nhất (Artifact trên iOS không tải được file phụ) | Lỗi hạ tầng, không phải thiết kế |
| Art 3D isometric | **Hoãn.** Đã xem tham chiếu (đảo cỏ vẽ tay, pixel iso 32×32, tileset OpenGameArt, khối voxel) và cân nhắc Blender + Tripo, rồi quyết định tập trung gameplay; giữ doodle | Mày đổi ý; bản doodle cuối là commit `68b7ea0` và có một Artifact đóng băng |
| Đánh giá gameplay | Giống nhất Wesnoth, rồi Advance Wars / Wargroove; điểm yếu: mục tiêu chiếm thành vô nghĩa, AI dễ đoán, ít khác biệt | Dev đánh giá theo mô phỏng, mày xác nhận AI đoán được |
| Chiến dịch | Có cốt truyện, có chơi bên Orc, chơi đơn trước | Mày chốt |
| Squad tinh nhuệ | Gọi là "squad tinh nhuệ" (không dùng "hero"); mở kỹ năng theo cấp và theo loại quân; mang qua các màn; chết trận là mất | Mày chốt |
| Tên trạng thái | "Bỏ chạy" thay "tan vỡ"; "hồi tỉnh" thay "tỉnh lại" | Mày yêu cầu |
| Sĩ khí | Hướng: sĩ khí cao thì tự tin xông lên, thấp thì bỏ chạy; một số squad bỏ chạy hẳn ra khỏi bản đồ (hiếm) | Mày đề xuất; chi tiết còn mở |
| Sĩ khí với người chơi | Chỉ đổi chỉ số, không ép hành động (trừ bỏ chạy); AI thì đổi cả hành vi | Mày chốt |
| Đích bỏ chạy | Gần thành thì về thành; không thì về hậu quân nếu có tiếp viện; không có cả hai thì chạy ra khỏi bản đồ. Xác định, nhiều lượt, hiện đích để người chơi can thiệp | Mày đề xuất, dev xác nhận và thêm chi tiết |
| Bỏ chạy hẳn khỏi bản đồ | Không tính là chết; squad thường mất khỏi màn, squad tinh nhuệ quay lại màn sau có phạt | Mày đề xuất; mức phạt còn mở |
| Gộp squad và xp | Pha loãng một phần (đề xuất d = 0,5, cấp không tụt vì gộp) | Mày đồng ý hướng; công thức là đề xuất |
| Mốc xp và tên cấp | Nâng mốc lên 18 / 40 / 70; cấp 1 Cựu binh, cấp 2 Lão luyện, cấp 3 Tinh nhuệ | Mày chốt |
| Elite mang qua màn | Người chơi tự chọn số squad elite mang sang; phạt bỏ chạy ra khỏi map = giáng 1 cấp | Mày chốt |
| Tinh nhuệ | Mọi squad từ 1 vạch trở lên; trần 3 vạch; hiển thị bằng vạch ^ chồng thay sao ★ | Mày chốt |
| Tách squad | Phần tách ra là squad thường, xp về 0 | Mày chốt |
| Loại nhiệm vụ | Ba loại đầu: cố thủ, phá thành, hộ tống; tuỳ chọn trong menu | Mày xác nhận ba loại |
| Phá thành | Mục tiêu là thành của mỗi bên (bỏ công trình riêng), không chiếm đóng, không hạn giờ | Mày chốt |
| Hộ tống | Bỏ thành của cả hai phe, chỉ còn: tướng tới điểm rút / hạ tướng / quét sạch (dev giữ ô rút và bỏ hạn giờ, chờ mày xác nhận) | Mày chốt, dev diễn giải |
| Cố thủ | Cả hai bên đều chiếm được thành đối phương để thắng; hạn 12 lượt; người cũng có 1 đợt tiếp viện | Mày chốt |
| Thứ tự roadmap | Mục tiêu đa dạng, rồi lưu/tải, rồi hệ trạng thái sĩ khí | Mày đồng ý |
| Biến đổi địa hình | Dân quân đốt rừng, đặt bẫy, xây cầu | Mày đề xuất |
