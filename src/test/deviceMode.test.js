// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isDesktopOrStandalone, isPwa, isDesktopApp } from '../utils/deviceMode';

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
    delete window.navigator.standalone;
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    delete window.electron;
    delete window.__TAURI__;
    delete window.isDesktopApp;
    delete window.navigator.standalone;
    storageStore = {};
    vi.restoreAllMocks();
  });

  it('detects Electron desktop environment', () => {
    window.electron = { isDesktop: true };
    expect(isDesktopApp()).toBe(true);
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects Tauri desktop environment', () => {
    window.__TAURI__ = {};
    expect(isDesktopApp()).toBe(true);
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects explicit desktop app flag', () => {
    window.isDesktopApp = true;
    expect(isDesktopApp()).toBe(true);
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects standalone PWA mode via display-mode: standalone', () => {
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

    expect(isPwa()).toBe(true);
    expect(isDesktopOrStandalone()).toBe(true);
    expect(mockLocalStorage.getItem('dineos_pwa_mode')).toBe('true');
  });

  it('detects standalone PWA mode via display-mode: window-controls-overlay and minimal-ui', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(display-mode: window-controls-overlay)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isPwa()).toBe(true);
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects iOS Safari Add to Home Screen via navigator.standalone', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }));
    window.navigator.standalone = true;

    expect(isPwa()).toBe(true);
    expect(isDesktopOrStandalone()).toBe(true);
    expect(mockLocalStorage.getItem('dineos_pwa_mode')).toBe('true');
  });

  it('detects PWA launch via query params ?source=pwa and persists preference', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }));
    window.history.pushState({}, '', '/?source=pwa');

    expect(isPwa()).toBe(true);
    expect(isDesktopOrStandalone()).toBe(true);
    expect(mockLocalStorage.getItem('dineos_pwa_mode')).toBe('true');
  });

  it('detects previously stored dineos_pwa_mode in localStorage', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }));
    mockLocalStorage.setItem('dineos_pwa_mode', 'true');

    expect(isPwa()).toBe(true);
    expect(isDesktopOrStandalone()).toBe(true);
  });

  it('detects stored POS app terminal preference in localStorage', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }));
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

    expect(isDesktopApp()).toBe(false);
    expect(isPwa()).toBe(false);
    expect(isDesktopOrStandalone()).toBe(false);
  });
});
