/**
 * DineOS Client-Side Security & Anti-Inspection Guard
 * 
 * Provides defense-in-depth protection for POS terminals:
 * 1. Blocks context menu (right-click) across window and document
 * 2. Blocks standard DevTools inspection keyboard shortcuts (F12, Cmd+Opt+I/J/C, Ctrl+Shift+I/J/C, Ctrl+U, etc.)
 * 3. Unclosable Anti-debugging freeze loop (pauses/locks DevTools if opened via browser menu)
 * 4. Active by default on both dev and production (disable with localStorage.setItem('dineos_disable_guards', 'true'))
 */

export function initSecurityGuards(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const isExplicitlyDisabled = localStorage.getItem('dineos_disable_guards') === 'true';
  const shouldEnable = options.forceEnable !== undefined ? options.forceEnable : !isExplicitlyDisabled;

  if (!shouldEnable) {
    console.info('[SecurityGuard] Anti-inspect guards are temporarily disabled via setting.');
    return;
  }

  const blockEvent = (event) => {
    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    return false;
  };

  const isPublicPage = () => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    if (path === '/landing' || path.startsWith('/order') || path.startsWith('/display') || path === '/login') {
      return true;
    }
    if (path === '/') {
      try {
        const authData = localStorage.getItem('auth-storage');
        if (authData) {
          const parsed = JSON.parse(authData);
          if (parsed?.state?.user || parsed?.state?.staffDoc) {
            return false;
          }
        }
      } catch {}
      return true;
    }
    return false;
  };

  // 1. Intercept Right-Click Context Menu: Block native browser menu on POS pages (anti-inspect)
  // and dispatch custom event for DineOS Desktop Context Menu
  const handleContextMenu = (event) => {
    // On public landing pages, customer QR order pages, or public displays, allow normal browser context menu
    if (isPublicPage()) {
      return true;
    }

    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();

    try {
      window.dispatchEvent(new CustomEvent('dineos:contextmenu', {
        detail: {
          clientX: event.clientX,
          clientY: event.clientY,
          targetTagName: event.target?.tagName,
          targetId: event.target?.id,
          targetClassName: event.target?.className,
        }
      }));
    } catch {}

    return false;
  };

  window.addEventListener('contextmenu', handleContextMenu, { capture: true });
  document.addEventListener('contextmenu', handleContextMenu, { capture: true });

  // 2. Disable DevTools & Source View Keyboard Shortcuts
  const handleKeydown = (event) => {
    const key = event.key ? event.key.toUpperCase() : '';
    const code = event.keyCode || event.which;
    const isCtrl = event.ctrlKey;
    const isMeta = event.metaKey; // Command key on macOS
    const isShift = event.shiftKey;
    const isAlt = event.altKey; // Option key on macOS

    // F12 key
    if (key === 'F12' || code === 123) {
      return blockEvent(event);
    }

    // Ctrl+Shift+I / J / C (Windows/Linux)
    // Cmd+Option+I / J / C (macOS)
    if (((isCtrl || isMeta) && (isShift || isAlt) && ['I', 'J', 'C'].includes(key)) ||
        ((isCtrl || isMeta) && (isShift || isAlt) && [73, 74, 67].includes(code))) {
      return blockEvent(event);
    }

    // Ctrl+U or Cmd+U (View Page Source)
    if ((isCtrl || isMeta) && (key === 'U' || code === 85)) {
      return blockEvent(event);
    }

    // Ctrl+S or Cmd+S (Save Page to disk)
    if ((isCtrl || isMeta) && (key === 'S' || code === 83)) {
      return blockEvent(event);
    }
  };

  window.addEventListener('keydown', handleKeydown, { capture: true });
  document.addEventListener('keydown', handleKeydown, { capture: true });

  // 3. Unclosable Anti-Debugging Freeze Loop
  // If DevTools is opened via browser menus (Three dots -> More tools -> Developer tools),
  // this triggers a debugger pause repeatedly every 150ms so DevTools is locked up.
  let antiDebugTimer = null;
  const runAntiDebug = () => {
    try {
      (function() {
        Function('debugger')();
      })();
    } catch {}
  };

  // Run anti-debug freeze loop
  antiDebugTimer = setInterval(runAntiDebug, 150);

  return () => {
    window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    window.removeEventListener('keydown', handleKeydown, { capture: true });
    document.removeEventListener('keydown', handleKeydown, { capture: true });
    if (antiDebugTimer) clearInterval(antiDebugTimer);
  };
}
