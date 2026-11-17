// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ActiveOrdersModal from '../components/pos/ActiveOrdersModal';
import { useOrderStore } from '../stores/orderStore';
import * as printModule from '../utils/print';

// Mock printReceipt to spy on thermal print calls
vi.mock('../utils/print', () => ({
  printReceipt: vi.fn(),
  printReceiptBrowser: vi.fn(),
  printReceiptSingle: vi.fn()
}));

describe('Pre-Bill Tracking & Duplicate Print Prevention', () => {
  const mockRestaurant = { id: 'rest_123', name: 'Spice Garden' };

  beforeEach(() => {
    vi.clearAllMocks();
    useOrderStore.setState({
      activeOrders: [],
      editingOrderId: null,
      billPrinted: false
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks an active order as billPrinted with timestamp and staff info', async () => {
    const testOrder = {
      id: 'order_1',
      tableName: 'T4',
      type: 'dine-in',
      status: 'pending',
      total: 850,
      items: [{ name: 'Chicken Biryani', qty: 2, price: 425 }],
      billPrinted: false
    };

    useOrderStore.setState({
      activeOrders: [testOrder]
    });

    await useOrderStore.getState().markBillPrinted('rest_123', 'order_1', 'Waiter Alex');

    const updated = useOrderStore.getState().activeOrders.find(o => o.id === 'order_1');
    expect(updated.billPrinted).toBe(true);
    expect(updated.billPrintedBy).toBe('Waiter Alex');
    expect(typeof updated.billPrintedAt).toBe('string');
  });

  it('displays BILL GIVEN badge and Settle (No Print) when bill was already printed', () => {
    const printedOrder = {
      id: 'order_printed',
      tableName: 'Table 5',
      type: 'dine-in',
      status: 'pending',
      total: 1200,
      paymentMethod: 'unpaid',
      items: [{ name: 'Butter Chicken', qty: 1, price: 500 }],
      billPrinted: true,
      billPrintedAt: new Date().toISOString()
    };

    useOrderStore.setState({
      activeOrders: [printedOrder]
    });

    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    // Header badge
    expect(screen.getByText(/BILL GIVEN/i)).toBeInTheDocument();

    // Bill button state
    expect(screen.getByText(/Bill Printed/i)).toBeInTheDocument();

    // Settle without print button
    expect(screen.getByRole('button', { name: /Settle \(No Print\)/i })).toBeInTheDocument();

    // Optional & Print button
    expect(screen.getByRole('button', { name: /& Print/i })).toBeInTheDocument();
  });

  it('settles order without invoking printReceipt when Settle (No Print) is tapped', async () => {
    const settleOrderMock = vi.fn().mockResolvedValue(true);
    useOrderStore.setState({
      settleOrder: settleOrderMock,
      activeOrders: [{
        id: 'order_to_settle',
        tableName: 'Table 2',
        type: 'dine-in',
        status: 'pending',
        total: 650,
        paymentMethod: 'unpaid',
        items: [{ name: 'Paneer Tikka', qty: 1, price: 650 }],
        billPrinted: true
      }]
    });

    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    const noPrintBtn = screen.getByRole('button', { name: /Settle \(No Print\)/i });
    fireEvent.click(noPrintBtn);

    await waitFor(() => {
      expect(settleOrderMock).toHaveBeenCalledWith('rest_123', 'order_to_settle', 'cash', 650);
    });

    // Verify printReceipt was NOT called
    expect(printModule.printReceipt).not.toHaveBeenCalled();
  });

  it('prints receipt when explicit & Print button is tapped on an already-printed bill', async () => {
    const settleOrderMock = vi.fn().mockResolvedValue(true);
    useOrderStore.setState({
      settleOrder: settleOrderMock,
      activeOrders: [{
        id: 'order_explicit_print',
        tableName: 'Table 3',
        type: 'dine-in',
        status: 'pending',
        total: 900,
        paymentMethod: 'unpaid',
        items: [{ name: 'Dal Makhani', qty: 2, price: 450 }],
        billPrinted: true
      }]
    });

    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    const printSettleBtn = screen.getByRole('button', { name: /& Print/i });
    fireEvent.click(printSettleBtn);

    await waitFor(() => {
      expect(settleOrderMock).toHaveBeenCalledWith('rest_123', 'order_explicit_print', 'cash', 900);
    });

    await waitFor(() => {
      expect(printModule.printReceipt).toHaveBeenCalled();
    });
  });

  it('shows Quick Cash button when bill was NOT previously printed', () => {
    const unprintedOrder = {
      id: 'order_fresh',
      tableName: 'Table 1',
      type: 'takeaway',
      status: 'pending',
      total: 350,
      paymentMethod: 'unpaid',
      items: [{ name: 'Burger', qty: 1, price: 350 }],
      billPrinted: false
    };

    useOrderStore.setState({
      activeOrders: [unprintedOrder]
    });

    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    expect(screen.queryByText(/BILL GIVEN/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Quick Cash/i })).toBeInTheDocument();
  });
});
