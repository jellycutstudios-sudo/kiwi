export const safeStorage = {
  getItem: (key) => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key) => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } catch {}
  },
  clear: () => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.clear();
    } catch {}
  }
};

export default safeStorage;
