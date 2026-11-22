// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useOrderStore } from '../stores/orderStore';

describe('Held Orders and Complimentary (NC) Store Logic', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
    useOrderStore.getState().clearCart();
    useOrderStore.getState().clearAllHeldOrders();
    useOrderStore.getState().setComplimentary(false);
  });

  it('parks current cart to heldOrders queue and resets active cart', () => {
    useOrderStore.getState().addItem({ id: 'item_1', name: 'Butter Chicken', price: 350 });
    useOrderStore.getState().addItem({ id: 'item_2', name: 'Garlic Naan', price: 60 });
    expect(useOrderStore.getState().items.length).toBe(2);

    const held = useOrderStore.getState().holdCurrentOrder('Customer stepped away');
    expect(held).not.toBeNull();
    expect(held.holdNumber).toBe(1);
    expect(held.items.length).toBe(2);
    expect(held.note).toBe('Customer stepped away');
    expect(held.total).toBe(410);

    // Active cart should be cleared
    expect(useOrderStore.getState().items.length).toBe(0);
    // heldOrders queue should hold 1 parked order
    expect(useOrderStore.getState().heldOrders.length).toBe(1);
  });

  it('resumes a parked cart back into active cart', () => {
    useOrderStore.getState().addItem({ id: 'item_b', name: 'Chicken Biryani', price: 280 });
    const held = useOrderStore.getState().holdCurrentOrder();
    expect(useOrderStore.getState().items.length).toBe(0);

    const success = useOrderStore.getState().resumeHeldOrder(held.id);
    expect(success).toBe(true);
    expect(useOrderStore.getState().items.length).toBe(1);
    expect(useOrderStore.getState().items[0].name).toBe('Chicken Biryani');
    expect(useOrderStore.getState().heldOrders.length).toBe(0);
  });

  it('discards a held order from the queue', () => {
    useOrderStore.getState().addItem({ id: 'item_1', name: 'Cold Drink', price: 40 });
    const held = useOrderStore.getState().holdCurrentOrder();
    expect(useOrderStore.getState().heldOrders.length).toBe(1);

    useOrderStore.getState().discardHeldOrder(held.id);
    expect(useOrderStore.getState().heldOrders.length).toBe(0);
  });

  it('computes 100% discount and ₹0 due when complimentary (NC) is set', () => {
    useOrderStore.getState().addItem({ id: 'item_1', name: 'Paneer Tikka', price: 300 });
    expect(useOrderStore.getState().getSubtotal()).toBe(300);

    useOrderStore.getState().setComplimentary(true, 'VIP Guest');
    expect(useOrderStore.getState().isComplimentary).toBe(true);
    expect(useOrderStore.getState().complimentaryReason).toBe('VIP Guest');
    expect(useOrderStore.getState().getDiscountAmount()).toBe(300);
    expect(useOrderStore.getState().getTotal()).toBe(0);

    // Toggling off restores normal calculation
    useOrderStore.getState().setComplimentary(false);
    expect(useOrderStore.getState().isComplimentary).toBe(false);
    expect(useOrderStore.getState().getDiscountAmount()).toBe(0);
    expect(useOrderStore.getState().getTotal()).toBe(300);
  });
});
