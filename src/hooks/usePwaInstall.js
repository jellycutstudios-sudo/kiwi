import { useState, useEffect, useCallback } from 'react';

// Global state to capture beforeinstallprompt regardless of which component mounts first
let globalDeferredPrompt = null;
const promptListeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent browser default mini-infobar on some older engines to allow customized app prompt
    e.preventDefault();
    globalDeferredPrompt = e;
    promptListeners.forEach(listener => listener(e));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    promptListeners.forEach(listener => listener(null));
  });
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(globalDeferredPrompt);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (installed PWA)
    const checkStandalone = () => {
      const isWindowStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
      const isNavStandalone = window.navigator?.standalone === true;
      return Boolean(isWindowStandalone || isNavStandalone);
    };

    setIsStandalone(checkStandalone());

    // Check iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !window.MSStream;
    setIsIOS(isIosDevice);

    const onPromptChange = (newPrompt) => {
      setDeferredPrompt(newPrompt);
    };

    promptListeners.add(onPromptChange);
    if (globalDeferredPrompt && !deferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
    }

    return () => {
      promptListeners.delete(onPromptChange);
    };
  }, [deferredPrompt]);

  const promptInstall = useCallback(async () => {
    const activePrompt = deferredPrompt || globalDeferredPrompt;
    if (!activePrompt) return false;
    try {
      await activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      return outcome === 'accepted';
    } catch (err) {
      console.warn('[PWA promptInstall Error]', err);
      return false;
    }
  }, [deferredPrompt]);

  return {
    canInstall: Boolean(deferredPrompt || globalDeferredPrompt),
    isStandalone,
    isIOS: isIOS && !isStandalone,
    promptInstall,
  };
}

