import { vi, describe, it, expect } from 'vitest';

// Mock firebase-admin since syncMenu.js requires it at the root
vi.mock('firebase-admin', () => ({
  default: {
    firestore: vi.fn(),
  },
  firestore: vi.fn(),
}));

import {
  formatForUberEats,
  formatForZomato,
  formatForSwiggy,
  formatForDeliveroo
} from './syncMenu';

const mockMenu = [
  {
    id: 'cat-1',
    name: 'Starters',
    items: [
      { id: 'item-1', name: 'Spring Rolls', price: 10, description: 'Crispy spring rolls', available: true },
      { id: 'item-2', name: 'Paneer Tikka', price: 15, available: true },
    ]
  },
  {
    id: 'cat-2',
    name: 'Mains',
    items: [
      { id: 'item-3', name: 'Butter Chicken', price: 25, available: true },
    ]
  }
];

describe('syncMenu - Catalog formatters', () => {
  describe('formatForUberEats', () => {
    it('should format catalog correctly and convert prices to cents', () => {
      const overrides = {};
      const result = formatForUberEats(mockMenu, overrides);
      
      const { catalog } = result;
      expect(catalog.categories).toHaveLength(2);
      expect(catalog.items).toHaveLength(3);

      expect(catalog.categories[0]).toEqual({
        id: 'cat-1',
        title: { translations: { en: 'Starters' } },
        entities: [
          { id: 'item-1', type: 'ITEM' },
          { id: 'item-2', type: 'ITEM' }
        ]
      });

      expect(catalog.items[0]).toEqual({
        id: 'item-1',
        title: { translations: { en: 'Spring Rolls' } },
        description: { translations: { en: 'Crispy spring rolls' } },
        price_info: { price: 1000, currency_code: 'INR' } // 10 * 100 = 1000 cents
      });
    });

    it('should filter out items marked unavailable in platform overrides', () => {
      const overrides = {
        'item-2': { available: false }
      };
      const result = formatForUberEats(mockMenu, overrides);
      
      // item-2 should be excluded
      expect(result.catalog.items).toHaveLength(2);
      expect(result.catalog.items.map(i => i.id)).toEqual(['item-1', 'item-3']);
      expect(result.catalog.categories[0].entities).toHaveLength(1);
      expect(result.catalog.categories[0].entities[0].id).toBe('item-1');
    });
  });

  describe('formatForZomato', () => {
    it('should format categories and items correctly', () => {
      const overrides = {};
      const result = formatForZomato(mockMenu, overrides);

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].category_id).toBe('cat-1');
      expect(result.categories[0].category_name).toBe('Starters');
      expect(result.categories[0].items).toHaveLength(2);
      expect(result.categories[0].items[0]).toEqual({
        item_id: 'item-1',
        name: 'Spring Rolls',
        price: 10,
        description: 'Crispy spring rolls',
        in_stock: true
      });
    });

    it('should respect overrides when generating Zomato schema', () => {
      const overrides = {
        'item-1': { available: false }
      };
      const result = formatForZomato(mockMenu, overrides);
      expect(result.categories[0].items).toHaveLength(1);
      expect(result.categories[0].items[0].item_id).toBe('item-2');
    });
  });

  describe('formatForSwiggy', () => {
    it('should format categories and items correctly', () => {
      const overrides = {};
      const result = formatForSwiggy(mockMenu, overrides);

      expect(result.menu.categories).toHaveLength(2);
      expect(result.menu.categories[0].items).toHaveLength(2);
      expect(result.menu.categories[0].items[0]).toEqual({
        id: 'item-1',
        name: 'Spring Rolls',
        price: 10,
        description: 'Crispy spring rolls',
        status: 'available'
      });
    });

    it('should respect overrides when generating Swiggy schema', () => {
      const overrides = {
        'item-2': { available: false }
      };
      const result = formatForSwiggy(mockMenu, overrides);
      expect(result.menu.categories[0].items).toHaveLength(1);
    });
  });

  describe('formatForDeliveroo', () => {
    it('should format categories and items correctly', () => {
      const overrides = {};
      const result = formatForDeliveroo(mockMenu, overrides);

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].items).toHaveLength(2);
      expect(result.categories[0].items[0]).toEqual({
        id: 'item-1',
        name: 'Spring Rolls',
        price: 10,
        description: 'Crispy spring rolls',
        available: true
      });
    });

    it('should respect overrides when generating Deliveroo schema', () => {
      const overrides = {
        'item-1': { available: false }
      };
      const result = formatForDeliveroo(mockMenu, overrides);
      expect(result.categories[0].items).toHaveLength(1);
    });
  });
});
