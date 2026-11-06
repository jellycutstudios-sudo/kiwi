import { describe, it, expect } from 'vitest';
import { getItemMonogram, getItemVisuals } from '../utils/itemVisuals';

describe('itemVisuals utility', () => {
  it('correctly generates 2-letter monograms for dishes', () => {
    expect(getItemMonogram('Garlic chicken')).toBe('GC');
    expect(getItemMonogram('Salad')).toBe('SA');
    expect(getItemMonogram('Chicken Tikka')).toBe('CT');
    expect(getItemMonogram('Cold Coffee 300ml')).toBe('CC');
    expect(getItemMonogram('Crispy Veg Burger')).toBe('CV');
    expect(getItemMonogram('French Fries')).toBe('FF');
  });

  it('handles single letters or edge cases gracefully', () => {
    expect(getItemMonogram('A')).toBe('A');
    expect(getItemMonogram('')).toBe('••');
    expect(getItemMonogram(null)).toBe('••');
  });

  it('assigns warm crimson to meats and chicken', () => {
    const chickenItem = { name: 'Garlic chicken', isVeg: false };
    const visuals = getItemVisuals(chickenItem);
    expect(visuals.monogram).toBe('GC');
    expect(visuals.color).toBe('#fca5a5'); // Warm crimson
  });

  it('assigns botanical emerald to salads and vegetarian items', () => {
    const saladItem = { name: 'Salad', isVeg: true };
    const visuals = getItemVisuals(saladItem);
    expect(visuals.monogram).toBe('SA');
    expect(visuals.color).toBe('#6ee7b7'); // Botanical emerald
  });

  it('assigns oceanic azure to seafood', () => {
    const salmonItem = { name: 'Grilled Salmon' };
    const visuals = getItemVisuals(salmonItem);
    expect(visuals.monogram).toBe('GS');
    expect(visuals.color).toBe('#7dd3fc'); // Azure
  });

  it('assigns golden amber to pizza and breads', () => {
    const pizzaItem = { name: 'Margherita Pizza' };
    const visuals = getItemVisuals(pizzaItem);
    expect(visuals.monogram).toBe('MP');
    expect(visuals.color).toBe('#fde68a'); // Golden Amber
  });

  it('assigns refreshing teal to coffee and beverages', () => {
    const coffeeItem = { name: 'Iced Latte' };
    const visuals = getItemVisuals(coffeeItem);
    expect(visuals.monogram).toBe('IL');
    expect(visuals.color).toBe('#99f6e4'); // Teal
  });
});

