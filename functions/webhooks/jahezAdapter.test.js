import { describe, it, expect } from 'vitest';
import { verifySignature, normalize } from './jahezAdapter';

describe('jahezAdapter - verifySignature', () => {
  const apiKey = 'jahez-key-777';

  it('should verify signature successfully for matching headers', () => {
    const headers = { 'x-jahez-api-key': apiKey };
    expect(verifySignature(headers, apiKey)).toBe(true);
  });

  it('should verify signature with Bearer authorization header', () => {
    const headers = { 'authorization': `Bearer ${apiKey}` };
    expect(verifySignature(headers, apiKey)).toBe(true);
  });

  it('should fail verification if key does not match or is missing', () => {
    expect(verifySignature({ 'x-jahez-api-key': 'bad-key' }, apiKey)).toBe(false);
    expect(verifySignature({}, apiKey)).toBe(false);
  });
});

describe('jahezAdapter - normalize', () => {
  it('should normalize standard Jahez GCC orders', () => {
    const mockPayload = {
      order_id: 'JAH-883311',
      items: [
        {
          id: 'item-shawarma',
          name: 'Chicken Shawarma Plate',
          quantity: 2,
          price: 28.0,
          notes: 'Extra garlic sauce'
        }
      ],
      subtotal: 56.0,
      vat: 8.4, // 15% KSA VAT
      total: 64.4,
      currency: 'SAR',
      customer: {
        name: 'Abdullah Al-Dosari',
        mobile: '+966 50 123 4567'
      },
      delivery_address: 'King Fahd Rd, Riyadh, Saudi Arabia',
      notes: 'Ring doorbell twice'
    };

    const result = normalize(mockPayload);
    expect(result.source).toBe('jahez');
    expect(result.externalOrderId).toBe('JAH-883311');
    expect(result.subtotal).toBe(56.0);
    expect(result.total).toBe(64.4);
    expect(result.currency).toBe('SAR');
    expect(result.customerName).toBe('Abdullah Al-Dosari');
    expect(result.platformCommission).toBe(20);
    expect(result.items[0].name).toBe('Chicken Shawarma Plate');
  });

  it('should fallback to safe defaults on minimal input', () => {
    const result = normalize({});
    expect(result.customerName).toBe('Jahez Customer');
    expect(result.source).toBe('jahez');
    expect(result.currency).toBe('SAR');
  });
});
