import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({ docs: new Map(), nextId: 0, failCommit: false, beforeTransaction: null }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const ref = path => ({ path, id: path.split('/').at(-1), get parent() { return ref(path.split('/').slice(0, -1).join('/')); } });
  const snapshot = reference => ({ ref: reference, id: reference.id, exists: () => memory.docs.has(reference.path), data: () => memory.docs.get(reference.path) });
  return {
    collection: (_db, ...parts) => ref(parts.join('/')),
    doc: (base, ...parts) => ref(parts.length ? parts.join('/') : `${base.path}/new-${++memory.nextId}`),
    getDoc: async reference => snapshot(reference),
    getDocs: async reference => ({ docs: [...memory.docs.keys()].filter(path => path.startsWith(`${reference.path}/`) && !path.slice(reference.path.length + 1).includes('/')).map(path => snapshot(ref(path))) }),
    serverTimestamp: () => 'server-time',
    runTransaction: async (_db, callback) => {
      memory.beforeTransaction?.();
      const writes = [];
      await callback({
        get: async reference => { if (writes.length) throw new Error('Read after write'); return snapshot(reference); },
        set: (reference, value, options) => writes.push({ reference, value, merge: options?.merge }),
        update: (reference, value) => writes.push({ reference, value, merge: true }),
      });
      if (memory.failCommit) throw new Error('Transaction denied');
      writes.forEach(({ reference, value, merge }) => memory.docs.set(reference.path, { ...(merge ? memory.docs.get(reference.path) : {}), ...value }));
    },
  };
});
import { pushBranchMenu, setBusinessDishAvailability } from '../services/platformMenus';

const adjustment = { type: 'percent', value: 10, roundTo: null };
beforeEach(() => {
  memory.docs.clear(); memory.nextId = 0; memory.failCommit = false; memory.beforeTransaction = null;
  ['a', 'b', 'c'].forEach(id => memory.docs.set(`restaurants/${id}`, { ownerUid: 'owner', businessGroupId: 'kiwi', currency: 'INR' }));
  memory.docs.set('restaurants/other', { ownerUid: 'other', businessGroupId: 'other', currency: 'INR' });
  memory.docs.set('restaurants/a/menu/source', { name: 'Drinks', items: [{ id: 'tea', name: 'Tea', price: 20, available: true }, { id: 'iced', name: 'Iced Tea', price: 50, available: true }] });
  memory.docs.set('restaurants/b/menu/existing', { name: 'Drinks', items: [{ id: 'tea', name: 'Tea', price: 10, available: true }] });
});

describe('super admin menu operations', () => {
  it('atomically copies fresh source prices to sibling branches and keeps existing category IDs', async () => {
    memory.beforeTransaction = () => memory.docs.get('restaurants/a/menu/source').items[0].price = 30;
    expect(await pushBranchMenu('a', ['b', 'c'], adjustment)).toBe(2);
    expect(memory.docs.get('restaurants/b/menu/existing').items[0].price).toBe(33);
    expect(memory.docs.get('restaurants/b/menu/existing').pushedFromMaster).toBe('a');
    expect([...memory.docs.keys()].filter(path => path.startsWith('restaurants/b/menu/'))).toHaveLength(1);
  });
  it('rejects cross-business and cross-currency copying', async () => {
    await expect(pushBranchMenu('a', ['other'], adjustment)).rejects.toThrow(/same currency/);
    memory.docs.get('restaurants/b').currency = 'USD';
    await expect(pushBranchMenu('a', ['b'], adjustment)).rejects.toThrow(/same currency/);
    expect(memory.docs.get('restaurants/b/menu/existing').items[0].price).toBe(10);
  });
  it('rechecks ownership inside the transaction before changing menus', async () => {
    memory.beforeTransaction = () => { memory.docs.get('restaurants/b').ownerUid = 'changed'; };
    await expect(pushBranchMenu('a', ['b'], adjustment)).rejects.toThrow(/ownership/);
    expect(memory.docs.get('restaurants/b/menu/existing').items[0].price).toBe(10);
  });
  it('does not leave partially copied menus if the commit fails', async () => {
    memory.failCommit = true;
    await expect(pushBranchMenu('a', ['b', 'c'], adjustment)).rejects.toThrow(/denied/);
    expect(memory.docs.get('restaurants/b/menu/existing').items[0].price).toBe(10);
    expect([...memory.docs.keys()].some(path => path.startsWith('restaurants/c/menu/'))).toBe(false);
  });
  it('requires valid explicit choices and price adjustments', async () => {
    await expect(pushBranchMenu('a', [], adjustment)).rejects.toThrow(/Choose/);
    await expect(pushBranchMenu('a', ['a'], adjustment)).rejects.toThrow(/same currency/);
    await expect(pushBranchMenu('a', ['b'], { ...adjustment, value: NaN })).rejects.toThrow(/adjustment/);
    await expect(pushBranchMenu('a', ['b'], { ...adjustment, value: -101 })).rejects.toThrow(/adjustment/);
  });
  it('changes only exact dish-name matches within the selected business', async () => {
    expect(await setBusinessDishAvailability('a', ['a', 'b'], ' tea ', false)).toBe(2);
    const source = memory.docs.get('restaurants/a/menu/source').items;
    expect(source[0].available).toBe(false);
    expect(source[1].available).toBe(true);
    expect(memory.docs.get('restaurants/b/menu/existing').items[0].available).toBe(false);
  });
  it('blocks availability changes for other businesses and rolls back failed commits', async () => {
    await expect(setBusinessDishAvailability('a', ['a', 'other'], 'Tea', false)).rejects.toThrow(/source business/);
    memory.failCommit = true;
    await expect(setBusinessDishAvailability('a', ['a', 'b'], 'Tea', false)).rejects.toThrow(/denied/);
    expect(memory.docs.get('restaurants/a/menu/source').items[0].available).toBe(true);
  });
});
