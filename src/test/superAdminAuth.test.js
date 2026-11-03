import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ docs: new Map(), onAuth: null, fail: false, pending: null }));
vi.mock('../firebase', () => ({ db: {}, auth: {}, functions: null }));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(), signOut: vi.fn(),
  onAuthStateChanged: (_auth, callback) => { state.onAuth = callback; return () => {}; },
  signInWithCustomToken: vi.fn(), signInAnonymously: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  collection: (_db, ...parts) => ({ path: parts.join('/') }),
  where: vi.fn(), query: ref => ref,
  getDoc: async ref => {
    if (state.pending) await state.pending;
    if (state.fail) throw new Error('Permission denied');
    return { id: ref.path.split('/').at(-1), exists: () => state.docs.has(ref.path), data: () => state.docs.get(ref.path) };
  },
  getDocs: async () => ({ docs: [...state.docs].filter(([path]) => path.startsWith('restaurants/')).map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data })) }),
  updateDoc: vi.fn(),
}));
vi.mock('../stores/orderStore', () => ({ useOrderStore: { getState: () => ({ clearCart: vi.fn() }), setState: vi.fn() } }));
vi.mock('../stores/menuStore', () => ({ useMenuStore: { setState: vi.fn() } }));
vi.mock('../stores/staffStore', () => ({ useStaffStore: { setState: vi.fn() } }));
vi.mock('../stores/tableStore', () => ({ useTableStore: { setState: vi.fn() } }));
vi.mock('../stores/shiftStore', () => ({ useShiftStore: { setState: vi.fn() } }));

let useAuthStore;
beforeEach(async () => {
  vi.resetModules(); state.docs.clear(); state.onAuth = null; state.fail = false; state.pending = null;
  ({ useAuthStore } = await import('../stores/authStore'));
  useAuthStore.setState({ user: null, staffDoc: null, restaurant: null, error: null, loading: false });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('super admin session isolation', () => {
  it('opens platform scope even if the super admin profile has an old restaurant ID', async () => {
    state.docs.set('users/super', { role: 'super_admin', restaurantId: 'old' });
    state.docs.set('restaurants/old', { status: 'suspended', ownerUid: 'someone-else' });
    expect(await useAuthStore.getState().loadUserData({ uid: 'super' })).toEqual({ ok: true });
    expect(useAuthStore.getState().restaurant).toBeNull();
    expect(useAuthStore.getState().staffDoc.role).toBe('super_admin');
  });
  it('clears stale super privileges when a different account has no profile', async () => {
    useAuthStore.setState({ user: { uid: 'super' }, staffDoc: { role: 'super_admin' }, restaurant: { id: 'a' } });
    expect((await useAuthStore.getState().loadUserData({ uid: 'missing' })).ok).toBe(false);
    expect(useAuthStore.getState()).toMatchObject({ user: null, staffDoc: null, restaurant: null });
  });
  it('clears old privilege state when a profile read fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    useAuthStore.setState({ user: { uid: 'super' }, staffDoc: { role: 'super_admin' } });
    state.fail = true;
    expect((await useAuthStore.getState().loadUserData({ uid: 'other' })).ok).toBe(false);
    expect(useAuthStore.getState().staffDoc).toBeNull();
    log.mockRestore();
  });
  it('does not restore a session from a late profile response after logout', async () => {
    let resolve;
    state.pending = new Promise(done => { resolve = done; });
    state.docs.set('users/super', { role: 'super_admin' });
    const load = useAuthStore.getState().loadUserData({ uid: 'super' });
    await useAuthStore.getState().signOut();
    resolve(); await load;
    expect(useAuthStore.getState()).toMatchObject({ user: null, staffDoc: null, restaurant: null });
  });
  it('revalidates registered owner profiles instead of treating them as PIN sessions', async () => {
    useAuthStore.setState({ user: { uid: 'owner' }, staffDoc: { role: 'admin' }, restaurant: { id: 'a' } });
    state.docs.set('users/owner', { role: 'super_admin', restaurantId: 'a' });
    useAuthStore.getState().initAuthListener();
    await state.onAuth({ uid: 'owner', getIdTokenResult: async () => ({ claims: {} }) });
    expect(useAuthStore.getState().staffDoc.role).toBe('super_admin');
    expect(useAuthStore.getState().restaurant).toBeNull();
  });
  it('drops cached super admin privileges when a different PIN identity appears', async () => {
    useAuthStore.setState({ user: { uid: 'super' }, staffDoc: { role: 'super_admin' }, restaurant: null });
    useAuthStore.getState().initAuthListener();
    await state.onAuth({ uid: 'staff', getIdTokenResult: async () => ({ claims: { isPinLogin: true, role: 'cashier', restaurantId: 'a' } }) });
    expect(useAuthStore.getState().staffDoc).toBeNull();
    expect(useAuthStore.getState().restaurant).toBeNull();
  });
});
