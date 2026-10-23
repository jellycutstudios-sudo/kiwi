// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
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
  };
});

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MenuEditor Mobile Add Item Button', () => {
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
          items: [
            { id: 'item-1', name: 'Spaghetti Carbonara', price: 15, available: true }
          ]
        }
      ],
      search: '',
    });
  });

  it('renders single clean mobile add item button in the category header toolbar', async () => {
    await act(async () => {
      render(<MenuEditor />);
    });

    // Mobile toolbar button in category header
    const mobileToolbarBtn = document.getElementById('mobile-toolbar-add-item-btn');
    expect(mobileToolbarBtn).toBeTruthy();
    expect(mobileToolbarBtn.textContent).toMatch(/Add (Dish|Item)/);

    // Desktop add item button is preserved for desktop
    const desktopBtn = document.getElementById('add-item-btn');
    expect(desktopBtn).toBeTruthy();

    // Redundant duplicate buttons should NOT exist
    expect(document.getElementById('mobile-header-add-item-btn')).toBeNull();
    expect(document.getElementById('mobile-fab-add-item-btn')).toBeNull();
  });
});
