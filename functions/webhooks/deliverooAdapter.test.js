import { describe, it, expect } from 'vitest';
import { verifySignature, normalize } from './deliverooAdapter';

describe('deliverooAdapter - verifySignature', () => {
  const apiKey = 'deliveroo-key-999';

  it('should verify signature successfully for matching headers', () => {
    const headers = { 'x-deliveroo-api-key': apiKey };
    expect(verifySignature(headers, apiKey)).toBe(true);
  });

  it('should fail verification if key does not match or is missing', () => {
    expect(verifySignature({ 'x-deliveroo-api-key': 'wrong-key' }, apiKey)).toBe(false);
    expect(verifySignature({}, apiKey)).toBe(false);
  });
});

describe('deliverooAdapter - normalize', () => {
  it('should normalize standard Deliveroo payloads correctly', () => {
    const mockPayload = {
      id: 'deliveroo-order-555',
      items: [
        { id: 'item-30', name: 'Pizza Margherita', quantity: 1, price: 12.99, notes: 'Extra cheese' }
      ],
      totals: {
        subtotal: 12.99,
        tax: 1.30,
        total: 14.29,
        currency: 'USD'
      },
      customer: {
        name: 'Sarah Smith',
        phone: '+15551234567'
      },
      delivery: {
        address: 'Apt 5B, 456 Broadway, New York',
        time: '35 mins'
      },
      notes: 'Please do not ring bell'
    };

    const result = normalize(mockPayload);
    expect(result.source).toBe('deliveroo');
    expect(result.externalOrderId).toBe('deliveroo-order-555');
    expect(result.subtotal).toBe(12.99);
    expect(result.total).toBe(14.29);
    expect(result.customerName).toBe('Sarah Smith');
    expect(result.deliveryAddress).toBe('Apt 5B, 456 Broadway, New York');
    expect(result.items[0]).toEqual({
      id: 'item-30',
      name: 'Pizza Margherita',
      qty: 1,
      price: 12.99,
      notes: 'Extra cheese'
    });
  });

  it('should fallback to defaults on minimal inputs', () => {
    const result = normalize({});
    expect(result.customerName).toBe('Deliveroo Customer');
    expect(result.subtotal).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});
