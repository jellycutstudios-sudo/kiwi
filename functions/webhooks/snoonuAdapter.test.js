import { describe, it, expect } from 'vitest';
import { verifySignature, normalize } from './snoonuAdapter';

describe('snoonuAdapter - verifySignature', () => {
  const apiKey = 'snoonu-merchant-key-xyz';

  it('should verify signature successfully for matching headers', () => {
    const headers = { 'x-snoonu-api-key': apiKey };
    expect(verifySignature(headers, apiKey)).toBe(true);
  });

  it('should verify signature with Bearer authorization header', () => {
    const headers = { 'authorization': `Bearer ${apiKey}` };
    expect(verifySignature(headers, apiKey)).toBe(true);
  });

  it('should fail verification if key does not match or is missing', () => {
    expect(verifySignature({ 'x-snoonu-api-key': 'wrong-key' }, apiKey)).toBe(false);
    expect(verifySignature({}, apiKey)).toBe(false);
  });
});

describe('snoonuAdapter - normalize', () => {
  it('should normalize standard Snoonu Qatar orders', () => {
    const mockPayload = {
      order_id: 'SNO-442211',
      items: [
        {
          item_id: 'item-burger-9',
          name: 'Truffle Wagyu Burger',
          qty: 1,
          price: 65.0,
          instructions: 'Well done',
          options: [{ name: 'Extra Truffle Mayo', price: 8.0 }]
        }
      ],
      subtotal: 65.0,
      tax: 0.0,
      delivery_fee: 15.0,
      total: 65.0,
      currency: 'QAR',
      customer_name: 'Fatima Al-Thani',
      customer_phone: '+974 6666 7890',
      delivery_address: 'The Pearl, Porto Arabia Tower 4, Doha, Qatar',
      notes: 'Call upon arrival'
    };

    const result = normalize(mockPayload);
    expect(result.source).toBe('snoonu');
    expect(result.externalOrderId).toBe('SNO-442211');
    expect(result.subtotal).toBe(65.0);
    expect(result.total).toBe(65.0);
    expect(result.currency).toBe('QAR');
    expect(result.customerName).toBe('Fatima Al-Thani');
    expect(result.deliveryAddress).toBe('The Pearl, Porto Arabia Tower 4, Doha, Qatar');
    expect(result.platformCommission).toBe(20);
    expect(result.items[0].name).toBe('Truffle Wagyu Burger');
    expect(result.items[0].selectedModifiers[0].name).toBe('Extra Truffle Mayo');
  });

  it('should fallback to safe defaults on minimal input', () => {
    const result = normalize({});
    expect(result.customerName).toBe('Snoonu Customer');
    expect(result.source).toBe('snoonu');
    expect(result.currency).toBe('QAR');
  });
});
