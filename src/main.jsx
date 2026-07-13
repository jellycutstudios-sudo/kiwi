import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import ErrorBoundary from './components/shared/ErrorBoundary.jsx';
import { logError } from './utils/logger.js';

// Register service worker for offline capability.
// registerType='prompt' in vite.config.js — we must NOT pass immediate:true here
// or it defeats the prompt and silently auto-updates (breaking active POS sessions).
if (typeof window !== 'undefined') {
  registerSW({
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
