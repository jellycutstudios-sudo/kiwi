/**
 * Promotion & Offer Engine for Kiwi POS
 * Handles BOGO (Buy 1 Get 1 Free), Combos, Tiered Spend Discounts, and Happy Hour.
 * Follows industry-standard rule evaluation used by Toast and Square POS.
 */

export const DEFAULT_OFFERS = [
  {
    id: 'bogo_pizza',
    name: 'BOGO - Buy 1 Get 1 Free',
    type: 'bogo',
    tag: 'BOGO',
    badgeColor: '#ef4444',
    icon: '🔥',
    description: 'Buy any 2 qualifying items and get the second one 100% FREE!',
    targetType: 'category',
    categoryFilter: ['pizza', 'mains', 'burgers', 'bogo'],
    targetItemIds: [],
    buyQty: 1,
    getQty: 1,
    discountPercent: 100
  },
  {
    id: 'happy_hour_beverages',
    name: 'Happy Hour - 20% OFF Drinks',
    type: 'percent_category',
    tag: 'Happy Hour',
    badgeColor: '#f59e0b',
    icon: '🍹',
    targetType: 'category',
    targetCategory: 'beverages',
    targetItemIds: [],
    discountPercent: 20,
    description: '20% off all Beverages & Drinks in this order'
  },
  {
    id: 'flat_spend_100',
    name: 'Flat ₹100 OFF on Orders > ₹800',
    type: 'threshold',
    tag: 'Spend & Save',
    badgeColor: '#10b981',
    icon: '💰',
    minSpend: 800,
    discountAmount: 100,
    description: 'Save flat ₹100 when your cart subtotal reaches ₹800'
  },
  {
    id: 'welcome_guest_10',
    name: 'VIP / Guest Special (10% OFF)',
    type: 'percent_cart',
    tag: 'VIP Guest',
    badgeColor: '#8b5cf6',
    icon: '👑',
    discountPercent: 10,
    description: '10% off entire order for loyalty customers'
  }
];

/**
 * Normalizes category string for comparison (e.g. 'Pizza', 'pizzas', 'PIZZA' -> 'pizza')
 */
function normCat(cat) {
  if (!cat) return '';
  return String(cat).toLowerCase().trim().replace(/s$/, '');
}

/**
 * Evaluates BOGO eligibility and discount on cart items.
 * Supports:
 * - Same-item BOGO (e.g. 2 of same pizza)
 * - Mixed-item category BOGO (e.g. 1 Margherita + 1 Pepperoni: cheaper item is free)
 * - Custom product item-level BOGO (selected SKU / item IDs)
 * - Configurable Buy X, Get Y quantities (e.g. Buy 1 Get 1, Buy 2 Get 1)
 * - Custom discount percentages (100% Free or 50% Off second item)
 * 
 * Follows industry-standard rule evaluation used by Toast, Square, and Petpooja.
 */
export function evaluateBogo(items = [], offerOrFilters = []) {
  // Support both legacy array of filters ['pizza'] and full offer object
  const offer = Array.isArray(offerOrFilters)
    ? { categoryFilter: offerOrFilters, buyQty: 1, getQty: 1, discountPercent: 100 }
    : (offerOrFilters || {});

  const buyQty = Math.max(1, parseInt(offer.buyQty, 10) || 1);
  const getQty = Math.max(1, parseInt(offer.getQty, 10) || 1);
  const bundleSize = buyQty + getQty; // e.g. 1 + 1 = 2, or 2 + 1 = 3
  const discountPct = Math.min(100, Math.max(0, offer.discountPercent !== undefined ? Number(offer.discountPercent) : 100));

  const categoryFilters = Array.isArray(offer.categoryFilter) ? offer.categoryFilter : [];
  const targetItemIds = Array.isArray(offer.targetItemIds) 
    ? offer.targetItemIds 
    : (Array.isArray(offer.itemIds) ? offer.itemIds : []);
  const targetType = offer.targetType || (targetItemIds.length > 0 ? 'items' : 'category');

  // Helper to check if an item qualifies for this promotion
  const itemQualifies = (item) => {
    // 1. Explicit item flag or tag
    if (item.isBogo === true || 
        (Array.isArray(item.tags) && item.tags.some(t => String(t).toLowerCase() === 'bogo')) ||
        item.name?.toLowerCase().includes('bogo') ||
        item.categoryName?.toLowerCase().includes('bogo')) {
      return true;
    }

    // 2. Specific product IDs
    if (targetType === 'items' && targetItemIds.length > 0) {
      const idMatch = targetItemIds.includes(item.id) || (item.menuItemId && targetItemIds.includes(item.menuItemId));
      if (idMatch) return true;
    }

    // 3. Category match
    if (targetType === 'category' || targetType === 'any' || categoryFilters.length > 0) {
      if (categoryFilters.length === 0) return true;
      const normCategory = normCat(item.categoryName || item.categoryId);
      return categoryFilters.some(cf => normCat(cf) === normCategory || normCategory.includes(normCat(cf)));
    }

    return false;
  };

  // Flatten all qualifying cart units into a pool
  const qualifyingUnits = [];
  const itemMap = new Map();

  items.forEach(item => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    if (qty <= 0 || price < 0) return;

    if (itemQualifies(item)) {
      itemMap.set(item.id, item);
      for (let k = 0; k < qty; k++) {
        qualifyingUnits.push({
          itemId: item.id,
          name: item.name,
          price
        });
      }
    }
  });

  if (qualifyingUnits.length === 0) {
    return {
      isEligible: false,
      discountAmount: 0,
      itemDiscounts: {},
      nudge: null,
      qualifyingCount: 0
    };
  }

  // Sort units descending by price so customer pays for higher-priced items
  qualifyingUnits.sort((a, b) => b.price - a.price);

  const fullBundles = Math.floor(qualifyingUnits.length / bundleSize);
  const totalFreeUnits = fullBundles * getQty;

  let totalDiscount = 0;
  const itemDiscounts = {};

  // Toast / Square standard: The cheapest units in each completed bundle get the discount
  if (totalFreeUnits > 0) {
    const discountedUnits = qualifyingUnits.slice(qualifyingUnits.length - totalFreeUnits);
    discountedUnits.forEach(unit => {
      const unitDiscount = Math.round((unit.price * (discountPct / 100)) * 100) / 100;
      totalDiscount += unitDiscount;
      itemDiscounts[unit.itemId] = Math.round(((itemDiscounts[unit.itemId] || 0) + unitDiscount) * 100) / 100;
    });
  }

  // Calculate Upsell Nudge for unfulfilled items toward next bundle
  const remainder = qualifyingUnits.length % bundleSize;
  let eligibleNudge = null;

  if (remainder > 0) {
    const needed = bundleSize - remainder;
    const sampleItem = qualifyingUnits[qualifyingUnits.length - 1]; // Suggest cheapest or current item
    const discountWord = discountPct === 100 ? '1 FREE' : `1 at ${discountPct}% OFF`;
    
    const text = needed === 1
      ? `Add 1 more ${sampleItem.name} to get ${discountWord}!`
      : `Add ${needed} more qualifying items to get ${discountWord}!`;

    eligibleNudge = {
      itemId: sampleItem.itemId,
      itemName: sampleItem.name,
      currentCount: qualifyingUnits.length,
      neededCount: qualifyingUnits.length + needed,
      potentialSavings: Math.round((sampleItem.price * (discountPct / 100)) * 100) / 100,
      text
    };
  }

  return {
    isEligible: totalDiscount > 0,
    discountAmount: Math.round(totalDiscount * 100) / 100,
    itemDiscounts,
    nudge: eligibleNudge,
    qualifyingCount: qualifyingUnits.length
  };
}

/**
 * Evaluates an offer against the current cart state.
 */
export function evaluateSingleOffer(offer, items = [], subtotal = 0) {
  if (!offer || !offer.type || offer.isActive === false) {
    return { isEligible: false, discountAmount: 0, statusText: 'Offer inactive' };
  }

  switch (offer.type) {
    case 'bogo': {
      const bogoRes = evaluateBogo(items, offer);
      return {
        isEligible: bogoRes.isEligible,
        discountAmount: bogoRes.discountAmount,
        itemDiscounts: bogoRes.itemDiscounts,
        nudge: bogoRes.nudge,
        statusText: bogoRes.isEligible
          ? `Saves ${bogoRes.discountAmount}`
          : (bogoRes.nudge ? bogoRes.nudge.text : `Add ${Math.max(1, parseInt(offer.buyQty, 10) || 1)} items to unlock`)
      };
    }

    case 'percent_category': {
      const targetCat = normCat(offer.targetCategory);
      const targetItemIds = Array.isArray(offer.targetItemIds) ? offer.targetItemIds : [];
      const targetType = offer.targetType || (targetItemIds.length > 0 ? 'items' : 'category');
      let eligibleSubtotal = 0;

      items.forEach(i => {
        let isMatch;
        if (targetType === 'items') {
          isMatch = targetItemIds.length > 0 && (targetItemIds.includes(i.id) || (i.menuItemId && targetItemIds.includes(i.menuItemId)));
        } else if (targetType === 'any') {
          isMatch = true;
        } else {
          const cat = normCat(i.categoryName || i.categoryId);
          isMatch = Boolean(targetCat && (cat === targetCat || cat.includes(targetCat)));
        }
        if (isMatch) {
          eligibleSubtotal += (Number(i.price) || 0) * (Number(i.qty) || 0);
        }
      });
      const pct = Math.min(100, Math.max(0, Number(offer.discountPercent) || 0));
      const discount = Math.round(((eligibleSubtotal * pct) / 100) * 100) / 100;
      return {
        isEligible: discount > 0,
        discountAmount: discount,
        statusText: discount > 0 ? `Saves ${discount}` : `Add items from ${offer.targetCategory || 'offer products'} to unlock`
      };
    }

    case 'threshold': {
      const min = Number(offer.minSpend) || 0;
      const isEligible = subtotal >= min;
      const discount = isEligible 
        ? (offer.discountPercent ? Math.round(((subtotal * offer.discountPercent) / 100) * 100) / 100 : Math.min(subtotal, Number(offer.discountAmount) || 0))
        : 0;
      const diff = Math.max(0, min - subtotal);
      return {
        isEligible,
        discountAmount: discount,
        statusText: isEligible 
          ? `Saves ${discount}` 
          : `Add ${Math.round(diff)} more to unlock!`
      };
    }

    case 'percent_cart': {
      const pct = Math.min(100, Math.max(0, Number(offer.discountPercent) || 0));
      const discount = Math.round(((subtotal * pct) / 100) * 100) / 100;
      return {
        isEligible: discount > 0,
        discountAmount: discount,
        statusText: discount > 0 ? `Saves ${discount}` : 'Add items to unlock'
      };
    }

    default:
      return { isEligible: false, discountAmount: 0, statusText: 'Offer not applicable' };
  }
}

/**
 * Returns all available restaurant offers enriched with live eligibility against current cart items.
 */
export function getAvailableOffers(restaurant, items = [], subtotal = 0, currentAppliedOfferId = null) {
  const customOffers = restaurant?.settings?.offers || restaurant?.offers;
  const list = Array.isArray(customOffers) && customOffers.length > 0
    ? customOffers
    : DEFAULT_OFFERS;

  return list
    .filter(offer => offer && offer.isActive !== false)
    .map(offer => {
      const evalResult = evaluateSingleOffer(offer, items, subtotal);
      const isApplied = currentAppliedOfferId === offer.id;
      return {
        ...offer,
        isApplied,
        isEligible: evalResult.isEligible,
        discountAmount: evalResult.discountAmount,
        nudge: evalResult.nudge,
        statusText: evalResult.statusText,
        itemDiscounts: evalResult.itemDiscounts || {}
      };
    });
}
