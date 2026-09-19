import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useWakeLock - Keeps the screen awake for POS terminals and Kitchen displays (KDS).
 * Handles visibility changes and automatically recovers wake lock when tab is focused.
 */
export function useWakeLock(enabled = true) {
  const wakeLockRef = useRef(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator);
  }, []);

  const requestLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        const lock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = lock;
        setIsLocked(true);

        lock.addEventListener('release', () => {
          wakeLockRef.current = null;
          setIsLocked(false);
        });
      }
    } catch {
      // Ignore wake lock rejection (e.g. low battery, background tab)
      setIsLocked(false);
    }
  }, []);

  const releaseLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore
      }
      wakeLockRef.current = null;
      setIsLocked(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      releaseLock();
      return;
    }

    requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestLock();
      } else {
        setIsLocked(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseLock();
    };
  }, [enabled, requestLock, releaseLock]);

  return { isLocked, isSupported, requestLock, releaseLock };
}
