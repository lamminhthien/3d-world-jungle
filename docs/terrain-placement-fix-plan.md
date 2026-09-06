# Plan: sửa nền đá và placement cây/nhà

## 1. Vấn đề quan sát được

Trong screenshot, vùng nền xám dạng plateau đang được generator coi như mặt đất hợp lệ:

- Cây/pine vẫn được spawn trên biome `MOUNTAIN`/`SNOW`, nên nhìn như cây mọc trực tiếp trên tảng đá.
- Village được đặt trên một vùng terrain có nhiều bậc cao độ, nhưng mỗi house/path/farm chỉ lấy `groundHeight()` tại một điểm neo. Vì vậy footprint của object có thể nằm một phần trên đá/bậc khác hoặc bị nền đá xuyên qua.
- Rock decoration và rock terrain chưa có ranh giới placement rõ ràng; logic placement chủ yếu kiểm tra biome tại đúng một sample point, chưa kiểm tra diện tích quanh object.

Mục tiêu là giữ địa hình low-poly và các vùng núi đẹp, nhưng không để asset sinh hoạt được đặt “lọt” vào nền đá hoặc bắc qua bề mặt không phù hợp.

## 2. Phạm vi source liên quan

- `src/world/procedural.js`
  - `sampleGround()`, `getBiome()`, `GEN.rockLine`/`snowLine`: định nghĩa height và biome.
  - Cần bổ sung khái niệm buildability/terrain class thay vì suy ra chỉ từ màu biome.
- `src/world/chunks.js`
  - `collectChunk()`: placement vegetation/rocks hiện chỉ dùng một sample `(x, z)`.
  - Nhánh `MOUNTAIN`/`SNOW` hiện cho pine spawn trên nền xám.
- `src/world/presets.js`
  - Các `place*()` đặt geometry theo một `y` được truyền vào; đây là đúng nếu caller đã xác nhận mặt nền.
- `src/gameplay/village.js`
  - `place()`: đặt mọi feature bằng `groundHeight(x, z)` tại origin của feature.
  - `houseLayout`, farm, path và fence có footprint lớn nhưng chưa có flatness/clearance validation.
- `src/utils.js`
  - API ground height dùng chung; phù hợp để thêm helper sample/footprint nếu tránh circular dependency.
- `docs/`
  - Bổ sung plan này; sau khi implement cần cập nhật progress/changelog nếu project đang dùng milestone village.

## 3. Hướng sửa đề xuất

### P0 — định nghĩa surface policy chung

Tạo API xác định loại bề mặt từ một sample ground, ví dụ:

- `terrainClass`: `water`, `beach`, `soil`, `rock`, `snow`.
- `isBuildableSurface(x, z, policy)` hoặc helper tương đương.
- `sampleFootprint(center, halfSize/radius, options)`: lấy mẫu ở tâm + các góc/cạnh, trả về min/max height, biome/class và độ dốc.

Không dùng màu ground để quyết định placement. `MOUNTAIN`/`SNOW` có thể tiếp tục tồn tại như biome hiển thị, nhưng phải khai báo rõ asset nào được phép trên đó.

Policy mặc định:

- Nhà, farm, path và NPC: chỉ `soil`/`beach` phù hợp, không `rock`, không snow, không river.
- Jungle vegetation: chỉ spawn trên `soil`; không spawn tree/bush/flower ở `rock` hoặc `snow`.
- Mountain decoration: chỉ cho rock/scree; pine chỉ được phép nếu có policy riêng và phải đặt ở nền núi hợp lệ, không trên plateau/cụm đá decoration.
- Mọi placement gần biên terrain phải kiểm tra footprint, không chỉ sample tại tâm.

### P0 — chặn cây mọc trên nền đá

Trong `collectChunk()`:

1. Đổi điều kiện placement từ chỉ `biome` sang terrain policy.
2. Tách rõ `rock` decoration khỏi `rock` terrain.
3. Với tree/palm/banana/bush/flower, reject nếu sample tại tâm hoặc các điểm quanh footprint là `MOUNTAIN`/`SNOW` không được phép.
4. Giữ branch mountain/snow cho rock decoration; chỉ bật pine sau khi có rule rõ ràng và test screenshot xác nhận không còn cảm giác cây mọc trên mặt đá trơn.
5. Cân nhắc thêm khoảng đệm theo bán kính asset để canopy/trunk không chạm qua mép plateau.

### P0 — kiểm soát nền village

Trong `village.js`, trước khi đặt hub:

1. Tìm một hub candidate nằm trên vùng buildable và đủ phẳng cho toàn bộ village footprint.
2. Dùng footprint bao phủ tối thiểu hàng rào, nhà, farm và đường; không chỉ kiểm tra origin.
3. Nếu candidate không đạt, thử các offset lân cận theo vòng/raster nhỏ và chọn candidate có:
   - không có sample river/rock/snow;
   - `maxY - minY` dưới ngưỡng bậc cho phép;
   - đủ clearance với river, bridge và spawn.
4. Nếu không tìm được candidate phù hợp, fallback về vị trí an toàn đã biết và ghi cảnh báo debug thay vì xây village trên terrain không hợp lệ.

### P1 — san nền/đặt object theo mặt phẳng village

Sau khi chọn được hub:

- Ưu tiên đặt toàn bộ village trên một “village pad” phẳng có kích thước đủ lớn, hoặc tạo một mesh pad/terrace có mép chuyển tiếp tự nhiên.
- Nếu chưa muốn thêm pad, vẫn phải đảm bảo độ dốc thấp và đặt feature theo cùng một `hubY`; không gọi `groundHeight()` riêng cho từng object trong cùng core village.
- Với farm/path, giữ y của pad và thêm offset rất nhỏ để tránh z-fighting.
- Với fence ngoài rìa, có thể sample từng post và điều chỉnh chiều cao post/rail, nhưng không để nhà và path xuyên qua nền.

## 4. Trình tự triển khai

1. Thêm terrain classification + footprint sampler trong `procedural.js` hoặc module helper phù hợp.
2. Viết unit-like deterministic checks cho các seed hiện có: sample river, jungle soil, mountain, snow và biên bậc.
3. Refactor `collectChunk()` dùng policy mới; trước mắt loại tree khỏi rock/snow, giữ rock decoration.
4. Refactor `village.place()` thành: tìm hub hợp lệ → lưu `hubY` → đặt features theo pad height.
5. Thêm debug toggle/log tùy chọn để hiển thị sample footprint và lý do reject placement trong lúc tuning.
6. Chụp/so sánh các seed đại diện, đặc biệt seed trong screenshot và seed mặc định `FOREST_123`.
7. Cập nhật docs/changelog sau khi behavior ổn định.

## 5. Tiêu chí nghiệm thu

- Không còn cây, bush hoặc flower có gốc nằm trên terrain class `rock`/`snow` nếu policy không cho phép.
- Không còn nhà/farm/path cắt qua mặt đá hoặc bậc terrain rõ rệt trong village.
- Village có nền tương đối phẳng, toàn bộ house footprint tiếp xúc cùng một pad/surface hợp lệ.
- Village vẫn có thể regenerate theo seed mà không mất tính deterministic.
- River, bridge, spawn và collision hiện tại không bị phá.
- Không tăng đáng kể số draw call; footprint sampling được giới hạn ở lúc generate/rebuild, không chạy mỗi frame.
- Kiểm tra desktop và low-tier/mobile vì chunk streaming và pool instancing không được tạo thêm hitch đáng kể.

## 6. Rủi ro và quyết định cần giữ nhất quán

- Nếu cấm toàn bộ pine trên mountain/snow, silhouette vùng núi sẽ thưa hơn; cần bù bằng rock/scree hoặc policy pine có kiểm soát.
- Village pad là cách ổn định nhất nhưng cần xử lý mép pad để không tạo một hình hộp nhân tạo.
- Không nên sửa riêng từng asset bằng offset y; lỗi gốc nằm ở surface validation và village footprint.
- `groundHeight()` và `sampleGround()` phải tiếp tục dùng chung một source of truth để tránh mesh terrain và placement lệch nhau.

