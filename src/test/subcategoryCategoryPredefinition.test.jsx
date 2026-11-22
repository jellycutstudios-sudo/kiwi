// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import MenuEditor from '../routes/admin/MenuEditor';
import { useMenuStore } from '../stores/menuStore';
import { useAuthStore } from '../stores/authStore';

// Partial mock for firestore
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    collection: vi.fn(),
    addDoc: vi.fn(() => Promise.resolve({ id: 'cloud_cat_123' })),
    updateDoc: vi.fn(() => Promise.resolve()),
    deleteDoc: vi.fn(() => Promise.resolve()),
    doc: vi.fn(),
    getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    })),
  };
});

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

describe('MenuEditor Subcategory Pre-Definition & 1-Tap Assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({
      restaurant: {
        id: 'rest-123',
        currency: 'INR',
        businessType: 'restaurant',
        kitchenConfig: { stations: ['Kitchen', 'Bar'] }
      },
      staffDoc: { role: 'admin' },
      user: { uid: 'user-123' },
    });

    useMenuStore.setState({
      categories: [
        {
          id: 'cat-bev',
          name: 'Beverages',
          emoji: '🍹',
          order: 0,
          subCategories: ['Mocktails', 'Cocktails'],
          items: [
            { id: 'item-1', name: 'Virgin Mojito', price: 180, available: true, subCategory: 'Mocktails' },
            { id: 'item-2', name: 'Cosmopolitan', price: 350, available: true, subCategory: 'Cocktails' },
            { id: 'item-3', name: 'Masala Chai', price: 60, available: true, subCategory: 'Hot Brews' }
          ]
        }
      ]
    });
  });

  it('allows adding and removing subcategory chips in the Add/Edit Category modal', async () => {
    const { container } = render(<MenuEditor />);

    // Open Edit Category for Beverages
    const editCatBtn = container.querySelector('#edit-cat-cat-bev');
    expect(editCatBtn).toBeTruthy();
    act(() => {
      fireEvent.click(editCatBtn);
    });

    // Check modal opened with existing subcategories
    expect(screen.getByText('Edit Category')).toBeTruthy();
    expect(screen.getAllByText('Mocktails').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cocktails').length).toBeGreaterThan(0);
    // 'Hot Brews' was on an item, so it was also unified
    expect(screen.getAllByText('Hot Brews').length).toBeGreaterThan(0);

    // Type a new subcategory and press Enter
    const subcatInput = screen.getByPlaceholderText(/Mocktails, Cocktails/i);
    act(() => {
      fireEvent.change(subcatInput, { target: { value: 'Smoothies' } });
      fireEvent.keyDown(subcatInput, { key: 'Enter', code: 'Enter' });
    });

    // Verify chip was added
    expect(screen.getByText('Smoothies')).toBeTruthy();

    // Remove 'Mocktails' chip
    const removeBtn = screen.getByTitle('Remove Mocktails');
    act(() => {
      fireEvent.click(removeBtn);
    });

    // Mocktails remove chip button should no longer exist
    expect(screen.queryByTitle('Remove Mocktails')).toBeNull();

    // Click Save Changes
    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Menu store category should be updated
    const updatedBev = useMenuStore.getState().categories.find(c => c.id === 'cat-bev');
    expect(updatedBev.subCategories).toContain('Smoothies');
    expect(updatedBev.subCategories).not.toContain('Mocktails');
  });

  it('renders 1-tap select/deselect chips in the Item modal', async () => {
    const { container } = render(<MenuEditor />);

    // Open Add Dish modal
    const addDishBtn = container.querySelector('#add-item-btn');
    expect(addDishBtn).toBeTruthy();
    act(() => {
      fireEvent.click(addDishBtn);
    });

    // Subcategory pills should appear for Beverages
    const mocktailPill = screen.getByRole('button', { name: /\+ Mocktails/i });
    expect(mocktailPill).toBeTruthy();

    // Tap the Mocktail pill -> should select it
    act(() => {
      fireEvent.click(mocktailPill);
    });

    // Input field should now have 'Mocktails'
    const subcatInput = screen.getByPlaceholderText(/Mocktails, Indian, etc/i);
    expect(subcatInput.value).toBe('Mocktails');

    // The pill should now show checked state '✓ Mocktails'
    const checkedPill = screen.getByRole('button', { name: /✓ Mocktails/i });
    expect(checkedPill).toBeTruthy();

    // Tap it again -> should deselect (toggle off)
    act(() => {
      fireEvent.click(checkedPill);
    });
    expect(subcatInput.value).toBe('');
  });
});
