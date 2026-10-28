/**
 * Kiwi POS — Seat-Level & Itemized Split Check Calculation Engine
 * Benchmark: Toast POS ($15B+) / Square for Restaurants Top 0.1% Architecture
 */

import { computeOrderTaxes } from './taxUtils';

/**
 * Distributes an exact penny amount across N parts without rounding losses.
 * Guarantees sum(parts) === total.
 * 
 * @param {number} total 
 * @param {number} numParts 
 * @returns {number[]}
 */
export function distributeEvenly(total, numParts) {
  if (!numParts || numParts <= 0) return [Math.round(total * 100) / 100];
  const totalCents = Math.round(Number(total) * 100);
  const baseCents = Math.floor(totalCents / numParts);
  const remainderCents = totalCents % numParts;

  const result = [];
  for (let i = 0; i < numParts; i++) {
    // Distribute remainder cents to first few checks
    const cents = baseCents + (i < remainderCents ? 1 : 0);
    result.push(cents / 100);
  }
  return result;
}

/**
 * Computes subtotal, taxes, service charges, discounts, and final total for a set of items in a check.
 * 
 * @param {Array} items - Items assigned to this check
 * @param {Object} options - Configuration and order context
 * @returns {Object} Calculated check totals
 */
export function computeCheckTotals(items = [], options = {}) {
  const {
    restaurant = {},
    orderDiscount = 0,
    orderDiscountType = 'fixed',
    totalOrderSubtotal = 0,
    orderType = 'dine-in',
    categoriesMap = {}
  } = options;

  let checkSubtotal = 0;
  for (const item of items) {
    const qty = Number(item.quantity ?? item.qty) || 1;
    const unitPrice = Number(item.price) || 0;
    const modifierTotal = Number(item.modifierTotal) || 0;
    checkSubtotal += (unitPrice + modifierTotal) * qty;
  }
  checkSubtotal = Math.round(checkSubtotal * 100) / 100;

  // Calculate check's share of overall order discount
  let checkDiscount = 0;
  if (orderDiscount > 0) {
    if (orderDiscountType === 'percent') {
      checkDiscount = Math.round((checkSubtotal * (orderDiscount / 100)) * 100) / 100;
    } else {
      // Fixed discount: proportional to check's share of total subtotal
      if (totalOrderSubtotal > 0) {
        const ratio = checkSubtotal / totalOrderSubtotal;
        checkDiscount = Math.round((orderDiscount * ratio) * 100) / 100;
      } else {
        checkDiscount = 0;
      }
    }
  }

  // Service charge
  const scRate = Number(restaurant?.serviceChargeRate) || 0;
  const checkServiceCharge = scRate > 0 
    ? Math.round((checkSubtotal * (scRate / 100)) * 100) / 100 
    : 0;

  const taxConfig = restaurant?.taxConfig || {
    rate: restaurant?.taxRate || 0,
    type: restaurant?.taxType || 'vat',
    mode: restaurant?.taxInclusive ? 'inclusive' : 'exclusive'
  };

  const taxCalc = computeOrderTaxes(items, categoriesMap, taxConfig, {
    discountAmount: checkDiscount,
    serviceChargeAmount: checkServiceCharge,
    orderType
  });

  const checkTaxTotal = Number(taxCalc?.taxTotal) || 0;
  const isTaxInclusive = taxConfig.mode === 'inclusive';
  const checkTotal = isTaxInclusive
    ? Math.max(0, Math.round((checkSubtotal - checkDiscount + checkServiceCharge) * 100) / 100)
    : Math.max(0, Math.round((checkSubtotal - checkDiscount + checkServiceCharge + checkTaxTotal) * 100) / 100);

  return {
    subtotal: checkSubtotal,
    taxTotal: checkTaxTotal,
    serviceChargeAmount: checkServiceCharge,
    discountAmount: checkDiscount,
    total: checkTotal,
    taxInfo: taxCalc
  };
}

/**
 * Groups cart items by seat number.
 * Items without a seatNumber or seatNumber <= 0 are classified as 'shared'.
 * 
 * @param {Array} items 
 * @returns {{ seats: Record<number, Array>, shared: Array }}
 */
export function groupItemsBySeat(items = []) {
  const seats = {};
  const shared = [];

  items.forEach(item => {
    const seatNum = item.seatNumber ? Number(item.seatNumber) : null;
    if (seatNum && seatNum > 0) {
      if (!seats[seatNum]) seats[seatNum] = [];
      seats[seatNum].push({ ...item });
    } else {
      shared.push({ ...item });
    }
  });

  return { seats, shared };
}

/**
 * Builds Split by Seat sub-checks.
 * Shared items can either be placed in a dedicated "Shared Table" check or divided proportionally.
 * 
 * @param {Array} items 
 * @param {Object} options 
 * @returns {Array} List of sub-check objects
 */
export function createSeatChecks(items = [], options = {}) {
  const { restaurant = {}, orderDiscount = 0, orderDiscountType = 'fixed', sharedHandling = 'separate' } = options;
  const { seats, shared } = groupItemsBySeat(items);
  const seatNumbers = Object.keys(seats).map(Number).sort((a, b) => a - b);

  // If no seats are assigned at all, treat as 1 check
  if (seatNumbers.length === 0) {
    const totals = computeCheckTotals(items, { restaurant, orderDiscount, orderDiscountType, totalOrderSubtotal: 0 });
    return [{
      id: 'check-1',
      checkNumber: 1,
      title: 'Check 1 (Full Table)',
      seatNumber: null,
      items: [...items],
      isPaid: false,
      paidAt: null,
      paymentDetails: null,
      ...totals
    }];
  }

  const checks = [];
  const totalSubtotal = items.reduce((sum, i) => sum + ((Number(i.price) || 0) + (Number(i.modifierTotal) || 0)) * (Number(i.qty) || 1), 0);

  seatNumbers.forEach((seatNum, idx) => {
    const seatItems = seats[seatNum] || [];
    const totals = computeCheckTotals(seatItems, {
      restaurant,
      orderDiscount,
      orderDiscountType,
      totalOrderSubtotal: totalSubtotal
    });

    checks.push({
      id: `check-seat-${seatNum}`,
      checkNumber: idx + 1,
      title: `Seat ${seatNum}`,
      seatNumber: seatNum,
      items: seatItems,
      isPaid: false,
      paidAt: null,
      paymentDetails: null,
      ...totals
    });
  });

  // Handle shared items
  if (shared.length > 0) {
    if (sharedHandling === 'separate') {
      const totals = computeCheckTotals(shared, {
        restaurant,
        orderDiscount,
        orderDiscountType,
        totalOrderSubtotal: totalSubtotal
      });

      checks.push({
        id: 'check-shared',
        checkNumber: checks.length + 1,
        title: 'Shared Items (Table)',
        seatNumber: 0,
        items: shared,
        isPaid: false,
        paidAt: null,
        paymentDetails: null,
        ...totals
      });
    } else if (sharedHandling === 'distribute' && checks.length > 0) {
      // Proportional split of shared items into existing seat checks
      const sharedTotals = computeCheckTotals(shared, { restaurant, totalOrderSubtotal: totalSubtotal });
      const distributedAmounts = distributeEvenly(sharedTotals.total, checks.length);
      checks.forEach((chk, i) => {
        chk.total = Math.round((chk.total + distributedAmounts[i]) * 100) / 100;
        chk.sharedContribution = distributedAmounts[i];
      });
    }
  }

  return checks;
}

/**
 * Builds Split Evenly ($N$ Ways) sub-checks from an order.
 * 
 * @param {number} total 
 * @param {number} numGuests 
 * @param {Array} items 
 * @param {Object} options 
 * @returns {Array}
 */
export function createEvenChecks(total, numGuests, _items = [], _options = {}) {
  const n = Math.max(2, Math.min(20, Number(numGuests) || 2));
  const amounts = distributeEvenly(total, n);

  return amounts.map((amt, idx) => ({
    id: `check-even-${idx + 1}`,
    checkNumber: idx + 1,
    title: `Guest ${idx + 1} of ${n}`,
    seatNumber: null,
    items: [], // Even split divides monetary total
    isEvenSplit: true,
    subtotal: amt,
    taxTotal: 0,
    serviceChargeAmount: 0,
    discountAmount: 0,
    total: amt,
    isPaid: false,
    paidAt: null,
    paymentDetails: null
  }));
}

/**
 * Splits an item quantity into two separate items (e.g. 2 Beers -> 1 to Seat 1, 1 to Seat 2).
 * 
 * @param {Object} item 
 * @param {number} moveQty 
 * @param {number} targetSeat 
 * @returns {{ remainingItem: Object|null, movedItem: Object }}
 */
export function splitItemQuantity(item, moveQty, targetSeat) {
  const currentQty = Number(item.quantity ?? item.qty) || 1;
  const qtyToMove = Math.max(1, Math.min(currentQty, Number(moveQty) || 1));

  const movedItem = {
    ...item,
    qty: qtyToMove,
    seatNumber: targetSeat
  };

  const remainingQty = currentQty - qtyToMove;
  const remainingItem = remainingQty > 0
    ? { ...item, qty: remainingQty }
    : null;

  return { remainingItem, movedItem };
}

/**
 * Marks a specific sub-check as paid and records payment info.
 * 
 * @param {Array} checks 
 * @param {string} checkId 
 * @param {Object} paymentDetails 
 * @returns {Array} Updated checks array
 */
export function settleCheck(checks = [], checkId, paymentDetails = {}) {
  return checks.map(chk => {
    if (chk.id === checkId) {
      return {
        ...chk,
        isPaid: true,
        paidAt: new Date().toISOString(),
        paymentDetails: {
          method: paymentDetails.method || 'cash',
          amount: chk.total,
          authCode: paymentDetails.authCode || null,
          rrn: paymentDetails.rrn || null,
          staffId: paymentDetails.staffId || null,
          staffName: paymentDetails.staffName || null,
          ...paymentDetails
        }
      };
    }
    return chk;
  });
}

/**
 * Checks if every sub-check has been settled.
 * 
 * @param {Array} checks 
 * @returns {boolean}
 */
export function areAllChecksSettled(checks = []) {
  if (!checks || checks.length === 0) return false;
  return checks.every(chk => chk.isPaid);
}

/**
 * Computes remaining balance yet to be paid across all sub-checks.
 * 
 * @param {Array} checks 
 * @returns {number}
 */
export function getRemainingBalance(checks = []) {
  const remaining = checks
    .filter(chk => !chk.isPaid)
    .reduce((sum, chk) => sum + (Number(chk.total) || 0), 0);
  return Math.round(remaining * 100) / 100;
}

/**
 * Computes total settled amount across all paid sub-checks.
 * 
 * @param {Array} checks 
 * @returns {number}
 */
export function getTotalPaid(checks = []) {
  const paid = checks
    .filter(chk => chk.isPaid)
    .reduce((sum, chk) => sum + (Number(chk.total) || 0), 0);
  return Math.round(paid * 100) / 100;
}

