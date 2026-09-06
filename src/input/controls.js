import * as THREE from 'three';
import { CAMERA } from '../config.js';

// Keyboard (WASD/arrows) + mobile joystick + orbit/zoom camera.
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

  // Mobile joystick.
  const joy = { x: 0, y: 0, active: false };
  const base = document.getElementById('joystick');
  const stick = document.getElementById('stick');
  if (base && stick) {
    let cx = 0;
    let cy = 0;
    const move = (t) => {
      const dx = t.clientX - cx;
      const dy = t.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const max = 38;
      const cl = Math.min(len, max);
      stick.style.transform = `translate(calc(-50% + ${(dx / len) * cl}px), calc(-50% + ${(dy / len) * cl}px))`;
      joy.x = (dx / len) * (cl / max);
      joy.y = (dy / len) * (cl / max);
      joy.active = true;
    };
    base.addEventListener(
      'touchstart',
      (e) => {
        const r = base.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
        move(e.touches[0]);
      },
      { passive: true },
    );
    base.addEventListener('touchmove', (e) => move(e.touches[0]), { passive: true });
    base.addEventListener('touchend', () => {
      stick.style.transform = 'translate(-50%,-50%)';
      joy.x = joy.y = 0;
      joy.active = false;
    });
  }

  // Drag to orbit, wheel to zoom.
  let dragging = false;
  let px = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    px = e.clientX;
  });
  addEventListener('pointerup', () => (dragging = false));
  addEventListener('pointermove', (e) => {
    if (dragging) {
      rig.state.azimuth -= (e.clientX - px) * 0.005;
      px = e.clientX;
    }
  });
  addEventListener(
    'wheel',
    (e) => {
      rig.state.frustumSize = THREE.MathUtils.clamp(
        rig.state.frustumSize + e.deltaY * 0.01,
        CAMERA.minZoom,
        CAMERA.maxZoom,
      );
      rig.onResize();
    },
    { passive: true },
  );

  return { keys, joy };
}
