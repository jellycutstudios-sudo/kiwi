import { create } from 'zustand';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem('dineos_theme');
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      return saved;
    }
  } catch (e) {
    // LocalStorage access may fail in restricted iframes
  }
  return 'dark'; // Default to DineOS obsidian dark
}

function resolveEffectiveTheme(theme) {
  if (theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'light' ? 'light' : 'dark';
}

function applyToDOM(theme) {
  if (typeof document === 'undefined') return;
  const effective = resolveEffectiveTheme(theme);
  const root = document.documentElement;

  // Set HTML attributes & classes for CSS selectors
  root.setAttribute('data-theme', effective);
  if (effective === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }

  // Update PWA / Mobile theme-color meta tag
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', effective === 'dark' ? '#0c0d11' : '#ffffff');
  }
}

// Initial application on script evaluation
const initialTheme = getInitialTheme();
applyToDOM(initialTheme);

export const useThemeStore = create((set, get) => ({
  theme: initialTheme,
  effectiveTheme: resolveEffectiveTheme(initialTheme),

  setTheme: (newTheme) => {
    try {
      localStorage.setItem('dineos_theme', newTheme);
    } catch (e) {}

    applyToDOM(newTheme);
    set({
      theme: newTheme,
      effectiveTheme: resolveEffectiveTheme(newTheme),
    });
  },

  toggleTheme: () => {
    const current = get().effectiveTheme;
    const next = current === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));

// Listen for OS dark mode changes if user chose 'system'
if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleMediaChange = () => {
    const current = useThemeStore.getState().theme;
    if (current === 'system') {
      applyToDOM('system');
      useThemeStore.setState({
        effectiveTheme: resolveEffectiveTheme('system'),
      });
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleMediaChange);
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(handleMediaChange);
  }
}
