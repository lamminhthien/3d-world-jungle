# 06 — Swamp biome

## Mục tiêu

Thêm một biome có bản sắc rõ ràng, tạo cảm giác nguy hiểm và khác biệt với jungle hiện tại.

## Đặc trưng hình ảnh

- Nước nông nhiều mảng, không phải một con sông duy nhất.
- Bùn nâu xanh và nền đất lún.
- Cây chết, rễ nổi, cọc gỗ và dây leo.
- Sương thấp, đom đóm và ánh sáng xanh lục.
- Mưa dày hơn và tầm nhìn ngắn hơn.

## Cơ chế

- Nước nông làm chậm di chuyển nhưng không chặn hoàn toàn.
- Bùn làm giảm tốc độ và tạo vệt bước chân.
- Một số cây thuốc và nấm chỉ mọc trong đầm lầy.
- Sương độc là vùng nguy hiểm nhẹ, có thể chống bằng thuốc hoặc pet phù hợp.
- Cầu gỗ và lối đi nổi làm landmark.

## MVP

- Thêm `SWAMP` vào biome classification.
- Màu đất, vegetation kit và fog riêng.
- Một vùng swamp được tạo ổn định theo seed.
- Một resource node mới: nấm thuốc.
- Không thêm damage cho tới khi UI cảnh báo rõ ràng.

## Hiệu năng

- Vẫn dùng instanced meshes.
- Không tạo quá nhiều particle sương.
- Nước nông dùng một số patch nhỏ thay vì nhiều plane lớn.
- Biome phải hoạt động tốt trên quality thấp.
