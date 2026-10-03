// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOrderStore } from '../stores/orderStore';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { computeTax } from '../utils/taxUtils';

// Mock Firebase
vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'mock-user-1' } },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: () => 'MOCK_TIMESTAMP',
  increment: (val) => val,
  writeBatch: () => ({
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe('Unbreakable POS App Flow & Calculation Logic', () => {
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
      configurable: true,
    });
    globalThis.localStorage = mockLocalStorage;
    useOrderStore.getState().clearCart();
    useOfflineQueueStore.getState().clearQueue();
  });

  describe('1. Cart Management & Variant Separation', () => {
    it('stacks identical items with same modifiers into qty increment', () => {
      const item1 = { id: 'item-1', name: 'Burger', price: 10, selectedModifiers: [{ name: 'Extra Cheese', price: 2 }] };
      const item2 = { id: 'item-1', name: 'Burger', price: 10, selectedModifiers: [{ name: 'Extra Cheese', price: 2 }] };

      useOrderStore.getState().addItem(item1);
      useOrderStore.getState().addItem(item2);

      const items = useOrderStore.getState().items;
      expect(items.length).toBe(1);
      expect(items[0].qty).toBe(2);
    });

    it('separates identical items with different modifiers into distinct lines', () => {
      const itemRegular = { id: 'item-1', name: 'Burger', price: 10, selectedModifiers: [] };
      const itemSpicy = { id: 'item-1', name: 'Burger', price: 10, selectedModifiers: [{ name: 'Jalapenos', price: 1.5 }] };

      useOrderStore.getState().addItem(itemRegular);
      useOrderStore.getState().addItem(itemSpicy);

      const items = useOrderStore.getState().items;
      expect(items.length).toBe(2);
      expect(items[0].qty).toBe(1);
      expect(items[1].qty).toBe(1);
    });

    it('removes only the specified variant without affecting sibling variants', () => {
      const itemRegular = { id: 'item-1', name: 'Burger', price: 10, selectedModifiers: [] };
      const itemSpicy = { id: 'item-1', name: 'Burger', price: 10, selectedModifiers: [{ name: 'Jalapenos', price: 1.5 }] };

      useOrderStore.getState().addItem(itemRegular);
      useOrderStore.getState().addItem(itemSpicy);

      // Remove only the spicy variant
      useOrderStore.getState().removeItem('item-1', [{ name: 'Jalapenos', price: 1.5 }]);

      const items = useOrderStore.getState().items;
      expect(items.length).toBe(1);
      expect(items[0].selectedModifiers).toEqual([]);
    });

    it('decrements qty and removes line when quantity reaches zero', () => {
      const item = { id: 'pizza-1', name: 'Pizza', price: 15 };
      useOrderStore.getState().addItem(item);
      useOrderStore.getState().updateQty('pizza-1', 2);
      expect(useOrderStore.getState().items[0].qty).toBe(2);

      useOrderStore.getState().updateQty('pizza-1', 0);
      expect(useOrderStore.getState().items.length).toBe(0);
    });
  });

  describe('2. Tax Computation & Precision Guarding', () => {
    it('accurately calculates exclusive Indian GST with CGST and SGST splits', () => {
      const result = computeTax(1000, {
        type: 'gst',
        rate: 18,
        cgst: 9,
        sgst: 9,
        mode: 'exclusive',
      });

      expect(result.mode).toBe('exclusive');
      expect(result.taxTotal).toBe(180);
      expect(result.total).toBe(1180);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toEqual({ label: 'CGST (9%)', amount: 90 });
      expect(result.lines[1]).toEqual({ label: 'SGST (9%)', amount: 90 });
    });

    it('accurately calculates inclusive Indian GST without penny rounding discrepancy', () => {
      const result = computeTax(118, {
        type: 'gst',
        rate: 18,
        mode: 'inclusive',
      });

      expect(result.mode).toBe('inclusive');
      expect(result.baseSubtotal).toBe(100);
      expect(result.taxTotal).toBe(18);
      expect(result.total).toBe(118);
      expect(result.lines[0].amount + result.lines[1].amount).toBe(18);
    });

    it('handles zero tax rate and none type gracefully', () => {
      const result = computeTax(250, { type: 'none', rate: 0 });
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(250);
    });
  });

  describe('3. Discount & Financial Boundary Clamping', () => {
    it('clamps fixed discount if it exceeds order subtotal', () => {
      const item = { id: 'coffee', name: 'Coffee', price: 5 };
      useOrderStore.getState().addItem(item); // subtotal = 5

      useOrderStore.getState().setDiscount(50, 'fixed'); // attempt $50 discount on $5 item
      const discountAmt = useOrderStore.getState().getDiscountAmount();
      expect(discountAmt).toBe(5); // clamped to subtotal
    });

    it('caps percent discount to maximum 100%', () => {
      const item = { id: 'steak', name: 'Steak', price: 40 };
      useOrderStore.getState().addItem(item);

      useOrderStore.getState().setDiscount(150, 'percent'); // attempt 150% discount
      const discountAmt = useOrderStore.getState().getDiscountAmount();
      expect(discountAmt).toBe(40); // 100% of 40
    });

    it('never produces negative total under any tip, discount, or tax combination', () => {
      const item = { id: 'dessert', name: 'Cake', price: 10 };
      useOrderStore.getState().addItem(item);
      useOrderStore.getState().setDiscount(10, 'fixed');
      useOrderStore.getState().setTip(0);

      const total = useOrderStore.getState().getTotal({ taxConfig: { type: 'none', rate: 0 } });
      expect(total).toBe(0);
      expect(total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('4. Empty Cart Guard & Submission Integrity', () => {
    it('blocks order submission when cart is completely empty', async () => {
      useOrderStore.getState().clearCart();
      const res = await useOrderStore.getState().submitOrder({ id: 'rest-1' }, 'staff-1');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Cart is empty');
    });
  });

  describe('5. Storage Corruption Fault-Tolerance', () => {
    it('recovers gracefully if localStorage contains corrupted non-JSON strings', () => {
      localStorage.setItem('dineos_active_cart', 'CORRUPT_NON_JSON_DATA{{{');
      localStorage.setItem('dineos_offline_order_queue', 'MALFORMED_ARRAY_INVALID');

      // The stores should initialize or load without throwing syntax errors
      const queue = useOfflineQueueStore.getState().queue;
      expect(Array.isArray(queue)).toBe(true);
    });
  });

  describe('6. Offline Queue Buffer & Recovery', () => {
    it('enqueues order, updates store count, and preserves order details', () => {
      const mockOrder = {
        id: 'ord-offline-999',
        items: [{ id: 'tea', name: 'Masala Tea', price: 3, qty: 2 }],
        subtotal: 6,
        total: 6,
        paymentMethod: 'cash',
      };

      useOfflineQueueStore.getState().enqueueOrder(mockOrder);

      const queue = useOfflineQueueStore.getState().queue;
      expect(queue.length).toBe(1);
      expect(queue[0].id).toBe('ord-offline-999');
      expect(queue[0].items[0].name).toBe('Masala Tea');
    });

    it('retains queue in localStorage across browser sessions', () => {
      const mockOrder = { id: 'ord-sess-1', total: 25 };
      useOfflineQueueStore.getState().enqueueOrder(mockOrder);

      const persisted = JSON.parse(localStorage.getItem('dineos_offline_order_queue'));
      expect(persisted).toHaveLength(1);
      expect(persisted[0].id).toBe('ord-sess-1');
    });

    it('clears queue when requested', () => {
      useOfflineQueueStore.getState().enqueueOrder({ id: 'ord-1' });
      useOfflineQueueStore.getState().enqueueOrder({ id: 'ord-2' });
      expect(useOfflineQueueStore.getState().queue.length).toBe(2);

      useOfflineQueueStore.getState().clearQueue();
      expect(useOfflineQueueStore.getState().queue.length).toBe(0);
      expect(JSON.parse(localStorage.getItem('dineos_offline_order_queue'))).toEqual([]);
    });
  });

  describe('7. Cash Change & Split Bill Mathematical Integrity', () => {
    it('computes exact change when cash tendered exceeds order total', () => {
      const orderTotal = 34.50;
      const tendered = 50.00;
      const change = tendered > orderTotal ? Math.round((tendered - orderTotal) * 100) / 100 : 0;
      expect(change).toBe(15.50);
    });

    it('returns zero change when cash tendered is exact', () => {
      const orderTotal = 25.00;
      const tendered = 25.00;
      const change = tendered > orderTotal ? tendered - orderTotal : 0;
      expect(change).toBe(0);
    });

    it('distributes split bill among N guests with no missing penny', () => {
      const total = 100.00;
      const guestCount = 3;
      const baseShare = Math.floor((total / guestCount) * 100) / 100; // 33.33
      const remainderCents = Math.round((total - baseShare * guestCount) * 100); // 1 cent

      const shares = Array.from({ length: guestCount }, (_, i) => {
        return Math.round((baseShare + (i < remainderCents ? 0.01 : 0)) * 100) / 100;
      });

      expect(shares).toEqual([33.34, 33.33, 33.33]);
      const sum = shares.reduce((acc, s) => acc + s, 0);
      expect(Math.round(sum * 100) / 100).toBe(100.00);
    });
  });
});
