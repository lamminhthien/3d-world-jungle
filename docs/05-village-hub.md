# 05 — Village hub

## Mục tiêu

Tạo một nơi an toàn để người chơi nhận quest, giao dịch, chăm pet và thấy thế giới có cộng đồng.

## Thành phần

- Cổng làng và bảng tên.
- Nhà ranger.
- Shop vật phẩm và dụng cụ.
- Nhà người dân với dialogue.
- Bảng nhiệm vụ công cộng.
- Khu campfire nghỉ ngơi.
- Khu chăm pet.

## Gameplay

- Bán tài nguyên dư thừa.
- Mua thức ăn, hạt giống, cần câu và vật liệu.
- Nhận quest theo ngày hoặc theo reputation.
- Trang trí một khoảng sân nhỏ.
- Dùng làng làm điểm hồi phục và điểm save.

## MVP kỹ thuật

- Làng được đặt gần spawn hoặc landmark ổn định theo seed.
- Các nhà dùng prefab low-poly nhẹ.
- NPC có id cố định.
- Shop dùng cùng inventory và item definitions.
- Bảng quest đọc từ quest registry.

## Quy tắc layout đã triển khai

- Vùng làng có clearing riêng, giảm cây procedural trong bán kính 18 đơn vị.
- Làng có cổng mở, hàng rào bao quanh, đường đất chính/phụ và khu campfire.
- Hai khu ruộng gồm các luống đất và cây trồng; cây rừng chỉ bắt đầu lại ở ngoài làng.
- Mười NPC có waypoint riêng và tự đi tuần quanh nhà, đường và ruộng.
- Quy mô village hiện có 10 căn nhà, phù hợp cho khu dân cư lớn hơn thay vì một cụm NPC nhỏ.
- Dân làng dùng cùng kiểu low-poly có đầu, thân, hai tay và hai chân như nhân vật người chơi; tay chân vung theo nhịp bước khi di chuyển.

## Fix nền làng và collision nhà (2026-09)

- Village dùng một `village pad` phẳng chung (`hubY`) cho nhà, đường, ruộng,
  hàng rào và NPC; không đặt từng object theo `groundHeight()` riêng lẻ.
- Khi người chơi nằm trong footprint của làng, cao độ chân lấy từ `hubY`,
  tránh bị chìm xuống các bậc terrain tự nhiên bên dưới pad.
- Mỗi nhà đăng ký một collider hình chữ nhật có đệm theo bán kính nhân vật,
  nên người chơi không thể đi xuyên tường/cửa nhà nhưng vẫn trượt được dọc
  theo tường khi di chuyển chéo.
- Khi regenerate seed hoặc dùng preset `VILLAGE_HUB`, điểm spawn cũng dùng
  cao độ pad thông qua API surface của village.

Chi tiết implementation nằm ở `src/gameplay/village.js` và `src/main.js`.

## Mở rộng

- Nâng cấp nhà.
- NPC mới xuất hiện theo tiến độ.
- Làng thay đổi theo việc người chơi giúp đỡ môi trường.
