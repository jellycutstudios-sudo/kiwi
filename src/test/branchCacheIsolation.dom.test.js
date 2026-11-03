// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ listeners: [] }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ restaurant: { id: 'b' } }) } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...parts) => ({ path: parts.join('/') }),
  onSnapshot: (ref, callback) => { firestore.listeners.push({ ref, callback }); return vi.fn(); },
  doc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), setDoc: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  const entries = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key),
  });
  firestore.listeners.length = 0;
});
afterEach(() => vi.unstubAllGlobals());
const publish = data => firestore.listeners.at(-1).callback({ docs: data.map(item => ({ id: item.id, data: () => item })) });

describe('branch cache isolation', () => {
  it('never displays the previous branch menu while loading a different branch', async () => {
    localStorage.setItem('dineos_cached_menu', JSON.stringify([{ id: 'legacy-a' }]));
    const { useMenuStore } = await import('../stores/menuStore');
    const stopA = useMenuStore.getState().subscribeMenu('a');
    publish([{ id: 'coffee-a', items: [] }]); stopA();
    const stopB = useMenuStore.getState().subscribeMenu('b');
    expect(useMenuStore.getState().categories).toEqual([]);
    publish([{ id: 'coffee-b', items: [] }]); stopB();
    useMenuStore.getState().subscribeMenu('a');
    expect(useMenuStore.getState().categories[0].id).toBe('coffee-a');
  });
  it('retains each branch’s staff offline cache without showing another branch’s roster', async () => {
    const { useStaffStore } = await import('../stores/staffStore');
    const stopA = useStaffStore.getState().subscribeStaff('a');
    publish([{ id: 'staff-a', name: 'Alice' }]); stopA();
    const stopB = useStaffStore.getState().subscribeStaff('b');
    expect(useStaffStore.getState().staff).toEqual([]);
    publish([{ id: 'staff-b', name: 'Bob' }]); stopB();
    useStaffStore.getState().subscribeStaff('a');
    expect(useStaffStore.getState().staff[0].id).toBe('staff-a');
  });
  it('clears old tables when the next branch has no cached floor plan', async () => {
    const { useTableStore } = await import('../stores/tableStore');
    const stopA = useTableStore.getState().subscribe('a');
    publish([{ id: 'table-a' }]); stopA();
    useTableStore.getState().subscribe('b');
    expect(useTableStore.getState().tables).toEqual([]);
  });
});
