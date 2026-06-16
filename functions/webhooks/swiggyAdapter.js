const crypto = require('crypto');

function verifySwiggySignature(headers, apiKey) {
  if (!apiKey) return false;
  const headerKey = headers['x-swiggy-api-key'] || headers['authorization'];
  if (!headerKey) return false;

  const headerBuf = Buffer.from(headerKey);
  const apiKeyBuf = Buffer.from(apiKey);
  if (headerBuf.length !== apiKeyBuf.length) {
    crypto.timingSafeEqual(headerBuf, headerBuf);
    return false;
  }
  return crypto.timingSafeEqual(headerBuf, apiKeyBuf);
}

function normalizeSwiggyOrder(body) {
  const cart = body.cart || {};
  const items = (cart.items || []).map(item => ({
    id: item.menu_id || item.id || '',
    name: item.name || 'Unknown Item',
    qty: item.quantity || 1,
    price: item.price || 0,
    notes: item.notes || item.instructions || ''
  }));

  const subtotal = cart.charges?.subtotal || body.subtotal || items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = cart.charges?.tax || body.tax || 0;
  const total = cart.charges?.total || body.total || (subtotal + tax);

  return {
    type: 'online',
    source: 'swiggy',
    externalOrderId: body.order_id || 'SWG-' + Math.floor(Math.random() * 100000),
    status: 'pending',
    items,
    subtotal,
    taxInfo: {
      amount: tax,
      type: 'flat'
    },
    total,
    customerName: body.customer?.name || 'Swiggy Customer',
    customerPhone: body.customer?.phone || '',
    deliveryAddress: body.customer?.address || 'Swiggy Delivery',
    note: body.instructions || body.note || '',
    estimatedDeliveryTime: body.delivery_time || '30 mins',
    platformCommission: 24, // Swiggy standard commission
    createdAt: new Date(),
    currency: cart.charges?.currency || 'INR'
  };
}

module.exports = {
  verifySignature: verifySwiggySignature,
  normalize: normalizeSwiggyOrder
};
