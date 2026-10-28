import { describe, it, expect } from 'vitest';

// Pure logic extracted from POS.jsx displayItems bestseller filter
function filterBestsellers(items, categories, itemSalesMap = {}) {
  const getItemSales = (i) => {
    const nameKey = (i.name || '').trim().toLowerCase();
    return (itemSalesMap[i.id] || 0) + (itemSalesMap[nameKey] || 0);
  };

  const qualifying = items.filter(i => {
    const sales = getItemSales(i);
    return i.isBestseller || i.bestseller || i.popular || i.highMargin || sales > 0;
  });

  if (qualifying.length > 0) {
    return [...qualifying].sort((a, b) => {
      const scoreA = (getItemSales(a) * 10) + (a.isBestseller || a.bestseller ? 50 : 0) + (a.popular ? 30 : 0) + (a.highMargin ? 20 : 0);
      const scoreB = (getItemSales(b) * 10) + (b.isBestseller || b.bestseller ? 50 : 0) + (b.popular ? 30 : 0) + (b.highMargin ? 20 : 0);
      return scoreB - scoreA;
    });
  }

  // Fallback for new restaurants with no sales and no manual flags:
  const fallbackSet = new Set();
  const fallbackItems = [];
  categories.forEach(cat => {
    if (Array.isArray(cat.items)) {
      const topFromCat = cat.items.slice(0, 2);
      topFromCat.forEach(it => {
        if (!fallbackSet.has(it.id)) {
          fallbackSet.add(it.id);
          fallbackItems.push(it);
        }
      });
    }
  });
  return (fallbackItems.length > 0 ? fallbackItems : items).slice(0, 12);
}

describe('POS Bestseller Filter Logic', () => {
  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Pizzas',
      items: [
        { id: 'item-1', name: 'Margherita Pizza', price: 250 },
        { id: 'item-2', name: 'Pepperoni Feast', price: 450, isBestseller: true },
        { id: 'item-3', name: 'Mushroom Truffle', price: 500, highMargin: true },
      ]
    },
    {
      id: 'cat-2',
      name: 'Drinks',
      items: [
        { id: 'item-4', name: 'Cold Brew Coffee', price: 120 },
        { id: 'item-5', name: 'Fresh Lime Soda', price: 80 },
      ]
    }
  ];

  const allItems = mockCategories.flatMap(c => c.items);

  it('includes items tagged as isBestseller or highMargin', () => {
    const result = filterBestsellers(allItems, mockCategories, {});
    expect(result.some(i => i.id === 'item-2')).toBe(true);
    expect(result.some(i => i.id === 'item-3')).toBe(true);
    // Explicit isBestseller (+50) ranks higher than highMargin (+20) when sales are 0
    expect(result[0].id).toBe('item-2');
  });

  it('dynamically ranks items with recorded sales higher', () => {
    // Cold Brew has 15 sales (15 * 10 = 150 points)
    // Pepperoni Feast has isBestseller (50 points)
    const salesMap = {
      'cold brew coffee': 15,
      'item-2': 1, // 1 sale (10 + 50 = 60 points)
    };
    const result = filterBestsellers(allItems, mockCategories, salesMap);
    expect(result[0].id).toBe('item-4'); // Cold Brew Coffee is #1 bestseller
    expect(result[1].id).toBe('item-2'); // Pepperoni Feast is #2
  });

  it('provides signature dishes fallback when 0 sales and 0 items tagged', () => {
    const plainCategories = [
      {
        id: 'cat-a',
        items: [
          { id: 'plain-1', name: 'Plain Dosa', price: 80 },
          { id: 'plain-2', name: 'Masala Dosa', price: 100 },
          { id: 'plain-3', name: 'Rava Dosa', price: 110 },
        ]
      },
      {
        id: 'cat-b',
        items: [
          { id: 'plain-4', name: 'Filter Coffee', price: 40 },
          { id: 'plain-5', name: 'Masala Chai', price: 30 },
        ]
      }
    ];
    const plainItems = plainCategories.flatMap(c => c.items);

    const result = filterBestsellers(plainItems, plainCategories, {});
    // Must NOT be empty!
    expect(result.length).toBeGreaterThan(0);
    // Picks top 2 from each category
    expect(result.map(i => i.id)).toEqual(['plain-1', 'plain-2', 'plain-4', 'plain-5']);
  });
});

describe('POS Dynamic Dietary Search', () => {
  function filterDisplayItems(rawItems, search = '', dietaryFilter = 'all') {
    let filtered = rawItems;
    let effectiveDietary = dietaryFilter;

    if (search.trim()) {
      let query = search.toLowerCase().trim();

      if (/\b(non[\s-]?veg|nv)\b/i.test(query)) {
        effectiveDietary = 'non-veg';
        query = query.replace(/\b(non[\s-]?veg|nv)\b/gi, '').trim();
      } else if (/\b(pure[\s-]?veg|vegetarian|veg)\b/i.test(query)) {
        effectiveDietary = 'veg';
        query = query.replace(/\b(pure[\s-]?veg|vegetarian|veg)\b/gi, '').trim();
      } else if (/\b(bestseller|popular|favorite|trending)\b/i.test(query)) {
        effectiveDietary = 'bestseller';
        query = query.replace(/\b(bestseller|popular|favorite|trending)\b/gi, '').trim();
      }

      if (query) {
        filtered = filtered.filter(i => 
          i.name?.toLowerCase().includes(query) ||
          i.code?.toLowerCase().includes(query) ||
          i.sku?.toLowerCase().includes(query) ||
          i.categoryName?.toLowerCase().includes(query)
        );
      }
    }

    if (effectiveDietary === 'veg') {
      filtered = filtered.filter(i => i.isVeg === true || i.veg === true || (/veg|paneer|salad|pasta|dal|roti|rice|mushroom|cheese|margherita/i.test(i.name) && !/chicken|mutton|fish|beef|pork|egg|meat|prawn|salmon/i.test(i.name)));
    } else if (effectiveDietary === 'non-veg') {
      filtered = filtered.filter(i => i.isVeg === false || i.veg === false || /chicken|mutton|fish|beef|pork|egg|meat|prawn|salmon|carbonara/i.test(i.name));
    }

    return filtered;
  }

  const sampleItems = [
    { id: '1', name: 'Margherita Pizza', isVeg: true },
    { id: '2', name: 'Chicken Pepperoni Pizza', isVeg: false },
    { id: '3', name: 'Paneer Butter Masala', isVeg: true },
    { id: '4', name: 'Butter Chicken', isVeg: false },
    { id: '5', name: 'Veg Hakka Noodles', isVeg: true },
  ];

  it('filters all veg items when user types "veg"', () => {
    const res = filterDisplayItems(sampleItems, 'veg');
    expect(res.map(i => i.id)).toEqual(['1', '3', '5']);
  });

  it('filters all non-veg items when user types "non-veg" or "non veg"', () => {
    const res1 = filterDisplayItems(sampleItems, 'non-veg');
    expect(res1.map(i => i.id)).toEqual(['2', '4']);

    const res2 = filterDisplayItems(sampleItems, 'non veg');
    expect(res2.map(i => i.id)).toEqual(['2', '4']);
  });

  it('filters combined dynamic search "veg pizza"', () => {
    const res = filterDisplayItems(sampleItems, 'veg pizza');
    expect(res.map(i => i.id)).toEqual(['1']);
  });

  it('filters combined dynamic search "non veg pizza"', () => {
    const res = filterDisplayItems(sampleItems, 'non veg pizza');
    expect(res.map(i => i.id)).toEqual(['2']);
  });
});
