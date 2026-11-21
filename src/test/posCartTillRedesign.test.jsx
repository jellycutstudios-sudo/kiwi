// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import { useShiftStore } from '../stores/shiftStore';
import AppShell from '../components/layout/AppShell';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useMenuStore } from '../stores/menuStore';

// Partial mock for firestore
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    doc: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() }
  })
}));

describe('POS Cart & Till Redesign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShiftStore.setState({
      activeShift: { id: 'shift-1', status: 'open', openedBy: 'Admin' },
      showTillModal: false
    });
    useAuthStore.setState({
      restaurant: { id: 'rest-1', name: 'Test Rest', businessType: 'restaurant' },
      staffDoc: { role: 'admin' },
      user: { uid: 'u-1' }
    });
    useMenuStore.setState({
      categories: [],
      search: '',
    });
  });

  it('updates showTillModal state in shiftStore', () => {
    expect(useShiftStore.getState().showTillModal).toBe(false);
    useShiftStore.getState().setShowTillModal(true);
    expect(useShiftStore.getState().showTillModal).toBe(true);
    useShiftStore.getState().setShowTillModal(false);
    expect(useShiftStore.getState().showTillModal).toBe(false);
  });

  it('renders Till button in top-bar when on /pos and toggles showTillModal', async () => {
    window.history.pushState({}, '', '/pos');
    await act(async () => {
      render(
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      );
    });

    const tillBtn = document.getElementById('till-drawer-btn');
    expect(tillBtn).toBeTruthy();
    expect(tillBtn.textContent).toContain('Till');

    await act(async () => {
      fireEvent.click(tillBtn);
    });

    expect(useShiftStore.getState().showTillModal).toBe(true);
  });
});
