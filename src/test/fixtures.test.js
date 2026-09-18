import { describe, it, expect } from 'vitest';
import {
  mockRestaurant,
  mockCategories,
  mockTables,
  mockOrders,
  mockShift,
  mockWebhooks,
} from './fixtures/index.js';
import { computeTax } from '../utils/taxUtils.js';
import { formatCurrency } from '../utils/formatCurrency.js';

describe('Test Data Fixtures', () => {
  it('loads valid restaurant configuration', () => {
    expect(mockRestaurant.id).toBeDefined();
    expect(mockRestaurant.currency).toBe('INR');
    expect(mockRestaurant.modes).toContain('dine-in');
  });

  it('verifies menu categories and modifier structure', () => {
    expect(mockCategories.length).toBeGreaterThanOrEqual(2);
    const nachos = mockCategories[0].items.find(i => i.id === 'item_nachos');
    expect(nachos.modifiers.length).toBe(2);
    expect(nachos.modifiers[0].priceAdd).toBe(50);
  });

  it('validates precomputed tax calculations for sample orders', () => {
    const order = mockOrders.dineInSimple;
    const taxResult = computeTax(order.subtotal, mockRestaurant.taxConfig);
    expect(taxResult.taxTotal).toBe(47.5);
    expect(taxResult.lines.length).toBe(2);
  });

  it('validates currency formatting for fixtures across multiple locales', () => {
    expect(formatCurrency(mockOrders.dineInSimple.total, 'INR')).toContain('1,095');
    expect(formatCurrency(50, 'USD')).toContain('50');
  });

  it('ensures all delivery webhooks adhere to standard payload schemas', () => {
    expect(mockWebhooks.zomato.order_id).toBeDefined();
    expect(mockWebhooks.swiggy.order_id).toBeDefined();
    expect(mockWebhooks.uberEats.id).toBeDefined();
    expect(mockWebhooks.deliveroo.id).toBeDefined();
  });
});
