import * as THREE from 'three';
import { CAMERA } from '../config.js';

// Keyboard (WASD/arrows + Shift để chạy) + mobile:
//  - Floating joystick nửa trái màn hình (chạm đâu hiện đó)
//  - Vuốt nửa phải để xoay camera, pinch 2 ngón để zoom
//  - Multi-touch: vừa đi vừa xoay (track riêng từng pointerId)
// Mutates `rig.state` (azimuth / frustumSize) and calls rig helpers.
export function setupControls(canvas, rig) {
  const keys = {};
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  const joy = { x: 0, y: 0, mag: 0, active: false };
  const touch = { sprintHeld: false };

  const base = document.getElementById('joystick');
  const stick = document.getElementById('stick');

  // Chặn menu long-press / callout trên Android Chrome + Safari.
  addEventListener('contextmenu', (e) => {
    if (e.target === canvas || (base && base.contains(e.target))) e.preventDefault();
  });
  if (canvas) canvas.style.touchAction = 'none';

  function setZoom(frustumSize) {
    rig.state.frustumSize = THREE.MathUtils.clamp(frustumSize, CAMERA.minZoom, CAMERA.maxZoom);
    rig.onResize();
  }

  // Nút zoom +/- cho mobile (giữ để zoom liên tục).
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const sprintBtn = document.getElementById('btnSprint');
  let zoomHoldTimer = null;
  function bindHoldZoom(btn, dir) {
    if (!btn) return;
    const step = () => setZoom(rig.state.frustumSize + dir * 1.2);
    const start = (e) => {
      e.preventDefault();
      step();
      clearInterval(zoomHoldTimer);
      zoomHoldTimer = setInterval(step, 90);
    };
    const stop = () => clearInterval(zoomHoldTimer);
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
  }
  bindHoldZoom(zoomInBtn, -1);
  bindHoldZoom(zoomOutBtn, +1);

  if (sprintBtn) {
    const on = (e) => {
      e.preventDefault();
      touch.sprintHeld = true;
      sprintBtn.classList.add('held');
    };
    const off = () => {
      touch.sprintHeld = false;
      sprintBtn.classList.remove('held');
    };
    sprintBtn.addEventListener('pointerdown', on);
    sprintBtn.addEventListener('pointerup', off);
    sprintBtn.addEventListener('pointercancel', off);
    sprintBtn.addEventListener('pointerleave', off);
  }

  // ---------- Floating joystick + look + pinch (Pointer Events) ----------
  const MAX_RADIUS = 52;
  const DEADZONE = 0.14;
  let joyPointerId = null;
  let joyOriginX = 0;
  let joyOriginY = 0;
  // Làm mượt input analog: tránh giật khi ngón tay rung.
  let smoothX = 0;
  let smoothY = 0;

  let lookPointerId = null;
  let lookLastX = 0;
  let lookLastY = 0;
  // Pinch: lưu khoảng cách 2 ngón look để zoom.
  const pinchPointers = new Map(); // pointerId -> {x, y}
  let pinchLastDist = 0;

  function showBaseAt(x, y) {
    if (!base) return;
    base.classList.add('active');
    // Đặt tâm joystick đúng điểm chạm (base 120px).
    base.style.left = `${x}px`;
    base.style.top = `${y}px`;
    base.style.right = 'auto';
    base.style.bottom = 'auto';
    base.style.transform = 'translate(-50%, -50%)';
  }

  function resetStick() {
    if (stick) stick.style.transform = 'translate(-50%,-50%)';
    if (base) base.classList.remove('active');
    joy.x = joy.y = joy.mag = 0;
    joy.active = false;
    smoothX = smoothY = 0;
  }

  function updateStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    const cl = Math.min(len || 0, MAX_RADIUS);
    const nx = len > 1e-6 ? dx / len : 0;
    const ny = len > 1e-6 ? dy / len : 0;
    if (stick) {
      stick.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
    }
    const rawMag = cl / MAX_RADIUS;
    // Deadzone + đường cong expo: đẩy nhẹ = đi chậm, đẩy hết = chạy.
    const shaped = rawMag < DEADZONE ? 0 : Math.min(1, ((rawMag - DEADZONE) / (1 - DEADZONE)) ** 1.15);
    const targetX = nx * shaped;
    const targetY = ny * shaped;
    // Lerp nhanh (~18/s ở 60fps) để mượt mà không trễ.
    smoothX += (targetX - smoothX) * 0.35;
    smoothY += (targetY - smoothY) * 0.35;
    // Snap về 0 khi thả gần hết để dừng hẳn.
    joy.x = Math.abs(smoothX) < 0.02 && shaped === 0 ? 0 : smoothX;
    joy.y = Math.abs(smoothY) < 0.02 && shaped === 0 ? 0 : smoothY;
    joy.mag = Math.min(1, Math.hypot(joy.x, joy.y));
    joy.active = shaped > 0;
  }

  function isTouchUI(el) {
    return el && typeof el.closest === 'function' && el.closest('#touch-ui, #hud .seedbar, #hud .stats, #envbar, button');
  }

  // Chạm bắt đầu: nửa trái (55%) = joystick, còn lại = xoay camera.
  // Bỏ qua chạm lên nút bấm / seedbar.
  function onPointerDown(e) {
    if (e.pointerType !== 'touch') return;
    if (isTouchUI(e.target)) return;
    // Chạm UI joystick cũ (nếu còn ở vị trí cố định) vẫn tính là joystick.
    const onBase = base && (e.target === base || base.contains(e.target));
    const goJoy = onBase || (e.clientX < innerWidth * 0.55 && joyPointerId === null);
    if (goJoy && joyPointerId === null) {
      joyPointerId = e.pointerId;
      joyOriginX = e.clientX;
      joyOriginY = e.clientY;
      showBaseAt(e.clientX, e.clientY);
      updateStick(0, 0);
      joy.active = true;
      e.preventDefault();
      return;
    }
    // Look / pinch.
    if (!onBase) {
      pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchPointers.size === 2) {
        const [a, b] = [...pinchPointers.values()];
        pinchLastDist = Math.hypot(a.x - b.x, a.y - b.y);
        lookPointerId = null; // nhường cho pinch
      } else if (lookPointerId === null) {
        lookPointerId = e.pointerId;
        lookLastX = e.clientX;
        lookLastY = e.clientY;
      }
    }
  }

  function onPointerMove(e) {
    if (e.pointerId === joyPointerId) {
      updateStick(e.clientX - joyOriginX, e.clientY - joyOriginY);
      e.preventDefault();
      return;
    }
    if (pinchPointers.has(e.pointerId)) {
      pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchPointers.size >= 2) {
        const [a, b] = [...pinchPointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchLastDist > 0) {
          // Pinch ra = zoom in (frustum nhỏ lại).
          setZoom(rig.state.frustumSize - (d - pinchLastDist) * 0.03);
        }
        pinchLastDist = d;
        return;
      }
    }
    if (e.pointerId === lookPointerId) {
      // Vuốt ngang xoay, vuốt dọc nhẹ chỉnh pitch? Giữ azimuth như desktop,
      // độ nhạy cao hơn chút cho ngón tay cái.
      rig.state.azimuth -= (e.clientX - lookLastX) * 0.0075;
      lookLastX = e.clientX;
      lookLastY = e.clientY;
      e.preventDefault();
    }
  }

  function onPointerUp(e) {
    if (e.pointerId === joyPointerId) {
      joyPointerId = null;
      resetStick();
      return;
    }
    if (pinchPointers.has(e.pointerId)) {
      pinchPointers.delete(e.pointerId);
      pinchLastDist = 0;
      // Rớt từ pinch về 1 ngón: gán ngón còn lại thành look để xoay tiếp.
      if (pinchPointers.size === 1) {
        const [id] = [...pinchPointers.keys()];
        const p = pinchPointers.get(id);
        lookPointerId = id;
        lookLastX = p.x;
        lookLastY = p.y;
      } else if (pinchPointers.size === 0 && e.pointerId === lookPointerId) {
        lookPointerId = null;
      }
      return;
    }
    if (e.pointerId === lookPointerId) lookPointerId = null;
  }

  // Lắng nghe trên window để bắt được cả khi ngón trượt khỏi canvas,
  // nhưng lọc bỏ thao tác trên input text (seed).
  const opts = { passive: false };
  addEventListener('pointerdown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    onPointerDown(e);
  }, opts);
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') onPointerMove(e);
  }, opts);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerUp);
  // Tránh kẹt joystick khi app mất focus / chuyển tab.
  addEventListener('blur', () => {
    joyPointerId = lookPointerId = null;
    pinchPointers.clear();
    resetStick();
  });
  // iOS Safari: gesture events gây zoom trang — chặn hẳn.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  // ---------- Desktop: kéo chuột xoay, lăn chuột zoom (giữ nguyên) ----------
  let dragging = false;
  let px = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      dragging = true;
      px = e.clientX;
    }
  });
  addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') dragging = false;
  });
  addEventListener('pointermove', (e) => {
    if (dragging && e.pointerType === 'mouse') {
      rig.state.azimuth -= (e.clientX - px) * 0.005;
      px = e.clientX;
    }
  });
  addEventListener(
    'wheel',
    (e) => {
      setZoom(rig.state.frustumSize + e.deltaY * 0.01);
    },
    { passive: true },
  );

  return { keys, joy, touch };
}
