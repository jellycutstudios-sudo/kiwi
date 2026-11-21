import { create } from 'zustand';
import {
  collection, addDoc, deleteDoc, doc, getDocs, serverTimestamp, onSnapshot, query, orderBy, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';
import { useShiftStore } from './shiftStore';

export const EXPENSE_CATEGORIES = [
  { id: 'supplies', label: 'Raw Materials & Food Supplies', icon: '🥬', color: '#10b981' },
  { id: 'utilities', label: 'Utilities (Gas, Electric, Water)', icon: '⚡', color: '#f59e0b' },
  { id: 'rent', label: 'Shop Rent & Property', icon: '🏢', color: '#6366f1' },
  { id: 'maintenance', label: 'Kitchen & Equipment Repairs', icon: '🔧', color: '#06b6d4' },
  { id: 'packaging', label: 'Packaging & Disposables', icon: '📦', color: '#8b5cf6' },
  { id: 'marketing', label: 'Marketing & Local Ads', icon: '📢', color: '#ec4899' },
  { id: 'staff_welfare', label: 'Staff Welfare & Refreshments', icon: '☕', color: '#14b8a6' },
  { id: 'license_legal', label: 'Licenses, Taxes & Legal', icon: '📜', color: '#64748b' },
  { id: 'misc', label: 'Miscellaneous Operating Cost', icon: '📝', color: '#94a3b8' },
];

export const PAYMENT_METHODS = [
  { id: 'cash_drawer', label: 'Cash Drawer (Till Petty Cash)', desc: 'Auto-deducts from active register drawer', isDrawer: true },
  { id: 'upi', label: 'UPI / QR Scan', desc: 'Direct merchant payment' },
  { id: 'bank_transfer', label: 'Bank Transfer (IMPS/NEFT)', desc: 'Vendor bank account transfer' },
  { id: 'card', label: 'Company Card', desc: 'Debit / Credit card charge' },
  { id: 'cash_personal', label: 'Cash (Owner Pocket)', desc: 'Paid outside register drawer' },
];

const getLocalExpenses = () => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('dineos_cached_expenses');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalExpenses = (expenses) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dineos_cached_expenses', JSON.stringify(expenses));
    }
  } catch {}
};

export const useExpenseStore = create((set, get) => ({
  expenses: getLocalExpenses(),
  loading: false,
  error: null,

  subscribeExpenses: (restaurantId) => {
    if (!restaurantId) return () => {};
    const rest = useAuthStore.getState().restaurant;
    if (rest?.localStorageOnly || rest?.privateSalesMode) {
      return () => {};
    }

    set({ loading: true, error: null });
    const q = query(
      collection(db, 'restaurants', restaurantId, 'expenses'),
      orderBy('date', 'desc'),
      limit(250)
    );

    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        date: d.data().date?.toDate ? d.data().date.toDate().toISOString() : (d.data().date || new Date().toISOString())
      }));
      set({ expenses: list, loading: false });
      saveLocalExpenses(list);
    }, err => {
      console.warn('[ExpenseStore] Subscription error (fallback to local cache):', err?.message);
      set({ loading: false, error: err?.message });
    });
  },

  addExpense: async (restaurantId, expenseData) => {
    const numAmount = Math.round((parseFloat(expenseData.amount) || 0) * 100) / 100;
    if (numAmount <= 0) {
      return { ok: false, error: 'Please enter a valid expense amount greater than 0' };
    }

    const categoryObj = EXPENSE_CATEGORIES.find(c => c.id === expenseData.category) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
    const categoryLabel = categoryObj.label;
    const paymentMethod = expenseData.paymentMethod || 'cash_drawer';
    const expenseDate = expenseData.date ? new Date(expenseData.date).toISOString() : new Date().toISOString();

    const activeShift = useShiftStore.getState().activeShift;
    let autoLoggedShiftId = null;

    // ─── TILL DRAWER AUTO-SYNC ───
    // If expense is paid from cash drawer, automatically record it as an Expense Paid-Out in active shift
    if (paymentMethod === 'cash_drawer' && activeShift?.id) {
      autoLoggedShiftId = activeShift.id;
      const drawerNote = `[Expense: ${categoryLabel}] ${expenseData.payee ? `${expenseData.payee} - ` : ''}${expenseData.note || 'Petty cash purchase'}`;
      try {
        await useShiftStore.getState().recordCashTransaction(
          restaurantId,
          activeShift.id,
          numAmount,
          'paidout',
          drawerNote
        );
      } catch (err) {
        console.warn('[ExpenseStore] Could not auto-sync with till drawer:', err?.message);
      }
    }

    const payload = {
      amount: numAmount,
      date: expenseDate,
      category: expenseData.category || 'misc',
      categoryLabel,
      paymentMethod,
      payee: expenseData.payee?.trim() || '',
      note: expenseData.note?.trim() || '',
      invoiceNumber: expenseData.invoiceNumber?.trim() || '',
      receiptUrl: expenseData.receiptUrl || null,
      createdByName: expenseData.createdByName || 'Staff',
      createdById: expenseData.createdById || null,
      shiftId: autoLoggedShiftId,
      createdAt: new Date().toISOString()
    };

    const tempId = `exp_${Date.now()}`;
    const newRecord = { id: tempId, ...payload };
    const currentList = get().expenses;
    const updatedList = [newRecord, ...currentList];
    set({ expenses: updatedList });
    saveLocalExpenses(updatedList);

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && !rest?.privateSalesMode && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const docRef = await addDoc(collection(db, 'restaurants', restaurantId, 'expenses'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        const syncedRecord = { ...newRecord, id: docRef.id };
        const replacedList = updatedList.map(item => item.id === tempId ? syncedRecord : item);
        set({ expenses: replacedList });
        saveLocalExpenses(replacedList);
        return { ok: true, id: docRef.id, syncedToTill: Boolean(autoLoggedShiftId) };
      }
    } catch (e) {
      console.warn('[ExpenseStore] Cloud sync deferred:', e?.message);
    }

    return { ok: true, id: tempId, syncedToTill: Boolean(autoLoggedShiftId) };
  },

  deleteExpense: async (restaurantId, expenseId) => {
    const currentList = get().expenses;
    const nextList = currentList.filter(e => e.id !== expenseId);
    set({ expenses: nextList });
    saveLocalExpenses(nextList);

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && !rest?.privateSalesMode && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        await deleteDoc(doc(db, 'restaurants', restaurantId, 'expenses', expenseId));
      }
    } catch (e) {
      console.warn('[ExpenseStore] Delete cloud sync error:', e?.message);
    }

    return { ok: true };
  }
}));
