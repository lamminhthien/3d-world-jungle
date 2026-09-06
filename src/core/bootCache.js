// Pre-game bundle/GPU cache pipeline (chạy TRƯỚC khi vào game).
// ---------------------------------------------------------------------------
// Mục tiêu: lần chơi đầu tải + cache đủ thứ, các lần sau mở gần như tức thì,
// vào game không khựng (shader/texture đã nằm sẵn trên GPU).
//
// Pipeline gồm 4 bước (có báo tiến trình ra màn hình loading):
//   1. Đăng ký Service Worker  -> bundle js/css/html được Cache Storage giữ
//      lại trên máy này (chỉ PROD; dev thì bỏ qua cho đỡ vướng HMR).
//   2. Xin persistent storage  -> hạn chế trình duyệt tự xóa cache.
//   3. Hâm nóng bundle hiện tại -> fetch trước các file js/css mà trang đang
//      dùng để HTTP cache/SW có sẵn.
//   4. Hâm nóng texture + upload GPU (renderer.initTexture) — canvas procedural
//      sinh trên CPU rồi đẩy thẳng lên VRAM trong lúc loading.
//
// Trả lời nhanh: bundle build 1 lần dùng chung mọi máy; còn CACHE (SW Cache
// Storage, HTTP cache, texture/shader trên GPU) là RIÊNG TỪNG THIẾT BỊ —
// máy nào vào trước thì máy đó tự build cache cho chính nó, không share được
// vì khác trình duyệt/khác GPU.

import { version as APP_VERSION } from '../../package.json';
import {
  getBarkBump,
  getBarkTexture,
  getCactusBump,
  getCactusTexture,
  getGroundBump,
  getGroundTexture,
  getLeafBump,
  getLeafTexture,
  getRockBump,
  getRockTexture,
  getSandBump,
  getSandTexture,
  getWaterBump,
  getWaterTexture,
} from '../world/textures.js';

// Nhường UI 1 nhịp để thanh loading kịp vẽ trước bước nặng tiếp theo.
const yieldUI = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// Đăng ký SW với version theo package.json: đổi version = SW mới = cache mới.
async function registerBundleSW() {
  if (!('serviceWorker' in navigator)) return { active: false, reason: 'no-sw' };
  if (!import.meta.env.PROD) return { active: false, reason: 'dev-skip' };
  try {
    const url = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(APP_VERSION)}`;
    const reg = await Promise.race([
      navigator.serviceWorker.register(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), 8000)),
    ]);
    // Đợi SW điều khiển trang (để fetch bundle đi qua cache ngay từ đầu).
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    return { active: !!reg.active || !!reg.installing || !!reg.waiting, reason: 'ok' };
  } catch (err) {
    return { active: false, reason: String(err?.message || err) };
  }
}

async function ensurePersistentStorage() {
  try {
    if (navigator.storage?.persist) return { persisted: await navigator.storage.persist() };
  } catch {
    /* bỏ qua: API không hỗ trợ hoặc bị từ chối */
  }
  return { persisted: false };
}

// Fetch trước bundle mà trang đang dùng (main.js, style.css...) để cache nóng.
async function warmBundleFiles(onFrac) {
  const urls = new Set();
  document.querySelectorAll('script[src]').forEach((el) => urls.add(el.src));
  document.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => urls.add(el.href));
  const list = [...urls];
  let done = 0;
  onFrac(0);
  await Promise.all(
    list.map(async (u) => {
      try {
        await fetch(u, { credentials: 'same-origin' });
      } catch {
        /* offline/miss: SW hoặc lần sau lo */
      }
      done += 1;
      onFrac(done / Math.max(1, list.length));
      await yieldUI();
    }),
  );
}

// Sinh toàn bộ texture procedural + đẩy lên GPU ngay trong lúc loading.
async function warmTextures(renderer, onFrac) {
  const pairs = [
    [getBarkTexture, getBarkBump],
    [getLeafTexture, getLeafBump],
    [getRockTexture, getRockBump],
    [getCactusTexture, getCactusBump],
    [getGroundTexture, getGroundBump],
    [getSandTexture, getSandBump],
    [getWaterTexture, getWaterBump],
  ];
  const canUpload = renderer && typeof renderer.initTexture === 'function';
  let done = 0;
  const total = pairs.length * 2;
  onFrac(0);
  for (const [getMap, getBump] of pairs) {
    for (const get of [getMap, getBump]) {
      const tex = get();
      try {
        if (canUpload && tex) renderer.initTexture(tex);
      } catch {
        /* GPU bận: kệ, lần render đầu sẽ tự upload */
      }
      done += 1;
      onFrac(done / total);
      await yieldUI();
    }
  }
}

/**
 * Chạy toàn bộ pipeline trước khi chơi.
 * @param {(frac:number, msg:string) => void} onProgress frac 0..1 toàn cục
 * @returns summary { sw, persisted } để debug (xem window.__jungleCache)
 */
export async function runPreGameCache({ renderer = null, onProgress = () => {} } = {}) {
  const report = (frac, msg) => {
    try {
      onProgress(Math.min(1, Math.max(0, frac)), msg);
    } catch {
      /* UI loading bị thiếu: vẫn cho game chạy */
    }
  };

  // 0.00–0.20: Service Worker (bundle cache trên thiết bị này).
  report(0.02, '📦 Đang bật bộ nhớ cache…');
  const sw = await registerBundleSW();
  report(0.2, sw.active ? '📦 Cache sẵn sàng!' : '📦 Bỏ qua cache (chế độ dev/offline)…');
  await yieldUI();

  // 0.20–0.25: persistent storage.
  const { persisted } = await ensurePersistentStorage();
  report(0.25, persisted ? '💾 Đã giữ chỗ lưu trữ!' : '💾 Chuẩn bị tài nguyên…');
  await yieldUI();

  // 0.25–0.45: hâm nóng bundle hiện tại.
  await warmBundleFiles((f) => report(0.25 + f * 0.2, '📥 Đang tải gói game…'));
  await yieldUI();

  // 0.45–0.85: texture + GPU upload.
  await warmTextures(renderer, (f) => report(0.45 + f * 0.4, '🎨 Đang vẽ vân đất đá cây sông…'));

  report(0.85, '🌍 Đang dựng thế giới…');
  await yieldUI();
  const summary = { version: APP_VERSION, sw, persisted };
  try {
    window.__jungleCache = summary;
  } catch {
    /* non-browser? bỏ qua */
  }
  return summary;
}
