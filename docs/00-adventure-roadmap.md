# Adventure roadmap

Tài liệu tổng hợp hướng phát triển Jungle Stroll thành game phiêu lưu khám phá, làm nhiệm vụ và chăm sóc thế giới.

## Thứ tự triển khai

1. `01-inventory-and-resources.md` — nền tảng vật phẩm và tài nguyên.
2. `02-data-driven-quests.md` — nhiệm vụ dùng dữ liệu, tái sử dụng được.
3. `03-villager-dialogue.md` — NPC, ranger và hội thoại.
4. `04-pet-system.md` — thuần hóa, chăm sóc và pet đi theo.
5. `05-village-hub.md` — làng, nhà, shop và bảng nhiệm vụ.
6. `06-swamp-biome.md` — biome đầm lầy và cơ chế địa hình mới.
7. `07-save-load.md` — lưu tiến độ người chơi.
8. `08-night-combat.md` — combat nhẹ và quái vật ban đêm.

## Nguyên tắc thiết kế

- Khám phá là hoạt động chính; combat chỉ bổ trợ, không biến game thành game hành động thuần túy.
- Mọi hệ thống nên hoạt động tốt với world procedural và seed hiện tại.
- Gameplay phải chia nhỏ thành các vertical slice có thể chơi được.
- Ưu tiên mobile: nút tương tác lớn, ít thao tác, không phụ thuộc bàn phím.
- Dữ liệu gameplay tách khỏi logic Three.js để dễ thêm NPC, item, quest và biome.
- Mỗi milestone phải được ghi lại trong `docs/adventure-progress.md`.

## Trạng thái hiện tại

- Đã có ranger, quest tracker, reward counter và bốn nhóm resource node: thảo dược, quả, gỗ và cá.
- Đã có inventory API dùng lại được.
- Đã có quest definition/log data-driven ban đầu.
- Đã có tương tác bằng phím `E` và nút lớn trên mobile.
- Chưa có persistence; toàn bộ tiến độ hiện reset khi reload hoặc đổi world.

## Milestone đã hoàn thành

- `01-inventory-and-resources.md`: inventory, resource nodes và vòng lặp thu thập cơ bản đã có.
- `02-data-driven-quests.md`: quest log và quest definition dùng dữ liệu đã có.

## Milestone kế tiếp

- `03-villager-dialogue.md`: mở rộng ranger thành hệ thống hội thoại, sau đó thêm NPC và quest board của village hub.
