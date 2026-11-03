// Run against a local Firestore emulator only: FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 npm run test:branch-rules
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, setLogLevel, updateDoc, writeBatch } from 'firebase/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Start the local Firestore emulator and set FIRESTORE_EMULATOR_HOST before running these tests.');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Rules tests only run against a local emulator.');
setLogLevel('silent');
const environment = await initializeTestEnvironment({
  projectId: 'demo-kiwi-branches',
  firestore: { host, port: Number(port), rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});
after(() => environment.cleanup());
await environment.clearFirestore();
await environment.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  await Promise.all([
    setDoc(doc(db, 'users/platform'), { role: 'super_admin' }),
    setDoc(doc(db, 'users/owner'), { role: 'admin', restaurantId: 'a' }),
    setDoc(doc(db, 'users/other'), { role: 'admin', restaurantId: 'other' }),
    setDoc(doc(db, 'restaurants/a'), { ownerUid: 'owner', status: 'approved', name: 'Downtown' }),
    setDoc(doc(db, 'restaurants/b'), { ownerUid: 'owner', status: 'approved', name: 'Airport' }),
    setDoc(doc(db, 'restaurants/other'), { ownerUid: 'other', status: 'approved', name: 'Other' }),
    setDoc(doc(db, 'businessGroups/group'), { name: 'Kiwi', ownerUid: 'owner' }),
    setDoc(doc(db, 'branchSubscriptions/a'), { feeMinor: 100000, currency: 'INR', cycle: 'monthly', paidThrough: null }),
    setDoc(doc(db, 'branchSubscriptions/other'), { feeMinor: 50000, currency: 'INR', cycle: 'monthly', paidThrough: null }),
  ]);
});
const platform = environment.authenticatedContext('platform').firestore();
const owner = environment.authenticatedContext('owner').firestore();
const other = environment.authenticatedContext('other').firestore();
const staff = environment.authenticatedContext('staff', { role: 'cashier', restaurantId: 'a' }).firestore();
const publicDb = environment.unauthenticatedContext().firestore();

test('private billing is visible to super admin and the branch owner, never public or other owners/staff', async () => {
  await assertSucceeds(getDoc(doc(publicDb, 'restaurants/a')));
  await assertFails(getDoc(doc(publicDb, 'branchSubscriptions/a')));
  await assertFails(getDoc(doc(other, 'branchSubscriptions/a')));
  await assertFails(getDoc(doc(staff, 'branchSubscriptions/a')));
  await assertSucceeds(getDoc(doc(owner, 'branchSubscriptions/a')));
  await assertSucceeds(getDocs(collection(platform, 'branchSubscriptions')));
  await assertFails(getDocs(collection(owner, 'branchSubscriptions')));
});

test('only super admin creates groups, and only for registered owner accounts', async () => {
  await assertFails(setDoc(doc(owner, 'businessGroups/illegal'), { name: 'New', ownerUid: 'owner' }));
  await assertFails(setDoc(doc(platform, 'businessGroups/invalid'), { name: 'New', ownerUid: 'missing' }));
  await assertSucceeds(getDoc(doc(owner, 'businessGroups/group')));
  await assertFails(getDoc(doc(other, 'businessGroups/group')));
});

test('business creation and branch linking work atomically with matching ownership', async () => {
  const batch = writeBatch(platform);
  batch.set(doc(platform, 'businessGroups/new'), { name: 'Kiwi second group', ownerUid: 'owner' });
  batch.update(doc(platform, 'restaurants/b'), { businessGroupId: 'new' });
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(doc(platform, 'restaurants/other'), { businessGroupId: 'new' }));
  await assertFails(updateDoc(doc(owner, 'restaurants/a'), { businessGroupId: 'group' }));
});

test('owners cannot self-approve, transfer branches or alter private fees', async () => {
  await assertFails(updateDoc(doc(owner, 'restaurants/a'), { status: 'suspended' }));
  await assertFails(updateDoc(doc(owner, 'restaurants/a'), { ownerUid: 'other' }));
  await assertFails(updateDoc(doc(owner, 'branchSubscriptions/a'), { feeMinor: 0 }));
  await assertSucceeds(updateDoc(doc(owner, 'restaurants/a'), { address: 'Updated address' }));
});

test('normal registration still works, while pre-approved or foreign registrations are rejected', async () => {
  await assertSucceeds(setDoc(doc(owner, 'restaurants/registration'), { name: 'New', ownerUid: 'owner', status: 'pending' }));
  await assertFails(setDoc(doc(owner, 'restaurants/self-approved'), { name: 'New', ownerUid: 'owner', status: 'approved' }));
  await assertFails(setDoc(doc(owner, 'restaurants/foreign'), { name: 'New', ownerUid: 'other', status: 'pending' }));
});

test('super admin can set branch fees; invalid fees are rejected', async () => {
  await assertSucceeds(updateDoc(doc(platform, 'branchSubscriptions/a'), { feeMinor: 120000 }));
  await assertFails(updateDoc(doc(platform, 'branchSubscriptions/a'), { feeMinor: -1 }));
});

test('payment receipts are private and immutable, including for super admin', async () => {
  const receipt = { recordedBy: 'platform', recordedAt: serverTimestamp(), totalMinor: 100000, branchIds: ['a'], allocations: [{ restaurantId: 'a', amountMinor: 100000 }] };
  await assertSucceeds(setDoc(doc(platform, 'branchPayments/receipt'), receipt));
  await assertFails(getDoc(doc(publicDb, 'branchPayments/receipt')));
  await assertFails(getDoc(doc(owner, 'branchPayments/receipt')));
  await assertFails(setDoc(doc(owner, 'branchPayments/owner-receipt'), { ...receipt, recordedBy: 'owner' }));
  await assertFails(updateDoc(doc(platform, 'branchPayments/receipt'), { totalMinor: 1 }));
  await assertFails(deleteDoc(doc(platform, 'branchPayments/receipt')));
});

test('suspension blocks operations for this branch while other owned branches remain usable', async () => {
  await assertSucceeds(updateDoc(doc(platform, 'restaurants/a'), { status: 'suspended' }));
  await assertFails(setDoc(doc(owner, 'restaurants/a/menu/test'), { name: 'Coffee' }));
  await assertFails(setDoc(doc(staff, 'restaurants/a/orders/test'), { status: 'billed' }));
  await assertFails(setDoc(doc(publicDb, 'restaurants/a/orders/public'), { status: 'pending', total: 1, items: [{}] }));
  await assertSucceeds(setDoc(doc(owner, 'restaurants/b/menu/test'), { name: 'Coffee' }));
  await assertSucceeds(updateDoc(doc(platform, 'restaurants/a'), { status: 'approved' }));
});

test('group membership alone grants no operational access to another owner’s branch', async () => {
  await assertFails(setDoc(doc(other, 'restaurants/b/menu/illegal'), { name: 'Coffee' }));
  await assertFails(setDoc(doc(staff, 'restaurants/b/menu/illegal'), { name: 'Coffee' }));
});
