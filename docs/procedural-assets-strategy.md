# Procedural Assets & Runtime Performance Strategy

## Mục tiêu

Tài liệu này đề xuất hướng tối ưu cho Jungle Stroll, nơi terrain, vegetation,
weather và nhiều hiệu ứng được generate bằng code thay vì phụ thuộc vào model,
texture và audio asset có sẵn.

Mục tiêu:

- Giữ world procedural, seeded world và chunk streaming.
- Giảm CPU time lúc khởi động và thời gian tạo texture.
- Giảm bandwidth/memory trên mobile khi có thể.
- Không làm mất khả năng đổi biome, seed, density và quality tier.
- Có fallback procedural khi asset build bị thiếu.

Đây là design/implementation plan. Chưa có thay đổi runtime nào được thực hiện
dựa trên tài liệu này.

## Bối cảnh hiện tại

Project là Vite + Three.js, chạy static và có PWA/offline cache.

- `src/world/procedural.js` và `src/world/noise.js` tạo terrain, biome và river.
- `src/world/chunks.js` stream terrain/vegetation quanh player.
- `src/world/presets.js` tạo các bộ hình học tĩnh cho vegetation.
- `src/world/textures.js` vẽ texture bằng Canvas khi runtime.
- `src/core/bootCache.js` generate texture và gọi `renderer.initTexture()` trước
  khi người chơi vào game.
- `src/core/setup.js` chọn quality tier, pixel ratio, shadow và material theo
  thiết bị.

Texture hiện có các nhóm bark, leaf, rock, cactus, ground, sand và water. Mỗi
nhóm thường có color map và bump map, tức khoảng 14 texture 256×256. Dữ liệu
không quá lớn, nhưng các vòng lặp Canvas có thể tạo CPU spike trên mobile.

## Nguyên tắc kiến trúc

### Chỉ bake phần không phụ thuộc vào world seed

Vân gỗ, hạt đất, vân đá, gợn nước và bump detail không phụ thuộc vị trí/seed,
nên phù hợp để build thành file tĩnh.

Terrain height, biome, river path, vegetation placement và collision vẫn nên
được generate từ seed.

### Static asset không thay thế render optimization

Bake texture chủ yếu giảm CPU startup, thời gian vẽ Canvas, thời gian loading và
số lần generate texture giữa các session. Nó không tự giảm polygon, instance,
shadow pass, số pixel render, fragment shader cost hoặc bump mapping sau khi
texture đã ở trên GPU.

Vì vậy texture baking là startup/bandwidth optimization, không phải giải pháp
duy nhất cho FPS.

### Luôn giữ fallback procedural

Runtime nên có hai nguồn texture:

1. Static generated asset trong production.
2. Canvas procedural fallback trong development hoặc khi asset load lỗi.

Fallback giúp chỉnh texture nhanh, hỗ trợ offline/missing asset và tránh làm game
không khởi động chỉ vì pipeline build bị lỗi.

## Phân loại asset

### Nên bake ở giai đoạn đầu

```text
bark-color / bark-bump
leaf-color / leaf-bump
rock-color / rock-bump
cactus-color / cactus-bump
ground-color / ground-bump
sand-color / sand-bump
water-color / water-bump
```

Các texture vẫn phải tileable và gần-white/grayscale như thiết kế hiện tại, vì
vegetation dùng instance color tint và terrain dùng vertex colors.

### Có thể bake sau

- noise lookup texture cho shader;
- gradient sky hoặc atmospheric lookup texture;
- particle sprite cho rain, ember và firefly;
- baked starter chunks quanh spawn;
- cache dữ liệu height/placement của chunk đã đi qua.

### Không nên bake toàn bộ world

Không nên chuyển world vô hạn thành một model hoặc texture lớn. Cách đó làm mất
hoặc làm yếu:

- infinite world;
- seed chia sẻ qua URL;
- biome thay đổi theo vị trí;
- chunk streaming;
- quality-dependent density/scale;
- khả năng đổi config mà không export lại toàn bộ world.

## Định dạng đề xuất

### Giai đoạn đầu: WebP

WebP dễ tích hợp với Vite và `THREE.TextureLoader`. Có thể bắt đầu bằng:

- 256×256 cho desktop;
- 128×128 hoặc 256×256 cho mobile;
- quality 80–90 cho color map;
- quality cao hơn hoặc lossless cho bump map nếu artifact rõ.

WebP giảm download size. Khi upload lên GPU, texture vẫn có thể được giải nén
thành dạng texture thông thường.

### Giai đoạn tối ưu sâu: KTX2/Basis Universal

KTX2/Basis nên được cân nhắc khi cần giảm cả bandwidth, upload time và GPU memory.
Khi đó cần thêm `KTX2Loader`, transcoder, kiểm tra format hỗ trợ và fallback.

Không nên bắt đầu bằng KTX2 nếu chưa có baseline, vì pipeline phức tạp hơn WebP.

## Cấu trúc thư mục đề xuất

```text
scripts/
  generate-textures.mjs

public/
  generated/
    textures/
      manifest.json
      bark-color.webp
      bark-bump.webp
      ...
```

`manifest.json` nên chứa version, kích thước và đường dẫn:

```json
{
  "version": 1,
  "size": 256,
  "format": "webp",
  "textures": {
    "ground": {
      "map": "/generated/textures/ground-color.webp",
      "bump": "/generated/textures/ground-bump.webp"
    }
  }
}
```

Manifest giúp đổi version/layout mà không hard-code đường dẫn ở từng material.

## Build pipeline đề xuất

Thêm bước trước Vite build:

```json
{
  "scripts": {
    "build:textures": "node scripts/generate-textures.mjs",
    "build": "npm run build:textures && vite build"
  }
}
```

Script nên:

1. Tạo RNG cố định cho texture generation.
2. Dùng lại builder hiện có hoặc tách phần vẽ texture thành module build-time.
3. Xuất color map và bump map.
4. Tạo manifest có version và metadata.
5. Kiểm tra toàn bộ output tồn tại và có kích thước hợp lệ.
6. Chỉ kết thúc thành công khi mọi asset đã tạo xong.

Có hai hướng kỹ thuật:

### Hướng A — Tách renderer khỏi browser

Tách logic pattern thành module thuần JavaScript, rồi dùng thư viện Node để tạo
PNG/WebP. Đây là hướng sạch hơn về lâu dài nhưng cần thay đổi `textures.js` và
thêm dependency build-time.

### Hướng B — Generator chạy bằng browser headless

Giữ Canvas API hiện tại, mở trang generator bằng headless browser rồi đọc canvas
và ghi file. Hướng này ít viết lại logic hơn, phù hợp để prototype, nhưng làm
toolchain build phức tạp hơn.

Nên ưu tiên Hướng A nếu texture pipeline còn tiếp tục phát triển. Hướng B phù
hợp để thử nghiệm nhanh.

## Runtime loading design

Giữ API hiện tại để các caller không phải đổi nhiều:

```js
getGroundTexture()
getGroundBump()
getBarkTexture()
getBarkBump()
```

Bên trong chọn nguồn như sau:

```text
production + asset tồn tại -> load static texture
development hoặc asset lỗi -> generate Canvas texture
```

Nên preload static texture trước khi xây world và tiếp tục dùng
`renderer.initTexture()` trong `bootCache.js`. Như vậy vẫn có GPU warm-up nhưng
loại được phần generate Canvas khỏi critical path.

Texture phải được cache chung theo key, giống cơ chế `cached()` hiện tại; không
để mỗi material tự tạo một texture riêng.

## Deterministic texture generation

Các builder hiện tại dùng `Math.random()`. Khi đưa vào build-time, nên thay bằng
RNG cố định, ví dụ:

```js
const rng = rngFromString(`texture|${name}|${version}`);
```

Lợi ích:

- cùng source tạo ra cùng asset;
- screenshot và visual test ổn định;
- dễ debug;
- cache dễ invalidate bằng version;
- texture không đổi ngẫu nhiên giữa các lần mở game.

Texture seed không cần liên quan seed của world; texture nên ổn định giữa các
world khác nhau.

## Quality variants

Có thể tạo profile:

```text
desktop:   color 256/512, bump 256, bump enabled
mobile:    color 128/256, bump 128 hoặc disabled
low-tier:  color 128, bump disabled
```

Không nên tạo nhiều variant ngay từ đầu nếu chưa đo memory/startup. Bản đầu nên
dùng 256×256, sau đó thêm mobile variant dựa trên số liệu thật.

Ở low tier, hướng đơn giản là dùng color map, bỏ bump map và tiếp tục dùng
`MeshLambertMaterial` như logic hiện tại.

## Starter chunk và persistent chunk cache

### Starter chunk tĩnh

Có thể export 3×3 hoặc 5×5 chunk quanh spawn thành GLB/binary data để người chơi
thấy world nhanh hơn trong khi chunk xa tiếp tục stream. Cách này phù hợp với
hub/demo cố định, nhưng kém phù hợp khi người dùng thường đổi seed/world type.

### Persistent cache cho chunk

Hướng linh hoạt hơn:

1. Generate chunk lần đầu.
2. Serialize height/biome/placement cần thiết.
3. Lưu vào IndexedDB hoặc Cache Storage theo key:

   ```text
   appVersion + worldSeed + worldConfigVersion + chunkX + chunkZ
   ```

4. Lần sau đọc cache trước khi chạy noise và placement.
5. Invalidate khi version/config ảnh hưởng generation thay đổi.

Chỉ nên làm sau khi profiling chứng minh chunk generation là bottleneck đáng kể.

## Các tối ưu không thuộc texture baking

Nếu mục tiêu là FPS/render load, các hạng mục sau có thể tác động lớn hơn:

- giảm pixel ratio trên mobile;
- tắt hoặc giảm shadow map;
- giới hạn vegetation instance trong vùng nhìn thấy;
- giảm density foliage ở foreground;
- bỏ bump map ở low tier;
- giảm overdraw từ leaf/canopy;
- dùng LOD hoặc impostor cho vegetation xa;
- giảm rain/firefly/ember particle;
- tiếp tục time-slice chunk rebuild;
- tránh rebuild toàn bộ vegetation pool nếu chỉ thay đổi một phần visible set;
- đo `renderer.info`, GPU time và frame time trước/sau.

Static texture nên triển khai song song với các tối ưu này, không dùng nó để che
một vấn đề render khác.

## Service Worker và cache invalidation

Asset generated phải được cache cùng chiến lược PWA hiện tại:

- tên file hoặc manifest được version hóa;
- build mới không dùng nhầm texture cũ;
- Service Worker precache asset production;
- fallback procedural vẫn hoạt động khi asset chưa có trong cache;
- cache cũ được xử lý khi version package tăng.

Có thể dùng tên file hash nếu Vite quản lý asset, hoặc dùng version trong manifest
nếu asset nằm trực tiếp trong `public/`.

## Đo lường trước và sau

Nên ghi baseline cho:

- page load đến khi texture sẵn sàng;
- page load đến khi người chơi điều khiển được;
- tổng thời gian Canvas texture generation;
- thời gian `renderer.initTexture()`;
- kích thước bundle và texture download;
- GPU memory nếu thiết bị cho phép đo;
- FPS/frametime ở khu vực nhiều cây;
- thời gian rebuild khi qua ranh giới chunk;
- CPU và nhiệt trên iPhone/Android mục tiêu.

Success criteria cho phase đầu:

- giảm CPU time ở loading screen;
- không tăng đáng kể tổng download size;
- visual output gần tương đương texture procedural;
- cùng seed cho kết quả ổn định;
- low-tier mobile không load bump map không dùng;
- không tăng draw call hoặc shader complexity.

## Lộ trình triển khai

### Phase 0 — Baseline

- Đo startup, texture generation, GPU upload và FPS.
- Ghi nhận thiết bị mục tiêu.
- Chụp screenshot day/night/weather để so sánh.

### Phase 1 — Bake material texture

- Tách hoặc tái sử dụng texture builder.
- Thêm `scripts/generate-textures.mjs`.
- Xuất WebP 256×256.
- Tạo manifest.
- Giữ procedural fallback.

### Phase 2 — Runtime integration

- Cho `textures.js` load static texture trong production.
- Giữ cache API hiện tại.
- Cập nhật `bootCache.js` để preload static texture.
- Cập nhật Service Worker precache.

### Phase 3 — Mobile quality

- Đánh giá 128×128 hoặc bỏ bump map trên low tier.
- Đo lại visual quality và memory.
- Chỉ thêm variant nếu lợi ích đủ lớn.

### Phase 4 — Chunk cache hoặc starter area

- Chỉ triển khai nếu profiling chứng minh chunk generation còn là bottleneck.
- Ưu tiên persistent chunk cache nếu cần giữ seed/infinite world.
- Dùng baked starter chunks khi cần trải nghiệm mở game tức thì tại spawn.

### Phase 5 — KTX2 hoặc geometry optimization

- Chỉ chuyển sang KTX2 khi bandwidth/GPU memory là vấn đề thực tế.
- Chỉ bake geometry/GLB cho khu vực giới hạn, không bake toàn bộ infinite world.

## Quyết định đề xuất

Hướng phù hợp nhất là:

```text
Static baked material textures
+ seeded procedural terrain
+ seeded procedural chunk vegetation
+ mobile-specific material fallback
+ optional persistent chunk cache sau khi profiling
```

Không nên bỏ procedural generation. Nên bake những phần vốn đã là texture tĩnh,
đồng thời giữ generation cho terrain, biome, river, vegetation placement và
world seed — những phần tạo nên bản sắc của game.
