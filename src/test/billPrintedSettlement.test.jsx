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

  it('displays minimal Bill Printed badge and Bill ✓ when bill was already printed', () => {
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

    // Compact icon-only bill button indicates already printed
    expect(screen.getByRole('button', { name: /Bill printed/i })).toBeInTheDocument();

    // Unified Quick Cash button (no redundant duplicate printer button)
    expect(screen.getByRole('button', { name: /^Quick Cash$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Print Receipt & Settle/i })).not.toBeInTheDocument();
  });

  it('settles order without duplicate print when Quick Cash is tapped on an already-printed bill', async () => {
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

    const quickCashBtn = screen.getByRole('button', { name: /^Quick Cash$/i });
    fireEvent.click(quickCashBtn);

    await waitFor(() => {
      expect(settleOrderMock).toHaveBeenCalledWith('rest_123', 'order_to_settle', 'cash', 650);
    });

    // Verify printReceipt was NOT called
    expect(printModule.printReceipt).not.toHaveBeenCalled();
  });

  it('prints receipt when Quick Cash is tapped on an unprinted counter order', async () => {
    const settleOrderMock = vi.fn().mockResolvedValue(true);
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
      settleOrder: settleOrderMock,
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

    const quickCashBtn = screen.getByRole('button', { name: /^Quick Cash$/i });
    fireEvent.click(quickCashBtn);

    await waitFor(() => {
      expect(settleOrderMock).toHaveBeenCalledWith('rest_123', 'order_fresh', 'cash', 350);
    });

    await waitFor(() => {
      expect(printModule.printReceipt).toHaveBeenCalled();
    });
  });
});
