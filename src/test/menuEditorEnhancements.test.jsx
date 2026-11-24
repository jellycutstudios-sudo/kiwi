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
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
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

describe('MenuEditor Enhancements: All Items, Global Search, and Category Reordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({
      restaurant: {
        id: 'rest-123',
        currency: 'USD',
        businessType: 'restaurant',
        kitchenConfig: { stations: ['Kitchen', 'Bar'] }
      },
      staffDoc: { role: 'admin' },
      user: { uid: 'user-123' },
    });

    useMenuStore.setState({
      categories: [
        {
          id: 'cat-1',
          name: 'Pasta & Mains',
          emoji: '🍝',
          order: 0,
          items: [
            { id: 'item-1', name: 'Spaghetti Carbonara', price: 15, available: true }
          ]
        },
        {
          id: 'cat-2',
          name: 'Burgers',
          emoji: '🍔',
          order: 1,
          items: [
            { id: 'item-2', name: 'Cheeseburger Deluxe', price: 12, available: true },
            { id: 'item-3', name: 'Bacon Burger', price: 14, available: false }
          ]
        }
      ],
      search: '',
    });
  });

  it('renders pinned "All Items" row in sidebar and mobile strip showing total item count', async () => {
    await act(async () => {
      render(<MenuEditor />);
    });

    const sidebarAll = document.getElementById('cat-sidebar-all');
    expect(sidebarAll).toBeTruthy();
    expect(sidebarAll.textContent).toContain('All Items');
    expect(sidebarAll.textContent).toMatch(/3 total (items|dishes)/);

    const mobileStripAll = document.getElementById('cat-mobile-strip-all');
    expect(mobileStripAll).toBeTruthy();
    expect(mobileStripAll.textContent).toContain('All Items');
    expect(mobileStripAll.textContent).toContain('3');
  });

  it('displays all items across categories when "All Items" is active', async () => {
    await act(async () => {
      render(<MenuEditor />);
    });

    // In All Items view (default), all 3 items are visible
    expect(screen.getByText('Spaghetti Carbonara')).toBeTruthy();
    expect(screen.getByText('Cheeseburger Deluxe')).toBeTruthy();
    expect(screen.getByText('Bacon Burger')).toBeTruthy();
  });

  it('filters all items globally when typing in search while in All Items', async () => {
    await act(async () => {
      render(<MenuEditor />);
    });

    const searchInput = screen.getAllByPlaceholderText(/Search all items/i)[0];
    expect(searchInput).toBeTruthy();

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Carbonara' } });
    });

    expect(screen.getByText('Spaghetti Carbonara')).toBeTruthy();
    expect(screen.queryByText('Cheeseburger Deluxe')).toBeNull();
  });

  it('shows cross-category search matches banner when searching within a specific category', async () => {
    await act(async () => {
      render(<MenuEditor />);
    });

    // Switch to category 1 (Pasta & Mains) in sidebar
    const pastaCatBtn = screen.getAllByText('Pasta & Mains')[0];
    await act(async () => {
      fireEvent.click(pastaCatBtn);
    });

    // Search for "burger", which belongs to Burgers category (cat-2)
    const searchInput = screen.getAllByPlaceholderText(/Search in Pasta & Mains/i)[0];
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'burger' } });
    });

    // Banner should suggest matches in Burgers category
    expect(screen.getByText(/Found/i)).toBeTruthy();
    expect(screen.getByText(/more in other categories/i)).toBeTruthy();
    expect(screen.getByText(/View All in Catalog/i)).toBeTruthy();
  });

  it('supports reordering categories using up/down arrow buttons', async () => {
    const reorderSpy = vi.fn();
    useMenuStore.setState({ reorderCategories: reorderSpy });

    await act(async () => {
      render(<MenuEditor />);
    });

    const downBtns = screen.getAllByTitle('Move category down');
    expect(downBtns.length).toBeGreaterThan(0);

    // Click move down on first category
    await act(async () => {
      fireEvent.click(downBtns[0]);
    });

    expect(reorderSpy).toHaveBeenCalledTimes(1);
    const newCatsOrder = reorderSpy.mock.calls[0][0];
    expect(newCatsOrder[0].id).toBe('cat-2');
    expect(newCatsOrder[1].id).toBe('cat-1');
  });

  it('allows selecting target category in Add Item modal', async () => {
    await act(async () => {
      render(<MenuEditor />);
    });

    const addItemBtn = document.getElementById('add-item-btn');
    await act(async () => {
      fireEvent.click(addItemBtn);
    });

    const categorySelect = document.getElementById('item-category-select');
    expect(categorySelect).toBeTruthy();
    expect(categorySelect.options.length).toBe(2);
    expect(categorySelect.options[0].textContent).toContain('Pasta & Mains');
    expect(categorySelect.options[1].textContent).toContain('Burgers');
  });

  it('toggles item reorder mode and displays position badges and quick sort toolbar', async () => {
    await act(async () => {
      render(<MenuEditor />);
    });

    // Switch to Burgers category (which has 2 items: Cheeseburger Deluxe, Bacon Burger)
    const burgersCatBtn = screen.getAllByText('Burgers')[0];
    await act(async () => {
      fireEvent.click(burgersCatBtn);
    });

    const reorderBtn = document.getElementById('reorder-items-btn');
    expect(reorderBtn).toBeTruthy();
    expect(reorderBtn.textContent).toContain('Reorder');

    // Click Reorder
    await act(async () => {
      fireEvent.click(reorderBtn);
    });

    // Should show Reorder toolbar with quick sort buttons and position badges
    expect(screen.getByText(/Arranging Burgers/i)).toBeTruthy();
    expect(document.getElementById('sort-alpha-btn')).toBeTruthy();
    expect(document.getElementById('sort-bestseller-btn')).toBeTruthy();
    expect(document.getElementById('sort-price-asc-btn')).toBeTruthy();
    expect(document.getElementById('sort-price-desc-btn')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
  });

  it('supports moving items earlier/later with shift arrow buttons', async () => {
    const reorderItemsSpy = vi.fn();
    useMenuStore.setState({ reorderItems: reorderItemsSpy });

    await act(async () => {
      render(<MenuEditor />);
    });

    // Switch to Burgers category
    const burgersCatBtn = screen.getAllByText('Burgers')[0];
    await act(async () => {
      fireEvent.click(burgersCatBtn);
    });

    // Enter reorder mode
    const reorderBtn = document.getElementById('reorder-items-btn');
    await act(async () => {
      fireEvent.click(reorderBtn);
    });

    // Find shift buttons
    const moveRightBtns = screen.getAllByTitle('Move item right / later');
    expect(moveRightBtns.length).toBeGreaterThan(0);

    // Shift first item (Cheeseburger Deluxe) to the right
    await act(async () => {
      fireEvent.click(moveRightBtns[0]);
    });

    expect(reorderItemsSpy).toHaveBeenCalledTimes(1);
    const [catId, reorderedItems] = reorderItemsSpy.mock.calls[0];
    expect(catId).toBe('cat-2');
    expect(reorderedItems[0].name).toBe('Bacon Burger');
    expect(reorderedItems[1].name).toBe('Cheeseburger Deluxe');
  });

  it('applies quick sort presets (alphabetical and price) to category items', async () => {
    const reorderItemsSpy = vi.fn();
    useMenuStore.setState({ reorderItems: reorderItemsSpy });

    await act(async () => {
      render(<MenuEditor />);
    });

    // Switch to Burgers category
    const burgersCatBtn = screen.getAllByText('Burgers')[0];
    await act(async () => {
      fireEvent.click(burgersCatBtn);
    });

    // Enter reorder mode
    const reorderBtn = document.getElementById('reorder-items-btn');
    await act(async () => {
      fireEvent.click(reorderBtn);
    });

    // Click A -> Z sort preset
    const sortAlphaBtn = document.getElementById('sort-alpha-btn');
    await act(async () => {
      fireEvent.click(sortAlphaBtn);
    });

    expect(reorderItemsSpy).toHaveBeenCalled();
    const sortedAlpha = reorderItemsSpy.mock.calls[0][1];
    expect(sortedAlpha[0].name).toBe('Bacon Burger');
    expect(sortedAlpha[1].name).toBe('Cheeseburger Deluxe');

    // Click Price: High -> Low
    const sortPriceDescBtn = document.getElementById('sort-price-desc-btn');
    await act(async () => {
      fireEvent.click(sortPriceDescBtn);
    });

    const sortedPrice = reorderItemsSpy.mock.calls[1][1];
    // Bacon Burger is 14, Cheeseburger is 12
    expect(sortedPrice[0].name).toBe('Bacon Burger');
    expect(sortedPrice[1].name).toBe('Cheeseburger Deluxe');
  });

  it('collapses Waiter Pronunciation Script by default and toggles on click', async () => {
    await act(async () => {
      render(<MenuEditor />);
    });

    // Open Add Item modal
    const addItemBtn = document.getElementById('add-item-btn');
    await act(async () => {
      fireEvent.click(addItemBtn);
    });

    // Header toggle should exist and be collapsed by default
    const toggleBtn = document.getElementById('toggle-waiter-pronunciation-btn');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.textContent).toContain('Waiter Pronunciation Script');
    // Inputs are not visible by default
    expect(screen.queryByText('🌴 Malayalam (മലയാളം)')).toBeNull();
    expect(screen.queryByText('🇮🇳 Hindi (हिंदी)')).toBeNull();

    // Click to expand
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    // Inputs should now be visible
    expect(screen.getByText('🌴 Malayalam (മലയാളം)')).toBeTruthy();
    expect(screen.getByText('🇮🇳 Hindi (हिंदी)')).toBeTruthy();

    // Click again to collapse
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    // Inputs are collapsed again
    expect(screen.queryByText('🌴 Malayalam (മലയാളം)')).toBeNull();
    expect(screen.queryByText('🇮🇳 Hindi (हिंदी)')).toBeNull();
  });

  it('collapses Optional Details by default when editing an item and toggles on click', async () => {
    // Give item-1 description and barcode
    useMenuStore.setState({
      categories: [
        {
          id: 'cat-1',
          name: 'Pasta & Mains',
          emoji: '🍝',
          order: 0,
          items: [
            {
              id: 'item-1',
              name: 'Spaghetti Carbonara',
              price: 15,
              description: 'Creamy pancetta pasta',
              barcode: 'SKU-PASTA-1',
              taxRate: 5,
              available: true,
            }
          ]
        }
      ]
    });

    await act(async () => {
      render(<MenuEditor />);
    });

    // Click on item card to edit
    const itemCard = screen.getByText('Spaghetti Carbonara');
    await act(async () => {
      fireEvent.click(itemCard);
    });

    // Optional Details toggle button should exist
    const toggleBtn = document.getElementById('toggle-optional-details-btn');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.textContent).toContain('Optional Details');
    expect(toggleBtn.textContent).toContain('Configured');

    // Tax rate input and description textarea should NOT be visible (collapsed by default)
    expect(document.getElementById('item-tax-rate-input')).toBeNull();
    expect(document.getElementById('item-desc-input')).toBeNull();

    // Click to expand
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    // Now inputs are visible
    expect(document.getElementById('item-tax-rate-input')).toBeTruthy();
    expect(document.getElementById('item-desc-input')).toBeTruthy();
    expect(toggleBtn.textContent).toContain('Hide Optional Details');

    // Click again to collapse
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(document.getElementById('item-tax-rate-input')).toBeNull();
    expect(document.getElementById('item-desc-input')).toBeNull();
  });
});
