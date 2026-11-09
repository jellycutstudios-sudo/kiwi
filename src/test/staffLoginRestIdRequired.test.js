import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from '../utils/safeStorage';

const state = vi.hoisted(() => ({ docs: new Map() }));
vi.mock('../firebase', () => ({ db: {}, auth: { currentUser: null }, functions: null }));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: () => () => {},
  signInWithCustomToken: vi.fn(),
  signInAnonymously: vi.fn(() => Promise.resolve({ user: { uid: 'anon_123' } })),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  collection: (_db, ...parts) => ({ path: parts.join('/') }),
  where: vi.fn(),
  query: ref => ref,
  getDoc: async ref => {
    return {
      id: ref.path.split('/').at(-1),
      exists: () => state.docs.has(ref.path),
      data: () => state.docs.get(ref.path),
    };
  },
  getDocs: async () => ({ docs: [], empty: true }),
  updateDoc: vi.fn(),
}));
vi.mock('../stores/orderStore', () => ({ useOrderStore: { getState: () => ({ clearCart: vi.fn() }), setState: vi.fn() } }));
vi.mock('../stores/menuStore', () => ({ useMenuStore: { setState: vi.fn() } }));
vi.mock('../stores/staffStore', () => ({ useStaffStore: { setState: vi.fn() } }));
vi.mock('../stores/tableStore', () => ({ useTableStore: { setState: vi.fn() } }));
vi.mock('../stores/shiftStore', () => ({ useShiftStore: { setState: vi.fn() } }));

let useAuthStore;

beforeEach(async () => {
  vi.resetModules();
  state.docs.clear();
  ({ useAuthStore } = await import('../stores/authStore'));
  useAuthStore.setState({ user: null, staffDoc: null, restaurant: null, error: null, loading: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Staff PIN Login - Restaurant ID and PIN Enforcement', () => {
  it('rejects login when Restaurant ID is empty', async () => {
    const res = await useAuthStore.getState().loginWithPin('', '1234');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Restaurant ID and PIN are required');
  });

  it('rejects login when Restaurant ID is whitespace only', async () => {
    const res = await useAuthStore.getState().loginWithPin('   ', '1234');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Restaurant ID and PIN are required');
  });

  it('rejects login when PIN is empty', async () => {
    const res = await useAuthStore.getState().loginWithPin('rest1', '');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Restaurant ID and PIN are required');
  });

  it('rejects login when Restaurant ID is unknown and does not exist', async () => {
    const res = await useAuthStore.getState().loginWithPin('nonexistent_rest', '1234');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not found');
  });

  it('authenticates staff successfully when both valid Restaurant ID and PIN are entered', async () => {
    state.docs.set('restaurants/my_cafe', { name: 'My Cafe', status: 'approved' });
    state.docs.set('restaurants/my_cafe/staff_auth/9999', {
      name: 'Alice',
      role: 'waiter',
      active: true,
      staffId: 'staff_alice',
    });

    const res = await useAuthStore.getState().loginWithPin('my_cafe', '9999');
    expect(res.ok).toBe(true);
    expect(res.role).toBe('waiter');
    expect(useAuthStore.getState().staffDoc.name).toBe('Alice');
    expect(useAuthStore.getState().restaurant.id).toBe('my_cafe');
  });

  it('clears rupos_last_rest_id on signOut so no stale restaurant ID is remembered', async () => {
    safeStorage.setItem('rupos_last_rest_id', 'some_old_id');
    await useAuthStore.getState().signOut();
    expect(safeStorage.getItem('rupos_last_rest_id')).toBeNull();
  });
});
