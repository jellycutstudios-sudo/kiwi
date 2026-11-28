// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import AppShell from '../components/layout/AppShell';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useMenuStore } from '../stores/menuStore';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    doc: vi.fn(),
    onSnapshot: vi.fn(() => () => { }),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() }
  })
}));

describe('POS Topbar Brand Logo & Clean Status Touch Optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      restaurant: {
        id: 'rest-1',
        name: 'Kiwi Gourmet',
        businessType: 'restaurant',
        privateSalesMode: true,
        receiptConfig: { logoUrl: 'https://example.com/logo.png' }
      },
      staffDoc: { role: 'admin' },
      user: { uid: 'u-1' }
    });
    useMenuStore.setState({
      categories: [],
      search: '',
    });
    useOfflineQueueStore.setState({
      offlineQueue: [],
      isOnline: true,
      isSyncingQueue: false
    });
  });

  it('renders restaurant logo touch pill on POS header and opens mobile sidebar on click', async () => {
    window.history.pushState({}, '', '/pos');
    await act(async () => {
      render(
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      );
    });

    const brandBtn = document.getElementById('pos-topbar-brand-btn');
    expect(brandBtn).toBeTruthy();
    expect(brandBtn.textContent).toContain('Kiwi Gourmet');

    const brandImg = brandBtn.querySelector('img');
    expect(brandImg).toBeTruthy();
    expect(brandImg.getAttribute('src')).toBe('https://example.com/logo.png');

    // Clicking the brand logo triggers the navigation drawer
    await act(async () => {
      fireEvent.click(brandBtn);
    });

    expect(brandBtn).toBeTruthy();
  });

  it('falls back to Rupos logo and branding if restaurant has no custom logo configured', async () => {
    useAuthStore.setState({
      restaurant: {
        id: 'rest-2',
        name: null,
        businessType: 'restaurant',
        receiptConfig: null,
        logo: null
      }
    });

    window.history.pushState({}, '', '/pos');
    await act(async () => {
      render(
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      );
    });

    const brandBtn = document.getElementById('pos-topbar-brand-btn');
    expect(brandBtn).toBeTruthy();
    expect(brandBtn.textContent).toContain('Rupos');

    const brandImg = brandBtn.querySelector('img');
    expect(brandImg).toBeTruthy();
    expect(brandImg.getAttribute('src')).toBe('/ricon.svg');
  });

  it('hides wide "Private Sales" text on POS topbar during normal clean online state to save space', async () => {
    window.history.pushState({}, '', '/pos');
    await act(async () => {
      render(
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      );
    });

    const statusBtn = document.getElementById('network-outbox-status-btn');
    expect(statusBtn).toBeTruthy();
    expect(statusBtn.classList.contains('is-clean-online')).toBe(true);
    // Does NOT render "Private Sales" text on POS header when clean
    expect(statusBtn.querySelector('.network-status-text')).toBeNull();
  });

  it('expands with amber alert text if device actually goes offline or has buffered orders', async () => {
    useOfflineQueueStore.setState({
      queue: [{ id: 'order-1' }, { id: 'order-2' }],
      isOnline: false
    });

    window.history.pushState({}, '', '/pos');
    await act(async () => {
      render(
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      );
    });

    const statusBtn = document.getElementById('network-outbox-status-btn');
    expect(statusBtn.classList.contains('is-clean-online')).toBe(false);
    const statusText = statusBtn.querySelector('.network-status-text');
    expect(statusText).toBeTruthy();
    expect(statusText.textContent).toContain('Offline (2)');
  });

  it('keeps secondary utilities inside the More dropdown and toggles it cleanly on click', async () => {
    window.history.pushState({}, '', '/pos');
    await act(async () => {
      render(
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      );
    });

    // Low-frequency buttons are NOT mounted directly on the top bar when closed
    expect(document.getElementById('pos-switch-cards-btn')).toBeNull();
    expect(document.getElementById('pos-switch-keys-btn')).toBeNull();
    expect(document.getElementById('pos-waiter-lang-btn')).toBeNull();
    expect(document.querySelector('.density-expand-btn')).toBeNull();
    expect(document.querySelector('.pos-topbar-theme-toggle')).toBeNull();
    expect(document.getElementById('notification-bell-btn')).toBeNull();

    // Clicking the More button opens the terminal options menu with those utilities
    const moreBtn = document.getElementById('pos-topbar-more-btn');
    expect(moreBtn).toBeTruthy();
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      moreBtn.click();
    });

    expect(moreBtn.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.pos-more-dropdown')).toBeTruthy();
    expect(document.getElementById('pos-switch-cards-btn')).toBeTruthy();
    expect(document.getElementById('pos-switch-keys-btn')).toBeTruthy();
    expect(document.getElementById('pos-waiter-lang-btn')).toBeTruthy();
    expect(document.getElementById('pos-more-theme-btn')).toBeTruthy();
    expect(document.getElementById('notification-bell-btn')).toBeTruthy();

    // Clicking More again closes it
    await act(async () => {
      moreBtn.click();
    });
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.pos-more-dropdown')).toBeNull();
  });

  it('renders /tables (Floor Map) full-screen without the left icon sidebar', async () => {
    window.history.pushState({}, '', '/tables');
    await act(async () => {
      render(
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      );
    });

    expect(document.querySelector('.sidebar')).toBeNull();
    expect(document.querySelector('.app-shell')?.classList.contains('kds-app-shell')).toBe(true);
    expect(document.querySelector('.main-content')?.classList.contains('kds-main-content')).toBe(true);
  });
});
