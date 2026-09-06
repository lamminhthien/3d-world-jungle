import * as THREE from 'three';
import { CAMERA } from '../config.js';

// Keyboard (WASD/arrows + Shift to sprint) + mobile:
//  - Floating joystick on the left half (appears where you touch)
//  - Swipe the right half to rotate the camera, pinch with 2 fingers to zoom
//  - Multi-touch: walk + rotate at once (separate tracking per pointerId)
// Mutates `rig.state` (azimuth / frustumSize) and calls rig helpers.
export function setupControls(canvas, rig) {
  const keys = {};
  // Ignore keystrokes typed into text fields (menu/title seed inputs) so
  // typing e.g. "w" doesn't also move the player.
  const isTyping = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    if (isTyping(e)) return;
    keys[e.code] = false;
  });

  const joy = { x: 0, y: 0, mag: 0, active: false };
  const touch = { sprintHeld: false };

  const base = document.getElementById('joystick');
  const stick = document.getElementById('stick');

  // Block long-press menu / callout on Android Chrome + Safari.
  addEventListener('contextmenu', (e) => {
    if (e.target === canvas || (base && base.contains(e.target))) e.preventDefault();
  });
  if (canvas) canvas.style.touchAction = 'none';

  function setZoom(frustumSize) {
    rig.state.frustumSize = THREE.MathUtils.clamp(frustumSize, CAMERA.minZoom, CAMERA.maxZoom);
    rig.onResize();
  }

  // Mobile zoom +/- buttons (hold for continuous zoom).
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
  // Smooth analog input: avoid jitter from shaky fingers.
  let smoothX = 0;
  let smoothY = 0;

  let lookPointerId = null;
  let lookLastX = 0;
  let lookLastY = 0;
  // Pinch: store the 2-finger look distance for zoom.
  const pinchPointers = new Map(); // pointerId -> {x, y}
  let pinchLastDist = 0;

  function showBaseAt(x, y) {
    if (!base) return;
    base.classList.add('active');
    // Center the joystick on the touch point (120px base).
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
    // Deadzone + expo curve: light push = walk slow, full push = run.
    const shaped = rawMag < DEADZONE ? 0 : Math.min(1, ((rawMag - DEADZONE) / (1 - DEADZONE)) ** 1.15);
    const targetX = nx * shaped;
    const targetY = ny * shaped;
    // Fast lerp (~18/s at 60fps) for smoothness without lag.
    smoothX += (targetX - smoothX) * 0.35;
    smoothY += (targetY - smoothY) * 0.35;
    // Snap to 0 when nearly released for a full stop.
    joy.x = Math.abs(smoothX) < 0.02 && shaped === 0 ? 0 : smoothX;
    joy.y = Math.abs(smoothY) < 0.02 && shaped === 0 ? 0 : smoothY;
    joy.mag = Math.min(1, Math.hypot(joy.x, joy.y));
    joy.active = shaped > 0;
  }

  function isTouchUI(el) {
    return el && typeof el.closest === 'function' && el.closest('#touch-ui, #menuPanel, #menuBtn, #title-screen, #envbar, button');
  }

  // Touch start: left half (55%) = joystick, rest = rotate camera.
  // Ignore touches on buttons / seedbar.
  function onPointerDown(e) {
    if (e.pointerType !== 'touch') return;
    if (isTouchUI(e.target)) return;
    // Touches on the legacy fixed joystick UI (if any) still count as joystick.
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
        lookPointerId = null; // yield to pinch
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
          // Pinch out = zoom in (smaller frustum).
          setZoom(rig.state.frustumSize - (d - pinchLastDist) * 0.03);
        }
        pinchLastDist = d;
        return;
      }
    }
    if (e.pointerId === lookPointerId) {
      // Horizontal swipe rotates; slight vertical pitch? Keep azimuth like desktop,
      // with slightly higher sensitivity for thumbs.
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
      // Dropping from pinch to 1 finger: keep the remaining finger as look to keep rotating.
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

  // Listen on window to catch fingers sliding off the canvas,
  // but filter out gestures on text inputs (seed).
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
  // Avoid a stuck joystick when the app loses focus / switches tab.
  addEventListener('blur', () => {
    joyPointerId = lookPointerId = null;
    pinchPointers.clear();
    resetStick();
  });
  // iOS Safari: gesture events zoom the page — block them entirely.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  // ---------- Desktop: drag to rotate, wheel to zoom (unchanged) ----------
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
