/**
 * Unit conversion helpers for inventory & recipe deductions.
 * Keeps stock ledgers in base purchase units (e.g. kg, l, pcs) while allowing
 * menu recipes to specify smaller/compatible units (e.g. g, ml).
 */

const UNIT_CONVERSION_GROUPS = {
  kg: { group: 'weight', factorToBase: 1000 },
  g: { group: 'weight', factorToBase: 1 },
  l: { group: 'volume', factorToBase: 1000 },
  ml: { group: 'volume', factorToBase: 1 },
};

/**
 * Returns compatible units for a given stock unit (e.g. ['kg', 'g'] for 'kg').
 */
export function getCompatibleUnits(stockUnit) {
  const normalized = String(stockUnit || '').toLowerCase();
  if (normalized === 'kg' || normalized === 'g') return ['kg', 'g'];
  if (normalized === 'l' || normalized === 'ml') return ['l', 'ml'];
  return stockUnit ? [stockUnit] : ['pcs'];
}

/**
 * Converts a recipe quantity from `recipeUnit` into `stockUnit`.
 * Falls back to `amount` unchanged if either unit is missing or incompatible.
 */
export function convertRecipeAmount(amount, recipeUnit, stockUnit) {
  const numericAmount = Number(amount) || 0;
  if (!numericAmount || !recipeUnit || !stockUnit) return numericAmount;

  const from = UNIT_CONVERSION_GROUPS[String(recipeUnit).toLowerCase()];
  const to = UNIT_CONVERSION_GROUPS[String(stockUnit).toLowerCase()];
  if (!from || !to || from.group !== to.group) return numericAmount;

  return Math.round(((numericAmount * from.factorToBase) / to.factorToBase) * 1000000) / 1000000;
}

/**
 * Aggregates ingredient usage across order items, respecting recipe unit conversion.
 */
export function aggregateRecipeUsage(itemsList = []) {
  const map = {};
  for (const item of itemsList) {
    const qty = Number(item?.qty) || 0;
    if (qty <= 0) continue;
    const recipe = item?.recipe ?? [];
    for (const recipeItem of recipe) {
      if (recipeItem?.ingredientId && recipeItem?.amount) {
        const perUnit = convertRecipeAmount(recipeItem.amount, recipeItem.unit, recipeItem.stockUnit);
        const amt = perUnit * qty;
        if (amt > 0) {
          map[recipeItem.ingredientId] = (map[recipeItem.ingredientId] ?? 0) + amt;
        }
      }
    }
  }
  return map;
}
