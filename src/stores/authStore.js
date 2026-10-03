import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,           // Firebase Auth user
      staffDoc: null,       // Firestore staff document
      restaurant: null,     // Current restaurant doc
      loading: true,
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

                // 2. Fallback: check 'users' collection
                if (!targetEmail) {
                  const qPhone = query(collection(db, 'users'), where('phone', 'in', candidates));
                  const snap = await getDocs(qPhone);
                  if (!snap.empty) {
                    const uData = snap.docs[0].data();
                    targetEmail = (uData.email || uData.authEmail || '').trim().toLowerCase();
                  }
                }
              } catch (lookupErr) {
                console.warn('Firestore phone lookup error:', lookupErr);
              }
            }

            // 2. Fallback to standard synthetic phone email if no custom email found
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

              const staffData = { id: staff.id, ...staff };
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

          // 2. Fallback (for offline or local testing environments)
          let actualRestId = cleanRestId;
          const restQuery = query(collection(db, 'restaurants'), where('customId', '==', cleanRestId));
          const restSnap = await getDocs(restQuery);
          if (!restSnap.empty) {
            actualRestId = restSnap.docs[0].id;
          } else {
            const slugQuery = query(collection(db, 'restaurants'), where('slug', '==', cleanRestId));
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
            set({ loading: false, error: 'Invalid PIN' });
            return { ok: false, error: 'Invalid PIN' };
          }

          const staffDocSnap = staffSnap.docs[0];
          const staffData = { id: staffDocSnap.id, ...staffDocSnap.data() };

          const restDoc = await getDoc(doc(db, 'restaurants', actualRestId));
          if (!restDoc.exists()) {
            set({ loading: false, error: 'Restaurant not found' });
            return { ok: false, error: 'Restaurant not found' };
          }
          const restData = { id: actualRestId, ...restDoc.data() };

          set({
            user: { uid: staffData.id, isPinLogin: true },
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
          // loadUserData: start
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          // fetching userDocRef
          const userSnap = await getDoc(userDocRef);
          // check if user exists

          if (userSnap.exists()) {
            const userData = { id: userSnap.id, ...userSnap.data() };
            let restData = null;
            if (userData.restaurantId) {
              const restDocRef = doc(db, 'restaurants', userData.restaurantId);
              const restDoc = await getDoc(restDocRef);
              // check if restDoc exists
              if (restDoc.exists()) {
                restData = { id: userData.restaurantId, ...restDoc.data() };
                if (restData.status && restData.status !== 'approved') {
                  set({ loading: false, error: 'Restaurant account is not active or suspended' });
                  await get().signOut();
                  return;
                }

                // Auto-sync email & phone to restaurant doc if missing, enabling mobile number login
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
            // set state
            set({
              user: firebaseUser,
              staffDoc: userData,
              restaurant: restData,
              loading: false,
            });
          } else {
            // user doc not found
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
          if (user) {
            if (user.isAnonymous) {
              // Anonymous user (PIN login session) — no /users doc to load.
              if (isLoggingIn) {
                // In the middle of loginWithPin — do nothing, loginWithPin will handle setting the state.
                return;
              }
              if (get().staffDoc && get().restaurant) {
                set({ user, loading: false });
                // Re-verify restaurant status hasn't changed while session was stored
                const restId = get().restaurant.id;
                if (restId) {
                  getDoc(doc(db, 'restaurants', restId)).then(async (rSnap) => {
                    if (rSnap.exists()) {
                      const rData = rSnap.data();
                      if (rData.status && rData.status !== 'approved') {
                        await get().signOut();
                      } else {
                        set({ restaurant: { id: restId, ...rData } });
                      }
                    } else {
                      await get().signOut();
                    }
                  }).catch(console.warn);
                }
              } else {
                // Page load/refresh with orphaned anonymous session — clean up and show login screen
                if (auth) {
                  try {
                    await firebaseSignOut(auth);
                  } catch (err) {
                    console.error(err);
                  }
                }
                set({ user: null, staffDoc: null, restaurant: null, loading: false });
              }
            } else {
              // Full email/password session — load full user profile from Firestore.
              await get().loadUserData(user);
            }
          } else {
            // No Firebase Auth session at all.
            if (get().staffDoc?.pin) {
              // PIN session persisted in localStorage — re-authenticate anonymously
              // to restore Firestore write permissions (anonymous auth must be enabled
              // in Firebase Console → Authentication → Sign-in method → Anonymous).
              try {
                const cred = await signInAnonymously(auth);
                set({ user: cred.user, loading: false });
              } catch (e) {
                console.error('PIN session anonymous re-auth failed:', e.code, e.message);
                // Anonymous auth is likely disabled in Firebase Console.
                // Staff stays "logged in" visually but Firestore writes will fail.
                set({ loading: false });
              }
            } else {
              // No PIN session — clear state and go to login screen.
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
      partialize: (s) => {
        // Persist only the minimum needed to restore session on refresh
        return { 
          user: s.user ? { uid: s.user.uid, isPinLogin: s.user.isPinLogin } : null,
          staffDoc: s.staffDoc, 
          restaurant: s.restaurant 
        };
      },
      onRehydrateStorage: () => (state) => {
        // Immediately dismiss the loading screen once localStorage is read.
        // This gives instant app startup (0ms), while Firebase verifies the session in the background.
        if (state) {
          state.loading = false;
        }
      }
    }
  )
);
