// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerMorningCheer, fireConfettiShower } from '../utils/morningCheer';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: vi.fn(),
}));

let mockStore = {};
const mockLocalStorage = {
  getItem: vi.fn((key) => mockStore[key] || null),
  setItem: vi.fn((key, val) => { mockStore[key] = String(val); }),
  removeItem: vi.fn((key) => { delete mockStore[key]; }),
  clear: vi.fn(() => { mockStore = {}; })
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true
});

describe('morningCheer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires confetti shower with multi-stage cannon bursts', async () => {
    vi.useFakeTimers();
    fireConfettiShower();
    const confetti = (await import('canvas-confetti')).default;
    expect(confetti).toHaveBeenCalled();

    // Fast-forward timers for left/right cannon bursts
    vi.advanceTimersByTime(500);
    expect(confetti).toHaveBeenCalledTimes(3);
  });

  it('triggers cheer during morning hours if not previously shown today', async () => {
    vi.useFakeTimers();
    // Set morning time: 9:00 AM
    vi.setSystemTime(new Date(2026, 8, 30, 9, 0, 0));

    triggerMorningCheer({ staffName: 'Alex' });

    const toast = (await import('react-hot-toast')).default;
    expect(toast).toHaveBeenCalled();

    const todayKey = new Date().toISOString().slice(0, 10);
    expect(localStorage.getItem(`dineOS_morning_cheer_${todayKey}`)).toBe('true');
  });

  it('does not re-trigger if already shown today unless forced', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 9, 0, 0));

    const todayKey = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`dineOS_morning_cheer_${todayKey}`, 'true');

    triggerMorningCheer({ staffName: 'Alex' });

    const toast = (await import('react-hot-toast')).default;
    expect(toast).not.toHaveBeenCalled();

    // With force: true, it should trigger
    triggerMorningCheer({ staffName: 'Alex', force: true });
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
