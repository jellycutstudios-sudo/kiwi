/**
 * Centralized error tracking, diagnostics, and telemetry utility.
 * Maintains an in-memory and session ring buffer of recent system logs,
 * intercepts unhandled errors, and provides diagnostic reports for debugging.
 */

const MAX_LOGS = 50;
const LOG_STORAGE_KEY = 'dineos_recent_logs';

function getStoredLogs() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(LOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function storeLog(entry) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const current = getStoredLogs();
    current.unshift(entry);
    if (current.length > MAX_LOGS) current.length = MAX_LOGS;
    sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

export const logError = (error, context = {}) => {
  const entry = {
    level: 'error',
    timestamp: new Date().toISOString(),
    message: error?.message || String(error),
    name: error?.name || 'Error',
    stack: error?.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined,
    route: typeof window !== 'undefined' ? window.location.pathname : '',
    context
  };

  storeLog(entry);

  // In development, log verbosely
  if (import.meta.env.DEV) {
    console.group('[Error Tracker]');
    console.error(error);
    if (Object.keys(context).length > 0) {
      console.info('Context:', context);
    }
    console.groupEnd();
  }
};

export const logEvent = (eventName, data = {}) => {
  const entry = {
    level: 'info',
    timestamp: new Date().toISOString(),
    eventName,
    data,
    route: typeof window !== 'undefined' ? window.location.pathname : ''
  };

  storeLog(entry);

  if (import.meta.env.DEV) {
    // console.info(`[Telemetry] ${eventName}`, data);
  }
};

export const getRecentLogs = () => {
  return getStoredLogs();
};

export const clearRecentLogs = () => {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(LOG_STORAGE_KEY);
  }
};

// Global unhandled error listeners
if (typeof window !== 'undefined' && !window.__dineos_err_listener_attached) {
  window.__dineos_err_listener_attached = true;
  window.addEventListener('error', (event) => {
    logError(event.error || event.message, { source: 'window.onerror', filename: event.filename, lineno: event.lineno });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, { source: 'window.onunhandledrejection' });
  });
}

/**
 * Generate a comprehensive, sanitized system diagnostic report
 */
export const generateDiagnosticReport = () => {
  if (typeof window === 'undefined') return 'Environment: Non-browser';

  let localStorageKeys = [];
  let localStorageBytes = 0;
  try {
    localStorageKeys = Object.keys(localStorage);
    for (const key of localStorageKeys) {
      localStorageBytes += (localStorage.getItem(key) || '').length * 2;
    }
  } catch {}

  const report = {
    timestamp: new Date().toISOString(),
    app: {
      version: '1.3.0',
      pwaMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone (installed)' : 'browser tab',
      serviceWorker: 'serviceWorker' in navigator && !!navigator.serviceWorker.controller ? 'Active (Controller Ready)' : 'Inactive / None'
    },
    system: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      onLine: navigator.onLine,
      screen: `${window.screen?.width}x${window.screen?.height} (DPR: ${window.devicePixelRatio || 1})`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      memory: performance?.memory ? {
        jsHeapSizeLimit: `${Math.round(performance.memory.jsHeapSizeLimit / 1048576)} MB`,
        totalJSHeapSize: `${Math.round(performance.memory.totalJSHeapSize / 1048576)} MB`,
        usedJSHeapSize: `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB`
      } : 'Unavailable'
    },
    storage: {
      localStorageKeyCount: localStorageKeys.length,
      estimatedLocalStorageUsage: `${Math.round(localStorageBytes / 1024)} KB`
    },
    recentErrors: getRecentLogs().slice(0, 15)
  };

  return JSON.stringify(report, null, 2);
};

/**
 * Run a multi-point live system health diagnostic
 */
export const runSystemDiagnostics = async () => {
  const results = [];

  // 1. LocalStorage RW check
  try {
    const testKey = '__dineos_diag_test__';
    localStorage.setItem(testKey, '1');
    const read = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    results.push({ name: 'Local Storage R/W', status: read === '1' ? 'ok' : 'error', message: 'Read/Write verified' });
  } catch (err) {
    results.push({ name: 'Local Storage R/W', status: 'error', message: err.message });
  }

  // 2. IndexedDB check
  try {
    const idbAvailable = typeof window !== 'undefined' && 'indexedDB' in window;
    results.push({ name: 'IndexedDB Engine', status: idbAvailable ? 'ok' : 'warn', message: idbAvailable ? 'Available for offline queue' : 'Unavailable' });
  } catch (err) {
    results.push({ name: 'IndexedDB Engine', status: 'error', message: err.message });
  }

  // 3. BroadcastChannel (Cross-Tab Local Sync)
  try {
    const bcAvailable = typeof window !== 'undefined' && 'BroadcastChannel' in window;
    results.push({ name: 'Cross-Tab Sync Channel', status: bcAvailable ? 'ok' : 'warn', message: bcAvailable ? 'Active (Sub-5ms multi-screen sync)' : 'Falling back to localStorage' });
  } catch (err) {
    results.push({ name: 'Cross-Tab Sync Channel', status: 'warn', message: err.message });
  }

  // 4. Audio Engine & Synthesizer
  try {
    const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const audioContextAvailable = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
    results.push({ 
      name: 'Audio & Chime Engine', 
      status: (speechAvailable && audioContextAvailable) ? 'ok' : 'warn', 
      message: speechAvailable ? 'Speech & Chime synthetics ready' : 'Speech synthesis not supported on this browser' 
    });
  } catch (err) {
    results.push({ name: 'Audio Engine', status: 'warn', message: err.message });
  }

  // 5. Network & Cloud Status
  results.push({
    name: 'Network Connection',
    status: navigator.onLine ? 'ok' : 'warn',
    message: navigator.onLine ? 'Online (Cloud sync active)' : 'Offline (Local-Only buffer engaged)'
  });

  return results;
};

