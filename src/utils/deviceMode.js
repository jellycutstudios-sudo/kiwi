/**
 * Utility to detect if the current session is running inside a dedicated POS environment:
 * - Native Windows / Mac Desktop Wrapper (Electron, Tauri)
 * - Installed Standalone PWA (iOS, Android, Windows, Mac, ChromeOS)
 * - PWA launch parameters (?source=pwa, ?pwa=true, etc.)
 * - Explicit POS Terminal query or stored preference
 */

export function isDesktopApp() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.electron ||
    window.__TAURI__ ||
    window.isDesktopApp ||
    (window.navigator?.userAgent && window.navigator.userAgent.includes('Electron'))
  );
}

export function isPwa() {
  if (typeof window === 'undefined') return false;

  // 1. Web Display Mode media queries (W3C standard for installed standalone PWAs)
  try {
    if (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: window-controls-overlay)').matches)
    ) {
      try {
        localStorage.setItem('dineos_pwa_mode', 'true');
      } catch {}
      return true;
    }
  } catch {}

  // 2. iOS Safari Add to Home Screen standalone mode
  if (window.navigator?.standalone === true) {
    try {
      localStorage.setItem('dineos_pwa_mode', 'true');
    } catch {}
    return true;
  }

  // 3. Android Trusted Web Activity / PWA referrers
  if (typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://')) {
    try {
      localStorage.setItem('dineos_pwa_mode', 'true');
    } catch {}
    return true;
  }

  // 4. PWA manifest query param or stored session
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('source') === 'pwa' ||
      params.get('pwa') === 'true' ||
      params.get('mode') === 'pwa'
    ) {
      try {
        localStorage.setItem('dineos_pwa_mode', 'true');
      } catch {}
      return true;
    }
    if (localStorage.getItem('dineos_pwa_mode') === 'true') {
      return true;
    }
  } catch {}

  return false;
}

export function isDesktopOrStandalone() {
  if (typeof window === 'undefined') return false;

  if (isDesktopApp()) return true;
  if (isPwa()) return true;

  // Explicit terminal preference or query flag (?mode=terminal or ?app=true or ?pos=true)
  try {
    if (localStorage.getItem('dineos_pos_app_mode') === 'true') return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'terminal' || params.get('app') === 'true' || params.get('pos') === 'true') {
      return true;
    }
  } catch {}

  return false;
}
