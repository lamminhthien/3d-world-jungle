# Plan: Ánh trăng ban đêm và nến quanh làng

## Mục tiêu

- Làm ánh trăng ban đêm dễ nhận biết hơn: mặt trăng có quầng sáng dịu, ánh sáng xanh lạnh phủ lên cảnh và chuyển mượt theo chu kỳ ngày/đêm.
- Thêm các cụm nến quanh khu dân làng để tạo những điểm sáng vàng ấm, tương phản với ánh trăng.
- Giữ chi phí render hợp lý trên thiết bị thấp/mobile bằng cách dùng ít `PointLight`, giới hạn phạm vi chiếu sáng và tái sử dụng vật liệu.

## Phạm vi chỉnh sửa

1. `src/world/environment.js`
   - Tinh chỉnh moonlight và halo để ánh trăng rõ hơn vào ban đêm nhưng không làm cảnh bị trắng.
   - Cho quầng trăng và mặt trăng fade mượt theo `nightFactor`/thời tiết.
   - Bảo đảm ánh sáng trăng giảm khi mưa hoặc nhiều mây.

2. `src/gameplay/village.js`
   - Tạo prop nến low-poly gồm chân đế, thân nến, ngọn lửa và quầng sáng nhỏ.
   - Đặt một số cụm nến dọc đường làng, gần bảng thông báo/camp trung tâm và các lối vào nhà.
   - Đồng bộ độ sáng ngọn lửa và `PointLight` theo nhịp nhẹ để tạo cảm giác đang cháy.
   - Chỉ bật phần phát sáng khi trời tối; ban ngày nến vẫn còn hình học nhưng không gây sáng.

3. `src/main.js` (chỉ nếu cần)
   - Nối trạng thái môi trường với hệ thống nến nếu API hiện tại của village chưa đủ.

## Cách triển khai

- Dùng `environment.get nightFactor` làm tín hiệu chung cho độ sáng ban đêm.
- Truyền thời gian/`nightFactor` vào `village.update` qua một API nhỏ, tránh tạo thêm hệ thống thời gian riêng.
- Giới hạn số đèn nến thật; nhiều nến có thể dùng mesh emissive/basic và chỉ vài đèn đại diện cho cụm.
- Không bật shadow map cho đèn nến.

## Kiểm thử / tiêu chí hoàn thành

- Build production chạy thành công bằng `npm run build`.
- Khi chuyển sang khoảng 18:00–06:00, mặt trăng và ánh sáng xanh xuất hiện mượt; ban ngày hiệu ứng biến mất.
- Khu làng có nhiều điểm sáng vàng quanh đường/camp/nhà, không bị nhấp nháy quá mạnh.
- Nến không làm thay đổi va chạm, đường đi hoặc vị trí spawn của dân làng.
- Mưa/mây làm giảm hợp lý ánh trăng và độ rõ của mặt trăng.

## Trạng thái

Đã triển khai và xác nhận bằng `npm run build`.
