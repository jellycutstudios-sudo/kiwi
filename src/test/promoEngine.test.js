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
});
