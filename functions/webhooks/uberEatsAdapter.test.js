import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifySignature, normalize } from './uberEatsAdapter';

describe('uberEatsAdapter - verifySignature', () => {
  const clientSecret = 'super-secret-key';
  const rawBody = JSON.stringify({ event: 'order.created', id: '123' });

  it('should verify signature successfully for a valid signature', () => {
    const hash = crypto.createHmac('sha256', clientSecret).update(rawBody).digest('hex');
    expect(verifySignature(rawBody, hash, clientSecret)).toBe(true);
  });

  it('should fail signature verification if signature does not match', () => {
    expect(verifySignature(rawBody, 'invalid-signature-hash', clientSecret)).toBe(false);
  });

  it('should return false if signature or secret is missing', () => {
    expect(verifySignature(rawBody, null, clientSecret)).toBe(false);
    expect(verifySignature(rawBody, 'some-hash', null)).toBe(false);
  });
});

describe('uberEatsAdapter - normalize', () => {
  it('should normalize standard Uber Eats order payloads correctly', () => {
    const mockPayload = {
      order: {
        id: 'uber-order-999',
        cart: {
          items: [
            {
              id: 'item-1',
              title: 'Truffle Fries',
              quantity: 2,
              price: { unit_price: { amount: 500 } }, // 500 cents = 5.00
              special_instructions: 'Extra crispy'
            },
            {
              id: 'item-2',
              title: 'Classic Burger',
              quantity: 1,
              price: { unit_price: { amount: 1250 } }, // 12.50
            }
          ]
        },
        payment: {
          subtotal: { amount: 2250 }, // 22.50
          tax: { amount: 225 }, // 2.25
          total: { amount: 2475, currency_code: 'INR' } // 24.75
        },
        eater: {
          first_name: 'Jane',
          last_name: 'Doe',
          phone: '+919999999999'
        },
        delivery: {
          location: { formatted_address: '123 Main St, New Delhi' },
          special_instructions: 'Leave at front door'
        }
      }
    };

    const result = normalize(mockPayload);

    expect(result.type).toBe('online');
    expect(result.source).toBe('ubereats');
    expect(result.externalOrderId).toBe('uber-order-999');
    expect(result.status).toBe('pending');
    expect(result.customerName).toBe('Jane Doe');
    expect(result.customerPhone).toBe('+919999999999');
    expect(result.deliveryAddress).toBe('123 Main St, New Delhi');
    expect(result.note).toBe('Leave at front door');
    expect(result.currency).toBe('INR');

    // Prices normalized from cents to currency base units
    expect(result.subtotal).toBe(22.50);
    expect(result.taxInfo.amount).toBe(2.25);
    expect(result.total).toBe(24.75);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: 'item-1',
      name: 'Truffle Fries',
      qty: 2,
      price: 5.00,
      notes: 'Extra crispy'
    });
    expect(result.items[1]).toEqual({
      id: 'item-2',
      name: 'Classic Burger',
      qty: 1,
      price: 12.50,
      notes: ''
    });
  });

  it('should fallback to defaults when properties are missing', () => {
    const mockMinimalPayload = {
      id: 'uber-order-111',
      cart: {
        items: []
      }
    };

    const result = normalize(mockMinimalPayload);

    expect(result.externalOrderId).toBe('uber-order-111');
    expect(result.customerName).toBe('Uber Eater');
    expect(result.subtotal).toBe(0);
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});
