import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { useOrderStore } from '../stores/orderStore';

describe('Terminal Delivery Workflow & Safety Logic', () => {
  const posJsx = fs.readFileSync(path.resolve(__dirname, '../routes/POS.jsx'), 'utf-8');
  const paymentModalJsx = fs.readFileSync(path.resolve(__dirname, '../components/pos/PaymentModal.jsx'), 'utf-8');
  const printJs = fs.readFileSync(path.resolve(__dirname, '../utils/print.js'), 'utf-8');

  it('orderStore supports setting, clearing, and persisting assignedRiderName', () => {
    const store = useOrderStore.getState();
    expect(store.assignedRiderName).toBeNull();

    // Set rider
    store.setRider('Ramesh');
    expect(useOrderStore.getState().assignedRiderName).toBe('Ramesh');

    // Load order restores rider
    store.loadOrderToCart({
      id: 'order-123',
      items: [],
      assignedRiderName: 'Dunzo Delivery'
    });
    expect(useOrderStore.getState().assignedRiderName).toBe('Dunzo Delivery');

    // Clear cart resets rider
    store.clearCart();
    expect(useOrderStore.getState().assignedRiderName).toBeNull();
  });

  it('POS enforces safety validation on Checkout and Kitchen dispatch for delivery', () => {
    // Checkout guard
    expect(posJsx).toContain('if (orderType === \'delivery\') {');
    expect(posJsx).toContain('toast.error(\'Please enter customer phone and delivery address before checkout\'');

    // Kitchen dispatch guard
    expect(posJsx).toContain('toast.error(\'Please enter customer phone and delivery address before sending to kitchen\'');
  });

  it('POS displays prominent delivery destination bar with quick edit action', () => {
    expect(posJsx).toContain('cart-delivery-destination-bar');
    expect(posJsx).toContain('Tap to add delivery address & phone');
    expect(posJsx).toContain('Edit ✎');
  });

  it('PaymentModal renders delivery dispatch card and rider selector', () => {
    expect(paymentModalJsx).toContain('payment-delivery-dispatch-card');
    expect(paymentModalJsx).toContain('Delivery Dispatch');
    expect(paymentModalJsx).toContain('Assign Rider:');
    expect(paymentModalJsx).toContain('Dunzo');
    expect(paymentModalJsx).toContain('Porter');
    expect(paymentModalJsx).toContain('Shadowfax');
    expect(paymentModalJsx).toContain('Own Fleet');
  });

  it('print.js includes rider information across receipt, KOT, and invoices', () => {
    // ESC/POS receipt & kitchen ticket
    expect(printJs).toContain('if (order.assignedRiderName) writeTextLine(`Rider: ${order.assignedRiderName}`);');

    // Browser receipt
    expect(printJs).toContain('${order.assignedRiderName ? `<div>Rider: ${order.assignedRiderName}</div>` : \'\'}');

    // A4 invoice
    expect(printJs).toContain('${order.assignedRiderName ? `<div style="font-size: 12px; color: #4b5563; margin-top: 2px;">Rider: ${order.assignedRiderName}</div>` : \'\'}');
  });
});
