// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActiveOrdersModal, { isOrderUnpaid, isOrderPaid, classifyOrderChannel, resolveOrderTimestampMs, formatOrderTimestamp } from '../components/pos/ActiveOrdersModal';
import { useOrderStore } from '../stores/orderStore';

vi.mock('../utils/print', () => ({
  printReceipt: vi.fn(),
  printReceiptBrowser: vi.fn(),
  printReceiptSingle: vi.fn()
}));

vi.mock('../services/whatsappService', () => ({
  sendWhatsAppReceipt: vi.fn().mockResolvedValue({ ok: true, phone: '9876543210' })
}));

describe('Orders Center & Kitchen Pass Redesign', () => {
  const mockRestaurant = { id: 'rest_test', name: 'Flavors POS', currency: 'INR' };

  beforeEach(() => {
    vi.clearAllMocks();
    useOrderStore.setState({
      activeOrders: [
        {
          id: 'order_open_1',
          tableName: 'T4',
          type: 'dine-in',
          status: 'pending',
          total: 450,
          paymentMethod: 'unpaid',
          items: [{ name: 'Buffalo Wings', qty: 2, price: 200 }, { name: 'Fries', qty: 1, price: 50 }],
          billPrinted: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'order_open_2',
          token: 18,
          type: 'takeaway',
          status: 'ready',
          total: 280,
          paymentMethod: 'unpaid',
          items: [{ name: 'Burger', qty: 1, price: 280 }],
          billPrinted: true,
          createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString()
        }
      ]
    });
  });

  it('renders the 3 top tabs: Open Orders, Completed Orders, and Voids', () => {
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    expect(screen.getByRole('button', { name: /Open Orders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paid Bills/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Voids \/ Cancelled/i })).toBeInTheDocument();
  });

  it('defaults to Master-Detail Split View and switches to Table View with clean columns', () => {
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    // Split View renders order queue + right itemized inspector + Order Ready progression
    expect(screen.getAllByText(/Table T4/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Token #18/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Buffalo Wings/i).length).toBeGreaterThan(0);
    expect(document.getElementById('orders-mark-ready-btn')).toBeInTheDocument();

    // Switch to Table View and verify table columns
    fireEvent.click(screen.getByRole('button', { name: /Table View/i }));
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Order / Table')).toBeInTheDocument();
    expect(screen.getByText('Items Summary')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('correctly classifies Direct Delivery vs Online vs Takeaway vs Dine-In channels', () => {
    expect(classifyOrderChannel({ type: 'delivery' })).toMatchObject({ isDelivery: true, isOnline: false, isTakeaway: false, isDineIn: false });
    expect(classifyOrderChannel({ type: 'online', source: 'swiggy', status: 'pending' })).toMatchObject({ isOnline: true, isDelivery: false, needsApproval: true });
    expect(classifyOrderChannel({ type: 'takeaway' })).toMatchObject({ isTakeaway: true, isDelivery: false, isOnline: false });
    expect(classifyOrderChannel({ type: 'dine-in' })).toMatchObject({ isDineIn: true, isDelivery: false, isOnline: false });
  });

  it('provides touch action buttons on open table rows: Edit, Bill, and Quick Cash', () => {
    const mockLoadToCart = vi.fn();
    const mockClose = vi.fn();

    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={mockClose}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
        onLoadOrderToCart={mockLoadToCart}
      />
    );

    const editBtns = screen.getAllByRole('button', { name: /^Edit$/i });
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);
    expect(mockLoadToCart).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();

    // Bill button and Quick Cash
    expect(screen.getAllByRole('button', { name: /^Bill/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Quick Cash$/i }).length).toBeGreaterThan(0);
  });

  it('can toggle between Table View and Cards View seamlessly', () => {
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    const cardsToggle = screen.getByRole('button', { name: /Cards View/i });
    fireEvent.click(cardsToggle);

    // Cards view rendered
    const tableToggle = screen.getByRole('button', { name: /Table View/i });
    expect(tableToggle).toBeInTheDocument();
  });

  it('switches to Paid Bills tab smoothly', () => {
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    const completedTab = screen.getByRole('button', { name: /Paid Bills/i });
    fireEvent.click(completedTab);

    expect(screen.getByText(/Viewing.*finalized customer bills/i)).toBeInTheDocument();
  });

  it('switches to Voids / Cancelled tab smoothly', () => {
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    const voidsTab = screen.getByRole('button', { name: /Voids \/ Cancelled/i });
    fireEvent.click(voidsTab);

    expect(screen.getByText(/Viewing.*voided\/cancelled ticket audits/i)).toBeInTheDocument();
  });

  it('correctly classifies unpaid vs paid checks across various POS paymentMethod conventions', () => {
    expect(isOrderUnpaid({ paymentMethod: 'unpaid' })).toBe(true);
    expect(isOrderUnpaid({ paymentMethod: 'Unpaid (Guest Check)' })).toBe(true);
    expect(isOrderUnpaid({ paymentMethod: undefined })).toBe(true);
    expect(isOrderUnpaid({ paymentMethod: null })).toBe(true);
    expect(isOrderUnpaid({ paymentMethod: '' })).toBe(true);

    expect(isOrderUnpaid({ paymentMethod: 'cash' })).toBe(false);
    expect(isOrderUnpaid({ paymentMethod: 'card' })).toBe(false);
    expect(isOrderUnpaid({ paymentMethod: 'upi' })).toBe(false);
    expect(isOrderUnpaid({ paid: true, paymentMethod: 'unpaid' })).toBe(false);
    expect(isOrderUnpaid({ isComplimentary: true })).toBe(false);

    expect(isOrderPaid({ paymentMethod: 'cash' })).toBe(true);
    expect(isOrderPaid({ paymentMethod: 'unpaid' })).toBe(false);
  });

  it('keeps served but unpaid orders in Open Orders queue marked as SERVED DUE with Quick Cash button', () => {
    useOrderStore.setState({
      activeOrders: [
        {
          id: 'order_served_unpaid',
          token: 99,
          type: 'dine-in',
          tableName: 'T99',
          status: 'completed', // Kitchen finished & served
          total: 990,
          paymentMethod: 'Unpaid (Guest Check)', // Bill printed or unpaid
          items: [{ name: 'Spaghetti Carbonara', qty: 2, price: 495 }],
          createdAt: new Date().toISOString()
        }
      ]
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

    // Order must NOT be lost or hidden; it must be in Open Orders
    expect(screen.getAllByText(/Table T99/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₹990/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SERVED DUE/i).length).toBeGreaterThan(0);

    // Must offer settlement actions, not just a reprint
    expect(screen.getByRole('button', { name: /^Quick Cash$/i })).toBeInTheDocument();
  });

  it('keeps in-kitchen Takeaway orders active in KDS when settled early via settleOrder', async () => {
    useOrderStore.setState({
      activeOrders: [
        {
          id: 'takeaway_cooking_1',
          type: 'takeaway',
          status: 'pending',
          paid: false,
          paymentMethod: 'unpaid',
          total: 320,
          items: [{ name: 'Masala Dosa', qty: 2, price: 160 }]
        }
      ]
    });

    await useOrderStore.getState().settleOrder('rest_test', 'takeaway_cooking_1', 'cash', 320);

    const updated = useOrderStore.getState().activeOrders.find(o => o.id === 'takeaway_cooking_1');
    expect(updated).toBeDefined();
    expect(updated.paid).toBe(true);
    expect(updated.paymentMethod).toBe('cash');
    expect(updated.status).toBe('pending');
  });

  it('skips unresolved serverTimestamp objects in paidAt so Settled Time never renders 05:30 (epoch 0)', () => {
    const validIso = '2026-11-28T07:15:00.000Z';
    const orderWithSentinel = {
      id: 'order_sentinel_1',
      paidAt: { _methodName: 'serverTimestamp' },
      updatedAt: {},
      createdAt: validIso
    };

    expect(resolveOrderTimestampMs(orderWithSentinel)).toBe(new Date(validIso).getTime());
    expect(formatOrderTimestamp(orderWithSentinel)).not.toBe('—');
    expect(formatOrderTimestamp({ id: 'order_no_ts', paidAt: {} })).toBe('—');
  });

  it('renders Today, Yesterday, 7D, and 30D range pills on Paid Bills and Voids tabs', () => {
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Paid Bills/i }));
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7D' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30D' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '7D' }));
    expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();
  });

  it('prevents early-paid cooking orders and settled SERVED DUE checks from reappearing in Open Orders', async () => {
    useOrderStore.setState({
      settledOrderOverrides: {},
      activeOrders: [
        {
          id: 'delivery_cooking_1',
          token: 42,
          type: 'delivery',
          status: 'pending',
          paid: false,
          paymentMethod: 'unpaid',
          total: 880,
          items: [{ name: 'Crispy Calamari', qty: 1, price: 880 }],
          createdAt: new Date().toISOString()
        }
      ]
    });

    await useOrderStore.getState().settleOrder('rest_test', 'delivery_cooking_1', 'cash', 880);

    // KDS activeOrders retains it while pending, with paid=true + durable override recorded
    expect(useOrderStore.getState().activeOrders.find(o => o.id === 'delivery_cooking_1')?.paid).toBe(true);
    expect(useOrderStore.getState().settledOrderOverrides['delivery_cooking_1']?.paid).toBe(true);

    // Open Orders queue in ActiveOrdersModal hides early-paid in-kitchen orders so it does not linger after Quick Cash
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );
    expect(screen.getByText(/No active orders found/i)).toBeInTheDocument();
  });

  it('normalizes unpaid paymentMethod to cash on loadOrderToCart and clearCart so Pay flow never submits unpaid', () => {
    const store = useOrderStore.getState();
    store.setPaymentMethod('unpaid');
    store.clearCart();
    expect(useOrderStore.getState().paymentMethod).toBe('cash');

    store.loadOrderToCart({
      id: 'served_due_tbl_big',
      type: 'dine-in',
      tableName: 'Big',
      paymentMethod: 'unpaid',
      items: [{ id: 'item_1', name: 'Crispy Calamari', price: 260, qty: 1 }],
    });
    expect(useOrderStore.getState().paymentMethod).toBe('cash');

    store.loadOrderToCart({
      id: 'guest_check_1',
      type: 'dine-in',
      tableName: 'T2',
      paymentMethod: 'Unpaid (Guest Check)',
      items: [{ id: 'item_2', name: 'Pasta', price: 320, qty: 1 }],
    });
    expect(useOrderStore.getState().paymentMethod).toBe('cash');
  });

  it('displays base item price and priced addons (e.g. Mayo) separately in Orders breakdown', () => {
    useOrderStore.setState({
      settledOrderOverrides: {},
      activeOrders: [
        {
          id: 'order_addon_wings',
          token: 55,
          type: 'takeaway',
          status: 'pending',
          paymentMethod: 'unpaid',
          total: 360,
          items: [
            {
              id: 'wings_1',
              name: 'Buffalo Wings',
              qty: 1,
              price: 360,
              selectedModifiers: [{ id: 'mayo', name: 'Mayo', priceAdd: 10 }]
            }
          ],
          createdAt: new Date().toISOString()
        }
      ]
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

    expect(screen.getByText('₹350.00')).toBeInTheDocument();
    expect(screen.getByText('+ Mayo')).toBeInTheDocument();
    expect(screen.getByText('+₹10.00')).toBeInTheDocument();
  });

  it('syncs settledOrderOverrides when updateOrderStatus or patchActiveOrder advances status', async () => {
    const onlineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      useOrderStore.setState({
        settledOrderOverrides: {
          table_t9_override: {
            status: 'preparing',
            paid: true,
            paymentMethod: 'cash',
          }
        },
        activeOrders: [
          {
            id: 'table_t9_override',
            type: 'dine-in',
            tableName: 'T9',
            status: 'preparing',
            paid: true,
            paymentMethod: 'cash',
            total: 520,
            items: [{ id: 'pasta_1', name: 'Carbonara', qty: 1, price: 520 }],
            createdAt: new Date().toISOString()
          }
        ]
      });

      await useOrderStore.getState().updateOrderStatus('rest_test', 'table_t9_override', 'ready');
      expect(useOrderStore.getState().settledOrderOverrides['table_t9_override']?.status).toBe('ready');
      expect(useOrderStore.getState().activeOrders.find(o => o.id === 'table_t9_override')?.status).toBe('ready');

      useOrderStore.getState().patchActiveOrder('table_t9_override', { status: 'served' });
      expect(useOrderStore.getState().settledOrderOverrides['table_t9_override']?.status).toBe('served');
    } finally {
      onlineSpy.mockRestore();
    }
  });

  it('completes paid Counter orders on Order Ready without keeping them stuck in Open Orders', async () => {
    useOrderStore.setState({
      settledOrderOverrides: {
        counter_paid_tblw: {
          status: 'pending',
          paid: true,
          paymentMethod: 'cash',
        }
      },
      activeOrders: [
        {
          id: 'counter_paid_tblw',
          type: 'dine-in',
          tableId: null,
          tableName: null,
          status: 'pending',
          paid: true,
          paymentMethod: 'cash',
          total: 360,
          items: [{ id: 'wings_1', name: 'Buffalo Wings', qty: 1, price: 360 }],
          createdAt: new Date().toISOString()
        },
        {
          id: 'delivery_unpaid_q5u1',
          type: 'delivery',
          status: 'pending',
          paid: false,
          paymentMethod: 'unpaid',
          total: 815,
          items: [{ id: 'calamari_1', name: 'Crispy Calamari', qty: 1, price: 815 }],
          createdAt: new Date(Date.now() - 60000).toISOString()
        }
      ]
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

    const readyBtn = document.getElementById('orders-mark-ready-btn');
    expect(readyBtn).toBeInTheDocument();
    fireEvent.click(readyBtn);

    await vi.waitFor(() => {
      expect(useOrderStore.getState().activeOrders.some(o => o.id === 'counter_paid_tblw')).toBe(false);
    });
    expect(useOrderStore.getState().settledOrderOverrides['counter_paid_tblw']?.status).toBe('completed');

    await vi.waitFor(() => {
      expect(screen.getByText('Crispy Calamari')).toBeInTheDocument();
    });
  });

  it('normalizes pickup and online order types on loadOrderToCart while preserving Pack, notes, and allergies', () => {
    const store = useOrderStore.getState();

    store.loadOrderToCart({
      id: 'pickup_ord_1',
      type: 'pickup',
      paymentMethod: 'unpaid',
      items: [
        {
          id: 'item_p1',
          name: 'Club Sandwich',
          qty: 1,
          price: 220,
          isTakeaway: true,
          itemNote: 'Extra toasted',
          allergies: ['peanut'],
        }
      ],
    });

    let loaded = useOrderStore.getState();
    expect(loaded.orderType).toBe('takeaway');
    expect(loaded.paymentMethod).toBe('cash');
    expect(loaded.items[0].isTakeaway).toBe(true);
    expect(loaded.items[0].itemNote).toBe('Extra toasted');
    expect(loaded.items[0].allergies).toEqual(['peanut']);

    store.loadOrderToCart({
      id: 'online_ord_2',
      type: 'online',
      orderType: 'takeaway',
      paymentMethod: 'upi',
      items: [{ id: 'item_o1', name: 'Lemonade', qty: 2, price: 90 }],
    });
    loaded = useOrderStore.getState();
    expect(loaded.orderType).toBe('takeaway');
    expect(loaded.paymentMethod).toBe('upi');
  });
});
