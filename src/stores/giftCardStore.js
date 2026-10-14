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
    // Service charge is applied on the taxable base
    const serviceChargeAmt = orderStore.getServiceChargeAmount(restaurant);
    const tipAmt = orderStore.tipAmount ?? 0;

    let taxableAmountForTax = Math.max(0, subtotal - discountAmt - pointsDiscount);
    if (restaurant?.serviceChargeTaxable === 'yes') {
      taxableAmountForTax += serviceChargeAmt;
    }
    const taxRes = computeTax(taxableAmountForTax, restaurant?.taxConfig ?? { type: 'none', rate: 0 });
    const baseTaxable = Math.max(0, subtotal - discountAmt - pointsDiscount);
    const taxToAdd = taxRes.mode === 'inclusive' ? 0 : (Number(taxRes.taxTotal) || 0);
    // Mirror getTotal() exactly: baseTaxable + tax (if exclusive) + serviceCharge + tip
    const totalBeforeGiftCard = baseTaxable + taxToAdd + serviceChargeAmt + tipAmt;

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
