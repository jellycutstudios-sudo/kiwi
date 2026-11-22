import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOrderStore } from '../stores/orderStore';

describe('POS Customer Lookup & Registration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOrderStore.getState().clearCart();
  });

  it('sets customer and customerProfile correctly on the cart state', () => {
    const store = useOrderStore.getState();
    expect(store.customerName).toBe('');
    expect(store.customerPhone).toBe('');
    expect(store.customer).toBeNull();

    // Attach new customer phone & name
    store.setCustomer('Rahul', '9400112833');
    store.setCustomerProfile({
      name: 'Rahul',
      phone: '9400112833',
      points: 0
    });

    const updated = useOrderStore.getState();
    expect(updated.customerName).toBe('Rahul');
    expect(updated.customerPhone).toBe('9400112833');
    expect(updated.customer).toEqual({
      name: 'Rahul',
      phone: '9400112833',
      points: 0
    });
  });

  it('preserves customerPhone even when cashier has not typed customer name yet', () => {
    const store = useOrderStore.getState();
    store.setCustomer('Customer', '9400112833');
    store.setCustomerProfile({
      name: 'Customer',
      phone: '9400112833',
      points: 0
    });

    const current = useOrderStore.getState();
    expect(current.customerPhone).toBe('9400112833');
    expect(current.customerName).toBe('Customer');
  });

  it('clears customer profile and phone when cashier removes customer', () => {
    const store = useOrderStore.getState();
    store.setCustomer('Rahul', '9400112833');
    store.setCustomerProfile({
      name: 'Rahul',
      phone: '9400112833',
      points: 15
    });

    expect(useOrderStore.getState().customerPhone).toBe('9400112833');

    store.setCustomer('', '');
    store.setCustomerProfile(null);

    const cleared = useOrderStore.getState();
    expect(cleared.customerName).toBe('');
    expect(cleared.customerPhone).toBe('');
    expect(cleared.customer).toBeNull();
  });
});
