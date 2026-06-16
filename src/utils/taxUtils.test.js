import { describe, it, expect } from 'vitest';
import { computeTax } from './taxUtils';

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
});
