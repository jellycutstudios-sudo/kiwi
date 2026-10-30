import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithCustomToken,
  signInAnonymously,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, functions } from '../firebase';
import { useOrderStore } from './orderStore';

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

      // PIN login for staff (authenticates securely via Cloud Functions or direct single-key verification)
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

          // 1. Client-side brute force rate-limiting / lockout protection
          const attemptsKey = `dineos_pin_attempts_${cleanRestId}`;
          let attemptRecord = null;
          try {
            attemptRecord = JSON.parse(safeStorage.getItem(attemptsKey) || 'null');
          } catch {}
          const now = Date.now();
          if (attemptRecord && attemptRecord.lockedUntil && attemptRecord.lockedUntil > now) {
            const minLeft = Math.ceil((attemptRecord.lockedUntil - now) / 60000);
            const msg = `Too many failed PIN attempts. Terminal locked for ${minLeft} minute${minLeft > 1 ? 's' : ''}.`;
            set({ loading: false, error: msg });
            return { ok: false, error: msg };
          }

          const recordFailedAttempt = () => {
            const count = (attemptRecord?.count || 0) + 1;
            const lockedUntil = count >= 5 ? now + 15 * 60 * 1000 : 0;
            try {
              safeStorage.setItem(attemptsKey, JSON.stringify({ count, lockedUntil, lastAttempt: now }));
            } catch {}
            const remaining = Math.max(0, 5 - count);
            return count >= 5
              ? 'Too many failed PIN attempts. Terminal locked for 15 minutes.'
              : `Invalid PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`;
          };

          const clearFailedAttempts = () => {
            try {
              safeStorage.removeItem(attemptsKey);
            } catch {}
          };

          // 2. Primary: Cloud Function (if deployed and available)
          if (functions) {
            try {
              const validatePinFn = httpsCallable(functions, 'validatePin');
              const res = await validatePinFn({ restaurantId: cleanRestId, pin: cleanPin });
              const { token, staff, restaurantId: actualRestId } = res.data;

              const staffData = { id: staff.id, ...staff, isPinLogin: true, restaurantId: actualRestId };

              // Load restaurant document before signing in with custom token
              let restData = null;
              if (db && actualRestId) {
                const restDoc = await getDoc(doc(db, 'restaurants', actualRestId));
                if (restDoc.exists()) {
                  restData = { id: actualRestId, ...restDoc.data() };
                }
              }

              set({
                staffDoc: staffData,
                restaurant: restData,
              });

              // Sign in with the cryptographically scoped Custom Token
              let firebaseUser = null;
              if (auth && token) {
                const cred = await signInWithCustomToken(auth, token);
                firebaseUser = cred.user;
              }

              clearFailedAttempts();
              set({
                user: firebaseUser || { uid: staffData.id, isPinLogin: true },
                staffDoc: staffData,
                restaurant: restData,
                loading: false,
              });

              return { ok: true, role: staffData.role };
            } catch (fnErr) {
              if (fnErr.code === 'resource-exhausted') {
                const msg = fnErr.message || 'Terminal locked due to too many failed attempts';
                set({ loading: false, error: msg });
                return { ok: false, error: msg };
              }
              if (fnErr.code === 'unauthenticated') {
                const msg = recordFailedAttempt();
                set({ loading: false, error: msg });
                return { ok: false, error: msg };
              }
              console.warn('validatePin function unreachable or not deployed, falling back to direct verification:', fnErr.message);
            }
          }

          // 3. Direct single-key PIN verification against staff_auth
          if (db) {
            try {
              let actualRestId = cleanRestId;
              let restData = get().restaurant || getInitialPersistedAuth().restaurant;

              // Map demo/kiwi aliases to rest1
              if (['kiwi', 'demo'].includes(cleanRestId.toLowerCase())) {
                actualRestId = 'rest1';
              }

              // Ensure restaurant ID is resolved
              if (!restData || !restData.id || restData.id !== actualRestId) {
                let rSnap = await getDoc(doc(db, 'restaurants', actualRestId));
                if (!rSnap.exists()) {
                  const lowerRestId = cleanRestId.toLowerCase();
                  // A. Try customId
                  const qCustom = query(collection(db, 'restaurants'), where('customId', 'in', [cleanRestId, lowerRestId]));
                  const sCustom = await getDocs(qCustom);
                  if (!sCustom.empty) {
                    rSnap = sCustom.docs[0];
                    actualRestId = rSnap.id;
                  } else {
                    // B. Try slug
                    const qSlug = query(collection(db, 'restaurants'), where('slug', 'in', [cleanRestId, lowerRestId]));
                    const sSlug = await getDocs(qSlug);
                    if (!sSlug.empty) {
                      rSnap = sSlug.docs[0];
                      actualRestId = rSnap.id;
                    }
                  }

                  // C. Try phone number (if input looks like digits)
                  if (!rSnap.exists()) {
                    const digits = cleanRestId.replace(/\D/g, '');
                    if (digits.length >= 6) {
                      const phoneCandidates = [digits];
                      if (digits.length > 10) phoneCandidates.push(digits.slice(-10));
                      if (digits.length === 10) phoneCandidates.push(`+91${digits}`, `91${digits}`);
                      const qPhone = query(collection(db, 'restaurants'), where('phone', 'in', phoneCandidates));
                      const sPhone = await getDocs(qPhone);
                      if (!sPhone.empty) {
                        rSnap = sPhone.docs[0];
                        actualRestId = rSnap.id;
                      }
                    }
                  }

                  // D. Try name match (case-insensitive / slug-normalized)
                  if (!rSnap.exists()) {
                    const qName = query(collection(db, 'restaurants'), where('name', '==', cleanRestId));
                    const sName = await getDocs(qName);
                    if (!sName.empty) {
                      rSnap = sName.docs[0];
                      actualRestId = rSnap.id;
                    } else {
                      try {
                        const allRests = await getDocs(collection(db, 'restaurants'));
                        const cleanNorm = cleanRestId.toLowerCase().replace(/[^a-z0-9]/g, '');
                        for (const d of allRests.docs) {
                          const dName = (d.data().name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          const dSlug = (d.data().slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          if (cleanNorm && (dName === cleanNorm || dSlug === cleanNorm)) {
                            rSnap = d;
                            actualRestId = d.id;
                            break;
                          }
                        }
                      } catch {}
                    }
                  }
                }
                if (rSnap && rSnap.exists()) {
                  restData = { id: rSnap.id, ...rSnap.data() };
                }
              }

              if (!restData || !restData.id) {
                const notFoundMsg = `Restaurant "${cleanRestId}" not found. Enter your Restaurant ID, Name, or Phone.`;
                set({ loading: false, error: notFoundMsg });
                return { ok: false, error: notFoundMsg };
              }

              if (restData?.status === 'suspended') {
                set({ loading: false, error: 'Restaurant account has been suspended' });
                return { ok: false, error: 'Restaurant account has been suspended' };
              }

              const authSnap = await getDoc(doc(db, 'restaurants', actualRestId, 'staff_auth', cleanPin));
              if (authSnap.exists()) {
                const authData = authSnap.data();
                if (authData.active === false) {
                  set({ loading: false, error: 'Staff member is inactive' });
                  return { ok: false, error: 'Staff member is inactive' };
                }

                const staffData = {
                  id: authData.staffId || authSnap.id,
                  name: authData.name || 'Staff',
                  role: authData.role || 'staff',
                  isPinLogin: true,
                  restaurantId: actualRestId
                };

                const finalRest = restData || { id: actualRestId, status: 'approved', name: cleanRestId };

                // Ensure an active Firebase Auth anonymous session for Firestore rules
                let firebaseUser = null;
                if (auth) {
                  if (auth.currentUser) {
                    firebaseUser = auth.currentUser;
                  } else {
                    try {
                      const cred = await signInAnonymously(auth);
                      firebaseUser = cred.user;
                    } catch (anonErr) {
                      console.warn('Anonymous sign-in for staff PIN session deferred:', anonErr?.message);
                    }
                  }
                }

                clearFailedAttempts();
                set({
                  user: firebaseUser || { uid: staffData.id, isPinLogin: true },
                  staffDoc: staffData,
                  restaurant: finalRest,
                  loading: false,
                  error: null
                });

                return { ok: true, role: staffData.role };
              } else {
                // Restaurant was verified, but PIN does not exist in staff_auth
                const failMsg = recordFailedAttempt();
                set({ loading: false, error: failMsg });
                return { ok: false, error: failMsg };
              }
            } catch (authErr) {
              console.warn('[loginWithPin] staff_auth lookup check error:', authErr.message);
              // Do not record failed attempt on server permission/network error
              const errMsg = authErr.message?.includes('permission')
                ? 'Permission denied accessing staff records. Please check restaurant setup.'
                : 'Unable to verify PIN with server. Please check your network connection.';
              set({ loading: false, error: errMsg });
              return { ok: false, error: errMsg };
            }
          }

          // 4. Offline / local fallback (uses cached staff roster on this terminal when offline)
          try {
            const cachedStaff = JSON.parse(safeStorage.getItem('dineos_cached_staff') || '[]');
            const cleanPin = String(pin || '').trim();
            const matched = cachedStaff.find(s => String(s.pin).trim() === cleanPin && s.active !== false);
            if (matched) {
              let actualRestId = matched.restaurantId || cleanRestId;
              let restData = get().restaurant || getInitialPersistedAuth().restaurant;

              // Ensure restaurant data is loaded so status === 'approved' is recognized
              if (!restData || !restData.id || restData.id !== actualRestId) {
                if (db) {
                  try {
                    let rSnap = await getDoc(doc(db, 'restaurants', actualRestId));
                    if (!rSnap.exists()) {
                      const lowerRestId = cleanRestId.toLowerCase();
                      const qCustom = query(collection(db, 'restaurants'), where('customId', 'in', [cleanRestId, lowerRestId]));
                      const sCustom = await getDocs(qCustom);
                      if (!sCustom.empty) {
                        rSnap = sCustom.docs[0];
                        actualRestId = rSnap.id;
                      } else {
                        const qSlug = query(collection(db, 'restaurants'), where('slug', 'in', [cleanRestId, lowerRestId]));
                        const sSlug = await getDocs(qSlug);
                        if (!sSlug.empty) {
                          rSnap = sSlug.docs[0];
                          actualRestId = rSnap.id;
                        }
                      }
                    }
                    if (rSnap && rSnap.exists()) {
                      restData = { id: rSnap.id, ...rSnap.data() };
                    }
                  } catch (rErr) {
                    console.warn('[loginWithPin] Could not fetch restaurant online:', rErr);
                  }
                }
              }

              // Fallback to active approved restaurant object so routing never redirects to pending approval
              if (!restData || !restData.id) {
                restData = { id: actualRestId, status: 'approved', name: cleanRestId };
              }

              const staffData = { id: matched.id, ...matched, isPinLogin: true, restaurantId: restData.id };
              clearFailedAttempts();
              set({
                user: { uid: staffData.id, isPinLogin: true },
                staffDoc: staffData,
                restaurant: restData,
                loading: false,
                error: null
              });
              return { ok: true, role: staffData.role, isOffline: true };
            }
          } catch (offlineErr) {
            console.warn('[loginWithPin] Offline cache check error:', offlineErr);
          }

          const failMsg = recordFailedAttempt();
          set({ loading: false, error: failMsg });
          return { ok: false, error: failMsg };
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
          if (isLoggingIn) return; // Prevent race condition with active loginWithPin or loginWithEmail

          const currentStaff = get().staffDoc;
          const currentRest = get().restaurant;
          const isStaffSession = Boolean(currentStaff && currentRest && currentStaff.role !== 'super_admin');

          if (user) {
            // Case 1: Staff session already active (waiter, cashier, kitchen, etc.)
            if (isStaffSession || currentStaff?.isPinLogin) {
              set({ user, loading: false });
              // Validate restaurant status without signing out on transient network errors
              const restId = currentRest?.id || currentStaff?.restaurantId;
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

            // Check if user authenticated via custom token with isPinLogin claim
            try {
              const tokenResult = await user.getIdTokenResult();
              if (tokenResult.claims && tokenResult.claims.isPinLogin) {
                set({ user, loading: false });
                return;
              }
            } catch {}

            // Case 2: Anonymous user without staff profile — check if orphaned
            if (user.isAnonymous) {
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
              // Retain active staff session without creating redundant anonymous auth users
              set({ loading: false });
            } else {
              // Not a staff session — clear state and show login screen
              set({ user: null, staffDoc: null, loading: false });
            }
          }
        });
      },

      clearError: () => set({ error: null }),

      switchRestaurant: (newRestaurant) => {
        if (!newRestaurant || !newRestaurant.id) return;
        try {
          useOrderStore.getState().clearCart?.();
          useOrderStore.setState({ activeOrders: [], onlineOrders: [] });
        } catch {}
        set({ restaurant: newRestaurant });
      },

      updateRestaurantState: (updates) => {
        set(state => ({
          restaurant: state.restaurant ? { ...state.restaurant, ...updates } : updates
        }));
      },

      // Ensures a valid Firebase Auth session exists for Firestore writes.
      ensureAnonymousAuth: async () => {
        if (!auth) return;
        if (auth.currentUser) return;
        try {
          const cred = await signInAnonymously(auth);
          set({ user: cred.user });
        } catch (e) {
          console.warn('ensureAnonymousAuth deferred:', e?.message);
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
