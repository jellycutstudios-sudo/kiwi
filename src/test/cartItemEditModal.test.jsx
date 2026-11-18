// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CartItemEditModal from '../components/pos/CartItemEditModal';

vi.mock('../utils/soundNotifications', () => ({
  hapticTap: vi.fn(),
}));

const sampleCartItem = {
  id: 'item_fries',
  name: 'Truffle Parmesan Fries',
  price: 180,
  qty: 1,
  course: 'Mains',
  prepState: 'fired',
  seatNumber: null,
  itemNote: '',
  selectedModifiers: [{ id: 'opt_lg', name: 'Large', priceAdd: 0 }],
};

describe('CartItemEditModal — accessible cart item customization popup', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('updates quantity via stepper, quick presets, and saves updated details', () => {
    const onSave = vi.fn();
    render(
      <CartItemEditModal
        item={sampleCartItem}
        currency="INR"
        orderType="dine-in"
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Displays item name, modifier chip, and unit price
    expect(screen.getByText('Truffle Parmesan Fries')).toBeTruthy();
    expect(screen.getByText('+Large')).toBeTruthy();
    expect(screen.getByText(/₹180\.00 each/i)).toBeTruthy();

    // Tap '+' to increase qty to 2
    fireEvent.click(screen.getByRole('button', { name: /Increase item quantity/i }));
    expect(screen.getByLabelText('Edit item quantity').value).toBe('2');

    // Tap quick preset '5'
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getByLabelText('Edit item quantity').value).toBe('5');

    // Toggle kitchen note presets
    fireEvent.click(screen.getByRole('button', { name: 'Less Spicy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pack Separately' }));
    expect(screen.getByLabelText('Kitchen note').value).toBe('Less Spicy, Pack Separately');

    // Toggle Hold, Course, and Seat
    fireEvent.click(screen.getByRole('button', { name: /Hold/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Starters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seat 2' }));

    // Save button shows updated live total (5 * 180 = ₹900.00)
    const saveBtn = screen.getByRole('button', { name: /Save · ₹900\.00/i });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      qty: 5,
      itemNote: 'Less Spicy, Pack Separately',
      prepState: 'hold',
      course: 'Starters',
      seatNumber: 2,
    });
  });

  it('opens Touch Number Pad for high bulk quantities (e.g. 50)', () => {
    const onSave = vi.fn();
    render(
      <CartItemEditModal
        item={sampleCartItem}
        currency="INR"
        orderType="takeaway"
        onSave={onSave}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Seat selector is hidden for takeaway orders
    expect(screen.queryByRole('button', { name: 'Seat 1' })).toBeNull();

    // Open Touch Number Pad and tap preset '100' (unique to keypad)
    fireEvent.click(screen.getByRole('button', { name: /Open Touch Number Pad/i }));
    fireEvent.click(screen.getByRole('button', { name: '100' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm: 100/i }));

    expect(screen.getByLabelText('Edit item quantity').value).toBe('100');
    fireEvent.click(screen.getByRole('button', { name: /Save · ₹18,000\.00/i }));

    expect(onSave).toHaveBeenCalledWith({
      qty: 100,
      itemNote: '',
      prepState: 'fired',
      course: 'Mains',
      seatNumber: null,
    });
  });

  it('triggers onRemove when clicking the large Remove button', () => {
    const onRemove = vi.fn();
    render(
      <CartItemEditModal
        item={sampleCartItem}
        currency="INR"
        orderType="dine-in"
        onSave={vi.fn()}
        onRemove={onRemove}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
