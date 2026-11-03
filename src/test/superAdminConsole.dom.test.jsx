// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const fixtures = vi.hoisted(() => ({ restaurants: [], records: {}, reads: [] }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../stores/authStore', () => ({ useAuthStore: selector => selector({ staffDoc: { role: 'super_admin' }, restaurant: null, switchRestaurant: vi.fn() }) }));
vi.mock('../components/admin/BranchManagement', () => ({ default: () => <div>Branch directory</div> }));
vi.mock('../services/platformMenus', () => ({ pushBranchMenu: vi.fn(), setBusinessDishAvailability: vi.fn() }));
vi.mock('firebase/firestore', () => {
  const docs = records => records.map(item => ({ id: item.id, data: () => item }));
  return {
    collection: (_db, ...parts) => ({ path: parts.join('/') }),
    doc: (_db, ...parts) => ({ path: parts.join('/') }),
    query: (ref, ...constraints) => ({ ...ref, constraints }),
    where: (field, op, value) => ({ field, op, value }),
    onSnapshot: (ref, callback) => { const records = ref.path === 'restaurants' ? fixtures.restaurants : []; const snapshot = { docs: docs(records), forEach: visit => docs(records).forEach(visit) }; callback(snapshot); return () => {}; },
    getDocs: async ref => {
      fixtures.reads.push(ref);
      let records = fixtures.records[ref.path] || [];
      for (const filter of ref.constraints || []) {
        records = records.filter(record => {
          const value = record[filter.field];
          if ((typeof value === 'string') !== (typeof filter.value === 'string')) return false;
          const actual = typeof value?.toDate === 'function' ? value.toDate() : value;
          return filter.op === '>=' ? actual >= filter.value : actual <= filter.value;
        });
      }
      return { docs: docs(records) };
    },
    addDoc: vi.fn(), serverTimestamp: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  };
});
import Restaurants from '../routes/admin/Restaurants';

beforeEach(() => {
  const recent = new Date(Date.now() - 86400000);
  fixtures.restaurants = [
    { id: 'a', name: 'Branch A', ownerUid: 'owner', businessGroupId: 'kiwi', currency: 'INR' },
    { id: 'b', name: 'Branch B', ownerUid: 'owner', businessGroupId: 'kiwi', currency: 'INR' },
    { id: 'c', name: 'Other Owner', ownerUid: 'other', currency: 'USD' },
    { id: 'd', name: 'Different Business', ownerUid: 'owner', businessGroupId: 'other-group', currency: 'INR' },
  ];
  fixtures.records = {
    'restaurants/a/orders': [{ id: 'text', createdAt: recent.toISOString(), status: 'billed', total: 100 }, { id: 'ts', createdAt: { toDate: () => recent }, status: 'billed', total: 20 }],
    'restaurants/c/orders': [{ id: 'usd', createdAt: recent.toISOString(), status: 'billed', total: 50 }],
    'restaurants/a/staff': [{ id: 'duplicate-id', role: 'admin', name: 'Inactive Admin', active: false }],
    'restaurants/b/staff': [{ id: 'duplicate-id', role: 'cashier', name: 'Cashier', active: true }],
  };
  fixtures.reads = [];
});
afterEach(cleanup);

describe('super admin console audit regressions', () => {
  it('includes timestamp and ISO-string POS orders and keeps currency totals separate', async () => {
    render(<Restaurants />);
    fireEvent.click(screen.getByRole('button', { name: 'Platform & Franchise Analytics' }));
    await waitFor(() => expect(screen.getByText('Group Sales Revenue').previousSibling).toHaveTextContent('₹120.00'));
    expect(fixtures.reads.filter(ref => ref.path.endsWith('/orders')).some(ref => ref.constraints.some(filter => filter.value instanceof Date))).toBe(true);
    expect(fixtures.reads.filter(ref => ref.path.endsWith('/orders')).some(ref => ref.constraints.some(filter => typeof filter.value === 'string'))).toBe(true);
    expect(fixtures.reads.some(ref => ref.path === 'restaurants/c/orders')).toBe(false);
    fireEvent.change(screen.getByLabelText('Report currency'), { target: { value: 'USD' } });
    await waitFor(() => expect(screen.getByText('Group Sales Revenue').previousSibling).toHaveTextContent('$50.00'));
  });
  it('does not read source menus on directory load or allow unrelated target selections', async () => {
    render(<Restaurants />);
    expect(fixtures.reads.some(ref => ref.path.endsWith('/menu'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Master Menu Hub & Push' }));
    expect(screen.getByRole('button', { name: /Apply to source business/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Source Master Outlet'), { target: { value: 'a' } });
    expect(screen.getByRole('checkbox', { name: /Branch B/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Other Owner/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Different Business/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Branch B/ }));
    fireEvent.change(screen.getByLabelText('Source Master Outlet'), { target: { value: 'b' } });
    expect(screen.getByText('Target Branches (0 selected)')).toBeInTheDocument();
  });
  it('refreshes the staff directory without fetching analytics and shows actual status/scope', async () => {
    render(<Restaurants />);
    fireEvent.click(screen.getByRole('button', { name: 'Global Staff Directory' }));
    await screen.findByText(/Inactive Admin/);
    expect(screen.getByText('● Inactive')).toBeInTheDocument();
    expect(screen.queryByText('Global (All Stores)')).not.toBeInTheDocument();
    expect(screen.queryByText(/Granted Capabilities/)).not.toBeInTheDocument();
    fixtures.reads = [];
    fireEvent.click(screen.getAllByRole('button', { name: 'Refresh Staff' })[0]);
    await waitFor(() => expect(fixtures.reads.length).toBeGreaterThan(0));
    expect(fixtures.reads.every(ref => ref.path.endsWith('/staff'))).toBe(true);
  });
});
