// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isDesktopOrStandalone } from '../utils/deviceMode';

describe('Device Mode & Standalone Detection', () => {
  let storageStore = {};

  const mockLocalStorage = {
    getItem: (key) => storageStore[key] || null,
    setItem: (key, val) => { storageStore[key] = String(val); },
    removeItem: (key) => { delete storageStore[key]; },
    clear: () => { storageStore = {}; },
  };

  beforeEach(() => {
    storageStore = {};
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
    globalThis.localStorage = mockLocalStorage;

    delete window.electron;
    delete window.__TAURI__;
    delete window.isDesktopApp;
  });

  afterEach(() => {
    delete window.electron;
    delete window.__TAURI__;
    delete window.isDesktopApp;
    storageStore = {};
    vi.restoreAllMocks();
  });

  it('detects Electron desktop environment', () => {
    window.electron = { isDesktop: true };
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects Tauri desktop environment', () => {
    window.__TAURI__ = {};
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects explicit desktop app flag', () => {
    window.isDesktopApp = true;
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects standalone PWA mode via display-mode matchMedia', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects stored POS app terminal preference in localStorage', () => {
    mockLocalStorage.setItem('dineos_pos_app_mode', 'true');
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('returns false for standard web browsers on marketing landing page', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isDesktopOrStandalone()).toBe(false);
  });
});
