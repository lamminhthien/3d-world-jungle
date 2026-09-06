Ý tưởng về đom đóm, ánh trăng, hiệu ứng mây trôi và đống lửa cắm trại sẽ làm cho bầu không khí ban đêm trở nên cực kỳ lung linh và thơ mộng.

Dưới đây là kế hoạch chi tiết để tích hợp các yếu tố này vào hệ thống ban đêm:

---

**1. Hệ thống Đom Đóm (Fireflies Particle System)**

* **Cơ chế:** Sử dụng `THREE.Points` kết hợp với custom Shader hoặc điểm hạt nhẹ để tạo hiệu ứng các đốm sáng lập lòe.
* **Hành vi (Behavior):**
* **Phân bố:** Chỉ spawn đom đóm vào ban đêm (`timeOfDay` từ 19:00 - 05:00) tại các biome Rừng và gần khu vực Sông/Hồ.
* **Chuyển động:** Sử dụng hàm Perlin Noise nhẹ hoặc Sine wave để tạo quỹ đạo bay uốn lượn, tự do và lơ lửng ngẫu nhiên quanh các bụi cây/mặt nước.
* **Hiệu ứng sáng:** Dùng hàm `Math.sin(clock.getElapsedTime())` trong Shader để làm hiệu ứng phát sáng mờ/tỏ (flicker) liên tục.



---

**2. Ánh Trăng & Bầu Trời Đêm (Moonlight & Night Sky)**

* **Mặt trăng (Moon Asset):**
* Dùng một khối Low-Poly cầu hoặc `THREE.DirectionalLight` thứ 2 đóng vai trò là ánh trăng (màu xanh icy/pale blue `#a1c4fd`).
* Mặt trăng di chuyển đối xứng 180 độ so với Mặt trời qua trục quỹ đạo.


* **Hiệu ứng Ánh trăng:**
* **Moonlight Shafts/God Rays:** Dùng hiệu ứng sương mù nhẹ (`THREE.FogExp2`) kết hợp với ánh sáng hướng từ trên xuống để tạo cảm giác các dải sáng trăng đâm xuyên qua kẽ lá Low-Poly.
* **Bóng đổ ban đêm:** Bật bóng đổ dịu (soft shadows) cho ánh trăng để nhân vật và cây cối đổ bóng mờ dưới nền đất.



---

**3. Mây Trôi Động (Procedural & Low-Poly Clouds)**

* **Tạo hình Mây:**
* Ghép nhiều khối cầu/hộp Low-Poly hợp lại (Merged Geometries) thành các đám mây xốp.


* **Chuyển động & Thời gian:**
* Ban ngày: Mây màu trắng/hồng nhạt, bay chậm.
* Ban đêm: Mây chuyển sang màu xám thẫm/xanh đen, che bớt Mặt trăng ngẫu nhiên (tạo hiệu ứng trăng khuyết/trăng mờ ảo).
* Cho các cụm mây di chuyển chậm theo trục $X$ hoặc $Z$ bằng việc cập nhật vị trí trong hàm render loop.



---

**4. Điểm Cắm Trại & Lửa Trại (Campsites & Campfire System)**

* **Spawn Ngẫu nhiên (Procedural Campsite Placement):**
* Thuật toán sẽ chọn ngẫu nhiên các ô đất bằng phẳng gần bờ sông hoặc bãi cỏ trống để đặt 1 trại cắm (gồm: Lều Low-Poly, vài khúc gỗ, đống lửa).


* **Hiệu ứng Lửa Trại (Campfire FX):**
* **Nguồn sáng:** Đặt 1 `THREE.PointLight` màu cam rực rỡ tại đống lửa.
* **Hiệu ứng bập bùng (Flickering Light):** Biến đổi cường độ (`intensity`) và bán kính (`distance`) của `PointLight` liên tục bằng hàm ngẫu nhiên: `light.intensity = base + Math.random() * 0.5`.
* **Hạt Tàn Lửa (Fire & Smoke Particles):** Sử dụng Particle System nhỏ bắn các hạt màu đỏ/cam bay ngược lên trên và mờ dần (mô phỏng khói và tàn lửa).



---

**5. Luồng Logic Xử Lý Trong Game**

1. **Kiểm tra Thời Gian:**
* Khi `timeOfDay` bước vào buổi tối $\rightarrow$ Bật `Fireflies`, chuyển `DirectionalLight` sang Mặt trăng, đổi màu Mây.


2. **Quản lý Ánh Sáng Cắm Trại:**
* Khi nhân vật đi lại gần Điểm Cắm Trại ban đêm $\rightarrow$ `PointLight` đống lửa chiếu sáng nhân vật và môi trường xung quanh, tăng thêm độ ấm áp tương phản với tone xanh lạnh của ánh trăng.



Bạn có muốn bổ sung thêm âm thanh ban đêm (tiếng lửa cháy tí tách, tiếng côn trùng) hay cần đoạn code mẫu về hiệu ứng đom đóm/lửa bập bùng không?