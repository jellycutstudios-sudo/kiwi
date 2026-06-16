import { describe, it, expect } from 'vitest';
import { verifySignature, normalize } from './zomatoAdapter';

describe('zomatoAdapter - verifySignature', () => {
  const apiKey = 'zomato-key-123';

  it('should verify signature successfully for matching headers', () => {
    const headers = { 'x-zomato-api-key': apiKey };
    expect(verifySignature(headers, apiKey)).toBe(true);

    const authHeaders = { 'authorization': apiKey };
    expect(verifySignature(authHeaders, apiKey)).toBe(true);
  });

  it('should fail verification if key does not match or is missing', () => {
    expect(verifySignature({ 'x-zomato-api-key': 'wrong-key' }, apiKey)).toBe(false);
    expect(verifySignature({}, apiKey)).toBe(false);
  });
});

describe('zomatoAdapter - normalize', () => {
  it('should normalize standard Zomato payloads correctly', () => {
    const mockPayload = {
      order_id: 'zomato-order-777',
      items: [
        { item_id: 'item-10', name: 'Garlic Bread', quantity: 2, price: 120, instructions: 'Extra garlic' }
      ],
      payment_details: {
        subtotal: 240,
        tax: 12,
        total: 252,
        currency: 'INR'
      },
      customer_details: {
        name: 'Rahul Sharma',
        phone: '+919876543210',
        delivery_address: 'Flat 402, Sector 15, Noida'
      },
      instructions: 'Ring bell on arrival',
      delivery_details: {
        estimated_time: '25 mins'
      }
    };

    const result = normalize(mockPayload);
    expect(result.source).toBe('zomato');
    expect(result.externalOrderId).toBe('zomato-order-777');
    expect(result.subtotal).toBe(240);
    expect(result.total).toBe(252);
    expect(result.customerName).toBe('Rahul Sharma');
    expect(result.deliveryAddress).toBe('Flat 402, Sector 15, Noida');
    expect(result.items[0]).toEqual({
      id: 'item-10',
      name: 'Garlic Bread',
      qty: 2,
      price: 120,
      notes: 'Extra garlic'
    });
    expect(result.note).toBe('Ring bell on arrival');
  });

  it('should fallback to defaults on minimal inputs', () => {
    const result = normalize({});
    expect(result.customerName).toBe('Zomato Customer');
    expect(result.subtotal).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});
