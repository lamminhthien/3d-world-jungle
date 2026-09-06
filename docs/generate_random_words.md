# Procedural Random Worlds

Generating random worlds (procedural generation) with algorithms levels this project up a lot. Similar to the reference image you shared, the world is built from noise algorithms that auto-generate stepped terrain, a winding river, and biomes such as jungle, desert, snow...

Below is the detailed technical plan for adding this to your Three.js project.

---

**1. Random Terrain (Procedural Terrain)**

* **Perlin / Simplex Noise:**
* Use a JavaScript library such as `simplex-noise` for smooth-but-random map heights from $(x, z)$ coordinates.

* **Stepped / low-poly terrain:**
* Quantize the noise height: $y = \text{Math.floor}(\text{noise}(x, z) \times \text{maxHeight})$. This creates blocky terraces like Minecraft or the reference art.

* **River generation:**
* Use a second noise function with absolute value $\text{Math.abs}(\text{noise2}(x, z))$ to carve winding channels, then fill them with a water plane.

---

**2. Biomes**

* **Zones by height & temperature:**
* Combine noise with coordinates:
* **Low + near water:** Tropical jungle / green grass (broadleaf trees, mossy rocks).
* **High altitude:** Snowy mountains (snowy pines, gray rocks).
* **Hot / arid:** Desert (cacti, yellow sand).

* **Automatic asset scattering:**
* Per tile, pick assets from the biome (`InstancedMesh`):
* Jungle $\rightarrow$ randomly place broadleaf trees, bushes.
* Mountains $\rightarrow$ place boulders, pine trees.

---

**3. Performance (World Streaming & Chunking)**

* **Split the map into chunks:**
* Divide the world into small grids (e.g. $16 \times 16$ cells per chunk).

* **Dynamic load / unload:**
* Only render chunks within the character's view radius.
* As the character moves, auto-generate chunks ahead and drop far chunks behind to free RAM/GPU.

---

**4. Code Flow**

1. **Init seed:** The user types or randomly rolls a seed string (e.g. `"FOREST_123"`).
2. **Generate grid:** Build a coordinate matrix around the character.
3. **Height & biome:** Run Simplex noise per grid point.
4. **Merge geometry & instancing:** Merge each chunk's ground into 1 mesh and use `InstancedMesh` for trees/rocks.
5. **Spawn character:** Place the character on the highest point of the center $(0, y_{\text{max}}, 0)$.

Want a deeper dive into sample code using `simplex-noise` for heights and low-poly block stacking in Three.js?
