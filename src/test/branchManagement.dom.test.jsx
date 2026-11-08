// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const fixtures = vi.hoisted(() => ({ groups: [], subscriptions: {}, receipts: [], failure: false, save: vi.fn() }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db, path) => ({ path }), query: ref => ref,
  where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  onSnapshot: (ref, callback, failure) => {
    if (fixtures.failure) { failure(Object.assign(new Error('Permission denied'), { code: 'permission-denied' })); return () => {}; }
    const docs = ref.path === 'businessGroups' ? fixtures.groups : ref.path === 'branchSubscriptions'
      ? Object.entries(fixtures.subscriptions).map(([id, value]) => ({ id, ...value })) : fixtures.receipts;
    callback({ docs: docs.map(item => ({ id: item.id, data: () => item })) });
    return () => {};
  },
}));
vi.mock('../services/branchAdministration', () => ({
  connectBranches: (...args) => fixtures.save('connect', ...args),
  createBusinessGroup: (...args) => fixtures.save('group', ...args),
  createBranch: (...args) => fixtures.save('branch', ...args),
  updateBranchAccountType: (...args) => fixtures.save('account_type', ...args),
  saveBranchFee: (...args) => fixtures.save('fee', ...args),
  recordBranchPayment: (...args) => fixtures.save('payment', ...args),
  newPaymentId: () => 'receipt-stable-id',
}));

import BranchManagement from '../components/admin/BranchManagement';

const branches = [
  { id: 'a', name: 'Downtown', ownerUid: 'owner', status: 'approved', currency: 'INR', businessGroupId: 'group' },
  { id: 'b', name: 'Airport', ownerUid: 'owner', status: 'pending', currency: 'INR', businessGroupId: 'group' },
  { id: 'c', name: 'Mall', ownerUid: 'owner', status: 'approved', currency: 'INR' },
  { id: 'd', name: 'Other owner branch', ownerUid: 'other', status: 'approved', currency: 'INR' },
];
const owners = { owner: { id: 'owner', name: 'Owner', email: 'owner@example.test', role: 'admin' } };
const renderConsole = () => render(<BranchManagement restaurants={branches} usersMap={owners} onEnter={vi.fn()} onStatusChange={vi.fn()} />);

beforeEach(() => {
  fixtures.groups = [{ id: 'group', name: 'Kiwi', ownerUid: 'owner' }];
  fixtures.subscriptions = { a: { currency: 'INR', feeMinor: 100000, cycle: 'monthly', paidThrough: '2099-12-01' }, b: { currency: 'INR', feeMinor: 200000, cycle: 'monthly', paidThrough: null } };
  fixtures.receipts = []; fixtures.failure = false; fixtures.save.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('super admin branch management', () => {
  it('groups branches by business and retains ungrouped branches', () => {
    renderConsole();
    const group = screen.getByRole('region', { name: 'Business Kiwi' });
    expect(within(group).getByRole('heading', { name: 'Downtown' })).toBeInTheDocument();
    expect(within(group).getByRole('heading', { name: 'Airport' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ungrouped branches' })).toHaveTextContent('Mall');
  });
  it('only offers eligible branches from the same owner for connecting', () => {
    renderConsole(); fireEvent.click(screen.getByRole('button', { name: 'Connect existing' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /Mall/ })).toBeInTheDocument();
    expect(within(dialog).queryByText('Other owner branch')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Mall/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(fixtures.save).toHaveBeenCalledWith('connect', 'group', ['c']);
  });
  it('records one payment with separate allocations and activation choices', async () => {
    renderConsole();
    fireEvent.click(within(screen.getByRole('region', { name: 'Business Kiwi' })).getAllByRole('button', { name: 'Record payment' })[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Amount · Downtown')).toHaveValue('1000');
    expect(within(dialog).getByLabelText('Amount · Airport')).toHaveValue('2000');
    expect(within(dialog).getByRole('checkbox', { name: 'Approve and activate this branch' })).toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment & renew' }));
    await waitFor(() => expect(fixtures.save).toHaveBeenCalled());
    const [type, id, saved] = fixtures.save.mock.calls[0];
    expect(type).toBe('payment'); expect(id).toBe('receipt-stable-id');
    expect(saved.allocations.map(line => [line.restaurantId, line.amount, line.activate])).toEqual([['a', '1000', false], ['b', '2000', true]]);
  });
  it('keeps failed submissions open and reuses the same receipt ID on retry', async () => {
    fixtures.save.mockRejectedValueOnce(new Error('Renewal must extend current date.'));
    renderConsole();
    fireEvent.click(within(screen.getByRole('article', { name: 'Branch Downtown' })).getByRole('button', { name: 'Record payment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record payment & renew' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Renewal must extend'));
    fireEvent.click(screen.getByRole('button', { name: 'Record payment & renew' }));
    await waitFor(() => expect(fixtures.save).toHaveBeenCalledTimes(2));
    expect(fixtures.save.mock.calls.map(call => call[1])).toEqual(['receipt-stable-id', 'receipt-stable-id']);
  });
  it('shows only this branch’s allocation in a combined receipt history', async () => {
    fixtures.receipts = [{ id: 'receipt', branchIds: ['a', 'b'], paidOn: '2026-11-01', currency: 'INR', method: 'cash', allocations: [{ restaurantId: 'a', amountMinor: 100000, paidThrough: '2026-12-01' }, { restaurantId: 'b', amountMinor: 200000, paidThrough: '2026-12-02' }] }];
    renderConsole();
    fireEvent.click(within(screen.getByRole('article', { name: 'Branch Downtown' })).getByRole('button', { name: 'Payment history' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Combined payment for 2 branches/)).toBeInTheDocument();
    expect(within(dialog).getByText('2026-12-01')).toBeInTheDocument();
    expect(within(dialog).queryByText('2026-12-02')).not.toBeInTheDocument();
  });
  it('searches by group name and filters pending approvals', () => {
    renderConsole();
    fireEvent.change(screen.getByLabelText('Search businesses and branches'), { target: { value: 'Kiwi' } });
    expect(screen.queryByRole('heading', { name: 'Mall' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter branches'), { target: { value: 'pending' } });
    expect(screen.getByRole('heading', { name: 'Airport' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Downtown' })).not.toBeInTheDocument();
  });
  it('disables mutations when private billing cannot be loaded', () => {
    fixtures.failure = true;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderConsole();
    expect(screen.getByRole('alert')).toHaveTextContent('Super admin access must also be allowed by the Firebase rules');
    expect(screen.queryByText('No payment recorded')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Create business' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Record payment' }).every(button => button.disabled)).toBe(true);
    warning.mockRestore();
  });
});
