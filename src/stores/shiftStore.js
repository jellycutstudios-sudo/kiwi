import { create } from 'zustand';
import {
  collection, addDoc, updateDoc, doc, getDoc, getDocs, serverTimestamp, onSnapshot, query, where, limit, increment, arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';

export const useShiftStore = create((set, get) => ({
  activeShift: null,

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
        set({ activeShift: { id: snap.docs[0].id, ...snap.docs[0].data() } });
      } else {
        set({ activeShift: null });
      }
      if (typeof onReady === 'function') onReady();
    }, err => {
      console.error("Shift subscription error:", err);
      set({ activeShift: null });
      if (typeof onReady === 'function') onReady();
    });
  },

  checkActiveShift: async (restaurantId, shiftMode, staffId) => {
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
        return docData;
      } else {
        set({ activeShift: null });
        return null;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  openShift: async (restaurantId, staffId, staffName, startCash) => {
    try {
      await useAuthStore.getState().ensureAnonymousAuth();
      const payload = {
        status: 'open',
        openedAt: serverTimestamp(),
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
      const ref = await addDoc(collection(db, 'restaurants', restaurantId, 'shifts'), payload);
      const docData = { id: ref.id, ...payload };
      set({ activeShift: docData });
      return { ok: true, shift: docData };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  recordCashTransaction: async (restaurantId, shiftId, amount, type, reason) => {
    try {
      await useAuthStore.getState().ensureAnonymousAuth();
      const docRef = doc(db, 'restaurants', restaurantId, 'shifts', shiftId);
      
      const numAmt = parseFloat(amount) || 0;
      if (numAmt <= 0) return { ok: false, error: 'Amount must be greater than 0' };
      
      const txObj = {
        amount: numAmt,
        reason: reason || '',
        timestamp: new Date()
      };
      
      const updates = {};
      // Use atomic increment() to avoid read-then-write race conditions across multiple terminals
      if (type === 'drop') {
        updates.cashDrops = arrayUnion(txObj);
        updates.expectedCash = increment(-numAmt);
      } else if (type === 'paidout') {
        updates.paidOuts = arrayUnion(txObj);
        updates.expectedCash = increment(-numAmt);
      } else {
        return { ok: false, error: `Unknown transaction type: ${type}` };
      }
      
      await updateDoc(docRef, updates);
      
      // Update local state optimistically (no full re-read needed)
      const currentShift = get().activeShift;
      if (currentShift) {
        const newExpected = (currentShift.expectedCash ?? currentShift.startCash ?? 0) - numAmt;
        const listKey = type === 'drop' ? 'cashDrops' : 'paidOuts';
        set({
          activeShift: {
            ...currentShift,
            expectedCash: newExpected,
            [listKey]: [...(currentShift[listKey] ?? []), txObj]
          }
        });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  closeShift: async (restaurantId, shiftId, countedCash, staffId, staffName) => {
    try {
      await useAuthStore.getState().ensureAnonymousAuth();
      const docRef = doc(db, 'restaurants', restaurantId, 'shifts', shiftId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return { ok: false, error: 'Shift not found' };
      const data = snap.data();
      
      const numCounted = parseFloat(countedCash) || 0;
      const expected = data.expectedCash ?? data.startCash;
      const variance = numCounted - expected;
      const closedAtDate = new Date();

      const updates = {
        status: 'closed',
        closedAt: serverTimestamp(),
        closedBy: staffName,
        closedById: staffId,
        actualCash: numCounted,
        variance: Math.round(variance * 100) / 100
      };
      
      await updateDoc(docRef, updates);
      set({ activeShift: null });

      return {
        ok: true,
        zReport: {
          id: shiftId,
          ...data,
          ...updates,
          closedAt: closedAtDate,
        }
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
}));
