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
    categoryFilter: ['pizza', 'mains', 'burgers', 'bogo'],
    discountPercent: 100
  },
  {
    id: 'happy_hour_beverages',
    name: 'Happy Hour - 20% OFF Drinks',
    type: 'percent_category',
    tag: 'Happy Hour',
    badgeColor: '#f59e0b',
    icon: '🍹',
    targetCategory: 'beverages',
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
 * Rule: For every 2 units of an eligible item, 1 unit is free (100% discount on unit price).
 */
export function evaluateBogo(items = [], categoryFilters = []) {
  let totalDiscount = 0;
  const itemDiscounts = {};
  const qualifyingItems = [];
  let eligibleNudge = null;

  items.forEach(item => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    if (qty <= 0) return;

    // Check if item qualifies for BOGO:
    // 1. Explicit item flag or tag
    const hasBogoTag = item.isBogo === true || 
                       (Array.isArray(item.tags) && item.tags.some(t => String(t).toLowerCase() === 'bogo')) ||
                       item.name?.toLowerCase().includes('bogo') ||
                       item.categoryName?.toLowerCase().includes('bogo');

    // 2. Or matches configured categories (or general food items if filter is broad)
    const normCategory = normCat(item.categoryName || item.categoryId);
    const inCategory = categoryFilters.length === 0 || 
                       categoryFilters.some(cf => normCat(cf) === normCategory || normCategory.includes(normCat(cf)));

    const qualifies = hasBogoTag || inCategory;

    if (qualifies) {
      qualifyingItems.push(item);
      const freeUnits = Math.floor(qty / 2);
      if (freeUnits > 0) {
        const discountForThisItem = freeUnits * price;
        totalDiscount += discountForThisItem;
        itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + discountForThisItem;
      }

      // Check if there is an unfulfilled odd item that can be nudged! (e.g. qty 1, 3, 5)
      if (qty % 2 === 1 && !eligibleNudge) {
        eligibleNudge = {
          itemId: item.id,
          itemName: item.name,
          currentQty: qty,
          neededQty: qty + 1,
          potentialSavings: price,
          text: `Add 1 more ${item.name} to get 1 FREE (BOGO Offer)!`
        };
      }
    }
  });

  return {
    isEligible: totalDiscount > 0,
    discountAmount: Math.round(totalDiscount * 100) / 100,
    itemDiscounts,
    nudge: eligibleNudge,
    qualifyingCount: qualifyingItems.length
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
      const bogoRes = evaluateBogo(items, offer.categoryFilter || []);
      return {
        isEligible: bogoRes.isEligible,
        discountAmount: bogoRes.discountAmount,
        itemDiscounts: bogoRes.itemDiscounts,
        nudge: bogoRes.nudge,
        statusText: bogoRes.isEligible
          ? `Saves ${bogoRes.discountAmount}`
          : (bogoRes.nudge ? bogoRes.nudge.text : 'Add 2 qualifying items to unlock')
      };
    }

    case 'percent_category': {
      const target = normCat(offer.targetCategory);
      let eligibleSubtotal = 0;
      items.forEach(i => {
        const cat = normCat(i.categoryName || i.categoryId);
        if (cat === target || cat.includes(target)) {
          eligibleSubtotal += (Number(i.price) || 0) * (Number(i.qty) || 0);
        }
      });
      const pct = Math.min(100, Math.max(0, Number(offer.discountPercent) || 0));
      const discount = Math.round(((eligibleSubtotal * pct) / 100) * 100) / 100;
      return {
        isEligible: discount > 0,
        discountAmount: discount,
        statusText: discount > 0 ? `Saves ${discount}` : `Add items from ${offer.targetCategory} to unlock`
      };
    }

    case 'threshold': {
      const min = Number(offer.minSpend) || 0;
      const isEligible = subtotal >= min;
      const discount = isEligible ? Math.min(subtotal, Number(offer.discountAmount) || 0) : 0;
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
