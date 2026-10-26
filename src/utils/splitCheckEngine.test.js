import { describe, it, expect } from 'vitest';
import {
  distributeEvenly,
  computeCheckTotals,
  groupItemsBySeat,
  createSeatChecks,
  createEvenChecks,
  splitItemQuantity,
  settleCheck,
  areAllChecksSettled,
  getRemainingBalance,
  getTotalPaid
} from './splitCheckEngine';

describe('splitCheckEngine', () => {
  describe('distributeEvenly', () => {
    it('splits $100 evenly across 3 guests with exact penny preservation', () => {
      const parts = distributeEvenly(100, 3);
      expect(parts).toEqual([33.34, 33.33, 33.33]);
      const sum = parts.reduce((acc, p) => acc + p, 0);
      expect(Math.round(sum * 100) / 100).toBe(100);
    });

    it('splits $10 evenly across 4 guests', () => {
      const parts = distributeEvenly(10, 4);
      expect(parts).toEqual([2.5, 2.5, 2.5, 2.5]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(10);
    });

    it('handles 1 guest', () => {
      const parts = distributeEvenly(45.75, 1);
      expect(parts).toEqual([45.75]);
    });
  });

  describe('groupItemsBySeat', () => {
    it('groups items by seat numbers and separates shared items', () => {
      const items = [
        { id: '1', name: 'Burger', seatNumber: 1, qty: 1, price: 10 },
        { id: '2', name: 'Pasta', seatNumber: 2, qty: 1, price: 15 },
        { id: '3', name: 'Fries', seatNumber: 1, qty: 1, price: 5 },
        { id: '4', name: 'Nachos for Table', seatNumber: null, qty: 1, price: 12 },
      ];

      const { seats, shared } = groupItemsBySeat(items);
      expect(seats[1]).toHaveLength(2);
      expect(seats[2]).toHaveLength(1);
      expect(shared).toHaveLength(1);
      expect(shared[0].name).toBe('Nachos for Table');
    });
  });

  describe('createSeatChecks', () => {
    const mockRestaurant = {
      taxRate: 5,
      taxInclusive: false,
      serviceChargeRate: 10
    };

    it('creates distinct checks for Seat 1, Seat 2, and Shared', () => {
      const items = [
        { id: '1', name: 'Steak', seatNumber: 1, qty: 1, price: 40 },
        { id: '2', name: 'Salmon', seatNumber: 2, qty: 1, price: 30 },
        { id: '3', name: 'Garlic Bread', seatNumber: null, qty: 1, price: 10 },
      ];

      const checks = createSeatChecks(items, { restaurant: mockRestaurant, sharedHandling: 'separate' });
      expect(checks).toHaveLength(3);
      expect(checks[0].title).toBe('Seat 1');
      expect(checks[0].subtotal).toBe(40);
      expect(checks[1].title).toBe('Seat 2');
      expect(checks[1].subtotal).toBe(30);
      expect(checks[2].title).toBe('Shared Items (Table)');
      expect(checks[2].subtotal).toBe(10);
    });
  });

  describe('createEvenChecks', () => {
    it('creates N checks matching the total', () => {
      const checks = createEvenChecks(75.50, 3);
      expect(checks).toHaveLength(3);
      const totalSum = checks.reduce((acc, c) => acc + c.total, 0);
      expect(Math.round(totalSum * 100) / 100).toBe(75.50);
    });
  });

  describe('splitItemQuantity', () => {
    it('splits a quantity of 3 into 1 for target seat and 2 remaining', () => {
      const item = { id: 'coke', name: 'Coke', qty: 3, price: 3, seatNumber: 1 };
      const { remainingItem, movedItem } = splitItemQuantity(item, 1, 2);

      expect(remainingItem.qty).toBe(2);
      expect(remainingItem.seatNumber).toBe(1);
      expect(movedItem.qty).toBe(1);
      expect(movedItem.seatNumber).toBe(2);
    });
  });

  describe('settlement helpers', () => {
    it('settles a check and tracks balances', () => {
      const checks = [
        { id: 'c-1', total: 40, isPaid: false },
        { id: 'c-2', total: 60, isPaid: false }
      ];

      expect(getRemainingBalance(checks)).toBe(100);
      expect(getTotalPaid(checks)).toBe(0);
      expect(areAllChecksSettled(checks)).toBe(false);

      const afterSettle1 = settleCheck(checks, 'c-1', { method: 'card' });
      expect(afterSettle1[0].isPaid).toBe(true);
      expect(afterSettle1[0].paymentDetails.method).toBe('card');
      expect(getRemainingBalance(afterSettle1)).toBe(60);
      expect(getTotalPaid(afterSettle1)).toBe(40);
      expect(areAllChecksSettled(afterSettle1)).toBe(false);

      const afterSettle2 = settleCheck(afterSettle1, 'c-2', { method: 'cash' });
      expect(getRemainingBalance(afterSettle2)).toBe(0);
      expect(getTotalPaid(afterSettle2)).toBe(100);
      expect(areAllChecksSettled(afterSettle2)).toBe(true);
    });
  });
});
