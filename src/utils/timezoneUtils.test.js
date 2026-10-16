import { describe, it, expect } from 'vitest';
import {
  getOrderTimestampMs,
  getOrderElapsedSeconds,
  formatOrderStopwatch,
  resolveTimezone,
  getTodayKey,
} from './timezoneUtils';

describe('timezoneUtils - order timestamp and stopwatch parsing', () => {
  it('returns null for empty or null inputs', () => {
    expect(getOrderTimestampMs(null)).toBeNull();
    expect(getOrderTimestampMs(undefined)).toBeNull();
    expect(getOrderTimestampMs('')).toBeNull();
  });

  it('parses Firestore Timestamp instance with toDate()', () => {
    const fakeTimestamp = {
      toDate: () => new Date('2026-10-16T10:00:00.000Z'),
    };
    const ms = getOrderTimestampMs(fakeTimestamp);
    expect(ms).toBe(new Date('2026-10-16T10:00:00.000Z').getTime());
  });

  it('parses serialized Firestore Timestamp { seconds, nanoseconds }', () => {
    const serialized = { seconds: 1729072800, nanoseconds: 0 };
    expect(getOrderTimestampMs(serialized)).toBe(1729072800000);

    const serializedWithUnderscore = { _seconds: 1729072800, _nanoseconds: 500000000 };
    expect(getOrderTimestampMs(serializedWithUnderscore)).toBe(1729072800500);
  });

  it('parses ISO date strings and number timestamps', () => {
    const iso = '2026-10-16T12:30:00.000Z';
    expect(getOrderTimestampMs(iso)).toBe(new Date(iso).getTime());

    const epochMs = 1729072800000;
    expect(getOrderTimestampMs(epochMs)).toBe(epochMs);

    const epochSecs = 1729072800;
    expect(getOrderTimestampMs(epochSecs)).toBe(1729072800000);
  });

  it('extracts timestamp from order objects with createdAt, offlineQueuedAt, or embedded id', () => {
    const orderWithCreatedAt = {
      id: 'ord_1',
      createdAt: '2026-10-16T10:00:00.000Z',
    };
    expect(getOrderTimestampMs(orderWithCreatedAt)).toBe(new Date('2026-10-16T10:00:00.000Z').getTime());

    const offlineOrderWithoutCreatedAt = {
      id: 'offline_1741234567890_xyr0n',
      offlineQueuedAt: '2026-10-16T11:00:00.000Z',
    };
    expect(getOrderTimestampMs(offlineOrderWithoutCreatedAt)).toBe(new Date('2026-10-16T11:00:00.000Z').getTime());

    const orderWithOnlyIdTimestamp = {
      id: 'offline_1741234567890_xyr0n',
    };
    expect(getOrderTimestampMs(orderWithOnlyIdTimestamp)).toBe(1741234567890);
  });

  it('calculates elapsed seconds correctly', () => {
    const baseTime = 1729072800000;
    const nowTime = baseTime + 125000; // 125 seconds later

    const elapsed = getOrderElapsedSeconds(baseTime, nowTime);
    expect(elapsed).toBe(125);

    // Negative elapsed (future clock skew) is clamped to 0
    expect(getOrderElapsedSeconds(nowTime, baseTime)).toBe(0);
  });

  it('formats stopwatch correctly for MM:SS', () => {
    const baseTime = 1729072800000;

    expect(formatOrderStopwatch(baseTime, baseTime)).toBe('0:00');
    expect(formatOrderStopwatch(baseTime, baseTime + 5000)).toBe('0:05');
    expect(formatOrderStopwatch(baseTime, baseTime + 65000)).toBe('1:05');
    expect(formatOrderStopwatch(baseTime, baseTime + 600000)).toBe('10:00');
    expect(formatOrderStopwatch(baseTime, baseTime + 3661000)).toBe('61:01');
  });

  it('resolves timezones and today key accurately', () => {
    expect(resolveTimezone('IN')).toBe('Asia/Kolkata');
    expect(resolveTimezone('AE')).toBe('Asia/Dubai');
    expect(resolveTimezone({ country: 'US' })).toBe('America/New_York');
    expect(getTodayKey('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
