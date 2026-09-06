# 01 — Inventory và resource nodes

## Mục tiêu

Biến việc khám phá thành vòng lặp gameplay: tìm tài nguyên → thu thập → dùng để hoàn thành quest, chăm pet, bán hoặc chế tạo.

## Nhóm item

| Nhóm | Ví dụ | Nguồn |
|---|---|---|
| Gỗ | cành cây, gỗ mềm, gỗ cứng | cây, đống gỗ, người đi rừng |
| Quả | chuối, xoài, quả mọng | cây ăn quả, bụi cây |
| Thảo dược | lá thuốc, nấm, hoa chữa lành | rừng, đầm lầy |
| Cá | cá nhỏ, cá sông, cá hiếm | sông, đầm lầy |
| Vật liệu | đá, sợi, lông, vảy | đá, thú, resource node |
| Tiền | coin hoặc token làng | quest, shop, nhiệm vụ cứu trợ |

## MVP

- Item có `id`, tên, icon, loại, stack limit và mô tả.
- Inventory có add/remove/count/has.
- Resource node có trạng thái đã thu hoạch và thời gian hồi lại.
- Nhặt bằng `E`, mobile có nút tương tác.
- HUD hiển thị một số item quan trọng; full inventory mở bằng menu.

## Quy tắc

- Không cho nhặt xuyên qua sông, vật cản hoặc khoảng cách tương tác.
- Resource node phải có feedback: âm thanh, animation, prompt và biến mất/hạ thấp.
- Node sinh theo seed để cùng seed cho vị trí ổn định.
- Không spawn tài nguyên trong vùng spawn, cầu hoặc campfire.

## Mở rộng

- Công cụ ảnh hưởng tài nguyên: rìu, cần câu, giỏ hái.
- Chất lượng item theo biome và thời tiết.
- Chế tạo thuốc, thức ăn và đồ trang trí.
