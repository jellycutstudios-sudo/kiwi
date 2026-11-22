import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatWhatsAppPhone,
  buildReceiptText,
  sendWhatsAppReceipt,
  sendWhatsAppTestMessage
} from '../services/whatsappService';

describe('WhatsApp Receipt Service (Meta Cloud API)', () => {
  describe('formatWhatsAppPhone', () => {
    it('normalizes 10-digit number by prepending default country code', () => {
      expect(formatWhatsAppPhone('9876543210', '91')).toBe('919876543210');
      expect(formatWhatsAppPhone('5551234567', '1')).toBe('15551234567');
    });

    it('strips formatting symbols, spaces, hyphens, and leading zeros', () => {
      expect(formatWhatsAppPhone('+91 98765-43210', '91')).toBe('919876543210');
      expect(formatWhatsAppPhone('09876543210', '91')).toBe('919876543210');
      expect(formatWhatsAppPhone('00919876543210', '91')).toBe('919876543210');
    });

    it('preserves existing full international format without duplicate country code', () => {
      expect(formatWhatsAppPhone('919876543210', '91')).toBe('919876543210');
      expect(formatWhatsAppPhone('+971501234567', '971')).toBe('971501234567');
    });

    it('returns null for invalid or empty inputs', () => {
      expect(formatWhatsAppPhone('')).toBeNull();
      expect(formatWhatsAppPhone(null)).toBeNull();
      expect(formatWhatsAppPhone(undefined)).toBeNull();
      expect(formatWhatsAppPhone('123')).toBeNull(); // Less than 8 digits
    });
  });

  describe('buildReceiptText', () => {
    it('generates itemized text receipt with correct totals and metadata', () => {
      const text = buildReceiptText({
        restaurantName: 'The Spicy Bowl',
        orderId: 'ord_abcdef123456',
        token: '42',
        items: [
          { name: 'Paneer Butter Masala', qty: 2, price: 250, selectedVariant: { name: 'Medium Spicy' } },
          { name: 'Garlic Naan', qty: 3, price: 50 }
        ],
        total: 650,
        currency: 'INR',
        paymentMethod: 'UPI',
        receiptUrl: 'https://kiwi.pos/order/spicy?receipt=ord_abcdef123456',
        promoText: 'Show this for 10% off your next order!'
      });

      expect(text).toContain('The Spicy Bowl');
      expect(text).toContain('*Order:* #123456');
      expect(text).toContain('*Token:* #42');
      expect(text).toContain('*Payment:* UPI');
      expect(text).toContain('Paneer Butter Masala × 2');
      expect(text).toContain('Medium Spicy');
      expect(text).toContain('Garlic Naan × 3');
      expect(text).toContain('TOTAL PAID:');
      expect(text).toContain('https://kiwi.pos/order/spicy?receipt=ord_abcdef123456');
      expect(text).toContain('Show this for 10% off your next order!');
    });

    it('provides pleasant fallback thank you when promoText is empty', () => {
      const text = buildReceiptText({
        restaurantName: 'Cafe Noir',
        orderId: 'abc1234',
        items: [],
        total: 100,
        currency: 'USD'
      });

      expect(text).toContain('Thank you for dining with us!');
    });
  });

  describe('sendWhatsAppReceipt & sendWhatsAppTestMessage', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('fails early if WhatsApp is disabled in restaurant settings', async () => {
      const restaurant = { settings: { whatsapp: { enabled: false } } };
      const res = await sendWhatsAppReceipt({
        restaurant,
        orderId: '123',
        customerPhone: '9876543210'
      });

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/not enabled/i);
    });

    it('fails early if credentials are missing', async () => {
      const restaurant = { settings: { whatsapp: { enabled: true, phoneNumberId: '' } } };
      const res = await sendWhatsAppReceipt({
        restaurant,
        orderId: '123',
        customerPhone: '9876543210'
      });

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Missing Meta WhatsApp/i);
    });

    it('fails early if customer phone number is invalid', async () => {
      const restaurant = {
        settings: {
          whatsapp: { enabled: true, phoneNumberId: '12345', accessToken: 'token_abc' }
        }
      };
      const res = await sendWhatsAppReceipt({
        restaurant,
        orderId: '123',
        customerPhone: 'invalid-phone'
      });

      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Invalid customer phone/i);
    });

    it('successfully sends direct text message via Meta Graph API', async () => {
      const restaurant = {
        name: 'Kiwi Bistro',
        settings: {
          whatsapp: {
            enabled: true,
            phoneNumberId: 'phone_id_999',
            accessToken: 'test_meta_token',
            mode: 'text',
            defaultCountryCode: '91'
          }
        }
      };

      const mockResponse = {
        messaging_product: 'whatsapp',
        contacts: [{ input: '919876543210', wa_id: '919876543210' }],
        messages: [{ id: 'wamid.HBgLMTIzNDU2' }]
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      const res = await sendWhatsAppReceipt({
        restaurant,
        orderId: 'order_test_123',
        customerName: 'Salman',
        customerPhone: '9876543210',
        items: [{ name: 'Espresso', price: 120, qty: 1 }],
        total: 120,
        currency: 'INR',
        paymentMethod: 'UPI'
      });

      expect(res.ok).toBe(true);
      expect(res.messageId).toBe('wamid.HBgLMTIzNDU2');
      expect(res.phone).toBe('919876543210');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/v21.0/phone_id_999/messages');
      expect(options.headers['Authorization']).toBe('Bearer test_meta_token');

      const body = JSON.parse(options.body);
      expect(body.messaging_product).toBe('whatsapp');
      expect(body.to).toBe('919876543210');
      expect(body.type).toBe('text');
      expect(body.text.body).toContain('Kiwi Bistro');
    });

    it('sends template message when template mode is selected', async () => {
      const restaurant = {
        name: 'Kiwi Bistro',
        settings: {
          whatsapp: {
            enabled: true,
            phoneNumberId: 'phone_id_999',
            accessToken: 'test_meta_token',
            mode: 'template',
            templateName: 'order_receipt_v1',
            templateLanguage: 'en',
            defaultCountryCode: '91'
          }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid.TPL123' }] })
      });

      const res = await sendWhatsAppReceipt({
        restaurant,
        orderId: 'order_test_456',
        customerName: 'Alex',
        customerPhone: '9876543210',
        total: 250,
        currency: 'INR'
      });

      expect(res.ok).toBe(true);
      expect(res.messageId).toBe('wamid.TPL123');

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.type).toBe('template');
      expect(body.template.name).toBe('order_receipt_v1');
      expect(body.template.language.code).toBe('en');
    });

    it('handles Meta API errors gracefully without throwing', async () => {
      const restaurant = {
        settings: {
          whatsapp: {
            enabled: true,
            phoneNumberId: 'phone_id_999',
            accessToken: 'invalid_token'
          }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            message: 'Invalid OAuth access token.',
            type: 'OAuthException',
            code: 190
          }
        })
      });

      const res = await sendWhatsAppReceipt({
        restaurant,
        orderId: 'order_123',
        customerPhone: '9876543210'
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('Invalid or expired Access Token');
    });

    it('returns helpful explanation when recipient is not in Meta sandbox allowed list', async () => {
      const restaurant = {
        settings: {
          whatsapp: {
            enabled: true,
            phoneNumberId: 'phone_id_999',
            accessToken: 'valid_token'
          }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: '(#131030) Recipient phone number not in allowed list',
            type: 'OAuthException',
            code: 131030
          }
        })
      });

      const res = await sendWhatsAppReceipt({
        restaurant,
        orderId: 'order_123',
        customerPhone: '9400018008'
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('Recipient number not in allowed list');
      expect(res.error).toContain('developers.facebook.com');
    });

    it('sends test verification message via sendWhatsAppTestMessage', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid.TEST999' }] })
      });

      const res = await sendWhatsAppTestMessage({
        phoneNumberId: 'phone_test_id',
        accessToken: 'token_test',
        testPhone: '9876543210',
        restaurantName: 'Test Cafe'
      });

      expect(res.ok).toBe(true);
      expect(res.messageId).toBe('wamid.TEST999');

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.text.body).toContain('Meta WhatsApp Cloud API Connected!');
      expect(body.text.body).toContain('Test Cafe');
    });
  });
});
