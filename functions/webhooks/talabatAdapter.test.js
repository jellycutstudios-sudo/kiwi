import { describe, it, expect } from 'vitest';
import { verifySignature, normalize } from './talabatAdapter';

describe('talabatAdapter - verifySignature', () => {
  const apiKey = 'talabat-secret-key-123';

  it('should verify signature successfully with x-talabat-api-key', () => {
    const headers = { 'x-talabat-api-key': apiKey };
    expect(verifySignature(headers, apiKey)).toBe(true);
  });

  it('should verify signature with Bearer authorization header', () => {
    const headers = { 'authorization': `Bearer ${apiKey}` };
    expect(verifySignature(headers, apiKey)).toBe(true);
  });

  it('should fail verification if key does not match or is missing', () => {
    expect(verifySignature({ 'x-talabat-api-key': 'invalid-key' }, apiKey)).toBe(false);
    expect(verifySignature({}, apiKey)).toBe(false);
  });
});

describe('talabatAdapter - normalize', () => {
  it('should normalize standard Talabat orders for Qatar market', () => {
    const mockPayload = {
      order_id: 'TAL-987654',
      items: [
        {
          id: 'item-biryani-1',
          name: 'Chicken Dum Biryani',
          quantity: 2,
          price: 35.0,
          instructions: 'Extra spicy',
          options: [{ name: 'Raita', price: 5.0 }]
        }
      ],
      pricing: {
        subtotal: 70.0,
        tax: 0.0, // Qatar has 0% VAT
        delivery_fee: 10.0,
        total: 70.0,
        currency: 'QAR'
      },
      customer: {
        name: 'Mohammed Al-Kuwari',
        phone: '+974 5555 1234'
      },
      delivery: {
        address: 'Villa 12, West Bay, Doha, Qatar',
        expected_time: '25-35 mins'
      },
      special_instructions: 'Leave at gate guard'
    };

    const result = normalize(mockPayload);
    expect(result.source).toBe('talabat');
    expect(result.externalOrderId).toBe('TAL-987654');
    expect(result.subtotal).toBe(70.0);
    expect(result.total).toBe(70.0);
    expect(result.currency).toBe('QAR');
    expect(result.customerName).toBe('Mohammed Al-Kuwari');
    expect(result.deliveryAddress).toBe('Villa 12, West Bay, Doha, Qatar');
    expect(result.platformCommission).toBe(22);
    expect(result.items[0].name).toBe('Chicken Dum Biryani');
    expect(result.items[0].qty).toBe(2);
    expect(result.items[0].selectedModifiers[0].name).toBe('Raita');
  });

  it('should fallback to safe defaults on minimal input', () => {
    const result = normalize({});
    expect(result.customerName).toBe('Talabat Customer');
    expect(result.source).toBe('talabat');
    expect(result.currency).toBe('QAR');
    expect(result.status).toBe('pending');
  });
});
