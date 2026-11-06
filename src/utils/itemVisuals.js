/**
 * itemVisuals.js
 * Generates elegant typographic monograms and related culinary background palettes
 * for menu items without photos across POS, Kiosk, and Online Ordering.
 */

const PALETTES = [
  // 0. Deep Indigo
  {
    bg: 'linear-gradient(145deg, rgba(99, 102, 241, 0.28) 0%, rgba(49, 46, 129, 0.45) 100%)',
    color: '#c7d2fe',
    border: 'rgba(99, 102, 241, 0.32)',
    glow: 'rgba(99, 102, 241, 0.15)'
  },
  // 1. Warm Crimson / Meat
  {
    bg: 'linear-gradient(145deg, rgba(239, 68, 68, 0.28) 0%, rgba(127, 29, 29, 0.45) 100%)',
    color: '#fca5a5',
    border: 'rgba(239, 68, 68, 0.32)',
    glow: 'rgba(239, 68, 68, 0.15)'
  },
  // 2. Botanical Emerald / Veg
  {
    bg: 'linear-gradient(145deg, rgba(16, 185, 129, 0.28) 0%, rgba(6, 78, 59, 0.45) 100%)',
    color: '#6ee7b7',
    border: 'rgba(16, 185, 129, 0.32)',
    glow: 'rgba(16, 185, 129, 0.15)'
  },
  // 3. Golden Amber / Bakery & Pizza
  {
    bg: 'linear-gradient(145deg, rgba(245, 158, 11, 0.28) 0%, rgba(120, 53, 15, 0.45) 100%)',
    color: '#fde68a',
    border: 'rgba(245, 158, 11, 0.32)',
    glow: 'rgba(245, 158, 11, 0.15)'
  },
  // 4. Coastal Azure / Seafood
  {
    bg: 'linear-gradient(145deg, rgba(14, 165, 233, 0.28) 0%, rgba(12, 74, 110, 0.45) 100%)',
    color: '#7dd3fc',
    border: 'rgba(14, 165, 233, 0.32)',
    glow: 'rgba(14, 165, 233, 0.15)'
  },
  // 5. Royal Plum / Dessert
  {
    bg: 'linear-gradient(145deg, rgba(168, 85, 247, 0.28) 0%, rgba(88, 28, 135, 0.45) 100%)',
    color: '#e9d5ff',
    border: 'rgba(168, 85, 247, 0.32)',
    glow: 'rgba(168, 85, 247, 0.15)'
  },
  // 6. Refreshing Teal / Beverage
  {
    bg: 'linear-gradient(145deg, rgba(20, 184, 166, 0.28) 0%, rgba(19, 78, 74, 0.45) 100%)',
    color: '#99f6e4',
    border: 'rgba(20, 184, 166, 0.32)',
    glow: 'rgba(20, 184, 166, 0.15)'
  }
];

/**
 * Extracts a punchy 1 or 2 letter typographic monogram from a dish name.
 * e.g., "Garlic chicken" -> "GC", "Salad" -> "SA", "Cold Coffee" -> "CC"
 */
export function getItemMonogram(name = '') {
  if (!name || typeof name !== 'string') return '••';
  
  // Strip size/portion designations like 330ml, 500g, 100g, 2pcs, etc.
  const cleaned = name
    .replace(/\b\d+(\.\d+)?\s*(ml|l|gm|g|kg|pcs|pc|oz|inch|cm)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return name.trim().slice(0, 2).toUpperCase() || '••';
  }

  if (words.length === 1) {
    const single = words[0];
    return (single.length >= 2 ? single.slice(0, 2) : single).toUpperCase();
  }

  // 2 or more words: take first char of first 2 words
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Returns a cohesive culinary theme (background, text color, border, and glow)
 * semantically matched to the food type or consistently hashed.
 */
export function getItemVisuals(item) {
  const name = (typeof item === 'string' ? item : item?.name || '').toLowerCase();
  const isVeg = typeof item === 'object' && item !== null
    ? (item.isVeg === true || item.veg === true || item.dietary === 'veg')
    : false;
  const isNonVeg = typeof item === 'object' && item !== null
    ? (item.isVeg === false || item.veg === false || item.dietary === 'non-veg')
    : false;

  const category = (typeof item === 'object' ? item?.category || '' : '').toLowerCase();
  const combined = `${name} ${category}`;

  // 1. Seafood / Fish
  if (/fish|salmon|prawn|shrimp|crab|seafood|tuna|calamari|lobster|cod/i.test(combined)) {
    return {
      monogram: getItemMonogram(typeof item === 'string' ? item : item?.name),
      ...PALETTES[4] // Coastal Azure
    };
  }

  // 2. Poultry / Meats / Steaks / BBQ (Warm Crimson)
  if (
    /chicken|meat|beef|mutton|pork|lamb|tikka|bbq|kebab|grill|bacon|wings|steak|patty|biryani|ribs|ham|sausage/i.test(combined) ||
    isNonVeg
  ) {
    return {
      monogram: getItemMonogram(typeof item === 'string' ? item : item?.name),
      ...PALETTES[1] // Warm Crimson
    };
  }

  // 3. Desserts / Sweets / Ice cream / Bakery (Plum Berry)
  if (/dessert|cake|sweet|ice cream|brownie|pudding|waffle|chocolate|pastry|cookie|donut|tiramisu|sundae/i.test(combined)) {
    return {
      monogram: getItemMonogram(typeof item === 'string' ? item : item?.name),
      ...PALETTES[5] // Royal Plum
    };
  }

  // 4. Beverages / Coffee / Tea / Drinks (Refreshing Teal)
  if (/coffee|tea|latte|cappuccino|espresso|juice|soda|shake|drink|beverage|mojito|coke|smoothie|water|pepsi|beer|wine|cocktail|chai/i.test(combined)) {
    return {
      monogram: getItemMonogram(typeof item === 'string' ? item : item?.name),
      ...PALETTES[6] // Refreshing Teal
    };
  }

  // 5. Salads / Greens / Veg Botanicals (Botanical Emerald)
  if (
    /salad|green|veg|spinach|herb|paneer|avocado|tofu|broccoli|cucumber|lettuce|kale|zucchini|dal|rice/i.test(combined) ||
    isVeg
  ) {
    return {
      monogram: getItemMonogram(typeof item === 'string' ? item : item?.name),
      ...PALETTES[2] // Botanical Emerald
    };
  }

  // 6. Bakery / Pizzas / Breads / Pasta (Golden Amber)
  if (/pizza|cheese|bread|toast|naan|roti|sandwich|burger|fries|wrap|taco|nacho|pasta|garlic bread/i.test(combined)) {
    return {
      monogram: getItemMonogram(typeof item === 'string' ? item : item?.name),
      ...PALETTES[3] // Golden Amber
    };
  }

  // 7. Deterministic Fallback Hash
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const paletteIndex = Math.abs(hash) % PALETTES.length;

  return {
    monogram: getItemMonogram(typeof item === 'string' ? item : item?.name),
    ...PALETTES[paletteIndex]
  };
}
