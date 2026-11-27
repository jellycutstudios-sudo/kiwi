import { describe, it, expect } from 'vitest';
import { convertRecipeAmount, getCompatibleUnits, aggregateRecipeUsage } from '../utils/inventoryUnits';

describe('inventoryUnits', () => {
  it('returns compatible units for weight, volume, and discrete items', () => {
    expect(getCompatibleUnits('kg')).toEqual(['kg', 'g']);
    expect(getCompatibleUnits('g')).toEqual(['kg', 'g']);
    expect(getCompatibleUnits('l')).toEqual(['l', 'ml']);
    expect(getCompatibleUnits('ml')).toEqual(['l', 'ml']);
    expect(getCompatibleUnits('pcs')).toEqual(['pcs']);
  });

  it('converts between compatible units accurately', () => {
    expect(convertRecipeAmount(200, 'g', 'kg')).toBe(0.2);
    expect(convertRecipeAmount(1.5, 'kg', 'g')).toBe(1500);
    expect(convertRecipeAmount(250, 'ml', 'l')).toBe(0.25);
    expect(convertRecipeAmount(2, 'pcs', 'pcs')).toBe(2);
    expect(convertRecipeAmount(5, undefined, undefined)).toBe(5);
  });

  it('aggregates recipe usage across order items with unit conversion', () => {
    const usage = aggregateRecipeUsage([
      {
        qty: 2,
        recipe: [
          { ingredientId: 'flour', amount: 250, unit: 'g', stockUnit: 'kg' },
          { ingredientId: 'bun', amount: 1 },
        ],
      },
      {
        qty: 1,
        recipe: [
          { ingredientId: 'flour', amount: 500, unit: 'g', stockUnit: 'kg' },
        ],
      },
    ]);

    expect(usage).toEqual({
      flour: 1,
      bun: 2,
    });
  });
});
