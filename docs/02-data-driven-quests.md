# 02 — Data-driven quest system

## Mục tiêu

Thêm nhiệm vụ mới bằng dữ liệu thay vì viết lại logic tương tác.

## Loại nhiệm vụ

- `collect`: nhặt đủ số lượng item.
- `deliver`: mang item tới NPC.
- `rescue`: tìm và đưa thú/người về nơi an toàn.
- `explore`: tới một vùng, biome hoặc landmark.
- `care`: cho pet ăn hoặc chăm sóc đủ số lần.
- `survive`: ở trong một khu vực qua một khoảng thời gian.
- `escort`: hộ tống NPC hoặc thú.

## Schema dự kiến

```js
{
  id: 'rangerHerbs',
  title: 'Thảo dược cho người đi rừng',
  giver: 'ranger_01',
  objectives: [
    { type: 'collect', item: 'herb', amount: 3 }
  ],
  rewards: { coins: 10, items: [] },
  prerequisites: [],
  repeatable: false
}
```

## MVP

- Quest definition tách khỏi scene.
- Quest log có `locked`, `available`, `active`, `completed`.
- Nhiều objective trong một quest.
- Điều kiện mở khóa quest.
- Thưởng item và tiền.
- Quest tracker hiển thị objective gần nhất.

## Nguyên tắc

- Quest không được phụ thuộc tọa độ cố định duy nhất.
- Có thể reset an toàn khi đổi seed.
- Quest phải chịu được việc người chơi nhặt item trước khi nhận nhiệm vụ.
- Không tự động nhận quest nếu người chơi chưa tương tác.
