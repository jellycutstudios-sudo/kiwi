const crypto = require('crypto');

/**
 * Verify Jahez partner webhook authenticity
 * Supports x-jahez-api-key or Bearer authorization
 */
function verifyJahezSignature(headers, apiKey) {
  if (!apiKey) return false;
  const headerKey = headers['x-jahez-api-key'] || headers['x-api-key'] || headers['authorization'];
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
 * Normalize Jahez order payload to DineOS schema
 */
function normalizeJahezOrder(body) {
  const rawItems = body.items || body.order_items || [];
  const items = rawItems.map(item => ({
    id: item.id || item.item_code || '',
    name: item.name || item.name_en || item.name_ar || 'Jahez Item',
    qty: item.quantity || item.qty || 1,
    price: item.price || item.unit_price || 0,
    notes: item.notes || item.special_request || '',
    selectedModifiers: (item.modifiers || item.options || []).map(opt => ({
      name: opt.name || opt.name_en || '',
      price: opt.price || 0
    }))
  }));

  const subtotal = body.subtotal || items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = body.vat || body.tax || 0;
  const total = body.total || body.total_amount || (subtotal + tax);

  return {
    type: 'online',
    source: 'jahez',
    externalOrderId: body.order_id || 'JAH-' + Math.floor(100000 + Math.random() * 900000),
    status: 'pending',
    items,
    subtotal: Math.round(Number(subtotal) * 100) / 100,
    taxInfo: {
      amount: Math.round(Number(tax) * 100) / 100,
      type: 'vat'
    },
    total: Math.round(Number(total) * 100) / 100,
    customerName: body.customer?.name || body.customer_name || 'Jahez Customer',
    customerPhone: body.customer?.mobile || body.customer?.phone || '',
    deliveryAddress: body.delivery_address || body.delivery?.address || 'Jahez Delivery',
    note: body.notes || body.instructions || '',
    estimatedDeliveryTime: body.delivery_time || '35 mins',
    platformCommission: 20, // Standard Jahez commission (20%)
    createdAt: new Date(),
    currency: body.currency || 'SAR'
  };
}

module.exports = {
  verifySignature: verifyJahezSignature,
  normalize: normalizeJahezOrder
};
