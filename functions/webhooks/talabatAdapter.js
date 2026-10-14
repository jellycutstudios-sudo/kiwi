const crypto = require('crypto');

/**
 * Verify Talabat / Delivery Hero webhook authenticity
 * Supports x-talabat-api-key, x-deliveryhero-api-key, or Bearer authorization
 */
function verifyTalabatSignature(headers, apiKey) {
  if (!apiKey) return false;
  const headerKey = headers['x-talabat-api-key'] || headers['x-deliveryhero-api-key'] || headers['authorization'];
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
 * Normalize incoming Talabat / Delivery Hero order payload to DineOS schema
 */
function normalizeTalabatOrder(body) {
  const rawItems = body.items || body.order_items || [];
  const items = rawItems.map(item => ({
    id: item.id || item.item_id || item.remote_code || '',
    name: item.name || item.title || 'Talabat Item',
    qty: item.quantity || item.qty || 1,
    price: item.price || item.unit_price || 0,
    notes: item.instructions || item.notes || item.comment || '',
    selectedModifiers: (item.options || item.modifiers || []).map(opt => ({
      name: opt.name || opt.title || '',
      price: opt.price || 0
    }))
  }));

  const totals = body.pricing || body.totals || {};
  const subtotal = totals.subtotal || body.subtotal || items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = totals.tax || totals.vat || body.tax || 0;
  const deliveryFee = totals.delivery_fee || totals.deliveryFee || 0;
  const total = totals.total || body.total || (subtotal + tax);

  return {
    type: 'online',
    source: 'talabat',
    externalOrderId: body.order_id || body.order_token || body.id || 'TAL-' + Math.floor(100000 + Math.random() * 900000),
    status: 'pending',
    items,
    subtotal: Math.round(Number(subtotal) * 100) / 100,
    taxInfo: {
      amount: Math.round(Number(tax) * 100) / 100,
      type: 'flat'
    },
    total: Math.round(Number(total) * 100) / 100,
    deliveryFee: Math.round(Number(deliveryFee) * 100) / 100,
    customerName: body.customer?.name || body.customer_name || 'Talabat Customer',
    customerPhone: body.customer?.phone || body.customer_phone || '',
    deliveryAddress: body.delivery?.address || body.delivery_address || 'Talabat Delivery',
    note: body.special_instructions || body.notes || body.comment || '',
    estimatedDeliveryTime: body.delivery?.expected_time || body.estimated_delivery_time || '30 mins',
    platformCommission: 22, // Standard GCC Talabat commission rate (22%)
    createdAt: new Date(),
    currency: totals.currency || body.currency || 'QAR'
  };
}

module.exports = {
  verifySignature: verifyTalabatSignature,
  normalize: normalizeTalabatOrder
};
