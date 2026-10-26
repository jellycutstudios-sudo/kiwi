import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useOrderStore } from '../stores/orderStore';
import { useShiftStore } from '../stores/shiftStore';
import { 
  createSeatChecks, 
  createEvenChecks, 
  settleCheck, 
  areAllChecksSettled,
  getRemainingBalance,
  getTotalPaid,
  splitItemQuantity
} from '../utils/splitCheckEngine';

// Mock dependencies
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  writeBatch: vi.fn(),
  increment: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock('../utils/localSyncChannel', () => ({
  localSyncChannel: {
    broadcast: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

describe('Pillar 1: Seat-Level Bill Splitting & Partial Settlements', () => {
  beforeEach(() => {
    useOrderStore.getState().clearCart();
  });

  it('assigns items to currently active seat during ordering', () => {
    const store = useOrderStore.getState();

    // Set active seat to Seat 1
    store.setActiveSeat(1);
    expect(useOrderStore.getState().activeSeat).toBe(1);

    // Add Burger for Seat 1
    store.addItem({ id: 'item-burger', name: 'Cheeseburger', price: 15 });
    let items = useOrderStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].seatNumber).toBe(1);
    expect(items[0].qty).toBe(1);

    // Set active seat to Seat 2
    store.setActiveSeat(2);
    expect(useOrderStore.getState().activeSeat).toBe(2);

    // Add Burger for Seat 2 (same item, different seat -> should NOT merge into 1 line item)
    store.addItem({ id: 'item-burger', name: 'Cheeseburger', price: 15 });
    items = useOrderStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].seatNumber).toBe(1);
    expect(items[1].seatNumber).toBe(2);

    // Switch back to Shared/Table
    store.setActiveSeat(null);
    store.addItem({ id: 'item-nachos', name: 'Table Nachos', price: 12 });
    items = useOrderStore.getState().items;
    expect(items).toHaveLength(3);
    expect(items[2].seatNumber).toBeNull();
  });

  it('allows reassigning item seat with setItemSeat', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-pasta', name: 'Pasta', price: 18, seatNumber: 1 });
    expect(useOrderStore.getState().items[0].seatNumber).toBe(1);

    store.setItemSeat('item-pasta', 3);
    expect(useOrderStore.getState().items[0].seatNumber).toBe(3);

    store.setItemSeat('item-pasta', null);
    expect(useOrderStore.getState().items[0].seatNumber).toBeNull();
  });

  it('splits item quantity across seats with splitItemQty', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-beer', name: 'Craft Beer', price: 8, seatNumber: 1 });
    // Increase qty to 3
    store.updateQty('item-beer', 3);
    expect(useOrderStore.getState().items[0].qty).toBe(3);

    // Move 1 beer to Seat 2
    store.splitItemQty('item-beer', 1, 2);
    const items = useOrderStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].qty).toBe(2);
    expect(items[0].seatNumber).toBe(1);
    expect(items[1].qty).toBe(1);
    expect(items[1].seatNumber).toBe(2);
  });

  it('builds sub-checks grouped by seat numbers with proportional taxes', () => {
    const items = [
      { id: '1', name: 'Ribeye Steak', price: 50, qty: 1, seatNumber: 1 },
      { id: '2', name: 'Caesar Salad', price: 20, qty: 1, seatNumber: 2 },
      { id: '3', name: 'Bottle of Wine', price: 40, qty: 1, seatNumber: null }, // Shared
    ];

    const checks = createSeatChecks(items, {
      restaurant: { taxRate: 10, taxInclusive: false, serviceChargeRate: 5 },
      sharedHandling: 'separate'
    });

    expect(checks).toHaveLength(3);
    expect(checks[0].title).toBe('Seat 1');
    expect(checks[0].subtotal).toBe(50);
    expect(checks[1].title).toBe('Seat 2');
    expect(checks[1].subtotal).toBe(20);
    expect(checks[2].title).toBe('Shared Items (Table)');
    expect(checks[2].subtotal).toBe(40);
  });

  it('processes partial settlements and accurately tracks remaining balance', async () => {
    const mockRestaurant = { id: 'rest_123', currency: 'USD' };
    const check1 = {
      id: 'check-seat-1',
      checkNumber: 1,
      title: 'Seat 1',
      total: 57.50,
      subtotal: 50,
      items: [{ id: '1', name: 'Steak', price: 50, qty: 1 }]
    };

    const res = await useOrderStore.getState().settleSubCheck(
      mockRestaurant,
      check1,
      'card',
      { authCode: 'AUTH_9988', rrn: 'RRN_12345' }
    );

    expect(res.ok).toBe(true);
    const settled = useOrderStore.getState().settledChecks;
    expect(settled).toHaveLength(1);
    expect(settled[0].checkId).toBe('check-seat-1');
    expect(settled[0].paymentMethod).toBe('card');
    expect(settled[0].total).toBe(57.50);

    // Verify getSettledTotal and getRemainingTotal
    expect(useOrderStore.getState().getSettledTotal()).toBe(57.50);

    // Add remaining item ($42.50)
    useOrderStore.getState().addItem({ id: 'item-wine', name: 'Wine', price: 42.50 });
    const fullTotal = useOrderStore.getState().getTotal(mockRestaurant);
    const remaining = useOrderStore.getState().getRemainingTotal(mockRestaurant);
    expect(remaining).toBe(Math.max(0, Math.round((fullTotal - 57.50) * 100) / 100));
  });
});
