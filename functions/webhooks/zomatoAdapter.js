const crypto = require('crypto');

function verifyZomatoSignature(headers, apiKey) {
  if (!apiKey) return false;
  const headerKey = headers['x-zomato-api-key'] || headers['authorization'];
  if (!headerKey) return false;

  const headerBuf = Buffer.from(headerKey);
  const apiKeyBuf = Buffer.from(apiKey);
  if (headerBuf.length !== apiKeyBuf.length) {
    crypto.timingSafeEqual(headerBuf, headerBuf);
    return false;
  }
  return crypto.timingSafeEqual(headerBuf, apiKeyBuf);
}

function normalizeZomatoOrder(body) {
  const items = (body.items || []).map(item => ({
    id: item.item_id || item.id || '',
    name: item.name || item.title || 'Unknown Item',
    qty: item.quantity || 1,
    price: item.price || 0,
    notes: item.instructions || item.notes || ''
  }));

  const subtotal = body.payment_details?.subtotal || body.subtotal || items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = body.payment_details?.tax || body.tax || 0;
  const total = body.payment_details?.total || body.total || (subtotal + tax);

  return {
    type: 'online',
    source: 'zomato',
    externalOrderId: body.order_id || 'ZOM-' + Math.floor(Math.random() * 100000),
    status: 'pending',
    items,
    subtotal,
    taxInfo: {
      amount: tax,
      type: 'flat'
    },
    total,
    customerName: body.customer_details?.name || 'Zomato Customer',
    customerPhone: body.customer_details?.phone || '',
    deliveryAddress: body.customer_details?.delivery_address || 'Zomato Delivery',
    note: body.instructions || body.note || '',
    estimatedDeliveryTime: body.delivery_details?.estimated_time || '35 mins',
    platformCommission: 22, // Zomato standard commission (18-25%)
    createdAt: new Date(),
    currency: body.payment_details?.currency || 'INR'
  };
}

module.exports = {
  verifySignature: verifyZomatoSignature,
  normalize: normalizeZomatoOrder
};
