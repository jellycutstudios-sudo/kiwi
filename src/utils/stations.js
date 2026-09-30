// Shared Kitchen Stations utilities

export const DEFAULT_KITCHEN_STATIONS = [
  'Kitchen',
  'Grill',
  'Fryer',
  'Cold',
  'Bar',
  'Bakery'
];

export const SUGGESTED_KITCHEN_STATIONS = [
  'Pizza Oven',
  'Espresso Bar',
  'Wok',
  'Sushi Bar',
  'Salad & Pantry',
  'Dessert',
  'Expo / Pass'
];

/**
 * Returns the list of active kitchen stations configured for a restaurant.
 * Falls back to DEFAULT_KITCHEN_STATIONS if none configured or invalid.
 */
export function getKitchenStations(restaurant) {
  const configured = restaurant?.kitchenConfig?.stations;
  if (Array.isArray(configured) && configured.length > 0) {
    const cleaned = configured
      .map(s => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    if (cleaned.length > 0) {
      return [...new Set(cleaned)];
    }
  }
  return [...DEFAULT_KITCHEN_STATIONS];
}
