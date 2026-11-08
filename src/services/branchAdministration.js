import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { BILLING_CYCLES, toMinorUnits, validatePayment } from '../utils/branchBilling';

function actor() {
  if (!auth?.currentUser?.uid) throw new Error('Sign in again before making changes.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Connect to the internet before saving branch or payment changes.');
  return auth.currentUser.uid;
}

export function newPaymentId() {
  return doc(collection(db, 'branchPayments')).id;
}

export async function createBusinessGroup({ name, ownerUid, restaurantIds = [] }) {
  const createdBy = actor();
  if (!name.trim() || !ownerUid) throw new Error('Enter a business name and select its owner.');
  if (restaurantIds.length > 50 || new Set(restaurantIds).size !== restaurantIds.length) throw new Error('Select up to 50 distinct branches.');
  const ref = doc(collection(db, 'businessGroups'));
  await runTransaction(db, async tx => {
    const owner = await tx.get(doc(db, 'users', ownerUid));
    const branches = await Promise.all(restaurantIds.map(id => tx.get(doc(db, 'restaurants', id))));
    if (!owner.exists() || owner.data().role !== 'admin') throw new Error('Choose a registered owner account.');
    branches.forEach(branch => {
      if (!branch.exists() || branch.data().ownerUid !== ownerUid || branch.data().businessGroupId) {
        throw new Error('Only ungrouped branches belonging to this owner can be connected.');
      }
    });
    tx.set(ref, { name: name.trim(), ownerUid, createdBy, createdAt: serverTimestamp() });
    branches.forEach(branch => tx.update(branch.ref, { businessGroupId: ref.id }));
  });
  return ref.id;
}

export async function connectBranches(groupId, restaurantIds) {
  actor();
  if (!restaurantIds.length || restaurantIds.length > 50) throw new Error('Select between 1 and 50 branches.');
  await runTransaction(db, async tx => {
    const group = await tx.get(doc(db, 'businessGroups', groupId));
    const branches = await Promise.all(restaurantIds.map(id => tx.get(doc(db, 'restaurants', id))));
    if (!group.exists()) throw new Error('Business group no longer exists.');
    branches.forEach(branch => {
      if (!branch.exists() || branch.data().ownerUid !== group.data().ownerUid || branch.data().businessGroupId) {
        throw new Error('Only ungrouped branches belonging to this owner can be connected.');
      }
    });
    branches.forEach(branch => tx.update(branch.ref, { businessGroupId: groupId }));
  });
}

export async function createBranch(input) {
  const createdBy = actor();
  if (!input.name.trim()) throw new Error('Enter a branch name.');
  if (!input.groupId && !input.ownerUid) throw new Error('Choose an owner account or business.');
  const feeMinor = toMinorUnits(input.fee, input.currency, true);
  if (!BILLING_CYCLES.includes(input.cycle)) throw new Error('Choose a billing cycle.');
  const ref = doc(collection(db, 'restaurants'));
  await runTransaction(db, async tx => {
    let ownerUid = input.ownerUid;
    let businessGroupId = input.groupId || null;
    let owner = null;

    if (input.groupId) {
      const group = await tx.get(doc(db, 'businessGroups', input.groupId));
      if (!group.exists()) throw new Error('Business group no longer exists.');
      ownerUid = group.data().ownerUid;
      businessGroupId = input.groupId;
    }

    if (ownerUid) {
      owner = await tx.get(doc(db, 'users', ownerUid));
      if (!owner.exists() || owner.data().role !== 'admin') throw new Error('Business owner account is unavailable.');
    }

    const isBillOnly = input.businessType === 'bill_only';
    const payload = {
      name: input.name.trim(), address: input.address.trim(), phone: input.phone.trim(),
      currency: input.currency, ownerUid: ownerUid || createdBy, email: owner?.data()?.email || '',
      status: input.status || 'pending',
      businessType: isBillOnly ? 'bill_only' : 'restaurant',
      accountType: isBillOnly ? 'bill_only' : 'restaurant',
      modes: isBillOnly ? ['pos', 'till_shift'] : ['pos', 'table', 'kds', 'reservations', 'inventory', 'customers', 'payroll', 'till_shift', 'customer_privacy', 'audit_shield', 'tax_reconcile'],
      quickPayEnabled: isBillOnly ? true : Boolean(input.quickPayEnabled),
      speedDialEnabled: isBillOnly ? true : Boolean(input.speedDialEnabled),
      kitchenConfig: { mode: isBillOnly ? 'disabled' : 'both' },
      taxConfig: { type: 'none' },
      createdAt: serverTimestamp(), createdBy,
    };
    if (businessGroupId) payload.businessGroupId = businessGroupId;

    tx.set(ref, payload);
    tx.set(doc(db, 'branchSubscriptions', ref.id), {
      feeMinor, currency: input.currency, cycle: input.cycle, paidThrough: null,
      updatedAt: serverTimestamp(), updatedBy: createdBy,
    });
    // Owners without an initial branch can sign in to this branch after activation.
    if (owner && !owner.data().restaurantId) tx.update(owner.ref, { restaurantId: ref.id });
  });
  return ref.id;
}

export async function saveBranchFee(restaurantId, input) {
  const updatedBy = actor();
  const feeMinor = toMinorUnits(input.fee, input.currency, true);
  if (!BILLING_CYCLES.includes(input.cycle)) throw new Error('Choose a billing cycle.');
  await runTransaction(db, async tx => {
    const branch = await tx.get(doc(db, 'restaurants', restaurantId));
    const ref = doc(db, 'branchSubscriptions', restaurantId);
    const current = await tx.get(ref);
    if (!branch.exists()) throw new Error('Branch no longer exists.');
    if (current.exists() && current.data().currency !== input.currency && current.data().lastPaymentId) {
      throw new Error('A branch billing currency cannot change after its first payment.');
    }
    tx.set(ref, { feeMinor, currency: input.currency, cycle: input.cycle,
      ...(current.exists() ? {} : { paidThrough: null }), updatedAt: serverTimestamp(), updatedBy }, { merge: true });
  });
}

export async function recordBranchPayment(paymentId, input) {
  const recordedBy = actor();
  const payment = validatePayment(input);
  const receiptRef = doc(db, 'branchPayments', paymentId);
  await runTransaction(db, async tx => {
    const existing = await tx.get(receiptRef);
    if (existing.exists()) {
      const previous = existing.data();
      const lines = previous.allocations?.map(({ restaurantId, amountMinor, paidThrough, activate }) => ({ restaurantId, amountMinor, paidThrough, activate }));
      if (previous.currency !== payment.currency || previous.paidOn !== payment.paidOn || previous.method !== payment.method ||
          (previous.reference || '') !== payment.reference || (previous.note || '') !== payment.note ||
          JSON.stringify(lines) !== JSON.stringify(payment.allocations)) {
        throw new Error('This receipt was already recorded with different details. Check payment history before creating another payment.');
      }
      return; // Identical retries are safe; changed submissions must not claim success.
    }
    const records = await Promise.all(payment.allocations.map(async line => ({
      line,
      branch: await tx.get(doc(db, 'restaurants', line.restaurantId)),
      subscription: await tx.get(doc(db, 'branchSubscriptions', line.restaurantId)),
    })));
    let ownerUid;
    records.forEach(({ line, branch, subscription }) => {
      if (!branch.exists()) throw new Error('A selected branch no longer exists.');
      const data = branch.data();
      if (!data.ownerUid) throw new Error('Assign a branch owner before recording payment.');
      if (ownerUid && ownerUid !== data.ownerUid) throw new Error('A combined payment must belong to one owner.');
      ownerUid = data.ownerUid;
      if (subscription.exists()) {
        if (subscription.data().currency !== payment.currency) throw new Error('Selected branches must use the payment currency.');
        if (subscription.data().paidThrough && line.paidThrough <= subscription.data().paidThrough) {
          throw new Error(`Renewal for ${data.name} must extend its current paid-through date.`);
        }
      }
    });
    tx.set(receiptRef, {
      ...payment, ownerUid, branchIds: payment.allocations.map(line => line.restaurantId),
      allocations: records.map(({ line, branch }) => ({ ...line, branchName: branch.data().name || line.restaurantId })),
      recordedBy, recordedAt: serverTimestamp(),
    });
    records.forEach(({ line, branch, subscription }) => {
      const ref = doc(db, 'branchSubscriptions', line.restaurantId);
      tx.set(ref, {
        ...(subscription.exists() ? {} : { feeMinor: line.amountMinor, cycle: 'monthly' }),
        currency: payment.currency, paidThrough: line.paidThrough, lastPaymentId: paymentId,
        updatedBy: recordedBy, updatedAt: serverTimestamp(),
      }, { merge: true });
      if (line.activate && branch.data().status !== 'approved') tx.update(branch.ref, { status: 'approved' });
    });
  });
  return paymentId;
}

export async function updateBranchAccountType(restaurantId, businessType) {
  const updatedBy = actor();
  const isBillOnly = businessType === 'bill_only';
  const branchRef = doc(db, 'restaurants', restaurantId);
  await runTransaction(db, async tx => {
    const branch = await tx.get(branchRef);
    if (!branch.exists()) throw new Error('Branch not found.');
    tx.update(branchRef, {
      businessType: isBillOnly ? 'bill_only' : 'restaurant',
      accountType: isBillOnly ? 'bill_only' : 'restaurant',
      modes: isBillOnly 
        ? ['pos', 'till_shift'] 
        : ['pos', 'table', 'kds', 'reservations', 'inventory', 'customers', 'payroll', 'till_shift', 'customer_privacy', 'audit_shield', 'tax_reconcile'],
      quickPayEnabled: isBillOnly ? true : false,
      speedDialEnabled: isBillOnly ? true : false,
      'kitchenConfig.mode': isBillOnly ? 'disabled' : 'both',
      updatedAt: serverTimestamp(),
      updatedBy,
    });
  });
}
