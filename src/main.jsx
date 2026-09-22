import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import ErrorBoundary from './components/shared/ErrorBoundary.jsx';
import { logError } from './utils/logger.js';

// Register service worker immediately so Android PWA installability criteria
// are met immediately. registerType='prompt' in vite.config.js ensures
// onNeedRefresh is triggered gracefully without disrupting active orders.
if (typeof window !== 'undefined') {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A new SW version is available. Show a non-intrusive toast so staff
      // can choose when to refresh (e.g. between shifts, not mid-order).
      if (typeof window.__swUpdateReady === 'function') {
        window.__swUpdateReady();
      }
    },
    onOfflineReady() {
      console.info('[SW] App is ready for offline use.');
    },
  });
  window.__updateSW = updateSW;


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
