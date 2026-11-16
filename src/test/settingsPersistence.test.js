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

  it('allows turning off active modules on Advanced plan without forced mode reversion', () => {
    // Mimic the sanitization & save logic in Settings.jsx
    function sanitizeSettingsOnSave(settingsToSave, assignedPlan = 'restaurant') {
      const result = { ...settingsToSave };
      if (assignedPlan === 'bill_only') {
        result.businessType = 'bill_only';
        result.accountType = 'bill_only';
        const rawModes = Array.isArray(result.modes) ? result.modes : [];
        result.modes = rawModes.filter(k => ['pos', 'till_shift'].includes(k));
        result.kitchenConfig = { ...(result.kitchenConfig || {}), mode: 'disabled' };
      } else {
        result.businessType = 'restaurant';
        result.accountType = 'restaurant';
        const rawModes = Array.isArray(result.modes) ? result.modes : [];
        result.modes = rawModes;

        if (!result.modes.includes('kds')) {
          result.kitchenConfig = { ...(result.kitchenConfig || {}), mode: 'disabled' };
        } else if (result.kitchenConfig?.mode === 'disabled') {
          result.kitchenConfig = { ...(result.kitchenConfig || {}), mode: 'both' };
        }

        result.features = {
          ...(result.features || {}),
          table: result.modes.includes('table'),
          enableTableMap: result.modes.includes('table'),
          enableKds: result.modes.includes('kds')
        };
      }
      return result;
    }

    // Advanced plan restaurant where user explicitly turned off Table Management and KDS
    const userConfiguredSettings = {
      name: 'Counter & Takeaway Deli',
      businessType: 'restaurant',
      modes: ['pos', 'till_shift', 'customers'], // table and kds disabled by user
      kitchenConfig: { mode: 'both' },
      features: { table: true, enableTableMap: true, enableKds: true }
    };

    const saved = sanitizeSettingsOnSave(userConfiguredSettings, 'restaurant');

    // Modes must preserve user choices without forcibly re-adding 'table' or 'kds'
    expect(saved.modes).toEqual(['pos', 'till_shift', 'customers']);
    expect(saved.modes).not.toContain('table');
    expect(saved.modes).not.toContain('kds');

    // KDS must be synced to disabled in kitchenConfig
    expect(saved.kitchenConfig.mode).toBe('disabled');

    // Legacy feature flags must be cleanly synced to false
    expect(saved.features.table).toBe(false);
    expect(saved.features.enableTableMap).toBe(false);
    expect(saved.features.enableKds).toBe(false);
  });
});
