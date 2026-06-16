const crypto = require('crypto');

function verifyUberSignature(rawBody, signature, clientSecret) {
  if (!signature || !clientSecret) return false;
  // If rawBody is a buffer or string, compute HMAC
  const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  const hmac = crypto.createHmac('sha256', clientSecret);
  const digest = hmac.update(bodyStr).digest('hex');

  const digestBuf = Buffer.from(digest);
  const signatureBuf = Buffer.from(signature);
  if (digestBuf.length !== signatureBuf.length) {
    crypto.timingSafeEqual(digestBuf, digestBuf);
    return false;
  }
  return crypto.timingSafeEqual(digestBuf, signatureBuf);
}

function normalizeUberOrder(body) {
  const order = body.order || body;
  
  const items = (order.cart?.items || []).map(item => ({
    id: item.id || item.external_id || '',
    name: item.title || item.name || 'Unknown Item',
    qty: item.quantity || 1,
    price: (item.price?.unit_price?.amount || item.price || 0) / 100, // Uber prices are in cents
    notes: item.special_instructions || ''
  }));

  const subtotal = (order.payment?.subtotal?.amount || order.subtotal || 0) / 100;
  const tax = (order.payment?.tax?.amount || order.tax || 0) / 100;
  const total = (order.payment?.total?.amount || order.total || 0) / 100;

  return {
    type: 'online',
    source: 'ubereats',
    externalOrderId: order.id || order.display_id || 'UBER-' + Math.floor(Math.random() * 100000),
    status: 'pending',
    items,
    subtotal: subtotal || items.reduce((sum, item) => sum + (item.price * item.qty), 0),
    taxInfo: {
      amount: tax,
      type: 'flat'
    },
    total: total || (subtotal + tax),
    customerName: order.eater?.first_name ? `${order.eater.first_name} ${order.eater.last_name || ''}`.trim() : 'Uber Eater',
    customerPhone: order.eater?.phone || '',
    deliveryAddress: order.delivery?.location?.formatted_address || 'Uber Delivery',
    note: order.delivery?.special_instructions || '',
    estimatedDeliveryTime: '30-40 mins',
    platformCommission: 30, // Uber standard commission
    createdAt: new Date(),
    currency: order.payment?.total?.currency_code || 'INR'
  };
}

module.exports = {
  verifySignature: verifyUberSignature,
  normalize: normalizeUberOrder
};
