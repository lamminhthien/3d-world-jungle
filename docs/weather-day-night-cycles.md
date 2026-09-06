# Day-Night Cycle & Dynamic Weather

Integrating a time cycle (day-night) and dynamic weather states into the procedural world makes the experience far more vivid and believable. Below is the detailed plan for building this system.

---

**1. Time Cycle System (Day-Night & Twilight)**

Time runs on a continuous loop (e.g. 1 in-game day = 10 real minutes) driven by a `timeOfDay` variable from `0` to `24`.

* **4 Main Time States:**
* **Day (08:00 - 16:00):** Harsh sunlight (`DirectionalLight`, pale yellow/white), crisp shadows, bright blue sky.
* **Sunset (16:00 - 19:00) / Sunrise (05:00 - 08:00):** Low-angle sun shifting to orange/pink tones. Ambient light (`AmbientLight`) softens, shadows stretch long.
* **Night (19:00 - 05:00):** The sun sets fully and is replaced by the moon (pale blue light, low intensity). The sky turns deep blue/black with stars/milky-way (star particles).

* **Implementation techniques:**
* **Light orbit:** The `DirectionalLight` orbits in a circle/ellipse around the map center based on `timeOfDay`.
* **Smooth color blending (Lerp Color):** Use `THREE.Color.lerp()` to interpolate `AmbientLight`, `DirectionalLight`, and `scene.fog` colors between hours without pops.

---

**2. Dynamic Weather System**

A random state machine drives weather types based on probability weights.

* **Weather types:**
* **Clear:** Long view distance, vivid colors, scattered drifting clouds.
* **Overcast:** Reduced sunlight intensity, fog tint shifts to light gray, thicker low-poly cloud layer covers the sky.
* **Rain:**
* Darkened sky.
* Particle system for raindrops falling vertically/slanted.
* Higher reflectivity (lower roughness / higher metalness) on rock and water surfaces for a wet look.

* **Fog:** Denser fog (`THREE.FogExp2`), narrower camera view, mysterious jungle mood.

---

**3. Visual & Audio Effects (VFX & Audio)**

* **Skybox & Atmospheric Fog:**
* Use time/weather-reactive `THREE.FogExp2` color to hide chunk spawn/despawn at the map edge.
* A skydome with a custom shader that auto-blends its gradient from day to night.

* **Ambient Audio:**
* Day: birdsong, soft wind.
* Night: crickets, night owls.
* Rain: downpour sound with random distant thunder.

---

**4. Code Flow**

1. **Update Loop:** In `requestAnimationFrame`, advance `timeOfDay` by delta time.
2. **Calculate Sun Position:** Compute the sun's $(x, y, z)$ coordinates:

$$x = R \cdot \cos(\theta), \quad y = R \cdot \sin(\theta)$$

3. **Lerp Lighting & Fog:** Update light and fog colors from the sun angle $\theta$.
4. **Trigger Weather Change:** Every cycle (e.g. 5 minutes), roll the dice to switch weather and fire the matching particle effect.

Want to go deeper into the day/night skydome shader or the Three.js rain particle system?
