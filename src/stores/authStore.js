// Zustand Auth Store — handles auth state + role resolution
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

let isLoggingIn = false;

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,           // Firebase Auth user
      staffDoc: null,       // Firestore staff document
      restaurant: null,     // Current restaurant doc
      loading: true,
      error: null,

      // Email/Password login (admin)
      loginWithEmail: async (email, password) => {
        set({ loading: true, error: null });

        try {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          await get().loadUserData(cred.user);
          return { ok: true };
        } catch (e) {
          const msg = e.code === 'auth/invalid-credential'
            ? 'Invalid email or password'
            : e.message;
          set({ loading: false, error: msg });
          return { ok: false, error: msg };
        }
      },

      // PIN login for staff — calls the secure Cloud Function which validates the PIN
      // server-side and returns a custom Firebase Auth token with restaurantId claims.
      // This ensures the PIN is NEVER sent to the client or exposed in Firestore rules.
      loginWithPin: async (restaurantId, pin) => {
        isLoggingIn = true;
        set({ loading: true, error: null });

        try {
          const { httpsCallable } = await import('firebase/functions');
          const { getFunctions } = await import('firebase/functions');
          const { signInWithCustomToken } = await import('firebase/auth');
          const { app } = await import('../firebase');

          const functions = getFunctions(app);
          const validatePin = httpsCallable(functions, 'validatePin');

          const result = await validatePin({ restaurantId: restaurantId.trim(), pin });
          const { token, staff: staffData, restaurantId: actualRestId } = result.data;

          // Sign in with the custom token — this embeds restaurantId + role claims
          const cred = await signInWithCustomToken(auth, token);
          const firebaseUser = cred.user;

          // Load restaurant document
          const restDoc = await getDoc(doc(db, 'restaurants', actualRestId));
          if (!restDoc.exists()) {
            set({ loading: false, error: 'Restaurant not found' });
            return { ok: false, error: 'Restaurant not found' };
          }
          const restData = { id: actualRestId, ...restDoc.data() };

          set({
            user: firebaseUser,
            staffDoc: staffData,
            restaurant: restData,
            loading: false,
          });
          return { ok: true, role: staffData.role };
        } catch (e) {
          // httpsCallable wraps errors as FirebaseError with code
          const msg = e?.message?.replace('FirebaseError: ', '') ?? e.message;
          set({ loading: false, error: msg });
          return { ok: false, error: msg };
        } finally {
          isLoggingIn = false;
        }
      },

      loadUserData: async (firebaseUser) => {
        try {
          // Fetch user document by UID — role is read from Firestore, never derived client-side.
          // To grant super_admin: set role:'super_admin' directly in Firebase Console → Firestore → /users/{uid}
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
            const userData = { id: userSnap.id, ...userSnap.data() };
            let restData = null;
            if (userData.restaurantId) {
              const restDoc = await getDoc(doc(db, 'restaurants', userData.restaurantId));
              if (restDoc.exists()) {
                restData = { id: userData.restaurantId, ...restDoc.data() };
              }
            }
            set({
              user: firebaseUser,
              staffDoc: userData,
              restaurant: restData,
              loading: false,
            });
          } else {
            // No /users doc yet — user is authenticated but not set up in the system
            set({ user: firebaseUser, loading: false });
          }
        } catch (e) {
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
            // No Firebase Auth session at all — clear state and go to login screen.
            // Custom token sessions (PIN logins) are persisted by Firebase Auth itself
            // and will be handled by the isAnonymous=false branch above on re-load.
            set({ user: null, staffDoc: null, loading: false });
          }
        });
      },

      clearError: () => set({ error: null }),

      // Ensures a valid Firebase Auth session exists for Firestore writes.
      // For custom token (PIN) sessions, Firebase Auth manages the token lifecycle.
      // This is a no-op guard — kept for API compatibility with store callers.
      ensureAnonymousAuth: async () => {
        if (!auth) return;
        if (auth.currentUser) return; // already signed in via custom token or email
        // If we reach here without a session, the user needs to log in again.
        console.warn('[ensureAnonymousAuth] No active session found. User may need to re-login.');
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
    }
  )
);
