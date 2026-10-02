import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import ErrorBoundary from './components/shared/ErrorBoundary.jsx';
import { logError } from './utils/logger.js';

import { useUpdateStore } from './stores/updateStore.js';

// Register service worker immediately so Android PWA installability criteria
// are met immediately. registerType='prompt' in vite.config.js ensures
// onNeedRefresh is triggered gracefully without disrupting active orders.
if (typeof window !== 'undefined') {
  // In development, clear any stale service workers/caches that prevent HMR/live updates
  if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    });
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
  } else {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Mark global update store so UI buttons and indicators light up across all devices
        useUpdateStore.getState().setHasUpdate(true);

        // Trigger toast if AppShell listener is attached
        if (typeof window.__swUpdateReady === 'function') {
          window.__swUpdateReady();
        }
      },
      onOfflineReady() {
        console.info('[SW] App is ready for offline use.');
      },
      onRegisteredSW(swUrl, registration) {
        if (registration) {
          window.__swRegistration = registration;

          // Proactively check for new versions every 10 minutes
          setInterval(() => {
            registration.update().catch(() => {});
          }, 10 * 60 * 1000);
        }
      }
    });
    window.__updateSW = updateSW;

    // Check for updates when app tab regains focus or visibility
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && window.__swRegistration) {
        window.__swRegistration.update().catch(() => {});
      }
    });

    window.addEventListener('focus', () => {
      if (window.__swRegistration) {
        window.__swRegistration.update().catch(() => {});
      }
    });

    window.addEventListener('online', () => {
      if (window.__swRegistration) {
        window.__swRegistration.update().catch(() => {});
      }
    });
  }

  // Request persistent storage so the browser/OS never purges offline IndexedDB & cache under disk pressure
  if ('storage' in navigator && 'persist' in navigator.storage) {
    navigator.storage.persist().catch(() => {});
  }

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, { context: 'Unhandled Promise Rejection' });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
