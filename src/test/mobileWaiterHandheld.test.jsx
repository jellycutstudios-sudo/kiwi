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
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
    } catch (_) {}
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

  it('allows quantity adjustment via stepper, chips, and typing inside modifier modal', () => {
    useOrderStore.getState().clearCart();

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

    // Tap on Garlic chicken card to open ModifierModal
    fireEvent.click(screen.getByText('Garlic chicken'));

    // Select Style: Gravy and Portion: Full (₹750.00)
    fireEvent.click(screen.getByText('Gravy'));
    fireEvent.click(screen.getByText('Full'));

    // Check stepper buttons and quantity chips exist
    const decBtn = screen.getByRole('button', { name: /Decrease quantity/i });
    const incBtn = screen.getByRole('button', { name: /Increase quantity/i });
    const qtyInput = screen.getByLabelText('Quantity');
    expect(decBtn).toBeTruthy();
    expect(incBtn).toBeTruthy();
    expect(qtyInput).toBeTruthy();
    expect(qtyInput.value).toBe('1');

    // Tap '+' to increase quantity to 2
    fireEvent.click(incBtn);
    expect(qtyInput.value).toBe('2');
    expect(screen.getByText('Pick style then portion — 2 items')).toBeTruthy();

    // Confirm button updates to "Add 2 to Cart · ₹1,500.00"
    const confirmBtn = screen.getByRole('button', { name: /Add 2 to Cart · ₹1,500.00/i });
    expect(confirmBtn).toBeTruthy();

    // Tap chip '3'
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(qtyInput.value).toBe('3');

    // Or type directly '2' into the input field
    fireEvent.change(qtyInput, { target: { value: '2' } });
    expect(qtyInput.value).toBe('2');

    // Confirm and add to cart
    fireEvent.click(confirmBtn);

    const cartItems = useOrderStore.getState().items;
    const added = cartItems.find(i => i.name === 'Garlic chicken');
    expect(added).toBeTruthy();
    expect(added.qty).toBe(2);
    expect(added.price).toBe(750);
  });

  it('allows ordering multiple portions simultaneously (e.g. 2 Full and 1 Half) in a single modal trip', () => {
    useOrderStore.getState().clearCart();

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

    // Tap on Garlic chicken card to open ModifierModal
    fireEvent.click(screen.getByText('Garlic chicken'));

    // Step 1: Style Gravy
    fireEvent.click(screen.getByText('Gravy'));

    // Step 2: Tap "Full" to add 1 Full
    fireEvent.click(screen.getByText('Full'));

    // Increment Full to 2 using its inline '+' stepper button
    const incFullBtn = screen.getByRole('button', { name: /Increase Full quantity/i });
    fireEvent.click(incFullBtn);

    // Tap "Half" to also add 1 Half
    fireEvent.click(screen.getByText('Half'));

    // Total: 2 Full (₹1,500) + 1 Half (₹350) = 3 items @ ₹1,850.00
    expect(screen.getByText('Pick style then portion — 3 items')).toBeTruthy();
    expect(screen.getByText(/3 selected/i)).toBeTruthy();

    const confirmBtn = screen.getByRole('button', { name: /Add 3 to Cart · ₹1,850.00/i });
    expect(confirmBtn).toBeTruthy();

    // Confirm both portions together!
    fireEvent.click(confirmBtn);

    // Cart now has 2 distinct line items added in a single trip!
    const cartItems = useOrderStore.getState().items;
    expect(cartItems.length).toBe(2);

    const fullItem = cartItems.find(i => i.selectedModifiers.some(m => m.name === 'Full'));
    const halfItem = cartItems.find(i => i.selectedModifiers.some(m => m.name === 'Half'));

    expect(fullItem).toBeTruthy();
    expect(fullItem.qty).toBe(2);
    expect(fullItem.price).toBe(750);

    expect(halfItem).toBeTruthy();
    expect(halfItem.qty).toBe(1);
    expect(halfItem.price).toBe(350);
  });

  it('allows setting high bulk quantity (50 Rotis) via TouchQuantityPadModal in one tap', () => {
    useOrderStore.getState().clearCart();

    const rotiItem = {
      id: 'dish_roti_1',
      name: 'Butter Roti',
      price: 20,
      isVeg: true,
      categoryId: 'cat_mains'
    };

    render(
      <MobileWaiterHandheld
        restaurant={mockRestaurant}
        currency="INR"
        menuItems={[rotiItem]}
        categories={sampleCategories}
        staffName="Alex"
        onCloseHandheld={vi.fn()}
        onSendToKitchen={vi.fn()}
        onPrintPreBill={vi.fn()}
        onOpenSplitModal={vi.fn()}
        onOpenPayment={vi.fn()}
      />
    );

    // Tap Add to add 1 Roti
    fireEvent.click(screen.getByText('Add'));

    // Tap on the quantity display (1) to open TouchQuantityPadModal
    const stepQty = screen.getByTitle('Tap to set quantity directly');
    fireEvent.click(stepQty);

    // Keypad opens showing title and quick presets
    expect(screen.getByText('Set Quantity')).toBeTruthy();
    expect(screen.getAllByText('Butter Roti').length).toBeGreaterThan(0);

    // Tap the '50' preset button
    const preset50 = screen.getByRole('button', { name: '50' });
    fireEvent.click(preset50);

    // Confirm: 50 Rotis
    const setBtn = screen.getByRole('button', { name: /Confirm: 50/i });
    fireEvent.click(setBtn);

    // Verify cart has 50 Rotis immediately without tapping 50 times
    const cartItems = useOrderStore.getState().items;
    expect(cartItems[0].name).toBe('Butter Roti');
    expect(cartItems[0].qty).toBe(50);
  });

  it('allows waiter to switch dish language to Malayalam and view phonetic script', () => {
    const dishes = [
      { id: 'dish_gc', name: 'Garlic Chicken', price: 280, isVeg: false, categoryId: 'cat_mains' }
    ];

    render(
      <MobileWaiterHandheld
        restaurant={mockRestaurant}
        currency="INR"
        menuItems={dishes}
        categories={sampleCategories}
        staffName="Alex"
        onCloseHandheld={vi.fn()}
        onSendToKitchen={vi.fn()}
        onPrintPreBill={vi.fn()}
        onOpenSplitModal={vi.fn()}
        onOpenPayment={vi.fn()}
      />
    );

    // Initial English display
    expect(screen.getByText('Garlic Chicken')).toBeTruthy();

    // Click language switcher pill
    const langBtn = screen.getByLabelText('Switch Language');
    fireEvent.click(langBtn);

    // Language sheet opens with options
    expect(screen.getByText('Waiter Dish Script')).toBeTruthy();
    expect(screen.getByText('മലയാളം')).toBeTruthy();

    // Select Malayalam
    const mlOption = screen.getAllByText('മലയാളം').find(el => el.closest('.handheld-lang-option')) || screen.getAllByText('മലയാളം')[0];
    fireEvent.click(mlOption);

    // Phonetic Malayalam script "ഗാർലിക് ചിക്കൻ" is rendered as primary title
    expect(screen.getByText('ഗാർലിക് ചിക്കൻ')).toBeTruthy();
    // English subtitle is still present underneath for kitchen clarity
    expect(screen.getByText('Garlic Chicken')).toBeTruthy();
  });

  it('prioritizes item.mlName and item.hiName custom translations over transliterator', () => {
    const dishes = [
      { id: 'dish_custom', name: 'Chef Special Tacos', mlName: 'ഷെഫ് സ്പെഷ്യൽ ടാക്കോസ്', hiName: 'शेफ स्पेशल टैकोस', price: 350, isVeg: false, categoryId: 'cat_mains' }
    ];

    render(
      <MobileWaiterHandheld
        restaurant={mockRestaurant}
        currency="INR"
        menuItems={dishes}
        categories={sampleCategories}
        staffName="Alex"
        onCloseHandheld={vi.fn()}
        onSendToKitchen={vi.fn()}
        onPrintPreBill={vi.fn()}
        onOpenSplitModal={vi.fn()}
        onOpenPayment={vi.fn()}
      />
    );

    // Switch to Malayalam
    const langBtn = screen.getByLabelText('Switch Language');
    fireEvent.click(langBtn);
    const mlOption = screen.getAllByText('മലയാളം').find(el => el.closest('.handheld-lang-option')) || screen.getAllByText('മലയാളം')[0];
    fireEvent.click(mlOption);

    // Custom mlName is displayed
    expect(screen.getByText('ഷെഫ് സ്പെഷ്യൽ ടാക്കോസ്')).toBeTruthy();
  });

  it('allows waiter to toggle between 2-column grid and list view mode', () => {
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

    const toggleBtn = screen.getByLabelText('Toggle View Mode');
    expect(toggleBtn).toBeTruthy();

    // Toggle from grid to list
    fireEvent.click(toggleBtn);
    expect(screen.getByRole('main')).toBeTruthy();
  });
});
