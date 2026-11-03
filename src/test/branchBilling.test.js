import { describe, expect, it } from 'vitest';
import { canSwitchBranch, fromMinorUnits, isCalendarDate, subscriptionStatus, suggestedRenewal, toMinorUnits, validatePayment } from '../utils/branchBilling';

const payment = {
  currency: 'INR', paidOn: '2026-11-03', method: 'cash',
  allocations: [{ restaurantId: 'a', amount: '1250.25', paidThrough: '2026-12-03', activate: true }],
};

describe('manual branch billing', () => {
  it('stores money exactly in minor units, including currencies with 3 decimals', () => {
    expect(toMinorUnits('1250.25', 'INR')).toBe(125025);
    expect(toMinorUnits('1.005', 'KWD')).toBe(1005);
    expect(fromMinorUnits(1005, 'KWD')).toBe(1.005);
  });
  it.each(['-1', 'NaN', 'Infinity', '1e4', '', '1.001', '0', '999999999999999999999'])('rejects invalid INR payments: %s', amount => {
    expect(() => toMinorUnits(amount, 'INR')).toThrow();
  });
  it('allows a zero configured fee but requires positive payments', () => {
    expect(toMinorUnits('0', 'INR', true)).toBe(0);
    expect(() => toMinorUnits('0', 'INR')).toThrow();
    expect(() => toMinorUnits('10', 'XYZ')).toThrow();
  });
  it('validates real calendar dates', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-04-31')).toBe(false);
    expect(isCalendarDate('2026-11-3')).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
  });
  it('keeps a paid-through day inclusive and flags the following day overdue', () => {
    expect(subscriptionStatus({}, { paidThrough: '2026-11-03' }, '2026-11-03').key).toBe('due_soon');
    expect(subscriptionStatus({}, { paidThrough: '2026-11-02' }, '2026-11-03').key).toBe('overdue');
    expect(subscriptionStatus({}, { paidThrough: '2026-11-10' }, '2026-11-03').key).toBe('due_soon');
    expect(subscriptionStatus({}, { paidThrough: '2026-11-11' }, '2026-11-03').key).toBe('active');
  });
  it('distinguishes missing billing, awaiting payment and manual suspension', () => {
    expect(subscriptionStatus({}, undefined).key).toBe('not_set');
    expect(subscriptionStatus({}, { paidThrough: null }).key).toBe('awaiting_payment');
    expect(subscriptionStatus({ status: 'suspended' }, { paidThrough: '2099-01-01' }).key).toBe('suspended');
  });
  it('suggests renewals without rolling past the end of the target month', () => {
    expect(suggestedRenewal('2026-01-31', 'monthly', '2026-01-01')).toBe('2026-02-28');
    expect(suggestedRenewal('2024-02-29', 'yearly', '2024-01-01')).toBe('2025-02-28');
    expect(suggestedRenewal('2026-09-30', 'monthly', '2026-11-03')).toBe('2026-12-03');
  });
  it('allocates one receipt exactly across branches', () => {
    const result = validatePayment({ ...payment, allocations: [...payment.allocations, { restaurantId: 'b', amount: '249.75', paidThrough: '2027-01-01' }] }, '2026-11-03');
    expect(result.totalMinor).toBe(150000);
    expect(result.allocations.map(line => line.amountMinor)).toEqual([125025, 24975]);
  });
  it('rejects duplicate branches, missing allocations, invalid dates and future collection dates', () => {
    expect(() => validatePayment({ ...payment, allocations: [...payment.allocations, ...payment.allocations] }, '2026-11-03')).toThrow(/once/);
    expect(() => validatePayment({ ...payment, allocations: [] }, '2026-11-03')).toThrow(/Select/);
    expect(() => validatePayment({ ...payment, paidOn: '2026-11-04' }, '2026-11-03')).toThrow(/payment date/);
    expect(() => validatePayment({ ...payment, allocations: [{ ...payment.allocations[0], paidThrough: '2026-10-01' }] }, '2026-11-03')).toThrow(/Paid-through/);
  });
});

describe('branch switching authorisation', () => {
  const owner = { uid: 'owner' };
  const branch = { ownerUid: 'owner', status: 'approved', brandId: 'brand' };
  it('allows owner accounts and platform administrators', () => {
    expect(canSwitchBranch(owner, { role: 'admin' }, branch)).toBe(true);
    expect(canSwitchBranch({ uid: 'platform' }, { role: 'super_admin' }, { status: 'suspended' })).toBe(true);
  });
  it('blocks staff, PIN admins, other owners and suspended branches', () => {
    expect(canSwitchBranch(owner, { role: 'cashier' }, branch)).toBe(false);
    expect(canSwitchBranch(owner, { role: 'admin', isPinLogin: true }, branch)).toBe(false);
    expect(canSwitchBranch({ uid: 'other' }, { role: 'admin' }, branch)).toBe(false);
    expect(canSwitchBranch(owner, { role: 'admin' }, { ...branch, status: 'suspended' })).toBe(false);
    expect(canSwitchBranch(null, { role: 'admin' }, branch)).toBe(false);
  });
});
