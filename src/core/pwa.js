// PWA helpers: nút fullscreen (Android) + nút cài app + nhận diện standalone.
// ---------------------------------------------------------------------------
// - Fullscreen dùng Fullscreen API chuẩn + tiền tố webkit (Android Chrome,
//   Samsung Internet...). iPhone Safari không hỗ trợ fullscreen cho trang web
//   nên nút sẽ tự ẩn (tránh hiện nút chết).
// - Khi đã chạy dưới dạng PWA standalone thì trang vốn đã chiếm toàn màn
//   hình -> ẩn nút fullscreen qua class `body.is-standalone` (xem style.css).
// - Install: hứng `beforeinstallprompt` (Android Chrome/Edge) để hiện nút ⬇️;
//   iOS không có event này -> nút hiện với hướng dẫn "Chia sẻ > Thêm vào MH chính".

function docEl() {
  return document.documentElement;
}

function requestPageFullscreen() {
  const el = docEl();
  // Chrome/Android: navigationUI hide để thật sự tràn viền.
  if (el.requestFullscreen) {
    try {
      const p = el.requestFullscreen({ navigationUI: 'hide' });
      if (p && typeof p.catch === 'function') return p.catch(() => el.requestFullscreen());
      return p;
    } catch {
      return el.requestFullscreen();
    }
  }
  // Safari desktop cũ / một số webview Android.
  const webkit = el.webkitRequestFullscreen;
  if (typeof webkit === 'function') return webkit.call(el);
  return Promise.reject(new Error('fullscreen-unsupported'));
}

function exitPageFullscreen() {
  if (document.exitFullscreen && document.fullscreenElement) return document.exitFullscreen();
  if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
    return document.webkitExitFullscreen();
  }
  return Promise.resolve();
}

export function isPageFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function togglePageFullscreen() {
  try {
    if (isPageFullscreen()) await exitPageFullscreen();
    else await requestPageFullscreen();
  } catch {
    /* Người dùng từ chối / thiết bị không cho: kệ, giữ nguyên */
  }
}

export function isStandalone() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
  } catch {
    /* bỏ qua */
  }
  // iOS Safari "đã thêm vào MH chính".
  if (typeof navigator.standalone === 'boolean' && navigator.standalone) return true;
  // Android PWA mở từ launcher thường có referrer rỗng + không có thanh địa chỉ.
  return false;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

/** Gắn logic cho 2 nút #btnFullscreen / #btnInstall. Gọi 1 lần lúc boot. */
export function setupPwaUi() {
  const fsBtn = document.getElementById('btnFullscreen');
  const installBtn = document.getElementById('btnInstall');

  if (isStandalone()) document.body.classList.add('is-standalone');

  // ---- Nút fullscreen ----
  if (fsBtn) {
    const supported =
      typeof docEl().requestFullscreen === 'function' ||
      typeof docEl().webkitRequestFullscreen === 'function';
    if (!supported) {
      fsBtn.hidden = true;
    } else {
      const syncIcon = () => {
        const on = isPageFullscreen();
        fsBtn.textContent = on ? '✕' : '⛶';
        fsBtn.title = on ? 'Thoát toàn màn hình' : 'Toàn màn hình';
        fsBtn.setAttribute('aria-label', fsBtn.title);
      };
      fsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePageFullscreen().then(syncIcon);
      });
      document.addEventListener('fullscreenchange', syncIcon);
      document.addEventListener('webkitfullscreenchange', syncIcon);
      syncIcon();
    }
  }

  // ---- Nút cài app (Android beforeinstallprompt + fallback iOS) ----
  if (!installBtn) return;
  let deferred = null;

  const showInstall = () => {
    installBtn.hidden = false;
  };
  const hideInstall = () => {
    installBtn.hidden = true;
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // giữ lại để mở khi user bấm nút ⬇️
    deferred = e;
    if (!isStandalone()) showInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    hideInstall();
    document.body.classList.add('is-standalone');
  });

  // iOS: không có beforeinstallprompt -> hiện nút với hướng dẫn thủ công.
  if (isIOS() && !isStandalone()) showInstall();

  installBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (deferred) {
      try {
        deferred.prompt();
        await deferred.userChoice;
      } catch {
        /* user đóng dialog: kệ */
      }
      deferred = null;
      hideInstall();
      return;
    }
    // Fallback (iOS / trình duyệt không hỗ trợ prompt):
    alert(
      isIOS()
        ? 'Để cài app: bấm nút Chia sẻ (Share) > "Thêm vào MH chính" (Add to Home Screen).'
        : 'Để cài app: mở menu trình duyệt (⋮) > "Cài đặt ứng dụng" / "Add to Home screen".',
    );
  });
}
