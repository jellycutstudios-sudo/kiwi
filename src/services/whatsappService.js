/**
 * WhatsApp Cloud API Service (Meta Official)
 * Sends automated digital receipts directly to customer WhatsApp from restaurant's WhatsApp Business Account.
 */

import { formatCurrency } from '../utils/formatCurrency';

/**
 * Normalizes phone number into international E.164 format (without leading +).
 * E.g., '9876543210' with country code '91' -> '919876543210'
 * E.g., '+91 98765-43210' -> '919876543210'
 */
export function formatWhatsAppPhone(rawPhone, defaultCountryCode = '91') {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return null;

  const cleanCountryCode = String(defaultCountryCode || '91').replace(/\D/g, '');

  // If starts with 0 (e.g., UK 07xxx or India 098xxx), strip leading 0
  const normalized = digits.replace(/^0+/, '');

  // If standard 10 digits (common for India, US/Canada, etc.), prepend default country code
  if (normalized.length === 10) {
    return `${cleanCountryCode}${normalized}`;
  }

  // If already contains country code (11-15 digits)
  if (normalized.length >= 11 && normalized.length <= 15) {
    return normalized;
  }

  // Fallback if at least 8 digits
  if (normalized.length >= 8) {
    return normalized.startsWith(cleanCountryCode) ? normalized : `${cleanCountryCode}${normalized}`;
  }

  return null;
}

/**
 * Builds clean, beautifully formatted plain text receipt for WhatsApp message.
 */
export function buildReceiptText({
  restaurantName = 'Restaurant',
  orderId = '',
  token = null,
  items = [],
  total = 0,
  currency = 'INR',
  paymentMethod = 'CASH',
  receiptUrl = '',
  promoText = ''
}) {
  const shortId = orderId ? orderId.slice(-6).toUpperCase() : 'N/A';
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let text = `🧾 *Digital Receipt · ${restaurantName}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*Order:* #${shortId}${token ? ` · *Token:* #${token}` : ''}\n`;
  text += `*Date:* ${dateStr} ${timeStr}\n`;
  text += `*Payment:* ${String(paymentMethod || 'CASH').toUpperCase()}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (Array.isArray(items) && items.length > 0) {
    text += `*ITEMS:*\n`;
    items.forEach(it => {
      const qty = it.qty || 1;
      const price = it.price || 0;
      const lineTotal = formatCurrency(price * qty, currency);
      text += `• ${it.name} × ${qty} — ${lineTotal}\n`;
      if (it.selectedVariant?.name) {
        text += `   _${it.selectedVariant.name}_\n`;
      }
    });
    text += `\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*TOTAL PAID: ${formatCurrency(total, currency)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (receiptUrl) {
    text += `🔗 *View Full Digital Tax Invoice:*\n${receiptUrl}\n\n`;
  }

  if (promoText && promoText.trim()) {
    text += `✨ *${promoText.trim()}*\n\n`;
  } else {
    text += `Thank you for dining with us! We look forward to seeing you again. ✨\n`;
  }

  return text;
}

function normalizeMetaError(data, status) {
  const code = data?.error?.code;
  const rawMsg = data?.error?.message || `Meta API Error (${status})`;
  if (code === 131030 || rawMsg.includes('not in allowed list')) {
    return 'Recipient number not in allowed list. In Meta sandbox mode, please whitelist this mobile number in the "Recipient" dropdown on developers.facebook.com first.';
  }
  if (code === 190 || rawMsg.includes('OAuth')) {
    return 'Invalid or expired Access Token. Please refresh your token in developers.facebook.com.';
  }
  return rawMsg;
}

/**
 * Sends a digital receipt via Meta WhatsApp Cloud API.
 * Never throws — returns { ok: boolean, error?: string, messageId?: string }.
 */
export async function sendWhatsAppReceipt({
  restaurant,
  orderId,
  customerName = '',
  customerPhone,
  items = [],
  total = 0,
  currency = 'INR',
  paymentMethod = 'CASH',
  token = null
}) {
  const config = restaurant?.settings?.whatsapp;
  if (!config || !config.enabled) {
    return { ok: false, error: 'WhatsApp integration is not enabled in settings.' };
  }

  const { phoneNumberId, accessToken, defaultCountryCode = '91', mode = 'text', templateName = 'digital_receipt', promoText = '' } = config;

  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: 'Missing Meta WhatsApp Phone Number ID or Access Token in settings.' };
  }

  const formattedPhone = formatWhatsAppPhone(customerPhone, defaultCountryCode);
  if (!formattedPhone) {
    return { ok: false, error: `Invalid customer phone number: ${customerPhone}` };
  }

  const restName = restaurant.name || 'Restaurant';
  const receiptUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/order/${restaurant.slug || restaurant.id}?receipt=${orderId}`
    : '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    let payload;
    if (mode === 'template' && templateName) {
      // Official pre-approved Meta WhatsApp Template payload
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: config.templateLanguage || 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName || 'Valued Guest' },
                { type: 'text', text: restName },
                { type: 'text', text: `#${orderId.slice(-6).toUpperCase()}` },
                { type: 'text', text: formatCurrency(total, currency) },
                { type: 'text', text: receiptUrl }
              ]
            }
          ]
        }
      };
    } else {
      // Direct formatted message (Ideal for developer sandbox & open service sessions)
      const bodyText = buildReceiptText({
        restaurantName: restName,
        orderId,
        token,
        items,
        total,
        currency,
        paymentMethod,
        receiptUrl,
        promoText
      });

      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: true,
          body: bodyText
        }
      };
    }

    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!response.ok) {
      const errMsg = normalizeMetaError(data, response.status);
      console.warn('[WhatsApp Cloud API] Delivery failed:', errMsg);
      return { ok: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    return { ok: true, messageId, phone: formattedPhone };
  } catch (err) {
    clearTimeout(timeoutId);
    const errMsg = err.name === 'AbortError' ? 'WhatsApp API request timed out' : err.message;
    console.warn('[WhatsApp Cloud API] Network error:', errMsg);
    return { ok: false, error: errMsg };
  }
}

/**
 * Sends an instant verification test message from Admin Settings.
 */
export async function sendWhatsAppTestMessage({
  phoneNumberId,
  accessToken,
  testPhone,
  defaultCountryCode = '91',
  restaurantName = 'Kiwi POS'
}) {
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: 'Enter Phone Number ID and Access Token before testing.' };
  }

  const formattedPhone = formatWhatsAppPhone(testPhone, defaultCountryCode);
  if (!formattedPhone) {
    return { ok: false, error: 'Enter a valid 10-12 digit mobile number to receive the test.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const testBody = `✅ *Meta WhatsApp Cloud API Connected!*\n\n` +
    `Hello from *${restaurantName}*!\n\n` +
    `Your automated WhatsApp receipt integration is working properly. Digital e-bills will now automatically deliver to your customers upon checkout.\n\n` +
    `_Sent via Kiwi POS Meta Cloud Integration · ${new Date().toLocaleTimeString()}_`;

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: testBody
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!response.ok) {
      const errMsg = normalizeMetaError(data, response.status);
      return { ok: false, error: errMsg };
    }

    return { ok: true, messageId: data?.messages?.[0]?.id };
  } catch (err) {
    clearTimeout(timeoutId);
    const errMsg = err.name === 'AbortError' ? 'Meta API request timed out' : err.message;
    return { ok: false, error: errMsg };
  }
}
