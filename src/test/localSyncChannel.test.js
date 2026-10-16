import { describe, it, expect, vi, beforeEach } from 'vitest';
import { localSyncChannel } from '../utils/localSyncChannel';

describe('localSyncChannel utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies registered subscribers when broadcast is called', () => {
    const callback = vi.fn();
    const unsub = localSyncChannel.subscribe(callback);

    localSyncChannel.broadcast('LOCAL_ORDER_CREATED', {
      orderId: 'local-test-123',
      restaurantId: 'rest-test'
    }, { includeSender: true });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOCAL_ORDER_CREATED',
        payload: {
          orderId: 'local-test-123',
          restaurantId: 'rest-test'
        }
      })
    );

    unsub();
  });

  it('stops notifying after unsubscribe', () => {
    const callback = vi.fn();
    const unsub = localSyncChannel.subscribe(callback);

    unsub();

    localSyncChannel.broadcast('LOCAL_ORDER_UPDATED', {
      orderId: 'local-test-456'
    });

    expect(callback).not.toHaveBeenCalled();
  });
});
