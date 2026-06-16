import { describe, it, expect } from 'vitest';
import { formatCurrency, getCurrencySymbol, CURRENCY_OPTIONS } from './formatCurrency';

// Helper to normalize any non-breaking spaces to standard space for reliable testing across node versions
const normalizeSpaces = (str) => str.replace(/[\u00a0\u2009\u202f]/g, ' ');

describe('formatCurrency', () => {
  it('should format INR currency by default', () => {
    const formatted = formatCurrency(1500.50);
    const normalized = normalizeSpaces(formatted);
    // INR can format as ₹ 1,500.50 or ₹1,500.50 depending on locale settings
    expect(normalized).toContain('₹');
    expect(normalized).toContain('1,500.50');
  });

  it('should format USD currency correctly', () => {
    const formatted = formatCurrency(99.99, 'USD');
    const normalized = normalizeSpaces(formatted);
    expect(normalized).toContain('$');
    expect(normalized).toContain('99.99');
  });

  it('should format AED currency correctly', () => {
    const formatted = formatCurrency(250.75, 'AED');
    const normalized = normalizeSpaces(formatted);
    // AED in ar-AE displays as "د.إ.‏ 250.75" or similar, or "AED 250.75" depending on runtime
    expect(normalized).toMatch(/(AED|د\.إ\.)/);
    expect(normalized).toContain('250.75');
  });

  it('should fallback to INR when currency code is unrecognized', () => {
    const formatted = formatCurrency(500, 'XYZ');
    const normalized = normalizeSpaces(formatted);
    expect(normalized).toContain('₹');
    expect(normalized).toContain('500.00');
  });
});

describe('getCurrencySymbol', () => {
  it('should return correct symbols for known currencies', () => {
    expect(getCurrencySymbol('INR')).toBe('₹');
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('AED')).toBe('AED');
  });

  it('should fallback to input currency string if symbol is unrecognized', () => {
    expect(getCurrencySymbol('XYZ')).toBe('XYZ');
    expect(getCurrencySymbol(undefined)).toBe('₹');
  });
});

describe('CURRENCY_OPTIONS', () => {
  it('should expose a mapped list of currency options', () => {
    expect(CURRENCY_OPTIONS).toBeInstanceOf(Array);
    expect(CURRENCY_OPTIONS.length).toBeGreaterThan(0);
    expect(CURRENCY_OPTIONS[0]).toHaveProperty('code');
    expect(CURRENCY_OPTIONS[0]).toHaveProperty('label');
    
    const inrOption = CURRENCY_OPTIONS.find(o => o.code === 'INR');
    expect(inrOption).toBeDefined();
    expect(inrOption.label).toContain('₹');
  });
});
