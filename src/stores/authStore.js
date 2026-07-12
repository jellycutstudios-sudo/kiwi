// Zustand Auth Store — handles auth state + role resolution
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInAnonymously,
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
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

        // --- DEMO ACCOUNT MOCK ---
        if (email === 'admin@demo.com' && password === 'password123') {
           const mockUid = 'demo_admin_uid';
           const mockUser = { uid: mockUid, email: 'admin@demo.com', isMock: true };
           const mockStaffDoc = { id: mockUid, email: 'admin@demo.com', role: 'admin', restaurantId: 'demo_rest' };
           const mockRestDoc = { 
             id: 'demo_rest', 
             status: 'approved', 
             name: 'Demo Restaurant', 
             currency: 'USD',
             modes: ['pos', 'table', 'online', 'delivery_hub', 'kds', 'payroll', 'inventory', 'customers', 'reservations']
           };
           
           set({
             user: mockUser,
             staffDoc: mockStaffDoc,
             restaurant: mockRestDoc,
             loading: false
           });
           return { ok: true };
        }
        // -------------------------

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

      // PIN login for staff (looks up PIN in Firestore)
      loginWithPin: async (restaurantId, pin) => {
        isLoggingIn = true;
        set({ loading: true, error: null });

        // --- DEMO ACCOUNT MOCK ---
        if (restaurantId.trim() === 'demo_rest' && pin === '1234') {
           const mockUid = 'demo_staff_uid';
           const mockUser = { uid: mockUid, isPinLogin: true, isMock: true };
           const mockStaffDoc = { id: mockUid, name: 'Demo Waiter', role: 'cashier', restaurantId: 'demo_rest', pin: '1234', active: true };
           const mockRestDoc = { 
             id: 'demo_rest', 
             status: 'approved', 
             name: 'Demo Restaurant', 
             currency: 'USD',
             modes: ['pos', 'table', 'online', 'delivery_hub', 'kds']
           };
           
           set({
             user: mockUser,
             staffDoc: mockStaffDoc,
             restaurant: mockRestDoc,
             loading: false
           });
           isLoggingIn = false;
           return { ok: true, role: 'cashier' };
        }
        // -------------------------

        try {
          const cleanRestId = restaurantId.trim();
          let actualRestId = cleanRestId;

          // 1. Try to find restaurant by customId
          const restQuery = query(collection(db, 'restaurants'), where('customId', '==', cleanRestId));
          const restSnap = await getDocs(restQuery);
          
          if (!restSnap.empty) {
            actualRestId = restSnap.docs[0].id;
          } else {
            // Fallback: Try to find restaurant by slug
            const slugQuery = query(collection(db, 'restaurants'), where('slug', '==', cleanRestId));
            const slugSnap = await getDocs(slugQuery);
            if (!slugSnap.empty) {
              actualRestId = slugSnap.docs[0].id;
            }
          }

          const staffRef = collection(db, 'restaurants', actualRestId, 'staff');
          const q = query(staffRef, where('pin', '==', pin), where('active', '==', true));
          const snap = await getDocs(q);
          if (snap.empty) {
            set({ loading: false, error: 'Invalid PIN' });
            return { ok: false, error: 'Invalid PIN' };
          }
          const staffData = { id: snap.docs[0].id, ...snap.docs[0].data() };

              // Authenticate anonymously in Firebase Auth so the session passes Firestore security rules
          let firebaseUser = null;
          if (auth) {
            try {
              const cred = await signInAnonymously(auth);
              firebaseUser = cred.user;
            } catch (anonErr) {
              // Anonymous auth disabled in Firebase Console — log but don't block login.
              // Staff will still be logged in to the UI; Firestore writes may fail until enabled.
              console.error('Anonymous auth failed (enable it in Firebase Console → Auth → Sign-in methods):', anonErr.code);
            }
          }

          // Load restaurant
          const restDoc = await getDoc(doc(db, 'restaurants', actualRestId));
          if (!restDoc.exists()) {
            set({ loading: false, error: 'Restaurant not found' });
            return { ok: false, error: 'Restaurant not found' };
          }
          const restData = { id: actualRestId, ...restDoc.data() };
          if (restData.status !== 'approved') {
            set({ loading: false, error: 'Restaurant is pending approval or suspended' });
            return { ok: false, error: 'Restaurant is pending approval or suspended' };
          }

          set({
            user: firebaseUser || { uid: staffData.id, isPinLogin: true },
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
        // Clear state synchronously and set loading to true during transition
        set({ user: null, staffDoc: null, restaurant: null, loading: true });
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
            // No Firebase Auth session at all.
            if (get().user?.isMock) {
               // Preserve mock session, do nothing.
               set({ loading: false });
               return;
            }
            
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
      partialize: (s) => ({ user: s.user, staffDoc: s.staffDoc, restaurant: s.restaurant }),
    }
  )
);
