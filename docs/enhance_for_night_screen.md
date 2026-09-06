# Night Ambience: Fireflies, Moonlight, Clouds & Campfires

Fireflies, moonlight, drifting clouds, and campfires make the night atmosphere glow and feel poetic.

Below is the detailed plan for bringing these elements into the night system:

---

**1. Fireflies (Particle System)**

* **Mechanism:** Use `THREE.Points` with a custom shader or lightweight sprites for flickering glow dots.
* **Behavior:**
* **Distribution:** Spawn fireflies only at night (`timeOfDay` 19:00 - 05:00) in forest biomes and near rivers/lakes.
* **Movement:** Light Perlin noise or sine waves for wandering, free-floating paths around bushes/water.
* **Glow:** Drive `Math.sin(clock.getElapsedTime())` in the shader for a continuous flicker.

---

**2. Moonlight & Night Sky**

* **Moon asset:**
* A low-poly sphere or second `THREE.DirectionalLight` acting as moonlight (icy/pale blue `#a1c4fd`).
* The moon travels 180 degrees opposite the sun along the orbit axis.

* **Moonlight effects:**
* **Moonlight shafts / god rays:** Soft `THREE.FogExp2` plus top-down directional light for moonbeams piercing the low-poly canopy.
* **Night shadows:** Soft shadows for moonlight so characters and trees cast faint ground shadows.

---

**3. Drifting Clouds (Procedural Low-Poly)**

* **Cloud shapes:**
* Merge several low-poly spheres/boxes (merged geometries) into puffy clouds.

* **Motion & time:**
* Day: white/pale-pink clouds, slow drift.
* Night: clouds shift to dark gray/navy, randomly covering the moon (crescent/hazy-moon effect).
* Drift cloud clusters slowly along $X$ or $Z$ inside the render loop.

---

**4. Campsites & Campfires**

* **Procedural placement:**
* The algorithm picks random flat tiles near riverbanks or open meadows for a camp (low-poly tent, logs, fire pit).

* **Campfire FX:**
* **Light source:** One bright orange `THREE.PointLight` at the fire.
* **Flicker:** Jitter `intensity` and `distance` continuously: `light.intensity = base + Math.random() * 0.5`.
* **Embers & smoke:** Small particle system shooting red/orange sparks upward that fade out (smoke + embers).

---

**5. In-Game Logic Flow**

1. **Check time:**
* When `timeOfDay` enters evening $\rightarrow$ enable `Fireflies`, switch `DirectionalLight` to the moon, recolor clouds.

2. **Camp light management:**
* When the character walks near a campsite at night $\rightarrow$ the fire `PointLight` lights the character and surroundings, adding warm contrast against the cold moonlight tone.

Want to add night audio (crackling fire, insects) or need sample code for firefly / flame flicker effects?
