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
