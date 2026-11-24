# Devlog #1: Bản chơi thử đầu tiên, và chuyện người chết không nằm yên

Chào mọi người, đây là bản chơi thử đầu tiên của **Chiến Địa Doodle**, game chiến thuật theo lượt chơi ngay trên trình duyệt. Bài này kể về những gì đã có, vài quyết định thiết kế mình thấy đáng chia sẻ, và những gì sắp làm.

## Ý tưởng gốc: không xúc xắc

Mình thích game chiến thuật nhưng ghét cảm giác thua vì một cú roll 95% trượt. Nên ngay từ đầu, Chiến Địa Doodle **không có ngẫu nhiên trong chiến đấu**. Trước mỗi đòn đánh, bạn thấy chính xác sát thương gây ra, sát thương nhận lại, và mục tiêu có bị tiêu diệt không. Cái khó không nằm ở may rủi mà ở chỗ đứng: thế cao, rừng, đánh bọc sườn, và giữ cho quân không vỡ trận.

## Ba phe, ba cách đánh

- **Người** mạnh nhờ công trình. Làng, tháp, thành cho phòng thủ đầy đủ, còn thiên nhiên chỉ giúp một nửa. Thủy binh có thể chặt cây, đóng thuyền và bắn tên từ dưới sông.
- **Orc** thì ngược lại: rừng và đồi là nhà, công trình chỉ giúp một nửa. Goblin nấp trong rừng, quân người không nhìn thấy, đi ngang qua là bị phục kích.
- **Âm binh** là xác chiến binh của cả hai phe, vẫn mặc đồng phục cũ. Chúng không có sĩ khí, không bao giờ bỏ chạy, nhưng chậm hơn và đánh yếu hơn lúc còn sống. Cả đạo quân phụ thuộc vào một necromancer: hạ được hắn là toàn bộ đổ sụp.

Ngoài ra còn có sĩ khí (quân hăng hái đánh mạnh hơn, quân dao động có thể vỡ trận và tháo chạy), hạ trại phòng thủ, gộp và tách squad, quân lên cấp, và 4 nhiệm vụ: Giao tranh, Cố thủ, Phá trại, Hộ tống.

## Tính năng mới nhất: mộ tử sĩ

Phe âm binh ban đầu khá "hiền", necromancer chỉ đứng sau bắn phép. Bản này cho hắn đúng việc của một necromancer: **dựng xác quân địch dậy**.

- Quân người ngã xuống để lại một nấm mộ ở chỗ nó chết.
- Nếu mộ nằm trong **7 ô** quanh necromancer, sau **2 lượt** nó sẽ trỗi dậy thành âm binh cùng loại quân, với nửa quân số.
- Âm binh đã chết thì tan hẳn, không dựng lại được lần hai.
- Để chặn, bạn có thể dành lượt của một squad đứng cạnh mộ để **an táng tử sĩ**: chôn cất, cầu siêu, linh hồn siêu thoát, necromancer không gọi dậy được nữa.

Lúc thiết kế, bán kính ban đầu được đề xuất là 15–20 ô. Nghe thì có vẻ "giới hạn", nhưng bản đồ nhỏ chỉ rộng 16×20, nên vùng 15 ô phủ gần hết chiến trường. Bán kính 7 phủ vừa khu giao tranh, và buộc necromancer phải tiến lên gần trận, nơi hắn cũng dễ bị săn hơn. Mỗi trận vì thế có thêm một câu hỏi: chạy lên đánh tiếp, hay lùi lại chôn đồng đội?

Mộ trong tầm necromancer có vòng xanh ma trơi và số lượt đếm ngược. Chọn necromancer sẽ thấy vùng triệu hồi tô tím.

## Cân bằng bằng cách cho AI đánh nhau

Mình đo cân bằng bằng cách cho AI đấu AI hàng chục ván mỗi cấu hình. Vài con số trên bản đồ nhỏ:

- Giao tranh với âm binh: âm binh thắng 48% trước khi có mộ, 57% sau khi có.
- Cố thủ trước âm binh từng là nhiệm vụ dễ nhất game: người giữ thành được hơn 90%. Lý do không phải âm binh yếu mà là âm binh **chậm**, không kịp tới thành trong hạn lượt. Cách sửa là cho quân tiếp viện của âm binh trồi lên ở mép bản đồ bên hông thành người, có cờ báo trước từ đầu trận để bạn kịp chuẩn bị. Âm binh giờ thắng khoảng 28%, gần mức của orc (30%).

AI không chơi giống người, nên những con số này chỉ là điểm khởi đầu. Đây chính là lý do có bản chơi thử.

## Hình ảnh

Nền bản đồ là pixel art có nước lấp lánh, hoặc chuyển sang kiểu giấy vẽ tay bằng nút trên thanh công cụ. Chân dung và character sheet các đơn vị theo phong cách painterly 2D, dùng làm tư liệu cho trailer sắp ra.

## Sắp tới

- Cân bằng lại cố thủ trước âm binh trên bản đồ lớn (hiện vẫn quá khó cho âm binh)
- Sprite riêng cho mộ tử sĩ
- AI biết dùng thuyền và chủ động đánh trại
- Chiến dịch nhiều màn, mang squad tinh nhuệ qua các màn
- Trailer cho từng phe

## Mình cần bạn

Chơi thử một hai ván rồi để lại bình luận: chỗ nào khó hiểu, nhiệm vụ nào quá dễ hay quá khó, lỗi gặp phải (kèm thiết bị và trình duyệt nếu được). Mọi góp ý đều được đọc.

Cảm ơn đã ghé chơi!
