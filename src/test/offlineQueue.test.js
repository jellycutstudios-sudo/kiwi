// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';

describe('Zero-Downtime Offline Queue Engine', () => {
  let storageStore = {};

  const mockLocalStorage = {
    getItem: (key) => storageStore[key] || null,
    setItem: (key, val) => { storageStore[key] = String(val); },
    removeItem: (key) => { delete storageStore[key]; },
    clear: () => { storageStore = {}; },
  };

  beforeEach(() => {
    storageStore = {};
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
    globalThis.localStorage = mockLocalStorage;
    useOfflineQueueStore.getState().clearQueue();
  });

  it('enqueues an order locally and persists to localStorage', () => {
    const mockOrder = {
      type: 'dine-in',
      tableName: 'Table 5',
      items: [{ id: 'item-1', name: 'Butter Chicken', price: 320, qty: 1 }],
      total: 320,
      paymentMethod: 'cash'
    };

    const result = useOfflineQueueStore.getState().enqueueOrder(mockOrder, { id: 'rest-101' });

    expect(result.ok).toBe(true);
    expect(result.isOffline).toBe(true);
    expect(result.orderId).toContain('offline_');
    expect(result.token).toBeTruthy();

    const queue = useOfflineQueueStore.getState().queue;
    expect(queue.length).toBe(1);
    expect(queue[0].total).toBe(320);
    expect(queue[0].isOffline).toBe(true);

    // Verify localStorage persistence
    const rawStorage = localStorage.getItem('dineos_offline_order_queue');
    expect(rawStorage).toBeTruthy();
    const parsed = JSON.parse(rawStorage);
    expect(parsed.length).toBe(1);
    expect(parsed[0].tableName).toBe('Table 5');
  });

  it('removes single order from queue on dequeueOrder', () => {
    const res1 = useOfflineQueueStore.getState().enqueueOrder({ total: 100 }, { id: 'r1' });
    const res2 = useOfflineQueueStore.getState().enqueueOrder({ total: 200 }, { id: 'r1' });

    expect(useOfflineQueueStore.getState().queue.length).toBe(2);

    useOfflineQueueStore.getState().dequeueOrder(res1.orderId);

    const remaining = useOfflineQueueStore.getState().queue;
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(res2.orderId);
  });

  it('clears all buffered orders on clearQueue', () => {
    useOfflineQueueStore.getState().enqueueOrder({ total: 150 }, { id: 'r1' });
    useOfflineQueueStore.getState().enqueueOrder({ total: 350 }, { id: 'r1' });

    expect(useOfflineQueueStore.getState().queue.length).toBe(2);

    useOfflineQueueStore.getState().clearQueue();
    expect(useOfflineQueueStore.getState().queue.length).toBe(0);
    expect(JSON.parse(localStorage.getItem('dineos_offline_order_queue'))).toEqual([]);
  });

  it('initializes network listeners and handles online/offline transitions', () => {
    const cleanup = useOfflineQueueStore.getState().initNetworkListeners();
    expect(typeof cleanup).toBe('function');

    // Simulate offline event
    window.dispatchEvent(new Event('offline'));
    expect(useOfflineQueueStore.getState().isOnline).toBe(false);

    // Simulate online event
    window.dispatchEvent(new Event('online'));
    expect(useOfflineQueueStore.getState().isOnline).toBe(true);

    cleanup();
  });
});
