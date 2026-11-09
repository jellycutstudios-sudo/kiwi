/**
 * Utility to detect if the current session is running inside a dedicated POS environment:
 * - Native Windows / Mac Desktop Wrapper (Electron, Tauri)
 * - Installed Standalone Desktop PWA (Edge / Chrome on Windows / Mac)
 * - Explicit POS Terminal query or stored preference
 */

export function isDesktopOrStandalone() {
  if (typeof window === 'undefined') return false;

  // 1. Native Desktop Shell (Electron / Tauri / Native Wrapper)
  if (
    Boolean(window.electron) ||
    Boolean(window.__TAURI__) ||
    Boolean(window.isDesktopApp) ||
    window.navigator.userAgent.includes('Electron')
  ) {
    return true;
  }

  // 2. Installed Standalone PWA on Windows / Mac / ChromeOS / Android Terminal
  if (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
    window.navigator.standalone === true
  ) {
    return true;
  }

  // 3. Explicit terminal preference or query flag (?mode=terminal or ?app=true)
  try {
    if (localStorage.getItem('dineos_pos_app_mode') === 'true') return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'terminal' || params.get('app') === 'true' || params.get('pos') === 'true') {
      return true;
    }
  } catch {}

  return false;
}
