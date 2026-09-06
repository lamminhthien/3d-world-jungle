# 04 — Pet system

## Mục tiêu

Cho người chơi thuần hóa và chăm sóc một người bạn đồng hành, tạo kết nối cảm xúc ngoài việc hoàn thành quest.

## Vòng lặp chính

1. Tìm thú hoang.
2. Giúp hoặc cho ăn để tạo niềm tin.
3. Thuần hóa bằng item hoặc quest.
4. Đặt tên và chọn pet active.
5. Cho ăn, chơi và chăm sóc.
6. Pet đi theo và hỗ trợ khám phá.

## Chỉ số

- Hunger: độ đói.
- Happiness: vui vẻ.
- Trust: mức tin tưởng.
- Energy: năng lượng.
- Health: sức khỏe.

## Loài ban đầu

- Hươu: thân thiện, tìm quả.
- Cáo rừng: nhanh, phát hiện resource node.
- Chim nhỏ: bay quanh người chơi, báo landmark.
- Rái cá: phù hợp sông và đầm lầy.

## MVP

- Một pet có thể thuần hóa.
- Pet đi theo với khoảng cách mềm, không kẹt địa hình.
- Cho ăn bằng item trong inventory.
- Pet có idle animation và phản ứng khi người chơi tương tác.
- Pet không chết vĩnh viễn; khi health thấp sẽ nghỉ hoặc quay về làng.

## Quy tắc an toàn

- Không phạt nặng nếu người chơi lâu không đăng nhập.
- Pet không làm chặn đường hoặc chặn collision.
- Pet state phải được lưu cùng save game.
