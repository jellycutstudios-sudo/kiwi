import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, functions } from '../firebase';

let isLoggingIn = false;

const getInitialPersistedAuth = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('restaurant-os-auth');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed.state || {};
  } catch {
    return {};
  }
};

const safeStorage = {
  getItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return null;
  },
  setItem: (key, value) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
  },
  removeItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  }
};
const cachedAuth = getInitialPersistedAuth();

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: cachedAuth.user ?? null,           // Firebase Auth user
      staffDoc: cachedAuth.staffDoc ?? null,   // Firestore staff document
      restaurant: cachedAuth.restaurant ?? null, // Current restaurant doc
      loading: !cachedAuth.staffDoc && !cachedAuth.user,
      error: null,

      // Identifier (Mobile Number or Email) / Password login (admin)
      loginWithEmail: async (identifier, password) => {
        set({ loading: true, error: null });

        try {
          const raw = String(identifier || '').trim();
          if (!raw) {
            set({ loading: false, error: 'Please enter your mobile number or email' });
            return { ok: false, error: 'Please enter your mobile number or email' };
          }

          let targetEmail = '';

          if (!raw.includes('@')) {
            // It's a mobile number
            const digits = raw.replace(/\D/g, '');
            if (digits.length < 6) {
              set({ loading: false, error: 'Please enter a valid mobile number or email' });
              return { ok: false, error: 'Please enter a valid mobile number or email' };
            }

            // 1. Look up phone in 'restaurants' (which allows public read in firestore.rules)
            if (db) {
              try {
                const candidates = [digits];
                if (digits.length > 10) candidates.push(digits.slice(-10));
                if (digits.length === 10) candidates.push(`+91${digits}`, `91${digits}`);

                const qRest = query(collection(db, 'restaurants'), where('phone', 'in', candidates));
                const snapRest = await getDocs(qRest);
                if (!snapRest.empty) {
                  for (const docSnap of snapRest.docs) {
                    const rData = docSnap.data();
                    if (rData.email) {
                      targetEmail = rData.email.trim().toLowerCase();
                      break;
                    }
                  }
                }

                // Fallback: check 'restaurants' by mobile candidates
              } catch (lookupErr) {
                console.warn('Firestore phone lookup error:', lookupErr);
              }
            }

            // Fallback to standard synthetic phone email if no custom email found
            if (!targetEmail) {
              const phoneKey = digits.length >= 10 ? digits.slice(-10) : digits;
              targetEmail = `${phoneKey}@phone.dineos.com`;
            }
          } else {
            // It's an email — strip any accidental spaces, newlines, or tabs & lowercase
            targetEmail = raw.replace(/\s+/g, '').toLowerCase();
          }

          const cred = await signInWithEmailAndPassword(auth, targetEmail, password);
          await get().loadUserData(cred.user);
          return { ok: true };
        } catch (e) {
          const isInvalidCred = e.code === 'auth/invalid-credential' 
            || e.code === 'auth/user-not-found' 
            || e.code === 'auth/wrong-password' 
            || e.code === 'auth/invalid-email';
          const msg = isInvalidCred
            ? 'Invalid mobile number, email, or password'
            : e.message;
          set({ loading: false, error: msg });
          return { ok: false, error: msg };
        }
      },

      // PIN login for staff (authenticates securely via Cloud Functions with custom claims)
      loginWithPin: async (restaurantId, pin) => {
        isLoggingIn = true;
        set({ loading: true, error: null });

        try {
          const cleanRestId = String(restaurantId || '').trim();
          const cleanPin = String(pin || '').trim();

          if (!cleanRestId || !cleanPin) {
            set({ loading: false, error: 'Restaurant ID and PIN are required' });
            return { ok: false, error: 'Restaurant ID and PIN are required' };
          }

          // 1. Primary: Server-side validation with brute-force rate-limiting
          if (functions) {
            try {
              const validatePinFn = httpsCallable(functions, 'validatePin');
              const res = await validatePinFn({ restaurantId: cleanRestId, pin: cleanPin });
              const { token, staff, restaurantId: actualRestId } = res.data;

              // Sign in with the cryptographically scoped Custom Token
              let firebaseUser = null;
              if (auth && token) {
                const cred = await signInWithCustomToken(auth, token);
                firebaseUser = cred.user;
              }

              // Load restaurant document
              let restData = null;
              if (db && actualRestId) {
                const restDoc = await getDoc(doc(db, 'restaurants', actualRestId));
                if (restDoc.exists()) {
                  restData = { id: actualRestId, ...restDoc.data() };
                }
              }

              const staffData = { id: staff.id, ...staff, isPinLogin: true, restaurantId: actualRestId };
              set({
                user: firebaseUser || { uid: staffData.id, isPinLogin: true },
                staffDoc: staffData,
                restaurant: restData,
                loading: false,
              });

              return { ok: true, role: staffData.role };
            } catch (fnErr) {
              // Rate limit lockouts or explicit invalid PIN responses must be returned immediately
              if (fnErr.code === 'resource-exhausted' || fnErr.code === 'unauthenticated' || fnErr.code === 'permission-denied') {
                const msg = fnErr.message || 'Invalid PIN';
                set({ loading: false, error: msg });
                return { ok: false, error: msg };
              }
              console.warn('validatePin function unreachable, attempting fallback:', fnErr.message);
            }
          }

          // 2. Fallback (for offline, local testing, or when Cloud Functions are not deployed)
          await get().ensureAnonymousAuth();

          let actualRestId = cleanRestId;
          const lowerRestId = cleanRestId.toLowerCase();
          const restQuery = query(collection(db, 'restaurants'), where('customId', 'in', [cleanRestId, lowerRestId]));
          const restSnap = await getDocs(restQuery);
          if (!restSnap.empty) {
            actualRestId = restSnap.docs[0].id;
          } else {
            const slugQuery = query(collection(db, 'restaurants'), where('slug', 'in', [cleanRestId, lowerRestId]));
            const slugSnap = await getDocs(slugQuery);
            if (!slugSnap.empty) {
              actualRestId = slugSnap.docs[0].id;
            }
          }

          const staffQuery = query(
            collection(db, 'restaurants', actualRestId, 'staff'),
            where('pin', '==', cleanPin),
            where('active', '==', true)
          );
          const staffSnap = await getDocs(staffQuery);
          if (staffSnap.empty) {
            set({ loading: false, error: 'Invalid PIN or staff member inactive' });
            return { ok: false, error: 'Invalid PIN or staff member inactive' };
          }

          const staffDocSnap = staffSnap.docs[0];
          const staffData = { id: staffDocSnap.id, ...staffDocSnap.data(), isPinLogin: true, restaurantId: actualRestId };

          const restDoc = await getDoc(doc(db, 'restaurants', actualRestId));
          if (!restDoc.exists()) {
            set({ loading: false, error: 'Restaurant not found' });
            return { ok: false, error: 'Restaurant not found' };
          }
          const restData = { id: actualRestId, ...restDoc.data() };

          set({
            user: auth?.currentUser || { uid: staffData.id, isPinLogin: true },
            staffDoc: staffData,
            restaurant: restData,
            loading: false,
          });
          return { ok: true, role: staffData.role };

        } catch (e) {
          set({ loading: false, error: e.message });
          return { ok: false, error: e.message };
        } finally {
          isLoggingIn = false;
        }
      },

      loadUserData: async (firebaseUser) => {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
            const userData = { id: userSnap.id, ...userSnap.data() };
            let restData = null;
            if (userData.restaurantId) {
              const restDocRef = doc(db, 'restaurants', userData.restaurantId);
              const restDoc = await getDoc(restDocRef);
              if (restDoc.exists()) {
                restData = { id: userData.restaurantId, ...restDoc.data() };
                if (restData.status === 'suspended') {
                  set({ loading: false, error: 'Restaurant account has been suspended. Please contact support.' });
                  await get().signOut();
                  return;
                }

                // Auto-sync email to restaurant doc if missing, enabling mobile number login
                const effectiveEmail = userData.email || firebaseUser.email;
                if (userData.role === 'admin' && effectiveEmail && !restData.email) {
                  try {
                    const cleanEmail = effectiveEmail.trim().toLowerCase();
                    await updateDoc(restDocRef, { email: cleanEmail });
                    restData.email = cleanEmail;
                  } catch (syncErr) {
                    console.warn('Could not auto-sync email to restaurant doc:', syncErr);
                  }
                }
              }
            }
            set({
              user: firebaseUser,
              staffDoc: userData,
              restaurant: restData,
              loading: false,
            });
          } else {
            // user doc not found (e.g. freshly registered, before setDoc)
            set({ user: firebaseUser, loading: false });
          }
        } catch (e) {
          console.error("loadUserData error:", e);
          set({ loading: false, error: e.message });
        }
      },

      signOut: async () => {
        // Clear state synchronously
        set({ user: null, staffDoc: null, restaurant: null, loading: false });
        
        try {
          const { useOrderStore } = await import('./orderStore');
          useOrderStore.getState().clearCart();
        } catch (e) {
          console.error('Failed to clear order cart on sign out', e);
        }

        if (auth) {
          await firebaseSignOut(auth);
        }
      },

      initAuthListener: () => {
        if (!auth) {
          set({ loading: false });
          return () => {};
        }
        return onAuthStateChanged(auth, async (user) => {
          const currentStaff = get().staffDoc;
          const currentRest = get().restaurant;
          const isStaffSession = Boolean(currentStaff && currentRest && currentStaff.role !== 'super_admin');

          if (user) {
            // Case 1: Staff session already active (waiter, cashier, kitchen, etc.)
            if (isStaffSession) {
              set({ user, loading: false });
              // Validate restaurant status without signing out on transient network errors
              const restId = currentRest.id;
              if (restId && db) {
                try {
                  const rSnap = await getDoc(doc(db, 'restaurants', restId));
                  if (rSnap.exists()) {
                    const rData = rSnap.data();
                    if (rData.status === 'suspended') {
                      await get().signOut();
                    } else {
                      set({ restaurant: { id: restId, ...rData } });
                    }
                  }
                } catch (restErr) {
                  console.warn('Could not verify restaurant status online (offline mode):', restErr);
                }
              }
              return;
            }

            // Case 2: Anonymous user without staff profile — check if orphaned
            if (user.isAnonymous) {
              if (isLoggingIn) return;
              // Clean up orphaned anonymous session
              try {
                await firebaseSignOut(auth);
              } catch (err) {
                console.error(err);
              }
              set({ user: null, staffDoc: null, restaurant: null, loading: false });
              return;
            }

            // Case 3: Registered admin email/password user
            await get().loadUserData(user);

          } else {
            // No Firebase Auth user on initial tick
            if (isStaffSession) {
              // Restore anonymous auth for Firestore permissions while keeping staff session intact
              try {
                const cred = await signInAnonymously(auth);
                set({ user: cred.user, loading: false });
              } catch (e) {
                console.warn('Staff session anonymous re-auth failed:', e.code, e.message);
                set({ loading: false });
              }
            } else {
              // Not a staff session — clear state and show login screen
              set({ user: null, staffDoc: null, loading: false });
            }
          }
        });
      },

      clearError: () => set({ error: null }),

      // Ensures a valid Firebase Auth session exists for Firestore writes.
      // Call before any authenticated Firestore write (openShift, submitOrder, etc.)
      ensureAnonymousAuth: async () => {
        if (!auth) return;
        if (auth.currentUser) return; // already signed in
        try {
          const cred = await signInAnonymously(auth);
          set({ user: cred.user });
        } catch (e) {
          console.error('ensureAnonymousAuth failed:', e.code, e.message);
        }
      },

      // Helpers
      get role() { return get().staffDoc?.role ?? null; },
      get isAdmin() { return ['admin', 'super_admin'].includes(get().staffDoc?.role); },
      get isSuperAdmin() { return get().staffDoc?.role === 'super_admin'; },
      get isApproved() {
        if (get().isSuperAdmin) return true;
        return get().restaurant?.status === 'approved';
      },
    }),
    {
      name: 'restaurant-os-auth',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => {
        // Persist only the minimum needed to restore session on refresh
        return { 
          user: s.user ? { uid: s.user.uid, isPinLogin: Boolean(s.user.isPinLogin || (s.staffDoc && s.staffDoc.role !== 'super_admin')) } : null,
          staffDoc: s.staffDoc, 
          restaurant: s.restaurant 
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.loading = false;
        }
      }
    }
  )
);
