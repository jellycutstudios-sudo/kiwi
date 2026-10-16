import { create } from 'zustand';
import {
  collection, addDoc, updateDoc, doc, getDocs, serverTimestamp, onSnapshot, query, where, limit, increment, arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';

const getInitialShift = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem('dineos_active_shift');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveShiftLocally = (shift) => {
  try {
    if (typeof localStorage !== 'undefined') {
      if (shift) {
        localStorage.setItem('dineos_active_shift', JSON.stringify(shift));
      } else {
        localStorage.removeItem('dineos_active_shift');
      }
    }
  } catch {}
};

export const useShiftStore = create((set, get) => ({
  activeShift: getInitialShift(),

  subscribeActiveShift: (restaurantId, shiftMode, staffId, onReady) => {
    let constraints = [where('status', '==', 'open')];
    if (shiftMode === 'staff' && staffId) {
      constraints.push(where('openedById', '==', staffId));
    }
    const q = query(
      collection(db, 'restaurants', restaurantId, 'shifts'),
      ...constraints,
      limit(1)
    );
    return onSnapshot(q, snap => {
      if (!snap.empty) {
        const shiftDoc = { id: snap.docs[0].id, ...snap.docs[0].data() };
        set({ activeShift: shiftDoc });
        saveShiftLocally(shiftDoc);
      } else {
        set({ activeShift: null });
        saveShiftLocally(null);
      }
      if (typeof onReady === 'function') onReady();
    }, err => {
      console.warn("[ShiftStore] Subscription error (retaining local shift):", err?.message);
      if (typeof onReady === 'function') onReady();
    });
  },

  checkActiveShift: async (restaurantId, shiftMode, staffId) => {
    const rest = useAuthStore.getState().restaurant;
    if (rest?.localStorageOnly || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return get().activeShift;
    }
    try {
      let constraints = [where('status', '==', 'open')];
      if (shiftMode === 'staff' && staffId) {
        constraints.push(where('openedById', '==', staffId));
      }
      const q = query(
        collection(db, 'restaurants', restaurantId, 'shifts'),
        ...constraints,
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        set({ activeShift: docData });
        saveShiftLocally(docData);
        return docData;
      } else {
        set({ activeShift: null });
        saveShiftLocally(null);
        return null;
      }
    } catch (e) {
      console.warn("[ShiftStore] checkActiveShift error, falling back to local:", e?.message);
      return get().activeShift;
    }
  },

  openShift: async (restaurantId, staffId, staffName, startCash) => {
    const payload = {
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: staffName,
      openedById: staffId,
      startCash: parseFloat(startCash) || 0,
      expectedCash: parseFloat(startCash) || 0,
      cashSalesAmount: 0,
      cashSalesCount: 0,
      cardSalesAmount: 0,
      cardSalesCount: 0,
      upiSalesAmount: 0,
      upiSalesCount: 0,
      totalSalesAmount: 0,
      cashDrops: [],
      paidOuts: []
    };
    const localId = `shift_${Date.now()}`;
    const docData = { id: localId, ...payload };
    set({ activeShift: docData });
    saveShiftLocally(docData);

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const ref = await addDoc(collection(db, 'restaurants', restaurantId, 'shifts'), {
          ...payload,
          openedAt: serverTimestamp()
        });
        const cloudData = { ...docData, id: ref.id };
        set({ activeShift: cloudData });
        saveShiftLocally(cloudData);
        return { ok: true, shift: cloudData };
      }
    } catch (e) {
      console.warn('[useShiftStore] openShift cloud sync deferred:', e?.message);
    }
    return { ok: true, shift: docData };
  },

  recordCashTransaction: async (restaurantId, shiftId, amount, type, reason) => {
    const numAmt = parseFloat(amount) || 0;
    if (numAmt <= 0) return { ok: false, error: 'Amount must be greater than 0' };

    const txObj = {
      amount: numAmt,
      reason: reason || '',
      timestamp: new Date().toISOString()
    };

    const currentShift = get().activeShift;
    if (!currentShift) return { ok: false, error: 'No active shift found' };

    const newExpected = (currentShift.expectedCash ?? currentShift.startCash ?? 0) - numAmt;
    const listKey = type === 'drop' ? 'cashDrops' : 'paidOuts';
    const updatedShift = {
      ...currentShift,
      expectedCash: newExpected,
      [listKey]: [...(currentShift[listKey] ?? []), txObj]
    };
    set({ activeShift: updatedShift });
    saveShiftLocally(updatedShift);

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const docRef = doc(db, 'restaurants', restaurantId, 'shifts', shiftId);
        const updates = {};
        if (type === 'drop') {
          updates.cashDrops = arrayUnion(txObj);
          updates.expectedCash = increment(-numAmt);
        } else if (type === 'paidout') {
          updates.paidOuts = arrayUnion(txObj);
          updates.expectedCash = increment(-numAmt);
        }
        await updateDoc(docRef, updates);
      }
    } catch (e) {
      console.warn('[useShiftStore] recordCashTransaction cloud sync deferred:', e?.message);
    }

    return { ok: true };
  },

  applySaleToActiveShift: (saleData) => {
    const currentShift = get().activeShift;
    if (!currentShift) return;

    const { total = 0, method = 'cash', splitPayments = [] } = saleData;
    const numTotal = Number(total) || 0;
    if (numTotal <= 0 && method !== 'unpaid') return;

    let deltaCashAmt = 0;
    let deltaCashCount = 0;
    let deltaCardAmt = 0;
    let deltaCardCount = 0;
    let deltaUpiAmt = 0;
    let deltaUpiCount = 0;

    if (method === 'cash') {
      deltaCashAmt = numTotal;
      deltaCashCount = 1;
    } else if (method === 'card' || method === 'terminal') {
      deltaCardAmt = numTotal;
      deltaCardCount = 1;
    } else if (method === 'upi') {
      deltaUpiAmt = numTotal;
      deltaUpiCount = 1;
    } else if (method === 'split' && Array.isArray(splitPayments)) {
      splitPayments.forEach(p => {
        const m = p.method ?? 'cash';
        const amt = Number(p.amount) || 0;
        if (m === 'cash') {
          deltaCashAmt += amt;
          deltaCashCount += 1;
        } else if (m === 'card' || m === 'terminal') {
          deltaCardAmt += amt;
          deltaCardCount += 1;
        } else if (m === 'upi') {
          deltaUpiAmt += amt;
          deltaUpiCount += 1;
        }
      });
    }

    const currentExpected = currentShift.expectedCash ?? currentShift.startCash ?? 0;
    const updatedShift = {
      ...currentShift,
      totalSalesAmount: Math.round(((Number(currentShift.totalSalesAmount) || 0) + numTotal) * 100) / 100,
      cashSalesCount: (Number(currentShift.cashSalesCount) || 0) + deltaCashCount,
      cashSalesAmount: Math.round(((Number(currentShift.cashSalesAmount) || 0) + deltaCashAmt) * 100) / 100,
      expectedCash: Math.round((currentExpected + deltaCashAmt) * 100) / 100,
      cardSalesCount: (Number(currentShift.cardSalesCount) || 0) + deltaCardCount,
      cardSalesAmount: Math.round(((Number(currentShift.cardSalesAmount) || 0) + deltaCardAmt) * 100) / 100,
      upiSalesCount: (Number(currentShift.upiSalesCount) || 0) + deltaUpiCount,
      upiSalesAmount: Math.round(((Number(currentShift.upiSalesAmount) || 0) + deltaUpiAmt) * 100) / 100,
    };

    set({ activeShift: updatedShift });
    saveShiftLocally(updatedShift);
  },

  closeShift: async (restaurantId, shiftId, countedCash, staffId, staffName) => {
    const currentShift = get().activeShift;
    const data = currentShift || {};
    const numCounted = parseFloat(countedCash) || 0;
    const expected = data.expectedCash ?? data.startCash ?? 0;
    const variance = numCounted - expected;
    const closedAtDate = new Date();

    const updates = {
      status: 'closed',
      closedAt: closedAtDate.toISOString(),
      closedBy: staffName,
      closedById: staffId,
      actualCash: numCounted,
      variance: Math.round(variance * 100) / 100
    };

    set({ activeShift: null });
    saveShiftLocally(null);

    const zReport = {
      id: shiftId,
      ...data,
      ...updates,
      closedAt: closedAtDate,
    };

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const docRef = doc(db, 'restaurants', restaurantId, 'shifts', shiftId);
        await updateDoc(docRef, {
          ...updates,
          closedAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.warn('[useShiftStore] closeShift cloud sync deferred:', e?.message);
    }

    return {
      ok: true,
      zReport
    };
  },
}));
