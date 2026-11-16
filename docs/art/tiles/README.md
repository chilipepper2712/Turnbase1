# Sprite nền pixel art

- `assets/terrain/<nhóm>_<n>.png`: sprite pixel gốc (nhóm: pine, tuft, bush, tiny, boulder, mound, reed, shrub, hill, house, tower, mine, castle, camp). Game phóng lên 4 lần bằng nearest.
- Sinh lại từ sheet: `python3 tools/prep_decor.py` (cây, cỏ, đá), `python3 tools/prep_buildings.py` (nhà, tháp, mỏ, thành, trại), `python3 tools/prep_hill.py` (đồi).

## Bóng vẽ tay cho công trình (tuỳ chọn)
Mặc định công trình có vệt bóng dưới chân do code tạo (elip phẳng, mép dither). Muốn thay bằng bóng tự vẽ:
đặt file PNG nền trong suốt tên `<nhóm>_<n>_shadow.png` cạnh sprite, ví dụ `assets/terrain/house_0_shadow.png`.
- Vẽ ở cùng độ phân giải pixel với sprite (1 pixel = 1 pixel).
- Game căn **giữa-đáy** của file bóng với giữa-đáy sprite, thò xuống dưới đáy sprite 2 pixel, và vẽ bóng *dưới* sprite.
- Bóng nên rộng hơn chân công trình vài pixel, màu tối bán trong suốt (code dùng khoảng rgb(20,45,25) alpha 0.3), mép dither nếu muốn hoà vào đất.
- Chỉ cần vẽ file nào muốn thay; công trình nào không có file bóng thì dùng bóng code.
- Nhóm áp dụng: house, tower, mine, castle, camp. Build bundle tự nhúng các file `*_shadow.png` có mặt.
