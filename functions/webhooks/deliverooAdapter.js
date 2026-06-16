const crypto = require('crypto');

function verifyDeliverooSignature(headers, apiKey) {
  if (!apiKey) return false;
  const headerKey = headers['x-deliveroo-api-key'] || headers['authorization'];
  if (!headerKey) return false;

  const headerBuf = Buffer.from(headerKey);
  const apiKeyBuf = Buffer.from(apiKey);
  if (headerBuf.length !== apiKeyBuf.length) {
    crypto.timingSafeEqual(headerBuf, headerBuf);
    return false;
  }
  return crypto.timingSafeEqual(headerBuf, apiKeyBuf);
}

function normalizeDeliverooOrder(body) {
  const items = (body.items || []).map(item => ({
    id: item.id || '',
    name: item.name || 'Unknown Item',
    qty: item.quantity || 1,
    price: item.price || 0,
    notes: item.notes || item.instructions || ''
  }));

  const subtotal = body.totals?.subtotal || body.subtotal || items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const tax = body.totals?.tax || body.tax || 0;
  const total = body.totals?.total || body.total || (subtotal + tax);

  return {
    type: 'online',
    source: 'deliveroo',
    externalOrderId: body.id || 'DEL-' + Math.floor(Math.random() * 100000),
    status: 'pending',
    items,
    subtotal,
    taxInfo: {
      amount: tax,
      type: 'flat'
    },
    total,
    customerName: body.customer?.name || 'Deliveroo Customer',
    customerPhone: body.customer?.phone || '',
    deliveryAddress: body.delivery?.address || 'Deliveroo Delivery',
    note: body.notes || body.note || '',
    estimatedDeliveryTime: body.delivery?.time || '25 mins',
    platformCommission: 25, // Deliveroo standard commission
    createdAt: new Date(),
    currency: body.totals?.currency || 'USD'
  };
}

module.exports = {
  verifySignature: verifyDeliverooSignature,
  normalize: normalizeDeliverooOrder
};
