// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const { dismissMock, mockToasts } = vi.hoisted(() => ({
  dismissMock: vi.fn(),
  mockToasts: { current: [] },
}));

vi.mock('react-hot-toast', () => {
  const toastFn = Object.assign(vi.fn(), {
    dismiss: dismissMock,
    success: vi.fn(),
    error: vi.fn(),
  });
  return {
    default: toastFn,
    Toaster: ({ toastOptions }) => (
      <div
        data-testid="mock-toaster"
        data-default-duration={toastOptions?.duration}
        data-success-duration={toastOptions?.success?.duration}
        data-error-duration={toastOptions?.error?.duration}
      />
    ),
    ToastBar: ({ children }) => <>{children}</>,
    useToasterStore: () => ({ toasts: mockToasts.current }),
  };
});

import PosToaster, { MAX_VISIBLE_TOASTS, TOAST_DURATIONS } from '../components/shared/PosToaster';
import { markLocalCreatedOrder, isLocalCreatedOrder } from '../stores/orderStore';

describe('PosToaster & Notification Governor', () => {
  afterEach(() => {
    cleanup();
    dismissMock.mockClear();
    mockToasts.current = [];
  });

  it('configures fast POS-grade default durations (1.8s success, 2.0s default, 3.5s error)', () => {
    expect(MAX_VISIBLE_TOASTS).toBe(2);
    expect(TOAST_DURATIONS).toEqual({
      default: 2000,
      success: 1800,
      error: 3500,
      loading: 3000,
    });

    const { getByTestId } = render(<PosToaster />);
    const el = getByTestId('mock-toaster');
    expect(el.getAttribute('data-default-duration')).toBe('2000');
    expect(el.getAttribute('data-success-duration')).toBe('1800');
    expect(el.getAttribute('data-error-duration')).toBe('3500');
  });

  it('dismisses oldest excess toasts when more than 2 visible toasts stack', () => {
    mockToasts.current = [
      { id: 'toast-newest', visible: true },
      { id: 'toast-second', visible: true },
      { id: 'toast-third', visible: true },
      { id: 'toast-oldest', visible: true },
      { id: 'toast-already-hidden', visible: false },
    ];

    render(<PosToaster />);

    expect(dismissMock).toHaveBeenCalledTimes(2);
    expect(dismissMock).toHaveBeenCalledWith('toast-third');
    expect(dismissMock).toHaveBeenCalledWith('toast-oldest');
    expect(dismissMock).not.toHaveBeenCalledWith('toast-newest');
    expect(dismissMock).not.toHaveBeenCalledWith('toast-second');
  });

  it('does not dismiss when visible toasts are within the 2-toast cap', () => {
    mockToasts.current = [
      { id: 't1', visible: true },
      { id: 't2', visible: true },
    ];

    render(<PosToaster />);
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it('tracks locally created order IDs to suppress self-echo notifications', () => {
    const id = 'ord-local-self-test';
    expect(isLocalCreatedOrder(id)).toBe(false);
    markLocalCreatedOrder(id);
    expect(isLocalCreatedOrder(id)).toBe(true);
  });
});
