// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActiveOrdersModal from '../components/pos/ActiveOrdersModal';
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
    expect(screen.getByRole('button', { name: /Completed Orders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Voids \/ Cancelled/i })).toBeInTheDocument();
  });

  it('defaults to Table View with clean columns and ticket numbers', () => {
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    // Header column labels
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Order / Table')).toBeInTheDocument();
    expect(screen.getByText('Items Summary')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // Table rows
    expect(screen.getByText(/Table T4/i)).toBeInTheDocument();
    expect(screen.getByText(/Token #18/i)).toBeInTheDocument();
    expect(screen.getByText(/Buffalo Wings/i)).toBeInTheDocument();
    expect(screen.getAllByText(/READY/i).length).toBeGreaterThan(0);
  });

  it('provides touch action buttons on open table rows: Resume, Bill, and Quick Cash', () => {
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

    const resumeBtns = screen.getAllByRole('button', { name: /Resume/i });
    expect(resumeBtns.length).toBeGreaterThan(0);
    fireEvent.click(resumeBtns[0]);
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

  it('switches to Completed Orders tab smoothly', () => {
    render(
      <ActiveOrdersModal
        isOpen={true}
        onClose={vi.fn()}
        restaurant={mockRestaurant}
        currency="₹"
        staffName="Cashier Sam"
      />
    );

    const completedTab = screen.getByRole('button', { name: /Completed Orders/i });
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
});
