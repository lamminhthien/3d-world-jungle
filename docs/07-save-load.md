# 07 — Save/load progression

## Mục tiêu

Giữ inventory, quest, pet và tiến độ làng giữa các phiên chơi.

## Dữ liệu cần lưu

- Save version.
- World seed và world preset.
- Người chơi: vị trí an toàn, tiền, inventory.
- Quest log và reward đã nhận.
- Pet list, pet active và pet stats.
- Reputation và nâng cấp làng.
- Cài đặt: âm thanh, chất lượng, thời tiết nếu cần.

## MVP

- Dùng `localStorage` hoặc IndexedDB.
- Auto-save khi hoàn thành quest, vào làng và đổi world.
- Manual save trong menu.
- 2–3 save slots hoặc một slot chính trước.
- Có schema version và migration function.
- Nếu save lỗi, game khởi động bằng save mới thay vì crash.

## Nguyên tắc

- Không lưu toàn bộ world procedural; chỉ lưu seed và thay đổi quan trọng.
- Vị trí respawn phải an toàn, không lưu giữa sông hoặc trong vật cản.
- Không tin dữ liệu save khi parse; validate trước khi dùng.
- Có nút reset save với xác nhận rõ ràng.
