/**
 * Outbound Delivery Partner Status Callbacks (Two-Way Handshake)
 * Gold standard status notifications sent to aggregator APIs:
 * - Talabat / Delivery Hero
 * - Snoonu (Qatar)
 * - Jahez (KSA & GCC)
 * - Deliveroo
 * - Uber Eats
 * - Zomato / Swiggy
 */

const PLATFORM_STATUS_MAP = {
  talabat: {
    accepted: 'ACCEPTED',
    preparing: 'PREPARING',
    ready: 'FOOD_READY',
    cancelled: 'REJECTED'
  },
  snoonu: {
    accepted: 'ACCEPTED',
    preparing: 'PREPARING',
    ready: 'READY_FOR_PICKUP',
    cancelled: 'CANCELLED'
  },
  jahez: {
    accepted: 'ACCEPTED',
    preparing: 'PREPARING',
    ready: 'READY',
    cancelled: 'CANCELLED'
  },
  deliveroo: {
    accepted: 'confirmed',
    preparing: 'in_kitchen',
    ready: 'ready_for_collection',
    cancelled: 'rejected'
  },
  ubereats: {
    accepted: 'ACCEPTED',
    preparing: 'POS_PROCESSING',
    ready: 'READY_FOR_PICKUP',
    cancelled: 'DENIED'
  },
  zomato: {
    accepted: 'acknowledged',
    preparing: 'preparing',
    ready: 'food_ready',
    cancelled: 'rejected'
  },
  swiggy: {
    accepted: 'acknowledged',
    preparing: 'in_prep',
    ready: 'ready_to_deliver',
    cancelled: 'rejected'
  }
};

/**
 * Send status update back to the delivery platform
 */
async function notifyPlatformOrderStatus({
  platform,
  config = {},
  externalOrderId,
  status,
  prepTimeMinutes = 20,
  reason = ''
}) {
  if (!platform || !externalOrderId) {
    return { success: false, error: 'Missing platform or externalOrderId' };
  }

  const platformMap = PLATFORM_STATUS_MAP[platform];
  const mappedStatus = platformMap ? platformMap[status] : status;

  if (!mappedStatus) {
    return { success: false, error: `Unsupported status transition: ${status} for ${platform}` };
  }

  const isMock = !config || 
                 (platform === 'ubereats' && (!config.clientId || config.clientId.includes('client_id_'))) ||
                 (platform !== 'ubereats' && (!config.apiKey || config.apiKey.includes('api_key_')));

  const payload = {
    order_id: externalOrderId,
    status: mappedStatus,
    prep_time_minutes: Number(prepTimeMinutes) || 20,
    timestamp: new Date().toISOString()
  };

  if (status === 'cancelled' && reason) {
    payload.rejection_reason = reason;
  }

  // If in mock/test mode or sandbox credentials, simulate successful dispatch
  if (isMock) {
    console.log(`[MOCK 2-WAY CALLBACK] Notified ${platform} order ${externalOrderId} -> Status: ${mappedStatus} (prep: ${prepTimeMinutes}m)`);
    return {
      success: true,
      simulated: true,
      platform,
      externalOrderId,
      mappedStatus,
      payload
    };
  }

  let endpoint = '';
  let headers = { 'Content-Type': 'application/json' };

  switch (platform) {
    case 'talabat':
      endpoint = `https://api.talabat.com/v1/orders/${externalOrderId}/status`;
      headers['x-talabat-api-key'] = config.apiKey;
      break;
    case 'snoonu':
      endpoint = `https://merchant-api.snoonu.com/v1/orders/${externalOrderId}/status`;
      headers['x-snoonu-api-key'] = config.apiKey;
      break;
    case 'jahez':
      endpoint = `https://api.jahez.com/v1/orders/${externalOrderId}/status`;
      headers['x-jahez-api-key'] = config.apiKey;
      break;
    case 'deliveroo':
      endpoint = `https://api.deliveroo.com/v1/orders/${externalOrderId}/status`;
      headers['x-deliveroo-api-key'] = config.apiKey;
      break;
    case 'ubereats':
      endpoint = `https://api.uber.com/v1/delivery/orders/${externalOrderId}/status`;
      headers['Authorization'] = `Bearer ${config.accessToken || 'MOCK_TOKEN'}`;
      break;
    default:
      endpoint = `https://api.${platform}.com/v1/orders/${externalOrderId}/status`;
      headers[`x-${platform}-api-key`] = config.apiKey;
  }

  try {
    // Standard fetch call to aggregator status API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status} from ${platform}: ${errText}`);
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: true,
      simulated: false,
      platform,
      externalOrderId,
      mappedStatus,
      data
    };
  } catch (err) {
    console.error(`Failed to send status callback to ${platform}:`, err.message);
    return {
      success: false,
      error: err.message,
      platform,
      externalOrderId
    };
  }
}

module.exports = {
  PLATFORM_STATUS_MAP,
  notifyPlatformOrderStatus
};
