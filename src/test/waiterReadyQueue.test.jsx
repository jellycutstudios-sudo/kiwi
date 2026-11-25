// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import WaiterReadySlidePopup from '../components/shared/WaiterReadySlidePopup';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';

vi.mock('../utils/soundNotifications', () => ({
  playNotificationTone: vi.fn(),
  vibrateDevice: vi.fn(),
}));

vi.mock('../utils/print', () => ({
  printReceipt: vi.fn(),
}));

describe('WaiterReadySlidePopup — Multi-Notification Pass Queue (5+ ready orders)', () => {
  const updateOrderStatusMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      restaurant: {
        id: 'rest-1',
        name: 'Kiwi Bistro',
        notifications: { waiterSlidePopupEnabled: true, vibrateOnReady: false },
      },
      staffDoc: { id: 'staff-1', name: 'Alex', role: 'admin' },
    });

    const now = Date.now();
    useOrderStore.setState({
      activeOrders: [
        { id: 'ord-1', status: 'ready', type: 'dine-in', tableName: 'T2', readyAt: now - 4 * 60000, items: [{ name: 'Garlic Bread', qty: 1 }] },
        { id: 'ord-2', status: 'ready', type: 'dine-in', tableName: 'T5', readyAt: now - 2 * 60000, items: [{ name: 'Buffalo Wings', qty: 2 }] },
        { id: 'ord-3', status: 'ready', type: 'takeaway', token: '14', readyAt: now - 60000, items: [{ name: 'Cheeseburger', qty: 1 }] },
        { id: 'ord-4', status: 'ready', type: 'dine-in', tableName: 'G9', readyAt: now - 30000, items: [{ name: 'Carbonara', qty: 1 }] },
        { id: 'ord-5', status: 'ready', type: 'dine-in', tableName: 'B1', readyAt: now - 10000, items: [{ name: 'Ribeye Steak', qty: 1 }] },
      ],
      updateOrderStatus: updateOrderStatusMock,
    });
  });

  it('shows 1/5 queue toggle and expands all 5 ready orders with per-row Serve & Serve All', async () => {
    render(
      <MemoryRouter initialEntries={['/pos']}>
        <WaiterReadySlidePopup />
      </MemoryRouter>
    );

    const queueToggle = screen.getByRole('button', { name: /View all 5 ready orders/i });
    expect(queueToggle.textContent).toContain('1/5');

    // Open Pass Queue drawer
    fireEvent.click(queueToggle);

    const queueRegion = screen.getByRole('region', { name: /Ready orders queue/i });
    expect(queueRegion.textContent).toContain('Table T2');
    expect(queueRegion.textContent).toContain('Table T5');
    expect(queueRegion.textContent).toContain('Token #14');
    expect(queueRegion.textContent).toContain('Table G9');
    expect(queueRegion.textContent).toContain('Table B1');

    // Serve All button shows count
    const serveAllBtn = screen.getByRole('button', { name: /Serve All \(5\)/i });
    await act(async () => {
      fireEvent.click(serveAllBtn);
    });

    expect(updateOrderStatusMock).toHaveBeenCalledTimes(5);
  });
});
