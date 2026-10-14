/**
 * Web Haptics Utility
 * Provides subtle tactile feedback on mobile & tablet touch devices (Android, Chrome, PWAs).
 * Gracefully no-ops on desktop or unsupported browsers.
 */

export const triggerHaptic = (pattern = 10) => {
  if (typeof window !== 'undefined' && 'navigator' in window && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration permissions/device limits
    }
  }
};

export const triggerHapticSuccess = () => {
  triggerHaptic([10, 40, 15]);
};

export const triggerHapticError = () => {
  triggerHaptic([25, 50, 25]);
};

export default triggerHaptic;
