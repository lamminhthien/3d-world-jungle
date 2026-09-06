Tích hợp chu kỳ thời gian (Day-Night Cycle) và các trạng thái thời tiết động vào thế giới procedural sẽ mang lại trải nghiệm sống động và chân thực hơn. Dưới đây là kế hoạch chi tiết để xây dựng hệ thống này.

---

**1. Hệ thống Chu kỳ Thời gian (Day-Night & Twilight Cycle)**

Quản lý thời gian theo một vòng lặp liên tục (ví dụ: 1 ngày trong game = 10 phút ngoài đời) dựa trên biến `timeOfDay` từ `0` đến `24`.

* **4 Trạng thái Thời gian Chính:**
* **Ban ngày (Day: 08:00 - 16:00):** Ánh sáng mặt trời gắt (`DirectionalLight` màu vàng nhạt/trắng), bóng đổ rõ nét, màu bầu trời xanh tươi sáng.
* **Hoàng hôn (Sunset: 16:00 - 19:00) / Bình minh (Sunrise: 05:00 - 08:00):** Ánh sáng mặt trời góc thấp, chuyển sang tone màu cam/đỏ hồng. Ánh sáng môi trường (`AmbientLight`) dịu lại, bóng đổ kéo dài.
* **Ban đêm (Night: 19:00 - 05:00):** Mặt trời lặn hẳn và thay bằng Mặt trăng (ánh sáng xanh lam nhạt, cường độ thấp). Bầu trời chuyển sang xanh thẫm/đen, hiển thị sao/ngân hà (Stars Particles).


* **Kỹ thuật Thực thi:**
* **Xoay nguồn sáng:** Quỹ đạo của `DirectionalLight` xoay theo dạng hình tròn/elip quanh tâm bản đồ dựa trên `timeOfDay`.
* **Chuyển màu mượt mà (Lerp Color):** Sử dụng `THREE.Color.lerp()` để nội suy màu sắc của `AmbientLight`, `DirectionalLight`, và `scene.fog` giữa các khung giờ mà không bị giật khựng.



---

**2. Hệ thống Thời tiết Động (Dynamic Weather System)**

Một máy trạng thái ngẫu nhiên (Random State Machine) điều khiển các loại thời tiết dựa trên tỷ lệ phần trăm xác suất.

* **Các loại thời tiết:**
* **Nắng đẹp (Clear):** Tầm nhìn xa, màu sắc tươi tắn, mây trôi rải rác.
* **Nhiều mây / Âm u (Overcast):** Giảm cường độ ánh sáng mặt trời, chuyển màu sương mù sang xám nhạt, che phủ bầu trời bằng layer mây Low-Poly dày hơn.
* **Mưa (Rain):**
* Tối sầm bầu trời.
* Xuất hiện hệ thống hạt (Particle System) cho các giọt mưa rơi theo hướng thẳng đứng/xiên.
* Tăng độ phản chiếu (Roughness/Metalness) trên bề mặt đá và nước để tạo hiệu ứng ướt át.


* **Sương mù (Fog):** Tăng mật độ sương mù (`THREE.FogExp2`), thu hẹp tầm nhìn của camera, tạo cảm giác huyền bí cho khu rừng.



---

**3. Tích hợp Hiệu ứng Hình ảnh & Âm thanh (VFX & Audio)**

* **Skybox & Atmospheric Fog:**
* Sử dụng `THREE.FogExp2` có màu thay đổi linh hoạt theo thời gian và thời tiết để che đi điểm Spawn/Despawn của các Chunk ở rìa bản đồ.
* Tạo bầu trời dạng vòm (Skydome) với shader tùy chỉnh để tự động đổi màu gradient từ ngày sang đêm.


* **Âm thanh Môi trường (Audio Environment):**
* Ban ngày: Tiếng chim hót, tiếng gió nhẹ.
* Ban đêm: Tiếng dế kêu, tiếng cú đêm.
* Khi mưa: Âm thanh mưa rào và tiếng sấm rền ngẫu nhiên.



---

**4. Luồng Xử lý Code (Logic Flow)**

1. **Update Loop:** Trong hàm `requestAnimationFrame`, tăng giá trị `timeOfDay` theo delta time.
2. **Calculate Sun Position:** Tính toán tọa độ $(x, y, z)$ của mặt trời:

$$x = R \cdot \cos(\theta), \quad y = R \cdot \sin(\theta)$$


3. **Lerp Lighting & Fog:** Cập nhật màu sắc ánh sáng và sương mù tương ứng với góc $\theta$ của mặt trời.
4. **Trigger Weather Change:** Cứ sau mỗi chu kỳ (ví dụ 5 phút), hệ thống sẽ gieo xúc xắc ngẫu nhiên để chuyển đổi loại thời tiết và kích hoạt hiệu ứng Particle tương ứng.

Bạn có muốn đi sâu vào cách viết Shader cho Skydome chuyển màu ngày/đêm hay cách dựng Particle System cho mưa trong Three.js không?