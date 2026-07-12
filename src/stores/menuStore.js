import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const useMenuStore = create((set) => {
  let activeUnsub = null;
  let subscribedRestId = null;

  return {
    categories: [],
    loading: true,
    error: null,
    search: '',
    setSearch: (search) => set({ search }),

    subscribeMenu: (restaurantId) => {
      if (!restaurantId) return () => {};

      // If already subscribed to this restaurant, return the current unsub
      if (subscribedRestId === restaurantId && activeUnsub) {
        return activeUnsub;
      }

      // Clean up previous subscription if any
      if (activeUnsub) {
        activeUnsub();
        activeUnsub = null;
      }

      set({ loading: true, error: null });
      subscribedRestId = restaurantId;

      // --- DEMO ACCOUNT MOCK ---
      if (restaurantId === 'demo_rest') {
         set({
           categories: [
             {
               id: 'cat_burgers',
               name: 'Burgers',
               active: true,
               order: 1,
               items: [
                 { id: 'item_1', name: 'Classic Cheeseburger', price: 15.99, active: true, imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=300&q=80' },
                 { id: 'item_2', name: 'Double Bacon Burger', price: 18.99, active: true, imageUrl: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=300&q=80' },
                 { id: 'item_3', name: 'Veggie Patty', price: 14.50, active: true, imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=300&q=80' },
               ]
             },
             {
               id: 'cat_pizza',
               name: 'Pizza',
               active: true,
               order: 2,
               items: [
                 { id: 'item_4', name: 'Margherita', price: 12.00, active: true, imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=300&q=80' },
                 { id: 'item_5', name: 'Pepperoni', price: 14.50, active: true, imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=300&q=80' },
                 { id: 'item_6', name: 'Hawaiian', price: 15.00, active: true, imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=300&q=80' },
               ]
             },
             {
               id: 'cat_sides',
               name: 'Sides',
               active: true,
               order: 3,
               items: [
                 { id: 'item_7', name: 'French Fries', price: 4.99, active: true, imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=300&q=80' },
                 { id: 'item_8', name: 'Onion Rings', price: 5.99, active: true, imageUrl: 'https://images.unsplash.com/photo-1625938146369-adc83368bda7?auto=format&fit=crop&w=300&q=80' },
               ]
             },
             {
               id: 'cat_drinks',
               name: 'Drinks',
               active: true,
               order: 4,
               items: [
                 { id: 'item_9', name: 'Cola', price: 3.50, active: true, imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=300&q=80' },
                 { id: 'item_10', name: 'Iced Tea', price: 3.50, active: true, imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=300&q=80' },
                 { id: 'item_11', name: 'Craft Beer', price: 6.00, active: true, imageUrl: 'https://images.unsplash.com/photo-1566633806327-68e152aaf26d?auto=format&fit=crop&w=300&q=80' },
               ]
             },
             {
               id: 'cat_desserts',
               name: 'Desserts',
               active: true,
               order: 5,
               items: [
                 { id: 'item_12', name: 'Chocolate Cake', price: 7.50, active: true, imageUrl: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&w=300&q=80' },
                 { id: 'item_13', name: 'Vanilla Ice Cream', price: 4.50, active: true, imageUrl: 'https://images.unsplash.com/photo-1557142046-c704a3adf364?auto=format&fit=crop&w=300&q=80' },
               ]
             }
           ],
           loading: false
         });
         
         activeUnsub = () => {
           activeUnsub = null;
           subscribedRestId = null;
           set({ categories: [], loading: true });
         };
         return activeUnsub;
      }
      // -------------------------

      const q = collection(db, 'restaurants', restaurantId, 'menu');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          set({ categories: cats, loading: false });
        },
        (err) => {
          console.error('[useMenuStore] Subscription error:', err);
          set({ error: err.message, loading: false });
        }
      );

      activeUnsub = () => {
        unsub();
        activeUnsub = null;
        subscribedRestId = null;
        set({ categories: [], loading: true });
      };

      return activeUnsub;
    },

    unsubscribeMenu: () => {
      if (activeUnsub) {
        activeUnsub();
      }
    },
  };
});
