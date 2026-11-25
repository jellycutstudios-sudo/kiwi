import { describe, it, expect } from 'vitest';
import { extractDietaryFromQuery, scoreMenuItemMatch } from '../utils/posSearch';

describe('Smart POS Search Engine', () => {
  const sampleItems = [
    { id: '1', name: 'Classic Cheeseburger', categoryName: 'Burgers & Sandwiches', subCategory: 'Classic', price: 250 },
    { id: '2', name: 'Truffle Parmesan Fries', categoryName: 'Starters & Sides', price: 180 },
    { id: '3', name: 'Mozzarella Sticks', categoryName: 'Starters & Sides', price: 200 },
    { id: '4', name: 'Spaghetti Carbonara', categoryName: 'Pasta & Mains', price: 450 },
    { id: '5', name: 'Spicy Chicken Sandwich', categoryName: 'Burgers & Sandwiches', subCategory: 'Spicy', tags: ['hot'], price: 280 },
    { id: '6', name: 'Virgin Mojito', categoryName: 'Mocktails', subCategory: 'Mojito', price: 180 },
  ];

  it('extracts dietary keywords while preserving remaining search terms', () => {
    expect(extractDietaryFromQuery('veg burger')).toEqual({ effectiveDietary: 'veg', cleanQuery: 'burger' });
    expect(extractDietaryFromQuery('non-veg')).toEqual({ effectiveDietary: 'non-veg', cleanQuery: '' });
    expect(extractDietaryFromQuery('nv pasta')).toEqual({ effectiveDietary: 'non-veg', cleanQuery: 'pasta' });
    expect(extractDietaryFromQuery('popular fries')).toEqual({ effectiveDietary: 'bestseller', cleanQuery: 'fries' });
  });

  it('matches multi-word queries regardless of word order', () => {
    const score = scoreMenuItemMatch(sampleItems[1], 'fries truffle');
    expect(score).toBeGreaterThan(0);
    expect(scoreMenuItemMatch(sampleItems[0], 'fries truffle')).toBe(0);
  });

  it('matches kitchen initials / shortcuts like cc, tpf, sc, vm', () => {
    expect(scoreMenuItemMatch(sampleItems[0], 'cc')).toBeGreaterThan(0);
    expect(scoreMenuItemMatch(sampleItems[1], 'tpf')).toBeGreaterThan(0);
    expect(scoreMenuItemMatch(sampleItems[3], 'sc')).toBeGreaterThan(0);
    expect(scoreMenuItemMatch(sampleItems[5], 'vm')).toBeGreaterThan(0);
    expect(scoreMenuItemMatch(sampleItems[2], 'tpf')).toBe(0);
  });

  it('tolerates 1-character typos on words >= 4 chars', () => {
    expect(scoreMenuItemMatch(sampleItems[2], 'mozarella')).toBeGreaterThan(0);
    expect(scoreMenuItemMatch(sampleItems[3], 'spagheti')).toBeGreaterThan(0);
  });

  it('searches subcategories and tags', () => {
    expect(scoreMenuItemMatch(sampleItems[4], 'spicy')).toBeGreaterThan(0);
    expect(scoreMenuItemMatch(sampleItems[4], 'hot')).toBeGreaterThan(0);
  });

  it('ranks prefix/exact matches above initials and fuzzy matches, using sales as tie-breaker', () => {
    const prefixScore = scoreMenuItemMatch(sampleItems[0], 'classic');
    const initialsScore = scoreMenuItemMatch(sampleItems[0], 'cc');
    const fuzzyScore = scoreMenuItemMatch(sampleItems[2], 'mozarella');

    expect(prefixScore).toBeGreaterThan(initialsScore);
    expect(initialsScore).toBeGreaterThan(fuzzyScore);

    const lowSales = scoreMenuItemMatch(sampleItems[0], 'burger', { '1': 1 });
    const highSales = scoreMenuItemMatch(sampleItems[0], 'burger', { '1': 25 });
    expect(highSales).toBeGreaterThan(lowSales);
  });
});
