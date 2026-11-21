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
});
