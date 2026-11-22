import { describe, it, expect, beforeEach } from 'vitest';
import { useOrderStore } from '../stores/orderStore';

describe('POS Cart Utility Bar & Complimentary NC Toggle', () => {
  beforeEach(() => {
    useOrderStore.setState({
      items: [
        { id: 'item-1', name: 'Pasta Carbonara', price: 450, qty: 2, selectedModifiers: [] },
        { id: 'item-2', name: 'Fresh Lemonade', price: 120, qty: 1, selectedModifiers: [] }
      ],
      discount: 0,
      discountType: 'percent',
      orderType: 'dine-in',
      isComplimentary: false,
      complimentaryReason: ''
    });
  });

  it('calculates regular subtotal correctly before complimentary NC is applied', () => {
    const state = useOrderStore.getState();
    const subtotal = state.getSubtotal();
    expect(subtotal).toBe(1020); // (450 * 2) + 120
    expect(state.isComplimentary).toBe(false);
  });

  it('sets 100% discount and isComplimentary=true on 1-tap NC toggle', () => {
    useOrderStore.getState().setComplimentary(true, 'Management NC');
    const state = useOrderStore.getState();

    expect(state.isComplimentary).toBe(true);
    expect(state.complimentaryReason).toBe('Management NC');
    expect(state.discount).toBe(100);
    expect(state.discountType).toBe('percent');

    const total = state.getTotal();
    expect(total).toBe(0);
  });

  it('restores previous pricing when NC is cleared via the remove button', () => {
    // Enable NC first
    useOrderStore.getState().setComplimentary(true, 'VIP Table');
    expect(useOrderStore.getState().isComplimentary).toBe(true);
    expect(useOrderStore.getState().getTotal()).toBe(0);

    // Turn NC off (e.g. cashier tapped X on the NC chip)
    useOrderStore.getState().setComplimentary(false);
    const updatedState = useOrderStore.getState();

    expect(updatedState.isComplimentary).toBe(false);
    expect(updatedState.discount).toBe(0);
    expect(updatedState.getTotal()).toBe(1020);
  });
});
