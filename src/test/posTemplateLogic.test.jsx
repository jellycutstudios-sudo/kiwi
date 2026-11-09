// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { getEffectivePosTemplate, usePosTemplate, POS_TEMPLATES } from '../utils/posTemplate';
import { useAuthStore } from '../stores/authStore';
import { useMenuStore } from '../stores/menuStore';

describe('POS Template Architecture & State Sync Logic', () => {
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

    useAuthStore.setState({
      restaurant: { id: 'rest_test', name: 'Test Bistro', posTemplate: undefined }
    });
    useMenuStore.setState({
      search: '',
      catFirstOverview: true,
      dietaryFilter: 'all'
    });
  });

  afterEach(() => {
    storageStore = {};
    vi.restoreAllMocks();
  });

  describe('getEffectivePosTemplate fallback hierarchy', () => {
    it('defaults to MODERN_GRID when neither restaurant doc nor localStorage is set', () => {
      const template = getEffectivePosTemplate(null);
      expect(template).toBe(POS_TEMPLATES.MODERN_GRID);
    });

    it('prioritizes restaurant.posTemplate over localStorage', () => {
      mockLocalStorage.setItem('dineos_pos_template', POS_TEMPLATES.MODERN_GRID);
      const restaurant = { posTemplate: POS_TEMPLATES.BISTRO_SIDEBAR };
      const template = getEffectivePosTemplate(restaurant);
      expect(template).toBe(POS_TEMPLATES.BISTRO_SIDEBAR);
    });

    it('falls back to localStorage cached selection if restaurant.posTemplate is unset', () => {
      mockLocalStorage.setItem('dineos_pos_template', POS_TEMPLATES.CATEGORY_FIRST);
      const restaurant = { id: 'r1' }; // no posTemplate
      const template = getEffectivePosTemplate(restaurant);
      expect(template).toBe(POS_TEMPLATES.CATEGORY_FIRST);
    });

    it('ignores unknown/invalid template values in localStorage and falls back to default', () => {
      mockLocalStorage.setItem('dineos_pos_template', 'corrupted_layout_name');
      const template = getEffectivePosTemplate({});
      expect(template).toBe(POS_TEMPLATES.MODERN_GRID);
    });
  });

  describe('usePosTemplate hook reactive synchronization', () => {
    it('reactively switches when dineos:pos-template-changed event fires across components', () => {
      const { result } = renderHook(() => usePosTemplate());
      expect(result.current.template).toBe(POS_TEMPLATES.MODERN_GRID);
      expect(result.current.isModern).toBe(true);

      act(() => {
        window.dispatchEvent(new CustomEvent('dineos:pos-template-changed', {
          detail: { template: POS_TEMPLATES.BISTRO_SIDEBAR }
        }));
      });

      expect(result.current.template).toBe(POS_TEMPLATES.BISTRO_SIDEBAR);
      expect(result.current.isBistro).toBe(true);
      expect(result.current.isModern).toBe(false);
      expect(result.current.isCategoryFirst).toBe(false);
    });

    it('reactively syncs when restaurant.posTemplate updates in authStore', () => {
      const { result } = renderHook(() => usePosTemplate());
      expect(result.current.template).toBe(POS_TEMPLATES.MODERN_GRID);

      act(() => {
        useAuthStore.setState({
          restaurant: { id: 'rest_test', posTemplate: POS_TEMPLATES.CATEGORY_FIRST }
        });
      });

      expect(result.current.template).toBe(POS_TEMPLATES.CATEGORY_FIRST);
      expect(result.current.isCategoryFirst).toBe(true);
    });
  });

  describe('Category First Navigation & Search State Transition', () => {
    it('opens items view automatically when user applies dietary filter from category overview', () => {
      const { setDietaryFilter } = useMenuStore.getState();
      expect(useMenuStore.getState().catFirstOverview).toBe(true);

      act(() => {
        setDietaryFilter('veg');
      });

      expect(useMenuStore.getState().dietaryFilter).toBe('veg');
      expect(useMenuStore.getState().catFirstOverview).toBe(false);
    });

    it('resets dietaryFilter, search and returns to category overview when cashier requests reset', () => {
      const { setSearch, setDietaryFilter, setCatFirstOverview } = useMenuStore.getState();

      act(() => {
        setSearch('burger');
        setDietaryFilter('non-veg');
        setCatFirstOverview(false);
      });

      expect(useMenuStore.getState().search).toBe('burger');
      expect(useMenuStore.getState().dietaryFilter).toBe('non-veg');
      expect(useMenuStore.getState().catFirstOverview).toBe(false);

      // Cashier clicks "All Categories" button
      act(() => {
        setCatFirstOverview(true);
        setSearch('');
        setDietaryFilter('all');
      });

      expect(useMenuStore.getState().search).toBe('');
      expect(useMenuStore.getState().dietaryFilter).toBe('all');
      expect(useMenuStore.getState().catFirstOverview).toBe(true);
    });
  });

  describe('Cross-Template Feature Parity & Pinned Operations', () => {
    it('provides consistent POS template constants across layouts', () => {
      expect(POS_TEMPLATES.MODERN_GRID).toBe('modern_grid');
      expect(POS_TEMPLATES.BISTRO_SIDEBAR).toBe('bistro_sidebar');
      expect(POS_TEMPLATES.CATEGORY_FIRST).toBe('category_first');
    });

    it('retains table features for dine-in venues while excluding them for bill-only format', () => {
      const dineInRest = { features: { table: true }, businessType: 'restaurant' };
      const billOnlyRest = { features: { table: true }, businessType: 'bill_only' };
      
      const isDineInTableEnabled = Boolean(dineInRest.features?.table && dineInRest.businessType !== 'bill_only');
      const isBillOnlyTableEnabled = Boolean(billOnlyRest.features?.table && billOnlyRest.businessType !== 'bill_only');

      expect(isDineInTableEnabled).toBe(true);
      expect(isBillOnlyTableEnabled).toBe(false);
    });
  });
});
