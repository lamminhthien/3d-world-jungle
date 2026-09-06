import * as THREE from 'three';

// ============ Renderer / Scene / Camera (Giai đoạn 2) ============
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8dcf0);
scene.fog = new THREE.Fog(0xa8dcf0, 45, 95);

// Isometric: OrthographicCamera
let frustumSize = 22;
let azimuth = Math.PI / 4; // 45deg -> offset (1,0,1)
const polarElevation = THREE.MathUtils.degToRad(35.264); // góc isometric chuẩn
let aspect = innerWidth / innerHeight;
const camera = new THREE.OrthographicCamera(
  (-frustumSize * aspect) / 2, (frustumSize * aspect) / 2,
  frustumSize / 2, -frustumSize / 2, 0.1, 200
);
const camTarget = new THREE.Vector3(0, 0, 0);
function updateCameraPos() {
  const dist = 60;
  const x = Math.cos(azimuth) * Math.cos(polarElevation) * dist;
  const z = Math.sin(azimuth) * Math.cos(polarElevation) * dist;
  const y = Math.sin(polarElevation) * dist;
  camera.position.set(camTarget.x + x, camTarget.y + y, camTarget.z + z);
  camera.lookAt(camTarget);
}
updateCameraPos();

// ============ Lighting (sáng sủa như image_0.png) ============
scene.add(new THREE.HemisphereLight(0xcdeffd, 0x7ec850, 0.95));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
sun.position.set(14, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// ============ Helpers ============
const rand = (a, b) => a + Math.random() * (b - a);
const flatMat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...opts });
const dummy = new THREE.Object3D();
const obstacles = []; // {x,z,r}
const RIVER_HALF = 3.1;

function groundHeight(x, z) {
  // bờ sông thấp dần về phía sông, tạo bậc đá tự nhiên
  const ax = Math.abs(x);
  if (ax < RIVER_HALF) return -0.55;
  if (ax < 4.6) return -0.25;
  if (ax < 6.2) return 0.05;
  return 0;
}

// ============ Ground (đất cỏ low poly) ============
{
  const geo = new THREE.PlaneGeometry(90, 90, 64, 64);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const cGrass = new THREE.Color(0x7ecb5f);
  const cGrass2 = new THREE.Color(0x67b34c);
  const cSand = new THREE.Color(0xd9c27a);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = groundHeight(x, z);
    // gợn low-poly ngoài sông
    if (Math.abs(x) > 6.2) y += (Math.sin(x * 1.3) + Math.cos(z * 1.1)) * 0.06 + rand(-0.06, 0.06);
    pos.setY(i, y);
    const ax = Math.abs(x);
    const c = ax < 4.6 ? cSand.clone() : cGrass.clone().lerp(cGrass2, Math.random() * 0.7);
    // loang màu nhẹ
    c.offsetHSL(0, 0, rand(-0.02, 0.02));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ============ River (sông trung tâm) ============
const waterMat = new THREE.MeshStandardMaterial({ color: 0x38b6d3, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92 });
{
  const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_HALF * 2 - 0.3, 90), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.32;
  water.receiveShadow = true;
  scene.add(water);

  // vệt sóng trắng di chuyển -> cảm giác nước chảy
  const foamGeo = new THREE.PlaneGeometry(0.28, 0.7);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
  window.__foams = [];
  for (let i = 0; i < 26; i++) {
    const f = new THREE.Mesh(foamGeo, foamMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(rand(-2.2, 2.2), -0.28, rand(-44, 44));
    f.scale.setScalar(rand(0.5, 1.2));
    scene.add(f);
    window.__foams.push({ mesh: f, speed: rand(1.5, 3.2) });
  }
}

// ============ Rocks (dải đá 2 bên bờ, nhiều tầng như ảnh) ============
{
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = flatMat(0x9aa0a3);
  const COUNT = 150;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, COUNT);
  rocks.castShadow = rocks.receiveShadow = true;
  let idx = 0;
  for (let i = 0; i < COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = rand(-42, 42);
    // 2 tầng: sát mép sông + tầng ngoài
    const tier = Math.random() < 0.55 ? 0 : 1;
    const x = side * (tier === 0 ? rand(3.2, 4.6) : rand(4.6, 6.4));
    const s = tier === 0 ? rand(0.5, 1.3) : rand(0.7, 1.7);
    dummy.position.set(x, groundHeight(x, z) + s * 0.25, z);
    dummy.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    dummy.scale.set(s * rand(0.8, 1.3), s * rand(0.6, 1), s * rand(0.8, 1.3));
    dummy.updateMatrix();
    rocks.setMatrixAt(idx++, dummy.matrix);
    if (s > 0.9) obstacles.push({ x, z, r: s * 0.8 });
  }
  rocks.count = idx;
  scene.add(rocks);
}

// ============ Trees (InstancedMesh — Giai đoạn 5 tối ưu) ============
const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1.4, 6);
const pineGeo = new THREE.ConeGeometry(1.25, 2.6, 7);
const blobGeo = new THREE.IcosahedronGeometry(1.25, 0);
const bushGeo = new THREE.IcosahedronGeometry(0.7, 0);
const palmLeafGeo = new THREE.ConeGeometry(0.4, 2.6, 4);

const MAX_TREES = 220;
const trunkMesh = new THREE.InstancedMesh(trunkGeo, flatMat(0xffffff), MAX_TREES);
const pineMesh = new THREE.InstancedMesh(pineGeo, flatMat(0xffffff), MAX_TREES * 2);
const blobMesh = new THREE.InstancedMesh(blobGeo, flatMat(0xffffff), MAX_TREES * 2);
const palmMesh = new THREE.InstancedMesh(palmLeafGeo, flatMat(0xffffff), MAX_TREES * 5);
const bushMesh = new THREE.InstancedMesh(bushGeo, flatMat(0xffffff), 120);
for (const m of [trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

let ti = 0, pi = 0, bi = 0, palmi = 0;
const pinePalette = [0x2f9e44, 0x2b8a3e, 0x37b24d];
const blobPalette = [0x40b34f, 0x51cf66, 0x2f9e44, 0x69db7c];

function addTree(x, z) {
  const y = groundHeight(x, z);
  const kind = Math.random();
  const s = rand(0.8, 1.5);
  const lean = rand(-0.08, 0.08);

  // thân cây dùng chung
  trunkMesh.setColorAt(ti, new THREE.Color(0x8a5a3b).offsetHSL(0, 0, rand(-0.03, 0.03)));
  dummy.position.set(x, y + 0.7 * s, z);
  dummy.rotation.set(lean, rand(0, 6.28), lean);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  if (ti < MAX_TREES) trunkMesh.setMatrixAt(ti++, dummy.matrix);
  obstacles.push({ x, z, r: 0.55 * s });

  if (kind < 0.38) {
    // thông low-poly 2 tầng
    const pineColor = new THREE.Color(pinePalette[(Math.random() * 3) | 0]);
    for (let k = 0; k < 2; k++) {
      pineMesh.setColorAt(pi, pineColor);
      dummy.position.set(x, y + (1.9 + k * 1.15) * s, z);
      dummy.rotation.set(0, rand(0, 6.28), 0);
      dummy.scale.setScalar(s * (k === 0 ? 1 : 0.68));
      dummy.updateMatrix();
      if (pi < MAX_TREES * 2) pineMesh.setMatrixAt(pi++, dummy.matrix);
    }
  } else if (kind < 0.75) {
    // tán tròn
    for (let k = 0; k < 2; k++) {
      blobMesh.setColorAt(bi, new THREE.Color(blobPalette[(Math.random() * blobPalette.length) | 0]));
      dummy.position.set(x + rand(-0.4, 0.4) * s, y + (2.1 + k * 0.8) * s, z + rand(-0.4, 0.4) * s);
      dummy.rotation.set(rand(0, 3), rand(0, 3), 0);
      dummy.scale.set(s * rand(0.9, 1.2), s * rand(0.8, 1), s * rand(0.9, 1.2));
      dummy.updateMatrix();
      if (bi < MAX_TREES * 2) blobMesh.setMatrixAt(bi++, dummy.matrix);
    }
  } else {
    // cọ / dừa như ảnh gốc
    dummy.position.set(x, y + 1.1 * s, z);
    dummy.rotation.set(0.15, rand(0, 6.28), 0.12);
    dummy.scale.setScalar(s * 1.15);
    dummy.updateMatrix();
    if (ti > 0) { trunkMesh.setMatrixAt(ti - 1, dummy.matrix); } // thân cao hơn cho cọ
    const topY = y + 2.2 * s, topX = x + 0.25, topZ = z + 0.2;
    // lá cọ
    for (let k = 0; k < 5; k++) {
      palmMesh.setColorAt(palmi, new THREE.Color(0x37b24d).offsetHSL(0, 0, rand(-0.03, 0.03)));
      const a = (k / 5) * Math.PI * 2;
      dummy.position.set(topX + Math.cos(a) * 1.05 * s, topY + rand(-0.15, 0.25), topZ + Math.sin(a) * 1.05 * s);
      dummy.rotation.set(Math.PI / 2.3, 0, -a + Math.PI / 2);
      dummy.scale.set(1, 1, 0.28);
      dummy.updateMatrix();
      if (palmi < MAX_TREES * 5) palmMesh.setMatrixAt(palmi++, dummy.matrix);
    }
    // chùm dừa
    blobMesh.setColorAt(bi, new THREE.Color(0x5c3d24));
    dummy.position.set(topX, topY - 0.15, topZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.28 * s);
    dummy.updateMatrix();
    if (bi < MAX_TREES * 2) blobMesh.setMatrixAt(bi++, dummy.matrix);
  }
}

// rải cây: dày phía sau + 2 bên, chừa lòng sông
const SPAWN = { x: 10.5, z: 2 };
for (let n = 0; n < MAX_TREES; n++) {
  let x = rand(-38, 38), z = rand(-42, 42);
  if (Math.abs(x) < 7.5) { n--; continue; } // chừa sông + lối mòn
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4.5) { n--; continue; } // chừa chỗ spawn
  // mật độ cao hơn ở xa (hậu cảnh như ảnh)
  if (z > 5 && Math.random() < 0.3) { n--; continue; }
  addTree(x, z);
}
// bụi cỏ điểm xuyết
{
  let c = 0;
  for (let i = 0; i < 120; i++) {
    const x = rand(-36, 36), z = rand(-42, 42);
    if (Math.abs(x) < 6.8) continue;
    bushMesh.setColorAt(c, new THREE.Color(0x69b93e).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.04, 0.04)));
    dummy.position.set(x, groundHeight(x, z) + 0.3, z);
    dummy.rotation.set(rand(0, 3), rand(0, 3), 0);
    dummy.scale.setScalar(rand(0.6, 1.4));
    dummy.updateMatrix();
    bushMesh.setMatrixAt(c++, dummy.matrix);
  }
  bushMesh.count = c;
}
trunkMesh.count = ti; pineMesh.count = pi; blobMesh.count = bi; palmMesh.count = palmi;
for (const m of [trunkMesh, pineMesh, blobMesh, palmMesh]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

// ============ Cầu gỗ qua sông ============
const BRIDGES = [-10, 12];
{
  const plankMat = flatMat(0xa5713f);
  const railMat = flatMat(0x7a4f27);
  for (const bz of BRIDGES) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.1), plankMat);
      p.position.set(-4 + i, 0.45, bz);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
    }
    for (const s of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.12), railMat);
      rail.position.set(0, 1.15, bz + s);
      rail.castShadow = true;
      g.add(rail);
      for (let i = -4; i <= 4; i += 2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), railMat);
        post.position.set(i, 0.8, bz + s);
        post.castShadow = true;
        g.add(post);
      }
    }
    scene.add(g);
  }
}

// ============ Mây low-poly ============
const clouds = [];
{
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const n = 3 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.8, 1.4), 0), cloudMat);
      m.position.set(k * rand(1.0, 1.5), rand(-0.3, 0.3), rand(-0.6, 0.6));
      m.scale.y = 0.6;
      g.add(m);
    }
    g.position.set(rand(-40, 40), rand(20, 27), rand(-45, 45));
    // đẩy mây ra rìa để không che nhân vật ở trung tâm
    const ang = rand(0, Math.PI * 2), rad = rand(30, 44);
    g.position.x = Math.cos(ang) * rad;
    g.position.z = Math.sin(ang) * rad;
    g.position.y = rand(24, 30);
    g.userData.speed = rand(0.2, 0.6);
    scene.add(g);
    clouds.push(g);
  }
}

// ============ Nhân vật Low-Poly (Giai đoạn 3.2) ============
const player = new THREE.Group();
const pParts = {};
{
  const skin = flatMat(0xffd8a8), shirt = flatMat(0xff6b6b), pants = flatMat(0x4dabf7), hatM = flatMat(0xe9c46a);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.85, 7), shirt);
  body.position.y = 1.15; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), skin);
  head.position.y = 1.95; head.castShadow = true;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.35, 8), hatM);
  hat.position.y = 2.28; hat.castShadow = true;
  const mkLimb = (w, h, mat, x, y) => {
    const geo = new THREE.BoxGeometry(w, h, w);
    geo.translate(0, -h / 2, 0); // pivot ở khớp
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0); m.castShadow = true;
    return m;
  };
  pParts.legL = mkLimb(0.2, 0.75, pants, -0.16, 0.75);
  pParts.legR = mkLimb(0.2, 0.75, pants, 0.16, 0.75);
  pParts.armL = mkLimb(0.16, 0.65, shirt, -0.5, 1.5);
  pParts.armR = mkLimb(0.16, 0.65, shirt, 0.5, 1.5);
  player.add(body, head, hat, pParts.legL, pParts.legR, pParts.armL, pParts.armR);
  // vòng tròn định vị dưới chân (kiểu game isometric)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  player.add(ring);
  player.position.set(10.5, groundHeight(10.5, 2), 2);
  scene.add(player);
  camTarget.set(10.5, 0.5, 2);
}

// ============ Điều khiển (Giai đoạn 4) ============
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });

// joystick mobile
const joy = { x: 0, y: 0, active: false };
{
  const base = document.getElementById('joystick'), stick = document.getElementById('stick');
  let cx = 0, cy = 0;
  const move = (t) => {
    const dx = t.clientX - cx, dy = t.clientY - cy;
    const len = Math.hypot(dx, dy) || 1, max = 38;
    const cl = Math.min(len, max);
    stick.style.transform = `translate(calc(-50% + ${dx / len * cl}px), calc(-50% + ${dy / len * cl}px))`;
    joy.x = dx / len * (cl / max); joy.y = dy / len * (cl / max); joy.active = true;
  };
  base.addEventListener('touchstart', (e) => { const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e.touches[0]); }, { passive: true });
  base.addEventListener('touchmove', (e) => move(e.touches[0]), { passive: true });
  base.addEventListener('touchend', () => { stick.style.transform = 'translate(-50%,-50%)'; joy.x = joy.y = 0; joy.active = false; });
}

// xoay / zoom camera
let dragging = false, px = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => { if (dragging) { azimuth -= (e.clientX - px) * 0.005; px = e.clientX; } });
addEventListener('wheel', (e) => { frustumSize = THREE.MathUtils.clamp(frustumSize + e.deltaY * 0.01, 12, 38); onResize(); }, { passive: true });

function onResize() {
  aspect = innerWidth / innerHeight;
  camera.left = (-frustumSize * aspect) / 2; camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2; camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

function isOnBridge(z) { return BRIDGES.some((bz) => Math.abs(z - bz) < 1.6); }

const SPEED = 6;
let walkTime = 0;
const clock = new THREE.Clock();
const posEl = document.getElementById('pos'), fpsEl = document.getElementById('fps');
let fpsAcc = 0, fpsN = 0, fpsT = 0;

function update(dt) {
  // input -> vector isometric
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  ix += joy.x; iz += joy.y;

  const moving = Math.hypot(ix, iz) > 0.1;
  if (moving) {
    // forward = hướng xa camera trên mặt đất, right = vuông góc (màn hình)
    const fwd = new THREE.Vector3(-Math.cos(azimuth), 0, -Math.sin(azimuth));
    const right = new THREE.Vector3(Math.sin(azimuth), 0, -Math.cos(azimuth));

    const len = Math.hypot(ix, iz);
    ix /= Math.max(1, len); iz /= Math.max(1, len);
    const move = new THREE.Vector3().addScaledVector(fwd, -iz).addScaledVector(right, ix).normalize();

    let nx = player.position.x + move.x * SPEED * dt;
    let nz = player.position.z + move.z * SPEED * dt;

    // va chạm tròn với cây/đá
    for (const o of obstacles) {
      const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), min = o.r + 0.45;
      if (d < min && d > 1e-4) { nx = o.x + (dx / d) * min; nz = o.z + (dz / d) * min; }
    }
    // chặn sông (trừ khi đứng trên cầu) + giới hạn bản đồ
    if (Math.abs(nx) < RIVER_HALF + 0.5 && !isOnBridge(nz)) {
      nx = Math.sign(nx || 1) * (RIVER_HALF + 0.5);
    }
    const r = Math.hypot(nx, nz);
    if (r > 37) { nx *= 37 / r; nz *= 37 / r; }

    player.position.x = nx; player.position.z = nz;
    player.rotation.y = Math.atan2(move.x, move.z);

    walkTime += dt * 10;
    const sw = Math.sin(walkTime);
    pParts.legL.rotation.x = sw * 0.7; pParts.legR.rotation.x = -sw * 0.7;
    pParts.armL.rotation.x = -sw * 0.6; pParts.armR.rotation.x = sw * 0.6;
    player.position.y += Math.abs(Math.cos(walkTime)) * 0.02;
  } else {
    // idle: thở nhẹ
    const t = performance.now() * 0.002;
    pParts.legL.rotation.x *= 0.8; pParts.legR.rotation.x *= 0.8;
    pParts.armL.rotation.x = Math.sin(t) * 0.06; pParts.armR.rotation.x = -Math.sin(t) * 0.06;
  }
  player.position.y += (groundHeight(player.position.x, player.position.z) - player.position.y) * Math.min(1, dt * 10);

  // nước chảy + mây trôi
  for (const f of window.__foams) {
    f.mesh.position.z += f.speed * dt;
    if (f.mesh.position.z > 45) f.mesh.position.z = -45;
  }
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 48) c.position.x = -48;
  }

  // camera follow mượt
  camTarget.lerp(new THREE.Vector3(player.position.x, 0.5, player.position.z), Math.min(1, dt * 4));
  sun.position.set(camTarget.x + 14, 24, camTarget.z + 10);
  sun.target.position.copy(camTarget); sun.target.updateMatrixWorld();
  updateCameraPos();
}

// ============ Loop ============
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);

  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++; fpsT += dt;
  if (fpsT > 0.5) {
    fpsEl.textContent = `${Math.round(fpsAcc / fpsN)} FPS`;
    posEl.textContent = `x: ${player.position.x.toFixed(1)}, z: ${player.position.z.toFixed(1)}`;
    fpsAcc = 0; fpsN = 0; fpsT = 0;
  }
}
animate();
document.getElementById('loading').classList.add('hidden');
