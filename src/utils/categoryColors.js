/**
 * Toast POS Chromatic Indexing Palette
 * High-recognition peripheral color-coding system for fast-paced touch terminals.
 */

export const CHROMATIC_PALETTE = [
  { id: 'indigo',   stripe: '#6366f1', activeBg: '#93a5ff', activeText: '#0f172a' }, // Indigo / Periwinkle (Sandwiches)
  { id: 'emerald',  stripe: '#10b981', activeBg: '#6ee7b7', activeText: '#064e3b' }, // Emerald Green (Salads)
  { id: 'amber',    stripe: '#f59e0b', activeBg: '#fde047', activeText: '#713f12' }, // Warm Amber / Yellow (Wraps)
  { id: 'orange',   stripe: '#f97316', activeBg: '#fdba74', activeText: '#7c2d12' }, // Tangerine (Combos)
  { id: 'cyan',     stripe: '#06b6d4', activeBg: '#67e8f9', activeText: '#164e63' }, // Electric Cyan (Beverages)
  { id: 'red',      stripe: '#ef4444', activeBg: '#fca5a5', activeText: '#7f1d1d' }, // Coral / Red (Beer & Grill)
  { id: 'violet',   stripe: '#8b5cf6', activeBg: '#c4b5fd', activeText: '#4c1d95' }, // Amethyst / Violet
  { id: 'rose',     stripe: '#ec4899', activeBg: '#f9a8d4', activeText: '#831843' }, // Rose Pink
  { id: 'teal',     stripe: '#14b8a6', activeBg: '#5eead4', activeText: '#134e4a' }, // Deep Teal
  { id: 'sky',      stripe: '#0284c7', activeBg: '#7dd3fc', activeText: '#0c4a6e' }, // Ocean Sky
];

export const SPECIAL_CATEGORY_COLORS = {
  all: { id: 'all', stripe: '#64748b', activeBg: '#cbd5e1', activeText: '#0f172a' }, // Speed Screen / All Items
  deals: { id: 'deals', stripe: '#ef4444', activeBg: '#fca5a5', activeText: '#7f1d1d' }, // ⚡ Offers
  custom: { id: 'custom', stripe: '#8b5cf6', activeBg: '#c4b5fd', activeText: '#0f172a' },
};

/**
 * Deterministically hash a string into an integer.
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Get category chromatic styling colors.
 * @param {object|string} cat - Category object or category id
 * @param {number} [index] - Position index if ordered
 * @returns {{ stripe: string, activeBg: string, activeText: string }}
 */
export function getCategoryChromaticColors(cat, index) {
  const catId = typeof cat === 'string' ? cat : (cat?.id || '');
  const catName = typeof cat === 'object' ? (cat?.name || '') : '';

  // Check special categories
  if (SPECIAL_CATEGORY_COLORS[catId]) {
    return SPECIAL_CATEGORY_COLORS[catId];
  }

  // If category has custom hex color assigned in db
  if (typeof cat === 'object' && cat?.color && /^#[0-9A-Fa-f]{6}$/.test(cat.color)) {
    return {
      stripe: cat.color,
      activeBg: cat.color + '40', // 25% tint fallback
      activeText: '#ffffff',
    };
  }

  // Index based priority, fallback to name/id hash
  if (typeof index === 'number' && index >= 0) {
    return CHROMATIC_PALETTE[index % CHROMATIC_PALETTE.length];
  }

  const key = catId || catName || 'default';
  const hashed = hashString(key);
  return CHROMATIC_PALETTE[hashed % CHROMATIC_PALETTE.length];
}
