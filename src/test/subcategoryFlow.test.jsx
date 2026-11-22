// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

describe('Dual-Tier Subcategory Navigation & Filtering Logic', () => {
  const sampleItems = [
    { id: 'item_1', name: 'Virgin Mojito', categoryId: 'cat_bev', subCategory: 'Mocktails', price: 180, isBestseller: true },
    { id: 'item_2', name: 'Blue Lagoon', categoryId: 'cat_bev', subCategory: 'Mocktails', price: 190 },
    { id: 'item_3', name: 'Long Island Iced Tea', categoryId: 'cat_bev', subCategory: 'Cocktails', price: 350 },
    { id: 'item_4', name: 'Margarita', categoryId: 'cat_bev', subCategory: 'Cocktails', price: 320, popular: true },
    { id: 'item_5', name: 'Fresh Lime Soda', categoryId: 'cat_bev', subCategory: 'Soft Drinks', price: 80 },
    { id: 'item_6', name: 'Mineral Water', categoryId: 'cat_bev', price: 30 } // unassigned subCategory
  ];

  it('derives unique subcategories with accurate counts for a category', () => {
    const counts = {};
    sampleItems.forEach(i => {
      const sub = typeof i.subCategory === 'string' ? i.subCategory.trim() : '';
      if (sub) {
        counts[sub] = (counts[sub] || 0) + 1;
      }
    });
    const subCats = Object.entries(counts).map(([name, count]) => ({ name, count }));

    expect(subCats).toEqual([
      { name: 'Mocktails', count: 2 },
      { name: 'Cocktails', count: 2 },
      { name: 'Soft Drinks', count: 1 }
    ]);
  });

  it('returns empty subcategories when no items have subCategory set', () => {
    const plainItems = [
      { id: 'p1', name: 'Roti', categoryId: 'cat_breads', price: 20 },
      { id: 'p2', name: 'Naan', categoryId: 'cat_breads', price: 40 }
    ];
    const counts = {};
    plainItems.forEach(i => {
      const sub = typeof i.subCategory === 'string' ? i.subCategory.trim() : '';
      if (sub) counts[sub] = (counts[sub] || 0) + 1;
    });
    const subCats = Object.entries(counts).map(([name, count]) => ({ name, count }));
    expect(subCats.length).toBe(0);
  });

  it('filters items accurately by selected subcategory', () => {
    const filterSub = (items, targetSub) => {
      if (targetSub === 'all') return items;
      return items.filter(i => (i.subCategory || '').trim().toLowerCase() === targetSub.toLowerCase());
    };

    expect(filterSub(sampleItems, 'all').length).toBe(6);
    expect(filterSub(sampleItems, 'Mocktails').length).toBe(2);
    expect(filterSub(sampleItems, 'Mocktails').map(i => i.name)).toEqual(['Virgin Mojito', 'Blue Lagoon']);
    expect(filterSub(sampleItems, 'Cocktails').length).toBe(2);
    expect(filterSub(sampleItems, 'Soft Drinks').length).toBe(1);
  });

  it('filters items accurately when popular / bestsellers pill is selected', () => {
    const filterPopular = (items) => {
      return items.filter(i => i.isBestseller || i.bestseller || i.popular);
    };

    const popularItems = filterPopular(sampleItems);
    expect(popularItems.length).toBe(2);
    expect(popularItems.map(i => i.name)).toEqual(['Virgin Mojito', 'Margarita']);
  });
});
