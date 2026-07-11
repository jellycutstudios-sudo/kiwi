import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useOrderStore } from './orderStore';
import { useGiftCardStore } from './giftCardStore';

// Mock Firestore operations
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
  },
}));

vi.mock('./tableStore', () => ({
  useTableStore: {
    getState: () => ({
      setTableStatus: vi.fn(),
      freeTable: vi.fn(),
    }),
  },
}));

vi.mock('./authStore', () => ({
  useAuthStore: {
    getState: () => ({
      ensureAnonymousAuth: vi.fn(),
    }),
  },
}));

describe('orderStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useOrderStore.getState().clearCart();
  });

  it('should initialize with an empty cart and correct defaults', () => {
    const state = useOrderStore.getState();
    expect(state.items).toEqual([]);
    expect(state.discount).toBe(0);
    expect(state.orderType).toBe('dine-in');
    expect(useGiftCardStore.getState().giftCardCode).toBeNull();
  });

  it('should add items to the cart and increment quantities if added again', () => {
    const store = useOrderStore.getState();
    
    // Add first item
    store.addItem({ id: 'item-1', name: 'Burger', price: 100 });
    expect(useOrderStore.getState().items).toHaveLength(1);
    expect(useOrderStore.getState().items[0]).toMatchObject({
      id: 'item-1',
      qty: 1,
      name: 'Burger',
      price: 100
    });

    // Add same item again
    useOrderStore.getState().addItem({ id: 'item-1', name: 'Burger', price: 100 });
    expect(useOrderStore.getState().items).toHaveLength(1);
    expect(useOrderStore.getState().items[0].qty).toBe(2);

    // Add different item
    useOrderStore.getState().addItem({ id: 'item-2', name: 'Fries', price: 50 });
    expect(useOrderStore.getState().items).toHaveLength(2);
  });

  it('should remove items from the cart', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 100 });
    store.addItem({ id: 'item-2', name: 'Fries', price: 50 });
    
    useOrderStore.getState().removeItem('item-1');
    expect(useOrderStore.getState().items).toHaveLength(1);
    expect(useOrderStore.getState().items[0].id).toBe('item-2');
  });

  it('should update quantities correctly', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 100 });
    
    useOrderStore.getState().updateQty('item-1', 5);
    expect(useOrderStore.getState().items[0].qty).toBe(5);

    // Should remove item if quantity <= 0
    useOrderStore.getState().updateQty('item-1', 0);
    expect(useOrderStore.getState().items).toHaveLength(0);
  });

  it('should compute subtotal correctly', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 100 });
    useOrderStore.getState().updateQty('item-1', 2);
    useOrderStore.getState().addItem({ id: 'item-2', name: 'Fries', price: 50 });

    expect(useOrderStore.getState().getSubtotal()).toBe(250);
  });

  it('should calculate discounts correctly (fixed and percent)', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 100 });
    store.updateQty('item-1', 2); // Subtotal = 200

    // Fixed Discount
    store.setDiscount(30, 'fixed');
    expect(useOrderStore.getState().getDiscountAmount()).toBe(30);

    // Percentage Discount
    store.setDiscount(10, 'percent');
    expect(useOrderStore.getState().getDiscountAmount()).toBe(20);
  });

  it('should compute loyalty points discount caps based on taxable subtotal', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 150 });
    store.setDiscount(50, 'fixed'); // Taxable subtotal before points = 100

    // Mock customer with 1500 points ($150 value)
    store.setCustomerProfile({ phone: '123', name: 'John', points: 1500 });
    store.setRedeemingPoints(true);

    // Points discount is capped at taxable subtotal before points (100) even though points value is 150
    expect(useOrderStore.getState().getPointsDiscountAmount()).toBe(100);

    // Mock customer with 500 points ($50 value)
    store.setCustomerProfile({ phone: '123', name: 'John', points: 500 });
    expect(useOrderStore.getState().getPointsDiscountAmount()).toBe(50);
  });

  it('should compute service charges based on post-discount subtotal', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 200 });
    store.setDiscount(20, 'fixed'); // Subtotal = 180

    const scAmount = store.getServiceChargeAmount({ serviceChargeRate: 10 });
    expect(scAmount).toBe(18);
  });

  it('should compute tax info including service charge if serviceChargeTaxable is true', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 100 }); // Subtotal = 100
    
    const restaurantNonTaxableSC = {
      serviceChargeRate: 10,
      serviceChargeTaxable: 'no',
      taxConfig: { type: 'flat', rate: 18 }
    };
    
    // Taxable is 100. Tax = 18% of 100 = 18
    const taxInfo1 = store.getTaxInfo(restaurantNonTaxableSC);
    expect(taxInfo1.taxTotal).toBe(18);

    const restaurantTaxableSC = {
      serviceChargeRate: 10,
      serviceChargeTaxable: 'yes',
      taxConfig: { type: 'flat', rate: 18 }
    };

    // Taxable is 100 + 10 (service charge) = 110. Tax = 18% of 110 = 19.8
    const taxInfo2 = store.getTaxInfo(restaurantTaxableSC);
    expect(taxInfo2.taxTotal).toBe(19.8);
  });

  it('should compute final order total correctly incorporating all parameters', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 100 });
    store.setDiscount(10, 'fixed'); // Taxable = 90
    
    const restaurant = {
      serviceChargeRate: 10, // SC = 9
      serviceChargeTaxable: 'no',
      taxConfig: { type: 'flat', rate: 5 } // Tax = 5% of 90 = 4.5
    };

    // Total = 90 + 9 + 4.5 = 103.5
    expect(store.getTotal(restaurant)).toBe(103.5);

    // Test with tip added
    store.setTip(15.25);
    // Total = 103.5 + 15.25 = 118.75
    expect(store.getTotal(restaurant)).toBe(118.75);
  });

  it('should apply gift card deduction up to the limit of totalBeforeGiftCard', () => {
    const store = useOrderStore.getState();
    const gcStore = useGiftCardStore.getState();
    store.addItem({ id: 'item-1', name: 'Burger', price: 100 }); // Subtotal = 100

    const restaurant = {
      taxConfig: { type: 'flat', rate: 10 } // Total = 110
    };

    // Case 1: Gift card balance (50) is less than total (110)
    gcStore.applyGiftCard('GC-1', 50, restaurant);
    expect(useGiftCardStore.getState().giftCardCode).toBe('GC-1');
    expect(useGiftCardStore.getState().giftCardDeduction).toBe(50);
    expect(store.getTotal(restaurant)).toBe(60);

    // Case 2: Gift card balance (200) is more than total (110)
    gcStore.applyGiftCard('GC-2', 200, restaurant);
    expect(useGiftCardStore.getState().giftCardDeduction).toBe(110);
    expect(store.getTotal(restaurant)).toBe(0);
  });
});
