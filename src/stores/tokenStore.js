// Token Store — manages token issuance and TV display
import { create } from 'zustand';
import {
  doc, onSnapshot, runTransaction, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

export const useTokenStore = create((set) => ({
  currentServing: null,
  latestIssued:   null,
  queue:          [],
  loading:        false,

  // Issue the next token (returns token number)
  issueToken: async (restaurantId) => {
    const tokenRef = doc(db, 'restaurants', restaurantId, 'tokens', todayKey());
    try {
      const newToken = await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);
        const latest = snap.exists() ? (snap.data().latest ?? 0) : 0;
        const next = latest + 1;
        tx.set(tokenRef, {
          latest: next,
          current: snap.exists() ? (snap.data().current ?? 0) : 0,
        }, { merge: true });
        return next;
      });
      return newToken;
    } catch (e) {
      console.error('Token issue error:', e);
      return null;
    }
  },


  // Call a specific token number directly (cashier/KDS action)
  callSpecificToken: async (restaurantId, tokenNumber) => {
    const tokenRef = doc(db, 'restaurants', restaurantId, 'tokens', todayKey());
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tokenRef);
      tx.set(tokenRef, {
        current: Number(tokenNumber),
        latest: snap.exists() ? (snap.data().latest ?? Number(tokenNumber)) : Number(tokenNumber),
        lastCalledAt: serverTimestamp()
      }, { merge: true });
    });
  },

  // Subscribe to real-time token state (for TV display and cashier)
  subscribe: (restaurantId) => {
    let currentUnsub = null;
    let timeoutId = null;

    const setupSubscription = () => {
      if (currentUnsub) currentUnsub();
      
      const tokenRef = doc(db, 'restaurants', restaurantId, 'tokens', todayKey());
      currentUnsub = onSnapshot(tokenRef, (snap) => {
        if (snap.exists()) {
          const { current = 0, latest = 0, lastCalledAt = null } = snap.data();
          const callTime = lastCalledAt?.toDate ? lastCalledAt.toDate().getTime() : Date.now();
          const queue = Array.from(
            { length: Math.max(0, latest - current) },
            (_, i) => current + i + 1
          ).slice(0, 10);
          set({ currentServing: current, latestIssued: latest, queue, lastCalledAt: callTime });
        } else {
          set({ currentServing: 0, latestIssued: 0, queue: [], lastCalledAt: null });
        }
      });

      // Calculate time until midnight to reset subscription
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const msUntilMidnight = tomorrow - now;
      
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setupSubscription(); // Re-subscribe when the day changes
      }, msUntilMidnight + 1000); // Add 1 second buffer
    };

    setupSubscription();

    return () => {
      if (currentUnsub) currentUnsub();
      if (timeoutId) clearTimeout(timeoutId);
    };
  },
}));
