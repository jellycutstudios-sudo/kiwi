// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import SelfServiceKiosk from '../routes/SelfServiceKiosk';
import { useAuthStore } from '../stores/authStore';
import { useMenuStore } from '../stores/menuStore';
import { useTokenStore } from '../stores/tokenStore';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mockqr')),
  },
}));

vi.mock('../utils/soundNotifications', () => ({
  playNotificationTone: vi.fn(),
  hapticTap: vi.fn(),
}));

vi.mock('../utils/print', () => ({
  printTokenTicket: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, ...parts) => ({ id: parts[parts.length - 1] || 'mock_doc_id', path: parts.join('/') })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => true, id: 'rest_kiosk', data: () => ({ name: 'Kiwi Cafe', currency: 'INR' }) })),
  getDocs: vi.fn(() => Promise.resolve({ empty: false, docs: [{ id: 'rest_kiosk', data: () => ({ name: 'Kiwi Cafe', currency: 'INR' }) }] })),
  setDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
}));

describe('Self-Service Kiosk Route', () => {
  const mockRestaurant = {
    id: 'rest_kiosk',
    name: 'Kiwi Cafe',
    currency: 'INR',
    upiConfig: { vpa: 'kiwicafe@upi', name: 'Kiwi Cafe' }
  };

  const sampleCategories = [
    {
      id: 'cat_burgers',
      name: 'Burgers',
      items: [
        { id: 'dish_b1', name: 'Classic Cheeseburger', price: 250, isVeg: false, available: true, mlName: 'ക്ലാസിക് ചീസ് ബർഗർ' },
        { id: 'dish_b2', name: 'Crispy Veg Burger', price: 180, isVeg: true, available: true, mlName: 'ക്രിസ്പി വെജ് ബർഗർ' }
      ]
    },
    {
      id: 'cat_drinks',
      name: 'Beverages',
      items: [
        { id: 'dish_d1', name: 'Fresh Lemonade', price: 90, isVeg: true, available: true, mlName: 'ഫ്രെഷ് ലെമണേഡ്' }
      ]
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      restaurant: {
        id: 'rest_kiosk',
        name: 'Kiwi Cafe',
        currency: 'INR',
        upiConfig: { vpa: 'kiwicafe@upi', name: 'Kiwi Cafe' }
      }
    });

    useMenuStore.setState({
      categories: sampleCategories,
      loading: false
    });

    useTokenStore.setState({
      issueToken: vi.fn(() => Promise.resolve(105))
    });
  });

  it('renders attract screen with Dine In and Takeaway options', () => {
    render(
      <MemoryRouter>
        <SelfServiceKiosk initialRestaurant={mockRestaurant} initialCategories={sampleCategories} />
      </MemoryRouter>
    );

    expect(screen.getByText('Touch Anywhere to Order')).toBeTruthy();
    expect(screen.getByText('Dine In')).toBeTruthy();
    expect(screen.getByText('Takeaway')).toBeTruthy();
    expect(screen.getByText('Kiwi Cafe')).toBeTruthy();
  });

  it('transitions to menu on clicking Dine In and allows adding items to cart', async () => {
    render(
      <MemoryRouter>
        <SelfServiceKiosk initialRestaurant={mockRestaurant} initialCategories={sampleCategories} />
      </MemoryRouter>
    );

    // Click Dine In
    const dineInBtn = screen.getByText('Dine In').closest('button');
    fireEvent.click(dineInBtn);

    // Verify Menu Screen Loaded
    expect(screen.getByText('Classic Cheeseburger')).toBeTruthy();
    expect(screen.getByText('Crispy Veg Burger')).toBeTruthy();

    // Add Crispy Veg Burger to Cart
    const addBtns = screen.getAllByRole('button', { name: /Add/i });
    fireEvent.click(addBtns[1]); // second dish

    // Bottom cart bar should appear with item count
    expect(screen.getByText(/Order Total/i)).toBeTruthy();
    expect(screen.getByText(/Pay & Place Order/i)).toBeTruthy();
  });

  it('allows language switching to Malayalam on the kiosk', () => {
    render(
      <MemoryRouter>
        <SelfServiceKiosk initialRestaurant={mockRestaurant} initialCategories={sampleCategories} />
      </MemoryRouter>
    );

    // Switch to Malayalam
    const mlPill = screen.getByText(/മലയാളം/i);
    fireEvent.click(mlPill);

    // Enter Menu
    const dineInBtn = screen.getByText('Dine In').closest('button');
    fireEvent.click(dineInBtn);

    // Localized Malayalam title should be visible
    expect(screen.getByText('ക്ലാസിക് ചീസ് ബർഗർ')).toBeTruthy();
  });

  it('proceeds through checkout, generates UPI QR and displays Token #105 on success', async () => {
    render(
      <MemoryRouter>
        <SelfServiceKiosk initialRestaurant={mockRestaurant} initialCategories={sampleCategories} />
      </MemoryRouter>
    );

    // 1. Enter menu
    fireEvent.click(screen.getByText('Dine In').closest('button'));

    // 2. Add an item
    const addBtns = screen.getAllByRole('button', { name: /Add/i });
    fireEvent.click(addBtns[0]);

    // 3. Open Checkout
    const payBtn = screen.getByText(/Pay & Place Order/i);
    fireEvent.click(payBtn);

    // 4. Checkout modal opens with UPI & Pay at Counter options
    expect(screen.getByText('Select Payment Method')).toBeTruthy();
    expect(screen.getByText('Scan with any UPI App to Pay')).toBeTruthy();

    // 5. Place order
    const confirmBtn = screen.getByText(/I Have Paid via UPI/i);
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    // 6. Token #105 is issued and displayed on the success screen
    await waitFor(() => {
      expect(screen.getByText('#105')).toBeTruthy();
      expect(screen.getByText(/Your Pickup Token Number/i)).toBeTruthy();
      expect(screen.getByText(/Next Customer/i)).toBeTruthy();
    });
  });
});
