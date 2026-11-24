import { describe, it, expect } from 'vitest';
import { getCategoryChromaticColors, CHROMATIC_PALETTE, SPECIAL_CATEGORY_COLORS } from '../utils/categoryColors';

describe('Toast POS Chromatic Indexing Palette System', () => {
  it('returns slate for special "all" category', () => {
    const colors = getCategoryChromaticColors('all');
    expect(colors).toEqual(SPECIAL_CATEGORY_COLORS.all);
    expect(colors.stripe).toBe('#64748b');
  });

  it('returns fire red for special "deals" category', () => {
    const colors = getCategoryChromaticColors('deals');
    expect(colors).toEqual(SPECIAL_CATEGORY_COLORS.deals);
    expect(colors.stripe).toBe('#ef4444');
  });

  it('returns custom item styling for special "custom" category', () => {
    const colors = getCategoryChromaticColors('custom');
    expect(colors).toEqual(SPECIAL_CATEGORY_COLORS.custom);
  });

  it('maps sequential indexes to the curated chromatic palette', () => {
    const color0 = getCategoryChromaticColors({ id: 'cat-1', name: 'Sandwiches' }, 0);
    expect(color0).toEqual(CHROMATIC_PALETTE[0]);
    expect(color0.stripe).toBe('#6366f1'); // Indigo / Periwinkle

    const color1 = getCategoryChromaticColors({ id: 'cat-2', name: 'Salads' }, 1);
    expect(color1).toEqual(CHROMATIC_PALETTE[1]);
    expect(color1.stripe).toBe('#10b981'); // Emerald Green

    const color2 = getCategoryChromaticColors({ id: 'cat-3', name: 'Wraps' }, 2);
    expect(color2).toEqual(CHROMATIC_PALETTE[2]);
    expect(color2.stripe).toBe('#f59e0b'); // Warm Amber / Yellow
  });

  it('supports custom category color override from db', () => {
    const custom = getCategoryChromaticColors({ id: 'special', color: '#ff0055' });
    expect(custom.stripe).toBe('#ff0055');
  });

  it('deterministically hashes category name when index is not provided', () => {
    const colorA = getCategoryChromaticColors({ id: 'drinks', name: 'Beverages' });
    const colorB = getCategoryChromaticColors({ id: 'drinks', name: 'Beverages' });
    expect(colorA).toEqual(colorB);
    expect(colorA.stripe).toBeDefined();
    expect(colorA.activeBg).toBeDefined();
    expect(colorA.activeText).toBeDefined();
  });
});
