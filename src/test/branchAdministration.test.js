import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({ docs: new Map(), nextId: 0 }));
vi.mock('../firebase', () => ({ db: {}, auth: { currentUser: { uid: 'platform' } } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...parts) => ({ path: parts.join('/') }),
  doc: (base, ...parts) => {
    const path = parts.length ? parts.join('/') : `${base.path}/generated-${++memory.nextId}`;
    return { path, id: path.split('/').at(-1) };
  },
  serverTimestamp: () => 'server-time',
  runTransaction: async (_db, callback) => {
    const writes = [];
    const tx = {
      get: async ref => {
        if (writes.length) throw new Error('Transactions must read all documents before writing.');
        return { ref, exists: () => memory.docs.has(ref.path), data: () => memory.docs.get(ref.path) };
      },
      set: (ref, value, options) => writes.push({ ref, value, merge: options?.merge }),
      update: (ref, value) => writes.push({ ref, value, merge: true }),
    };
    await callback(tx);
    writes.forEach(({ ref, value, merge }) => memory.docs.set(ref.path, { ...(merge ? memory.docs.get(ref.path) : {}), ...value }));
  },
}));

import { connectBranches, createBranch, createBusinessGroup, recordBranchPayment, saveBranchFee, updateBranchAccountType } from '../services/branchAdministration';

const input = () => ({
  currency: 'INR', paidOn: '2026-01-01', method: 'cash', reference: 'receipt-123',
  allocations: [
    { restaurantId: 'a', amount: '1000', paidThrough: '2027-01-01', activate: true },
    { restaurantId: 'b', amount: '2000', paidThrough: '2027-02-01', activate: false },
  ],
});

beforeEach(() => {
  memory.docs.clear(); memory.nextId = 0;
  memory.docs.set('users/owner', { role: 'admin', email: 'owner@example.test', restaurantId: 'a' });
  memory.docs.set('businessGroups/group', { ownerUid: 'owner', name: 'Café' });
  memory.docs.set('restaurants/a', { name: 'Downtown', ownerUid: 'owner', status: 'pending' });
  memory.docs.set('restaurants/b', { name: 'Airport', ownerUid: 'owner', status: 'suspended' });
});

describe('branch administration transactions', () => {
  it('creates a group and connects existing records without replacing their operational data', async () => {
    memory.docs.set('restaurants/a/orders/order', { total: 100 });
    const id = await createBusinessGroup({ name: 'Kiwi', ownerUid: 'owner', restaurantIds: ['a'] });
    expect(memory.docs.get(`businessGroups/${id}`).ownerUid).toBe('owner');
    expect(memory.docs.get('restaurants/a').businessGroupId).toBe(id);
    expect(memory.docs.get('restaurants/a').status).toBe('pending');
    expect(memory.docs.get('restaurants/a/orders/order')).toEqual({ total: 100 });
  });
  it('rejects linking unrelated or already grouped branches atomically', async () => {
    memory.docs.set('restaurants/b', { ownerUid: 'another-owner' });
    await expect(connectBranches('group', ['a', 'b'])).rejects.toThrow(/belonging/);
    expect(memory.docs.get('restaurants/a').businessGroupId).toBeUndefined();
    memory.docs.set('restaurants/a', { ownerUid: 'owner', businessGroupId: 'existing' });
    await expect(connectBranches('group', ['a'])).rejects.toThrow(/ungrouped/);
  });
  it('new branches belong to the selected owner, start pending, and get private billing', async () => {
    const id = await createBranch({ groupId: 'group', name: 'Mall', address: 'City', phone: '', currency: 'INR', fee: '1500', cycle: 'monthly' });
    const branch = memory.docs.get(`restaurants/${id}`);
    expect(branch).toMatchObject({ ownerUid: 'owner', businessGroupId: 'group', status: 'pending', email: 'owner@example.test' });
    expect(branch.feeMinor).toBeUndefined();
    expect(memory.docs.get(`branchSubscriptions/${id}`)).toMatchObject({ feeMinor: 150000, paidThrough: null });
  });
  it('records combined payments and renews each branch independently', async () => {
    await recordBranchPayment('receipt', input());
    expect(memory.docs.get('branchPayments/receipt')).toMatchObject({ totalMinor: 300000, branchIds: ['a', 'b'], recordedBy: 'platform' });
    expect(memory.docs.get('branchSubscriptions/a').paidThrough).toBe('2027-01-01');
    expect(memory.docs.get('branchSubscriptions/b').paidThrough).toBe('2027-02-01');
    expect(memory.docs.get('restaurants/a').status).toBe('approved');
    expect(memory.docs.get('restaurants/b').status).toBe('suspended');
  });
  it('does not duplicate a retried receipt or change its renewal dates', async () => {
    await recordBranchPayment('receipt', input());
    const original = memory.docs.get('branchPayments/receipt');
    await recordBranchPayment('receipt', input());
    expect(memory.docs.get('branchPayments/receipt')).toBe(original);
    expect([...memory.docs.keys()].filter(key => key.startsWith('branchPayments/'))).toHaveLength(1);
  });
  it('rejects a combined receipt for different owners with no partial changes', async () => {
    memory.docs.set('restaurants/b', { name: 'Airport', ownerUid: 'other', status: 'pending' });
    await expect(recordBranchPayment('receipt', input())).rejects.toThrow(/one owner/);
    expect(memory.docs.has('branchPayments/receipt')).toBe(false);
    expect(memory.docs.has('branchSubscriptions/a')).toBe(false);
    expect(memory.docs.get('restaurants/a').status).toBe('pending');
  });
  it('never claims a changed payment succeeded when its receipt ID was already committed', async () => {
    await recordBranchPayment('receipt', input());
    const changed = input(); changed.allocations[0].amount = '1500';
    await expect(recordBranchPayment('receipt', changed)).rejects.toThrow(/already recorded with different details/);
    expect(memory.docs.get('branchPayments/receipt').totalMinor).toBe(300000);
    expect(memory.docs.get('branchSubscriptions/a').paidThrough).toBe('2027-01-01');
  });
  it('rejects stale renewal dates and mixed currencies before writing anything', async () => {
    memory.docs.set('branchSubscriptions/a', { currency: 'INR', paidThrough: '2027-01-02' });
    await expect(recordBranchPayment('receipt', input())).rejects.toThrow(/extend/);
    memory.docs.set('branchSubscriptions/a', { currency: 'KWD' });
    await expect(recordBranchPayment('receipt', input())).rejects.toThrow(/currency/);
    expect(memory.docs.has('branchPayments/receipt')).toBe(false);
    expect(memory.docs.has('branchSubscriptions/b')).toBe(false);
  });
  it('keeps an existing paid-through date when editing the fee', async () => {
    memory.docs.set('branchSubscriptions/a', { currency: 'INR', feeMinor: 100000, paidThrough: '2026-12-01', lastPaymentId: 'old' });
    await saveBranchFee('a', { fee: '1500', currency: 'INR', cycle: 'yearly' });
    expect(memory.docs.get('branchSubscriptions/a')).toMatchObject({ paidThrough: '2026-12-01', lastPaymentId: 'old', feeMinor: 150000, cycle: 'yearly' });
    await expect(saveBranchFee('a', { fee: '10', currency: 'KWD', cycle: 'monthly' })).rejects.toThrow(/currency/);
  });
  it('creates bill-only express counter branches with disabled tables and kitchen', async () => {
    const id = await createBranch({
      name: 'Express Bakery', ownerUid: 'owner', currency: 'INR', fee: '500', cycle: 'monthly',
      address: 'Main St', phone: '+919999999999', businessType: 'bill_only'
    });
    const branch = memory.docs.get(`restaurants/${id}`);
    expect(branch.businessType).toBe('bill_only');
    expect(branch.accountType).toBe('bill_only');
    expect(branch.modes).toEqual(['pos', 'till_shift']);
    expect(branch.quickPayEnabled).toBe(true);
    expect(branch.kitchenConfig).toEqual({ mode: 'disabled' });
  });
  it('updates existing branch account type between advanced and bill-only', async () => {
    await updateBranchAccountType('a', 'bill_only');
    expect(memory.docs.get('restaurants/a').businessType).toBe('bill_only');
    expect(memory.docs.get('restaurants/a').accountType).toBe('bill_only');
    expect(memory.docs.get('restaurants/a').modes).toEqual(['pos', 'till_shift']);
    expect(memory.docs.get('restaurants/a')['kitchenConfig.mode']).toBe('disabled');

    await updateBranchAccountType('a', 'restaurant');
    expect(memory.docs.get('restaurants/a').businessType).toBe('restaurant');
    expect(memory.docs.get('restaurants/a').accountType).toBe('restaurant');
    expect(memory.docs.get('restaurants/a').modes).toContain('table');
    expect(memory.docs.get('restaurants/a').modes).toContain('kds');
    expect(memory.docs.get('restaurants/a')['kitchenConfig.mode']).toBe('both');
  });
});
