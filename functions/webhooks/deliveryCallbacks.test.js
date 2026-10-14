import { describe, it, expect, vi } from 'vitest';
import { PLATFORM_STATUS_MAP, notifyPlatformOrderStatus } from './deliveryCallbacks';

describe('deliveryCallbacks - Status Mapping', () => {
  it('correctly maps internal status to aggregator specific payloads', () => {
    expect(PLATFORM_STATUS_MAP.talabat.ready).toBe('FOOD_READY');
    expect(PLATFORM_STATUS_MAP.snoonu.ready).toBe('READY_FOR_PICKUP');
    expect(PLATFORM_STATUS_MAP.jahez.ready).toBe('READY');
    expect(PLATFORM_STATUS_MAP.deliveroo.ready).toBe('ready_for_collection');
    expect(PLATFORM_STATUS_MAP.ubereats.ready).toBe('READY_FOR_PICKUP');
  });

  it('correctly maps accepted and cancelled states across GCC partners', () => {
    expect(PLATFORM_STATUS_MAP.talabat.accepted).toBe('ACCEPTED');
    expect(PLATFORM_STATUS_MAP.talabat.cancelled).toBe('REJECTED');

    expect(PLATFORM_STATUS_MAP.snoonu.accepted).toBe('ACCEPTED');
    expect(PLATFORM_STATUS_MAP.snoonu.cancelled).toBe('CANCELLED');

    expect(PLATFORM_STATUS_MAP.jahez.accepted).toBe('ACCEPTED');
    expect(PLATFORM_STATUS_MAP.jahez.cancelled).toBe('CANCELLED');
  });
});

describe('deliveryCallbacks - notifyPlatformOrderStatus', () => {
  it('simulates outbound callback cleanly when running with mock/test credentials', async () => {
    const result = await notifyPlatformOrderStatus({
      platform: 'talabat',
      config: { apiKey: 'api_key_mock_123' },
      externalOrderId: 'TAL-789012',
      status: 'ready',
      prepTimeMinutes: 25
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.mappedStatus).toBe('FOOD_READY');
    expect(result.payload.prep_time_minutes).toBe(25);
  });

  it('returns error when required platform or orderId is missing', async () => {
    const result = await notifyPlatformOrderStatus({
      platform: null,
      externalOrderId: null,
      status: 'ready'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing platform');
  });

  it('handles cancellation reasons in payload', async () => {
    const result = await notifyPlatformOrderStatus({
      platform: 'snoonu',
      config: { apiKey: 'api_key_test' },
      externalOrderId: 'SNO-112233',
      status: 'cancelled',
      reason: 'Kitchen overloaded during peak rush'
    });

    expect(result.success).toBe(true);
    expect(result.mappedStatus).toBe('CANCELLED');
    expect(result.payload.rejection_reason).toBe('Kitchen overloaded during peak rush');
  });
});
