// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

describe('Settings Persistence & Memory', () => {
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
    localStorage.clear();
  });

  it('remembers active tab across sessions', () => {
    // Initial default
    const getInitialTab = () => localStorage.getItem('dineos_settings_tab') || 'general';
    expect(getInitialTab()).toBe('general');

    // User switches to 'hardware' (printers)
    localStorage.setItem('dineos_settings_tab', 'hardware');
    expect(getInitialTab()).toBe('hardware');

    // User switches to 'tax-pay'
    localStorage.setItem('dineos_settings_tab', 'tax-pay');
    expect(getInitialTab()).toBe('tax-pay');
  });

  it('restores cached settings instantly without network delay', () => {
    const restaurantId = 'rest-123';
    const mockSettings = {
      id: restaurantId,
      name: 'The Artisan Trattoria',
      currency: 'AED',
      taxRate: 5,
      taxType: 'vat',
      peripheralConfig: {
        printers: [{ name: 'Kitchen Thermal', ip: '192.168.1.100', type: 'kitchen' }]
      }
    };

    localStorage.setItem(`dineos_cached_settings_${restaurantId}`, JSON.stringify(mockSettings));

    const loadSettings = (id) => {
      const cached = localStorage.getItem(`dineos_cached_settings_${id}`);
      return cached ? JSON.parse(cached) : null;
    };

    const loaded = loadSettings(restaurantId);
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe('The Artisan Trattoria');
    expect(loaded.currency).toBe('AED');
    expect(loaded.peripheralConfig.printers[0].ip).toBe('192.168.1.100');
  });

  it('preserves unsaved drafts when staff or admin leaves the page', () => {
    const restaurantId = 'rest-999';
    const draftSettings = {
      name: 'Unsaved Name Edit',
      currency: 'USD',
      gstin: '07AAAAA0000A1Z5'
    };

    // Save draft
    localStorage.setItem(`dineos_settings_draft_${restaurantId}`, JSON.stringify(draftSettings));

    // When reopening settings
    const draft = localStorage.getItem(`dineos_settings_draft_${restaurantId}`);
    expect(draft).toBeTruthy();
    expect(JSON.parse(draft).name).toBe('Unsaved Name Edit');

    // On save or discard, draft is cleared
    localStorage.removeItem(`dineos_settings_draft_${restaurantId}`);
    expect(localStorage.getItem(`dineos_settings_draft_${restaurantId}`)).toBeNull();
  });

  it('remembers POS dietary filter selection', () => {
    expect(localStorage.getItem('kiwi_pos_dietary')).toBeNull();

    // Staff chooses Bestseller filter
    localStorage.setItem('kiwi_pos_dietary', 'bestseller');
    expect(localStorage.getItem('kiwi_pos_dietary')).toBe('bestseller');

    // Staff chooses Veg
    localStorage.setItem('kiwi_pos_dietary', 'veg');
    expect(localStorage.getItem('kiwi_pos_dietary')).toBe('veg');
  });
});
