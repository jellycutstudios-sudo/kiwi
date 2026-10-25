import { describe, it, expect } from 'vitest';
import { computeTax, computeOrderTaxes, resolveItemTaxRule } from './taxUtils';

describe('computeTax', () => {
  it('should return default none tax configuration if config is empty', () => {
    const result = computeTax(100);
    expect(result).toEqual({
      type: 'none',
      lines: [],
      taxTotal: 0,
      total: 100,
    });
  });

  it('should compute flat VAT correctly', () => {
    const result = computeTax(200, { type: 'vat', rate: 15 });
    expect(result.type).toBe('vat');
    expect(result.taxTotal).toBe(30);
    expect(result.total).toBe(230);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toEqual({ label: 'VAT (15%)', amount: 30 });
  });

  it('should compute India GST (CGST + SGST) with default split (half/half)', () => {
    const result = computeTax(1000, { type: 'gst', rate: 18 });
    expect(result.type).toBe('gst');
    expect(result.taxTotal).toBe(180);
    expect(result.total).toBe(1180);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({ label: 'CGST (9%)', amount: 90 });
    expect(result.lines[1]).toEqual({ label: 'SGST (9%)', amount: 90 });
  });

  it('should compute India GST with custom cgst and sgst overrides', () => {
    const result = computeTax(1000, { type: 'gst', rate: 18, cgst: 5, sgst: 5 });
    expect(result.type).toBe('gst');
    expect(result.taxTotal).toBe(100);
    expect(result.total).toBe(1100);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({ label: 'CGST (5%)', amount: 50 });
    expect(result.lines[1]).toEqual({ label: 'SGST (5%)', amount: 50 });
  });

  it('should compute flat rate correctly', () => {
    const result = computeTax(500, { type: 'flat', rate: 12 });
    expect(result.type).toBe('flat');
    expect(result.taxTotal).toBe(60);
    expect(result.total).toBe(560);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toEqual({ label: 'Tax (12%)', amount: 60 });
  });

  it('should fallback to none for invalid tax types', () => {
    const result = computeTax(150, { type: 'unknown_type', rate: 10 });
    expect(result.type).toBe('none');
    expect(result.taxTotal).toBe(0);
    expect(result.total).toBe(150);
  });

  it('should compute tax-inclusive GST correctly', () => {
    const result = computeTax(118, { type: 'gst', rate: 18, mode: 'inclusive' });
    expect(result.type).toBe('gst');
    expect(result.mode).toBe('inclusive');
    expect(result.total).toBe(118);
    expect(result.baseSubtotal).toBe(100);
    expect(result.taxTotal).toBe(18);
    expect(result.lines).toEqual([
      { label: 'CGST (9%)', amount: 9 },
      { label: 'SGST (9%)', amount: 9 }
    ]);
  });

  it('should compute tax-inclusive VAT correctly', () => {
    const result = computeTax(105, { type: 'vat', rate: 5, mode: 'inclusive' });
    expect(result.type).toBe('vat');
    expect(result.mode).toBe('inclusive');
    expect(result.total).toBe(105);
    expect(result.baseSubtotal).toBe(100);
    expect(result.taxTotal).toBe(5);
  });
});

describe('computeOrderTaxes (Universal Inherited Engine)', () => {
  it('should resolve fallback inheritance: Item -> Category -> Store', () => {
    const storeConfig = { type: 'vat', rate: 15 };
    const category = { id: 'bakery', name: 'Bakery', taxRate: 0 };
    const item1 = { id: 'croissant', name: 'Croissant', price: 10, categoryId: 'bakery' };
    const item2 = { id: 'special_wine', name: 'Special Wine', price: 50, taxRate: 20 };
    const item3 = { id: 'pasta', name: 'Pasta', price: 30 }; // inherits store 15%

    const rule1 = resolveItemTaxRule(item1, category, storeConfig);
    expect(rule1.rate).toBe(0);
    expect(rule1.label).toBe('Zero-Rated (0%)');

    const rule2 = resolveItemTaxRule(item2, category, storeConfig);
    expect(rule2.rate).toBe(20);

    const rule3 = resolveItemTaxRule(item3, {}, storeConfig);
    expect(rule3.rate).toBe(15);
  });

  it('should compute mixed multi-tier line item taxes in 1 pass', () => {
    const storeConfig = { type: 'vat', rate: 20, mode: 'exclusive' };
    const categoriesMap = {
      bakery: { id: 'bakery', name: 'Bakery', taxRate: 0 }
    };
    const cart = [
      { id: '1', name: 'Steak', price: 50, qty: 1 }, // inherits 20% VAT = 10
      { id: '2', name: 'Bread', price: 10, qty: 2, categoryId: 'bakery' }, // inherits 0% Bakery = 0
      { id: '3', name: 'Luxury Cigar', price: 40, qty: 1, taxRate: 50 } // override 50% = 20
    ];

    const result = computeOrderTaxes(cart, categoriesMap, storeConfig);

    expect(result.taxTotal).toBe(30); // 10 (Steak) + 0 (Bread) + 20 (Cigar) = 30
    expect(result.total).toBe(140); // 50 + 20 + 40 + 30 = 140
    expect(result.lines).toHaveLength(3);
    expect(result.lines).toEqual(expect.arrayContaining([
      { label: 'VAT (20%)', amount: 10 },
      { label: 'Zero-Rated (0%)', amount: 0 },
      { label: 'VAT (50%)', amount: 20 }
    ]));
  });

  it('should respect takeaway reduced tax rule when orderType is takeaway', () => {
    const storeConfig = {
      type: 'vat',
      rate: 20, // 20% dine in
      takeawayRate: 7, // 7% reduced takeaway
      takeawayLabel: 'Takeaway VAT (7%)',
      mode: 'exclusive'
    };
    const cart = [{ id: '1', name: 'Meal', price: 100, qty: 1 }];

    const dineInResult = computeOrderTaxes(cart, {}, storeConfig, { orderType: 'dine-in' });
    expect(dineInResult.taxTotal).toBe(20);

    const takeawayResult = computeOrderTaxes(cart, {}, storeConfig, { orderType: 'takeaway' });
    expect(takeawayResult.taxTotal).toBe(7);
    expect(takeawayResult.lines[0].label).toBe('Takeaway VAT (7%)');
  });
});
