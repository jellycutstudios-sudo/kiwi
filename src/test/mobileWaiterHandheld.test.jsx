// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import MobileWaiterHandheld from '../components/pos/MobileWaiterHandheld';
import { useOrderStore } from '../stores/orderStore';
import { useTableStore } from '../stores/tableStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  increment: vi.fn(),
  writeBatch: vi.fn(),
}));

describe('Pillar 3: Mobile Waiter Handheld & Course Engine', () => {
  const mockRestaurant = {
    id: 'rest_demo',
    currency: 'USD'
  };

  const sampleMenuItems = [
    { id: 'dish_1', name: 'Truffle Fries', price: 12, isVeg: true, categoryId: 'cat_starters', isBestseller: true },
    { id: 'dish_2', name: 'Ribeye Steak', price: 38, isVeg: false, categoryId: 'cat_mains' },
    { id: 'dish_3', name: 'Classic Mojito', price: 10, isVeg: true, categoryId: 'cat_drinks' }
  ];

  const sampleCategories = [
    { id: 'cat_starters', name: 'Starters' },
    { id: 'cat_mains', name: 'Mains' },
    { id: 'cat_drinks', name: 'Drinks' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useOrderStore.getState().clearCart();
    useTableStore.setState({
      tables: [
        { id: 'tbl_1', name: 'T1', capacity: 4, status: 'free' },
        { id: 'tbl_2', name: 'T2', capacity: 2, status: 'occupied' }
      ]
    });
  });

  it('updates item details (course, prepState, allergies, notes) in orderStore', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'item_test_1', name: 'Grilled Salmon', price: 28 });

    expect(useOrderStore.getState().items.length).toBe(1);

    // Update to Starter course on hold with gluten-free tag
    useOrderStore.getState().setItemDetails('item_test_1', {
      course: 'Starters',
      prepState: 'hold',
      seatNumber: 2,
      allergies: ['Gluten-Free'],
      itemNote: 'Well done crispy skin'
    });

    const updated = useOrderStore.getState().items[0];
    expect(updated.course).toBe('Starters');
    expect(updated.prepState).toBe('hold');
    expect(updated.seatNumber).toBe(2);
    expect(updated.allergies).toContain('Gluten-Free');
    expect(updated.itemNote).toBe('Well done crispy skin');
  });

  it('batch fires held course items via fireHeldItems', async () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'drink_1', name: 'Iced Latte', price: 5, prepState: 'fired', course: 'Drinks' });
    store.addItem({ id: 'main_1', name: 'T-Bone Steak', price: 45, prepState: 'hold', course: 'Mains' });
    store.addItem({ id: 'dessert_1', name: 'Tiramisu', price: 12, prepState: 'hold', course: 'Desserts' });

    // Fire all held items
    const res = await useOrderStore.getState().fireHeldItems(mockRestaurant, 'all');
    expect(res.firedCount).toBe(2);

    const items = useOrderStore.getState().items;
    expect(items.every(i => i.prepState === 'fired')).toBe(true);
  });

  it('renders Mobile Waiter Handheld view with menu, thumb categories, and cart drawer', () => {
    render(
      <MobileWaiterHandheld
        restaurant={mockRestaurant}
        currency="USD"
        menuItems={sampleMenuItems}
        categories={sampleCategories}
        staffName="Alex"
        onCloseHandheld={vi.fn()}
        onSendToKitchen={vi.fn()}
        onPrintPreBill={vi.fn()}
        onOpenSplitModal={vi.fn()}
        onOpenPayment={vi.fn()}
      />
    );

    // Header staff & table badges
    expect(screen.getByText('👤 Alex')).toBeTruthy();
    expect(screen.getByText('Select Table')).toBeTruthy();

    // Menu dishes rendered
    expect(screen.getByText('Truffle Fries')).toBeTruthy();
    expect(screen.getByText('Ribeye Steak')).toBeTruthy();
    expect(screen.getByText('Classic Mojito')).toBeTruthy();

    // Thumb category navigation
    expect(screen.getByText('All Items')).toBeTruthy();
    expect(screen.getByText('Starters')).toBeTruthy();
    expect(screen.getByText('Mains')).toBeTruthy();
    expect(screen.getByText('Drinks')).toBeTruthy();
  });

  it('supports rapid inline thumb additions and table assignment', () => {
    render(
      <MobileWaiterHandheld
        restaurant={mockRestaurant}
        currency="USD"
        menuItems={sampleMenuItems}
        categories={sampleCategories}
        staffName="Alex"
        onCloseHandheld={vi.fn()}
        onSendToKitchen={vi.fn()}
        onPrintPreBill={vi.fn()}
        onOpenSplitModal={vi.fn()}
        onOpenPayment={vi.fn()}
      />
    );

    // Add Truffle Fries
    const addBtn = screen.getByLabelText('Add Truffle Fries');
    fireEvent.click(addBtn);

    expect(useOrderStore.getState().items.length).toBe(1);
    expect(useOrderStore.getState().items[0].name).toBe('Truffle Fries');
    expect(useOrderStore.getState().items[0].qty).toBe(1);

    // Bottom cart reflects subtotal and item price both show $12.00
    expect(screen.getAllByText('$12.00').length).toBe(2);
  });

  it('allows adding overall table instructions and item cooking notes', () => {
    const store = useOrderStore.getState();
    store.addItem({ id: 'm1', name: 'Ribeye Steak', price: 42 });

    render(
      <MobileWaiterHandheld
        restaurant={mockRestaurant}
        currency="USD"
        menuItems={sampleMenuItems}
        categories={sampleCategories}
        staffName="Alex"
        onCloseHandheld={vi.fn()}
        onSendToKitchen={vi.fn()}
        onPrintPreBill={vi.fn()}
        onOpenSplitModal={vi.fn()}
        onOpenPayment={vi.fn()}
      />
    );

    // Open cart sheet
    const viewCartBtn = screen.getByTitle('View Cart & Actions');
    fireEvent.click(viewCartBtn);

    // Table instructions section is rendered
    expect(screen.getByText('Table / Kitchen Instructions:')).toBeTruthy();
    expect(screen.getByText('🔥 Rush Order')).toBeTruthy();
    expect(screen.getByText('⭐ VIP Table')).toBeTruthy();

    // Tap Rush Order preset
    fireEvent.click(screen.getByText('🔥 Rush Order'));
    expect(useOrderStore.getState().note).toContain('🔥 Rush Order');
  });

  it('opens modifier modal and adds customizable item with selected sub options', () => {
    const itemWithModifiers = {
      id: '8a049dac-dd7c-4ff8-9c00-b53f0f07a706',
      name: 'Garlic chicken',
      price: 360,
      isVeg: false,
      categoryId: 'cat_mains',
      modifierGroups: [
        {
          id: 'grp_gravy',
          name: 'Gravy',
          required: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'opt_qtr', name: 'Quarter', priceAdd: 250 },
            { id: 'opt_half', name: 'Half', priceAdd: 350 },
            { id: 'opt_full', name: 'Full', priceAdd: 750 }
          ]
        },
        {
          id: 'grp_paste',
          name: 'Paste',
          required: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'opt_paste_qtr', name: 'Quarter', priceAdd: 270 },
            { id: 'opt_paste_half', name: 'Half', priceAdd: 340 },
            { id: 'opt_paste_full', name: 'Full', priceAdd: 780 }
          ]
        }
      ]
    };

    render(
      <MobileWaiterHandheld
        restaurant={mockRestaurant}
        currency="INR"
        menuItems={[...sampleMenuItems, itemWithModifiers]}
        categories={sampleCategories}
        staffName="Alex"
        onCloseHandheld={vi.fn()}
        onSendToKitchen={vi.fn()}
        onPrintPreBill={vi.fn()}
        onOpenSplitModal={vi.fn()}
        onOpenPayment={vi.fn()}
      />
    );

    // "Options" badge and price are rendered
    expect(screen.getByText('Options')).toBeTruthy();
    expect(screen.getByText('₹360.00')).toBeTruthy();

    // Tap on Garlic chicken card to open ModifierModal
    fireEvent.click(screen.getByText('Garlic chicken'));

    // Modal opens showing style and portion axes
    expect(screen.getByText('Pick style then portion — 1 item')).toBeTruthy();
    expect(screen.getAllByText('Preparation / Style').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Portion / Size').length).toBeGreaterThan(0);

    // Select Style: Gravy and Portion: Quarter (₹250.00)
    fireEvent.click(screen.getByText('Gravy'));
    fireEvent.click(screen.getByText('Quarter'));

    // Confirm selection
    const confirmBtn = screen.getByRole('button', { name: /Add to Cart/i });
    fireEvent.click(confirmBtn);

    // Cart contains Garlic chicken with sub-options
    const cartItems = useOrderStore.getState().items;
    expect(cartItems.length).toBe(1);
    expect(cartItems[0].name).toBe('Garlic chicken');
    expect(cartItems[0].price).toBe(250);
    expect(cartItems[0].selectedModifiers.length).toBeGreaterThanOrEqual(1);
  });
});
