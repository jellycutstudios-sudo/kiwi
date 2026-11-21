/**
 * itemVisuals.js
 * Generates elegant typographic monograms and related culinary background palettes
 * for menu items without photos across POS, Kiosk, and Online Ordering.
 * Provides high-contrast, theme-aware palettes for both Light and Dark themes.
 */

export const PALETTES = [
  // 0. Deep Indigo
  {
    name: 'indigo',
    bg: 'var(--item-visual-indigo-bg, linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%))',
    color: 'var(--item-visual-indigo-color, #312e81)',
    border: 'var(--item-visual-indigo-border, #818cf8)',
    glow: 'var(--item-visual-indigo-glow, rgba(49, 46, 129, 0.12))',
    light: {
      bg: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
      color: '#312e81',
      border: '#818cf8',
      glow: 'rgba(49, 46, 129, 0.12)'
    },
    dark: {
      bg: 'linear-gradient(145deg, rgba(99, 102, 241, 0.28) 0%, rgba(49, 46, 129, 0.45) 100%)',
      color: '#c7d2fe',
      border: 'rgba(99, 102, 241, 0.32)',
      glow: 'rgba(99, 102, 241, 0.25)'
    }
  },
  // 1. Warm Crimson / Meat
  {
    name: 'crimson',
    bg: 'var(--item-visual-crimson-bg, linear-gradient(135deg, #fee2e2 0%, #fecaca 100%))',
    color: 'var(--item-visual-crimson-color, #991b1b)',
    border: 'var(--item-visual-crimson-border, #f87171)',
    glow: 'var(--item-visual-crimson-glow, rgba(153, 27, 27, 0.12))',
    light: {
      bg: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
      color: '#991b1b',
      border: '#f87171',
      glow: 'rgba(153, 27, 27, 0.12)'
    },
    dark: {
      bg: 'linear-gradient(145deg, rgba(239, 68, 68, 0.28) 0%, rgba(127, 29, 29, 0.45) 100%)',
      color: '#fca5a5',
      border: 'rgba(239, 68, 68, 0.32)',
      glow: 'rgba(239, 68, 68, 0.25)'
    }
  },
  // 2. Botanical Emerald / Veg
  {
    name: 'emerald',
    bg: 'var(--item-visual-emerald-bg, linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%))',
    color: 'var(--item-visual-emerald-color, #14532d)',
    border: 'var(--item-visual-emerald-border, #4ade80)',
    glow: 'var(--item-visual-emerald-glow, rgba(20, 83, 45, 0.12))',
    light: {
      bg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
      color: '#14532d',
      border: '#4ade80',
      glow: 'rgba(20, 83, 45, 0.12)'
    },
    dark: {
      bg: 'linear-gradient(145deg, rgba(16, 185, 129, 0.28) 0%, rgba(6, 78, 59, 0.45) 100%)',
      color: '#6ee7b7',
      border: 'rgba(16, 185, 129, 0.32)',
      glow: 'rgba(16, 185, 129, 0.25)'
    }
  },
  // 3. Golden Amber / Bakery & Pizza
  {
    name: 'amber',
    bg: 'var(--item-visual-amber-bg, linear-gradient(135deg, #fef3c7 0%, #fde68a 100%))',
    color: 'var(--item-visual-amber-color, #78350f)',
    border: 'var(--item-visual-amber-border, #f59e0b)',
    glow: 'var(--item-visual-amber-glow, rgba(120, 53, 15, 0.12))',
    light: {
      bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
      color: '#78350f',
      border: '#f59e0b',
      glow: 'rgba(120, 53, 15, 0.12)'
    },
    dark: {
      bg: 'linear-gradient(145deg, rgba(245, 158, 11, 0.28) 0%, rgba(120, 53, 15, 0.45) 100%)',
      color: '#fde68a',
      border: 'rgba(245, 158, 11, 0.32)',
      glow: 'rgba(245, 158, 11, 0.25)'
    }
  },
  // 4. Coastal Azure / Seafood
  {
    name: 'azure',
    bg: 'var(--item-visual-azure-bg, linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%))',
    color: 'var(--item-visual-azure-color, #0c4a6e)',
    border: 'var(--item-visual-azure-border, #38bdf8)',
    glow: 'var(--item-visual-azure-glow, rgba(12, 74, 110, 0.12))',
    light: {
      bg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
      color: '#0c4a6e',
      border: '#38bdf8',
      glow: 'rgba(12, 74, 110, 0.12)'
    },
    dark: {
      bg: 'linear-gradient(145deg, rgba(14, 165, 233, 0.28) 0%, rgba(12, 74, 110, 0.45) 100%)',
      color: '#7dd3fc',
      border: 'rgba(14, 165, 233, 0.32)',
      glow: 'rgba(14, 165, 233, 0.25)'
    }
  },
  // 5. Royal Plum / Dessert
  {
    name: 'plum',
    bg: 'var(--item-visual-plum-bg, linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%))',
    color: 'var(--item-visual-plum-color, #581c87)',
    border: 'var(--item-visual-plum-border, #c084fc)',
    glow: 'var(--item-visual-plum-glow, rgba(88, 28, 135, 0.12))',
    light: {
      bg: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
      color: '#581c87',
      border: '#c084fc',
      glow: 'rgba(88, 28, 135, 0.12)'
    },
    dark: {
      bg: 'linear-gradient(145deg, rgba(168, 85, 247, 0.28) 0%, rgba(88, 28, 135, 0.45) 100%)',
      color: '#e9d5ff',
      border: 'rgba(168, 85, 247, 0.32)',
      glow: 'rgba(168, 85, 247, 0.25)'
    }
  },
  // 6. Refreshing Teal / Beverage
  {
    name: 'teal',
    bg: 'var(--item-visual-teal-bg, linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%))',
    color: 'var(--item-visual-teal-color, #134e4a)',
    border: 'var(--item-visual-teal-border, #2dd4bf)',
    glow: 'var(--item-visual-teal-glow, rgba(19, 78, 74, 0.12))',
    light: {
      bg: 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)',
      color: '#134e4a',
      border: '#2dd4bf',
      glow: 'rgba(19, 78, 74, 0.12)'
    },
    dark: {
      bg: 'linear-gradient(145deg, rgba(20, 184, 166, 0.28) 0%, rgba(19, 78, 74, 0.45) 100%)',
      color: '#99f6e4',
      border: 'rgba(20, 184, 166, 0.32)',
      glow: 'rgba(20, 184, 166, 0.25)'
    }
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
 * Supports theme ('light' or 'dark') or returns CSS variables for responsive theme switching.
 */
export function getItemVisuals(item, options = {}) {
  const theme = typeof options === 'string' ? options : options?.theme;
  const name = (typeof item === 'string' ? item : item?.name || '').toLowerCase();
  const isVeg = typeof item === 'object' && item !== null
    ? (item.isVeg === true || item.veg === true || item.dietary === 'veg')
    : false;
  const isNonVeg = typeof item === 'object' && item !== null
    ? (item.isVeg === false || item.veg === false || item.dietary === 'non-veg')
    : false;

  const category = (typeof item === 'object' ? item?.category || '' : '').toLowerCase();
  const combined = `${name} ${category}`;

  const buildResult = (paletteIndex) => {
    const matched = PALETTES[paletteIndex];
    const targetTheme = theme === 'dark' ? matched.dark : theme === 'light' ? matched.light : null;

    return {
      monogram: getItemMonogram(typeof item === 'string' ? item : item?.name),
      palette: matched.name,
      paletteIndex,
      bg: targetTheme ? targetTheme.bg : matched.bg,
      color: targetTheme ? targetTheme.color : matched.color,
      border: targetTheme ? targetTheme.border : matched.border,
      glow: targetTheme ? targetTheme.glow : matched.glow,
      light: matched.light,
      dark: matched.dark
    };
  };

  // 1. Seafood / Fish (Coastal Azure)
  if (/fish|salmon|prawn|shrimp|crab|seafood|tuna|calamari|lobster|cod/i.test(combined)) {
    return buildResult(4);
  }

  // 2. Poultry / Meats / Steaks / BBQ (Warm Crimson)
  if (
    /chicken|meat|beef|mutton|pork|lamb|tikka|bbq|kebab|grill|bacon|wings|steak|patty|biryani|ribs|ham|sausage/i.test(combined) ||
    isNonVeg
  ) {
    return buildResult(1);
  }

  // 3. Desserts / Sweets / Ice cream / Bakery (Plum Berry)
  if (/dessert|cake|sweet|ice cream|brownie|pudding|waffle|chocolate|pastry|cookie|donut|tiramisu|sundae/i.test(combined)) {
    return buildResult(5);
  }

  // 4. Beverages / Coffee / Tea / Drinks (Refreshing Teal)
  if (/coffee|tea|latte|cappuccino|espresso|juice|soda|shake|drink|beverage|mojito|coke|smoothie|water|pepsi|beer|wine|cocktail|chai/i.test(combined)) {
    return buildResult(6);
  }

  // 5. Salads / Greens / Veg Botanicals (Botanical Emerald)
  if (
    /salad|green|veg|spinach|herb|paneer|avocado|tofu|broccoli|cucumber|lettuce|kale|zucchini|dal|rice/i.test(combined) ||
    isVeg
  ) {
    return buildResult(2);
  }

  // 6. Bakery / Pizzas / Breads / Pasta (Golden Amber)
  if (/pizza|cheese|bread|toast|naan|roti|sandwich|burger|fries|wrap|taco|nacho|pasta|garlic bread/i.test(combined)) {
    return buildResult(3);
  }

  // 7. Deterministic Fallback Hash
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const paletteIndex = Math.abs(hash) % PALETTES.length;

  return buildResult(paletteIndex);
}
