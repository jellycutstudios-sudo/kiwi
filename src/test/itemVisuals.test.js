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

  it('assigns warm crimson to meats and chicken with high contrast in light mode', () => {
    const chickenItem = { name: 'Garlic chicken', isVeg: false };
    const visuals = getItemVisuals(chickenItem);
    expect(visuals.monogram).toBe('GC');
    expect(visuals.palette).toBe('crimson');
    expect(visuals.color).toContain('crimson');
    // Dark mode preserves luminous pastel
    expect(visuals.dark.color).toBe('#fca5a5');
    // Light mode provides rich, high-contrast red-800
    expect(visuals.light.color).toBe('#991b1b');
    // Explicit theme option
    expect(getItemVisuals(chickenItem, 'dark').color).toBe('#fca5a5');
    expect(getItemVisuals(chickenItem, 'light').color).toBe('#991b1b');
  });

  it('assigns botanical emerald to salads and vegetarian items with high contrast in light mode', () => {
    const saladItem = { name: 'Salad', isVeg: true };
    const visuals = getItemVisuals(saladItem);
    expect(visuals.monogram).toBe('SA');
    expect(visuals.palette).toBe('emerald');
    expect(visuals.color).toContain('emerald');
    expect(visuals.dark.color).toBe('#6ee7b7');
    expect(visuals.light.color).toBe('#14532d');
    expect(getItemVisuals(saladItem, 'dark').color).toBe('#6ee7b7');
    expect(getItemVisuals(saladItem, 'light').color).toBe('#14532d');
  });

  it('assigns oceanic azure to seafood with high contrast in light mode', () => {
    const salmonItem = { name: 'Grilled Salmon' };
    const visuals = getItemVisuals(salmonItem);
    expect(visuals.monogram).toBe('GS');
    expect(visuals.palette).toBe('azure');
    expect(visuals.color).toContain('azure');
    expect(visuals.dark.color).toBe('#7dd3fc');
    expect(visuals.light.color).toBe('#0c4a6e');
    expect(getItemVisuals(salmonItem, 'dark').color).toBe('#7dd3fc');
    expect(getItemVisuals(salmonItem, 'light').color).toBe('#0c4a6e');
  });

  it('assigns golden amber to pizza and breads with high contrast in light mode', () => {
    const pizzaItem = { name: 'Margherita Pizza' };
    const visuals = getItemVisuals(pizzaItem);
    expect(visuals.monogram).toBe('MP');
    expect(visuals.palette).toBe('amber');
    expect(visuals.color).toContain('amber');
    expect(visuals.dark.color).toBe('#fde68a');
    expect(visuals.light.color).toBe('#78350f');
    expect(getItemVisuals(pizzaItem, 'dark').color).toBe('#fde68a');
    expect(getItemVisuals(pizzaItem, 'light').color).toBe('#78350f');
  });

  it('assigns refreshing teal to coffee and beverages with high contrast in light mode', () => {
    const coffeeItem = { name: 'Iced Latte' };
    const visuals = getItemVisuals(coffeeItem);
    expect(visuals.monogram).toBe('IL');
    expect(visuals.palette).toBe('teal');
    expect(visuals.color).toContain('teal');
    expect(visuals.dark.color).toBe('#99f6e4');
    expect(visuals.light.color).toBe('#134e4a');
    expect(getItemVisuals(coffeeItem, 'dark').color).toBe('#99f6e4');
    expect(getItemVisuals(coffeeItem, 'light').color).toBe('#134e4a');
  });
});
