// PWA helpers: fullscreen button (Android) + install button + standalone detection.
// ---------------------------------------------------------------------------
// - Fullscreen uses the standard Fullscreen API + webkit prefix (Android Chrome,
//   Samsung Internet...). iPhone Safari has no fullscreen for web pages
//   so the button hides itself (avoids a dead button).
// - When already running as a standalone PWA the page already fills the screen
//   -> hide the fullscreen button via `body.is-standalone` (see style.css).
// - Install: listen for `beforeinstallprompt` (Android Chrome/Edge) to show the install button;
//   iOS has no such event -> the button shows manual "Share > Add to Home Screen" guidance.

function docEl() {
  return document.documentElement;
}

function requestPageFullscreen() {
  const el = docEl();
  // Chrome/Android: navigationUI hide for a truly edge-to-edge view.
  if (el.requestFullscreen) {
    try {
      const p = el.requestFullscreen({ navigationUI: 'hide' });
      if (p && typeof p.catch === 'function') return p.catch(() => el.requestFullscreen());
      return p;
    } catch {
      return el.requestFullscreen();
    }
  }
  // Old desktop Safari / some Android webviews.
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
    /* User denied / device blocked: ignore, keep state */
  }
}

export function isStandalone() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
  } catch {
    /* ignore */
  }
  // iOS Safari "added to Home Screen".
  if (typeof navigator.standalone === 'boolean' && navigator.standalone) return true;
  // Android PWAs launched from the launcher usually have an empty referrer + no address bar.
  return false;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

/** Wire up #btnFullscreen / #btnInstall. Call once at boot. */
export function setupPwaUi() {
  const fsBtn = document.getElementById('btnFullscreen');
  const installBtn = document.getElementById('btnInstall');

  if (isStandalone()) document.body.classList.add('is-standalone');

  // ---- Fullscreen button ----
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
        fsBtn.title = on ? 'Exit fullscreen' : 'Fullscreen';
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

  // ---- Install-app button (Android beforeinstallprompt + iOS fallback) ----
  if (!installBtn) return;
  let deferred = null;

  const showInstall = () => {
    installBtn.hidden = false;
  };
  const hideInstall = () => {
    installBtn.hidden = true;
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it to show when the user taps the button ⬇️
    deferred = e;
    if (!isStandalone()) showInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    hideInstall();
    document.body.classList.add('is-standalone');
  });

  // iOS: no beforeinstallprompt -> show the button with manual guidance.
  if (isIOS() && !isStandalone()) showInstall();

  installBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (deferred) {
      try {
        deferred.prompt();
        await deferred.userChoice;
      } catch {
        /* user closed the dialog: ignore */
      }
      deferred = null;
      hideInstall();
      return;
    }
    // Fallback (iOS / browsers without prompt support):
    alert(
      isIOS()
        ? 'To install: tap Share > "Add to Home Screen".'
        : 'To install: open the browser menu (⋮) > "Install app" / "Add to Home screen".',
    );
  });
}
