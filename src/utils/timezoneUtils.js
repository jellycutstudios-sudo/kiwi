/**
 * Timezone and Date Utility
 * Automatically resolves timezone based on country or browser environment.
 */

const COUNTRY_TIMEZONE_MAP = {
  IN: 'Asia/Kolkata',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  QA: 'Asia/Qatar',
  OM: 'Asia/Muscat',
  KW: 'Asia/Kuwait',
  BH: 'Asia/Bahrain',
  GB: 'Europe/London',
  US: 'America/New_York',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  SG: 'Asia/Singapore',
  MY: 'Asia/Kuala_Lumpur',
};

export function resolveTimezone(restaurantOrCountry) {
  if (typeof restaurantOrCountry === 'string') {
    const code = restaurantOrCountry.toUpperCase();
    if (COUNTRY_TIMEZONE_MAP[code]) return COUNTRY_TIMEZONE_MAP[code];
  } else if (restaurantOrCountry && typeof restaurantOrCountry === 'object') {
    if (restaurantOrCountry.timezone) return restaurantOrCountry.timezone;
    if (restaurantOrCountry.timeZone) return restaurantOrCountry.timeZone;
    if (restaurantOrCountry.country && COUNTRY_TIMEZONE_MAP[restaurantOrCountry.country.toUpperCase()]) {
      return COUNTRY_TIMEZONE_MAP[restaurantOrCountry.country.toUpperCase()];
    }
  }

  try {
    const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (sysTz) return sysTz;
  } catch {
    // fallback
  }

  return 'Asia/Kolkata';
}

export function getTodayKey(restaurantOrTimezone) {
  const tz = typeof restaurantOrTimezone === 'string' && restaurantOrTimezone.includes('/')
    ? restaurantOrTimezone
    : resolveTimezone(restaurantOrTimezone);

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date()); // Formats as YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Reliably extracts unix epoch milliseconds from any order or timestamp representation.
 * Handles:
 * - Firestore Timestamp instances (.toDate())
 * - Serialized Firestore Timestamps ({ seconds, nanoseconds } / { _seconds, _nanoseconds })
 * - ISO string or Date strings
 * - Epoch numbers (seconds or milliseconds)
 * - Order objects with createdAt, offlineQueuedAt, prepStartedAt, updatedAt
 * - Embedded timestamps in order IDs (e.g. offline_1741234567890_abc)
 */
export function getOrderTimestampMs(orderOrTimestamp) {
  if (!orderOrTimestamp) return null;

  let target = orderOrTimestamp;
  let fallbackId = null;

  // If input is an object (not Date) with order-like properties
  if (typeof orderOrTimestamp === 'object' && !(orderOrTimestamp instanceof Date)) {
    if (
      'createdAt' in orderOrTimestamp ||
      'offlineQueuedAt' in orderOrTimestamp ||
      'prepStartedAt' in orderOrTimestamp ||
      'updatedAt' in orderOrTimestamp ||
      'id' in orderOrTimestamp
    ) {
      fallbackId = orderOrTimestamp.id;
      target = orderOrTimestamp.createdAt ||
               orderOrTimestamp.offlineQueuedAt ||
               orderOrTimestamp.prepStartedAt ||
               orderOrTimestamp.updatedAt;
    }
  }

  // 1. Firestore Timestamp instance with toDate()
  if (target && typeof target.toDate === 'function') {
    try {
      const ms = target.toDate().getTime();
      if (!isNaN(ms) && ms > 0) return ms;
    } catch {}
  }

  // 2. Serialized Firestore Timestamp { seconds, nanoseconds } or { _seconds, _nanoseconds }
  if (target && typeof target === 'object' && !(target instanceof Date)) {
    const secs = target.seconds ?? target._seconds;
    if (typeof secs === 'number' && !isNaN(secs)) {
      return Math.floor(secs * 1000 + ((target.nanoseconds ?? target._nanoseconds ?? 0) / 1000000));
    }
  }

  // 3. Epoch number (seconds or milliseconds)
  if (typeof target === 'number' && !isNaN(target) && target > 0) {
    return target < 1e11 ? target * 1000 : target;
  }

  // 4. ISO or date string, or numeric string
  if (typeof target === 'string' && target.trim()) {
    const trimmed = target.trim();
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      return num < 1e11 ? num * 1000 : num;
    }
    const parsed = new Date(trimmed).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 5. Native Date instance
  if (target instanceof Date) {
    const ms = target.getTime();
    if (!isNaN(ms) && ms > 0) return ms;
  }

  // 6. Embedded timestamp in order ID (e.g. offline_1741234567890_abc)
  if (fallbackId && typeof fallbackId === 'string') {
    const match = fallbackId.match(/(?:offline|ord)_?(\d{10,13})/i);
    if (match) {
      const num = Number(match[1]);
      const ms = num < 1e11 ? num * 1000 : num;
      if (!isNaN(ms) && ms > 0) return ms;
    }
  }

  return null;
}

/**
 * Returns elapsed seconds since order placement / timestamp.
 * Clamps negative values (clock skew) to 0.
 */
export function getOrderElapsedSeconds(orderOrTimestamp, nowMs = Date.now()) {
  const timeMs = getOrderTimestampMs(orderOrTimestamp);
  if (!timeMs || isNaN(timeMs) || timeMs <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - timeMs) / 1000));
}

/**
 * Formats stopwatch elapsed time as MM:SS (or M:SS).
 */
export function formatOrderStopwatch(orderOrTimestamp, nowMs = Date.now()) {
  const totalSecs = getOrderElapsedSeconds(orderOrTimestamp, nowMs);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
