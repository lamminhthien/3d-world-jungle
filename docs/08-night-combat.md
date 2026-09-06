# 08 — Combat nhẹ và quái vật ban đêm

## Mục tiêu

Thêm chút nguy hiểm để ban đêm có ý nghĩa, nhưng vẫn giữ tinh thần khám phá êm dịu của game.

## Triết lý combat

- Combat là lựa chọn, không bắt buộc với mọi người chơi.
- Đánh nhanh, dễ hiểu, không cần combo phức tạp.
- Có thể chạy trốn, ẩn nấp hoặc dùng pet hỗ trợ.
- Không để quái phá hỏng trải nghiệm ban ngày.

## Kẻ địch ban đầu

- Shadow crawler: yếu, xuất hiện ở vùng tối.
- Swamp wisp: bay trong đầm lầy, gây slow nhẹ.
- Corrupted boar: bảo vệ resource hiếm.

## MVP

- Quái chỉ spawn sau khi nền quest và save ổn định.
- Spawn theo vùng nguy hiểm và thời gian trong ngày.
- State machine: idle → notice → chase → attack → retreat.
- Một đòn đánh đơn giản hoặc công cụ tự vệ.
- Health bar, hit feedback và cảnh báo âm thanh.
- Quái biến mất lúc bình minh hoặc quay về vùng spawn.

## Phần thưởng

- Lông, nanh, tinh chất bóng tối hoặc vật liệu chế tạo.
- Không rơi quá nhiều vật phẩm để tránh phá cân bằng inventory.

## An toàn trải nghiệm

- Có peaceful mode.
- Không spawn gần làng, spawn point hoặc pet mới thuần hóa.
- Cho người chơi thấy cảnh báo trước khi combat bắt đầu.
- Có cooldown và invulnerability ngắn để tránh bị đánh liên tục.
