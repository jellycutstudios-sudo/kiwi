const crypto = require('crypto');

/**
 * Verify Snoonu partner webhook authenticity
 * Supports x-snoonu-api-key or authorization Bearer token
 */
function verifySnoonuSignature(headers, apiKey) {
  if (!apiKey) return false;
  const headerKey = headers['x-snoonu-api-key'] || headers['x-api-key'] || headers['authorization'];
  if (!headerKey) return false;

  const cleanHeader = headerKey.startsWith('Bearer ') ? headerKey.slice(7) : headerKey;

  const headerBuf = Buffer.from(cleanHeader);
  const apiKeyBuf = Buffer.from(apiKey);
  if (headerBuf.length !== apiKeyBuf.length) {
    crypto.timingSafeEqual(headerBuf, headerBuf);
    return false;
  }
  return crypto.timingSafeEqual(headerBuf, apiKeyBuf);
}

/**
 * Normalize Snoonu merchant webhook order payload to DineOS schema
 */
function normalizeSnoonuOrder(body) {
  const rawItems = body.items || body.products || [];
  const items = rawItems.map(item => ({
    id: item.item_id || item.id || '',
    name: item.name || item.item_name || 'Snoonu Item',
    qty: item.qty || item.quantity || 1,
    price: item.price || item.unit_price || 0,
    notes: item.instructions || item.notes || '',
    selectedModifiers: (item.options || item.modifiers || []).map(opt => ({
      name: opt.name || opt.title || '',
      price: opt.price || 0
    }))
  }));

  const subtotal = body.subtotal || body.items_total || items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = body.tax || body.vat || 0;
  const deliveryFee = body.delivery_fee || 0;
  const total = body.total || body.total_amount || (subtotal + tax);

  return {
    type: 'online',
    source: 'snoonu',
    externalOrderId: body.order_id || body.order_number || 'SNO-' + Math.floor(100000 + Math.random() * 900000),
    status: 'pending',
    items,
    subtotal: Math.round(Number(subtotal) * 100) / 100,
    taxInfo: {
      amount: Math.round(Number(tax) * 100) / 100,
      type: 'flat'
    },
    total: Math.round(Number(total) * 100) / 100,
    deliveryFee: Math.round(Number(deliveryFee) * 100) / 100,
    customerName: body.customer_name || body.customer?.name || 'Snoonu Customer',
    customerPhone: body.customer_phone || body.customer?.phone || '',
    deliveryAddress: body.delivery_address || body.delivery?.address || 'Snoonu Delivery',
    note: body.notes || body.comment || body.special_instructions || '',
    estimatedDeliveryTime: body.estimated_delivery || '30 mins',
    platformCommission: 20, // Standard Snoonu merchant commission (20%)
    createdAt: new Date(),
    currency: body.currency || 'QAR'
  };
}

module.exports = {
  verifySignature: verifySnoonuSignature,
  normalize: normalizeSnoonuOrder
};
