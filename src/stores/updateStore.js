import { create } from 'zustand';

export const useUpdateStore = create((set) => ({
  hasUpdate: false,
  isUpdating: false,
  lastChecked: null,

  setHasUpdate: (hasUpdate) => set({ hasUpdate }),

  applyUpdate: () => {
    set({ isUpdating: true });
    if (typeof window !== 'undefined') {
      if (typeof window.__updateSW === 'function') {
        window.__updateSW(true);
      } else {
        window.location.reload();
      }
    }
  },

  checkForUpdates: async () => {
    if (typeof window !== 'undefined' && window.__swRegistration) {
      try {
        await window.__swRegistration.update();
        set({ lastChecked: Date.now() });
      } catch (err) {
        console.warn('[SW update check error]', err);
      }
    }
  }
}));
