# Prompt video trailer orc

Model `seedance_2_5`, mode `omni_reference`, `draft: true`, 480p, 5 giây. Khung đầu (`start_image`) là keyframe đã duyệt, sheet nhân vật làm `image_references`.
Clip nào đạt thì upscale bằng Topaz lên 1080p (khoảng 9 credit / 5 giây). Vì gen bằng `draft: true` nên trong 7 ngày còn có thể finalize bản gốc lên 720p/1080p (giá đầy đủ) nếu một cảnh cần nét thật.

Keyframe dùng: o01_B3b, o02, o03d, o04b, o05, o06, o07, o08c, o09b (thư mục `keyframes/`). Prompt đầy đủ lưu trong `shots.json`.

Ghi chú nhiễu: GPT Image vẽ vệt cọ thành ô khảm nhỏ. Lọc bilateral chỉ đỡ chút ít vì ô khảm đã thành hình khối; xử lý chính ở bước video bằng cách bỏ cụm "dry gouache brush texture" và ghi "clean smooth shading, no mosaic texture".
