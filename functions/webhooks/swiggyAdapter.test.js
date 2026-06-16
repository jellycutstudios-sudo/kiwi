import { describe, it, expect } from 'vitest';
import { verifySignature, normalize } from './swiggyAdapter';

describe('swiggyAdapter - verifySignature', () => {
  const apiKey = 'swiggy-key-555';

  it('should verify signature successfully for matching headers', () => {
    const headers = { 'x-swiggy-api-key': apiKey };
    expect(verifySignature(headers, apiKey)).toBe(true);
  });

  it('should fail verification if key does not match or is missing', () => {
    expect(verifySignature({ 'x-swiggy-api-key': 'wrong-key' }, apiKey)).toBe(false);
    expect(verifySignature({}, apiKey)).toBe(false);
  });
});

describe('swiggyAdapter - normalize', () => {
  it('should normalize standard Swiggy payloads correctly', () => {
    const mockPayload = {
      order_id: 'swiggy-order-888',
      cart: {
        items: [
          { menu_id: 'item-20', name: 'Paneer Wrap', quantity: 1, price: 150, notes: 'Less spicy' }
        ],
        charges: {
          subtotal: 150,
          tax: 7.5,
          total: 157.5,
          currency: 'INR'
        }
      },
      customer: {
        name: 'Amit Kumar',
        phone: '+919111111111',
        address: 'H-12, Green Park, Delhi'
      },
      instructions: 'Leave with guard',
      delivery_time: '20 mins'
    };

    const result = normalize(mockPayload);
    expect(result.source).toBe('swiggy');
    expect(result.externalOrderId).toBe('swiggy-order-888');
    expect(result.subtotal).toBe(150);
    expect(result.total).toBe(157.5);
    expect(result.customerName).toBe('Amit Kumar');
    expect(result.deliveryAddress).toBe('H-12, Green Park, Delhi');
    expect(result.items[0]).toEqual({
      id: 'item-20',
      name: 'Paneer Wrap',
      qty: 1,
      price: 150,
      notes: 'Less spicy'
    });
  });

  it('should fallback to defaults on minimal inputs', () => {
    const result = normalize({});
    expect(result.customerName).toBe('Swiggy Customer');
    expect(result.subtotal).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});
