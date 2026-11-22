import { describe, it, expect } from 'vitest';
import { evaluateBogo, evaluateSingleOffer, getAvailableOffers } from '../utils/promoEngine';

describe('Promotion & Offer Engine (BOGO & Discounts)', () => {
  const sampleItems = [
    { id: 'item_pizza_1', name: 'Margherita Pizza', categoryName: 'Pizza', price: 250, qty: 1 },
    { id: 'item_coke_1', name: 'Coca Cola', categoryName: 'Beverages', price: 60, qty: 1 }
  ];

  it('generates an upsell nudge when 1 qualifying BOGO item is in the cart', () => {
    const result = evaluateBogo(sampleItems, ['pizza']);
    expect(result.isEligible).toBe(false);
    expect(result.discountAmount).toBe(0);
    expect(result.nudge).not.toBeNull();
    expect(result.nudge.itemId).toBe('item_pizza_1');
    expect(result.nudge.text).toContain('Add 1 more Margherita Pizza to get 1 FREE');
  });

  it('automatically calculates 1 free item when 2 BOGO items are in the cart', () => {
    const twoPizzas = [
      { id: 'item_pizza_1', name: 'Margherita Pizza', categoryName: 'Pizza', price: 250, qty: 2 }
    ];
    const result = evaluateBogo(twoPizzas, ['pizza']);
    expect(result.isEligible).toBe(true);
    expect(result.discountAmount).toBe(250);
    expect(result.itemDiscounts['item_pizza_1']).toBe(250);
  });

  it('calculates 2 free items when 4 BOGO items are in the cart', () => {
    const fourPizzas = [
      { id: 'item_pizza_1', name: 'Margherita Pizza', categoryName: 'Pizza', price: 250, qty: 4 }
    ];
    const result = evaluateBogo(fourPizzas, ['pizza']);
    expect(result.isEligible).toBe(true);
    expect(result.discountAmount).toBe(500);
  });

  it('handles spend threshold discount correctly', () => {
    const offer = {
      id: 'threshold_100',
      type: 'threshold',
      minSpend: 800,
      discountAmount: 100
    };

    // Subtotal 500 (not eligible)
    const res1 = evaluateSingleOffer(offer, sampleItems, 500);
    expect(res1.isEligible).toBe(false);
    expect(res1.discountAmount).toBe(0);

    // Subtotal 850 (eligible)
    const res2 = evaluateSingleOffer(offer, sampleItems, 850);
    expect(res2.isEligible).toBe(true);
    expect(res2.discountAmount).toBe(100);
  });

  it('handles category-specific happy hour discounts', () => {
    const offer = {
      id: 'happy_hour',
      type: 'percent_category',
      targetCategory: 'beverages',
      discountPercent: 20
    };

    const cart = [
      { id: 'i1', name: 'Burger', categoryName: 'Mains', price: 200, qty: 1 },
      { id: 'i2', name: 'Mojito', categoryName: 'Beverages', price: 150, qty: 2 } // Total beverages = 300
    ];

    const res = evaluateSingleOffer(offer, cart, 500);
    expect(res.isEligible).toBe(true);
    // 20% of 300 = 60
    expect(res.discountAmount).toBe(60);
  });

  it('enriches available offers with live eligibility status against the cart', () => {
    const restaurant = {};
    const cart = [
      { id: 'p1', name: 'Margherita Pizza', categoryName: 'Pizza', price: 250, qty: 2 }
    ];
    const offers = getAvailableOffers(restaurant, cart, 500);
    expect(offers.length).toBeGreaterThan(0);
    const bogo = offers.find(o => o.type === 'bogo');
    expect(bogo).toBeDefined();
    expect(bogo.isEligible).toBe(true);
    expect(bogo.discountAmount).toBe(250);
  });

  it('correctly discounts the lowest-priced item in mixed BOGO pairs (Toast/Square standard)', () => {
    const mixedCart = [
      { id: 'p_pep', name: 'Pepperoni Pizza', categoryName: 'Pizza', price: 350, qty: 1 },
      { id: 'p_mar', name: 'Margherita Pizza', categoryName: 'Pizza', price: 250, qty: 1 }
    ];
    const result = evaluateBogo(mixedCart, ['pizza']);
    expect(result.isEligible).toBe(true);
    // Cheaper pizza (250) is free
    expect(result.discountAmount).toBe(250);
    expect(result.itemDiscounts['p_mar']).toBe(250);
    expect(result.itemDiscounts['p_pep']).toBeUndefined();
  });

  it('supports custom product SKU / item-level targeting', () => {
    const customProductOffer = {
      id: 'custom_bogo',
      type: 'bogo',
      targetType: 'items',
      targetItemIds: ['special_burger_1'],
      buyQty: 1,
      getQty: 1,
      discountPercent: 100
    };
    const cart = [
      { id: 'other_burger', name: 'Regular Burger', categoryName: 'Mains', price: 150, qty: 2 },
      { id: 'special_burger_1', name: 'Truffle Burger', categoryName: 'Mains', price: 300, qty: 2 }
    ];
    const res = evaluateSingleOffer(customProductOffer, cart, 900);
    expect(res.isEligible).toBe(true);
    // Only Truffle Burger qualifies; 1 free = 300
    expect(res.discountAmount).toBe(300);
    expect(res.itemDiscounts['special_burger_1']).toBe(300);
  });

  it('supports Buy 2 Get 1 Free rules', () => {
    const buy2Get1 = {
      id: 'b2g1',
      type: 'bogo',
      categoryFilter: ['pizza'],
      buyQty: 2,
      getQty: 1,
      discountPercent: 100
    };
    // 2 pizzas (needs 1 more)
    const cart2 = [{ id: 'p1', name: 'Pizza', categoryName: 'Pizza', price: 200, qty: 2 }];
    const res2 = evaluateSingleOffer(buy2Get1, cart2, 400);
    expect(res2.isEligible).toBe(false);
    expect(res2.nudge.text).toContain('Add 1 more');

    // 3 pizzas (1 free!)
    const cart3 = [{ id: 'p1', name: 'Pizza', categoryName: 'Pizza', price: 200, qty: 3 }];
    const res3 = evaluateSingleOffer(buy2Get1, cart3, 600);
    expect(res3.isEligible).toBe(true);
    expect(res3.discountAmount).toBe(200);
  });

  it('supports Buy 1 Get 1 at 50% Off rules', () => {
    const bogoHalf = {
      id: 'bogo_50',
      type: 'bogo',
      categoryFilter: ['pizza'],
      buyQty: 1,
      getQty: 1,
      discountPercent: 50
    };
    const cart = [{ id: 'p1', name: 'Pizza', categoryName: 'Pizza', price: 300, qty: 2 }];
    const res = evaluateSingleOffer(bogoHalf, cart, 600);
    expect(res.isEligible).toBe(true);
    // 50% of 300 = 150
    expect(res.discountAmount).toBe(150);
  });
});
