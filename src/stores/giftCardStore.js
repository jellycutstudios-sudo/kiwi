import { create } from 'zustand';
import { useOrderStore } from './orderStore';
import { computeTax } from '../utils/taxUtils';

export const useGiftCardStore = create((set) => ({
  giftCardCode: null,
  giftCardBalance: 0,
  giftCardDeduction: 0,

  applyGiftCard: (code, balance, restaurant) => {
    const orderStore = useOrderStore.getState();
    const subtotal = orderStore.getSubtotal();
    const discountAmt = orderStore.getDiscountAmount();
    const pointsDiscount = orderStore.getPointsDiscountAmount();
    const taxableAmount = Math.max(0, subtotal - discountAmt - pointsDiscount);
    const { taxTotal } = computeTax(taxableAmount, restaurant?.taxConfig ?? { type: 'none', rate: 0 });
    const totalBeforeGiftCard = taxableAmount + taxTotal;

    const deduction = Math.round(Math.min(balance, totalBeforeGiftCard) * 100) / 100;
    set({
      giftCardCode: code,
      giftCardBalance: balance,
      giftCardDeduction: deduction
    });
  },

  removeGiftCard: () => set({
    giftCardCode: null,
    giftCardBalance: 0,
    giftCardDeduction: 0
  }),

  clearGiftCard: () => set({
    giftCardCode: null,
    giftCardBalance: 0,
    giftCardDeduction: 0
  })
}));
