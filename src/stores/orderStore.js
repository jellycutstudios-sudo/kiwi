// Order Store — cart state, order type, table assignment
import { create } from 'zustand';
import {
  collection, updateDoc, doc, getDoc, serverTimestamp, onSnapshot, query, where, limit, increment, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { computeTax } from '../utils/taxUtils';
import { useTableStore } from './tableStore';
import { useMenuStore } from './menuStore';
import { useAuthStore } from './authStore';
import { useShiftStore } from './shiftStore';
import { useGiftCardStore } from './giftCardStore';
import { playNotificationTone, vibrateDevice } from '../utils/soundNotifications';
import { useOfflineQueueStore } from './offlineQueueStore';
import toast from 'react-hot-toast';
import { localSyncChannel } from '../utils/localSyncChannel';

let activeOrdersUnsub = null;
let subscribedOrdersRestId = null;
let ordersSubCount = 0;
const localCancelledOrderIds = new Set();

const CART_STORAGE_KEY = 'dineos_active_cart';

const loadPersistedCart = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const savePersistedCart = (state) => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!state.items || state.items.length === 0) {
      localStorage.removeItem(CART_STORAGE_KEY);
      return;
    }
    const cartSnapshot = {
      items: state.items,
      activeSeat: state.activeSeat,
      orderType: state.orderType,
      tableId: state.tableId,
      tableName: state.tableName,
      tokenNumber: state.tokenNumber,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      note: state.note,
      discount: state.discount,
      discountType: state.discountType,
      tipAmount: state.tipAmount,
      editingOrderId: state.editingOrderId
    };
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartSnapshot));
  } catch {}
};

const clearPersistedCart = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CART_STORAGE_KEY);
  } catch {}
};

const initialCart = loadPersistedCart();

export const useOrderStore = create((set, get) => ({
  // Cart
  items: initialCart?.items || [],
  activeSeat: initialCart?.activeSeat || null,
  settledChecks: [],
  orderType: initialCart?.orderType || 'dine-in',   // 'dine-in' | 'takeaway' | 'online'
  tableId: initialCart?.tableId || null,
  tableName: initialCart?.tableName || null,
  tokenNumber: initialCart?.tokenNumber || null,
  customerName: initialCart?.customerName || '',
  customerPhone: initialCart?.customerPhone || '',
  note: initialCart?.note || '',
  customer: null,
  redeemingPoints: false,
  editingOrderId: initialCart?.editingOrderId || null,
  assignedWaiterId: null,
  assignedWaiterName: null,

  // Active orders list (realtime)
  activeOrders: [],
  onlineOrders: [],
  unreadOnlineCount: 0,
  readOnlineOrderIds: [], // array of read online order IDs
  notifiedReadyOrders: [], // array of order IDs already notified

  // Payment
  paymentMethod: 'cash',  // 'cash' | 'card' | 'upi' | 'split' | 'terminal'
  splitPayments: [],
  upiRef: '',
  terminalTx: null, // { transactionId, status, rrn, authCode, provider, terminalId, paymentMethodUsed }

  // Discount
  discount: 0,
  discountType: 'fixed', // 'fixed' | 'percent'

  // Tips
  tipAmount: 0,

  // ── Cart Operations ──────────────────────────────────────
  setActiveSeat: (seatNumber) => set({ activeSeat: seatNumber ? Number(seatNumber) : null }),

  addItem: (item) => {
    if (useGiftCardStore.getState().giftCardCode) {
      useGiftCardStore.getState().clearGiftCard();
    }
    const items = get().items;
    const activeSeat = get().activeSeat;
    const itemSeat = item.seatNumber !== undefined ? item.seatNumber : (activeSeat ?? null);
    const existing = items.find(i => 
      i.id === item.id && 
      JSON.stringify(i.selectedModifiers ?? []) === JSON.stringify(item.selectedModifiers ?? []) &&
      (i.seatNumber ?? null) === (itemSeat ?? null)
    );
    if (existing) {
      set({ 
        items: items.map(i => 
          (i.id === item.id && 
           JSON.stringify(i.selectedModifiers ?? []) === JSON.stringify(item.selectedModifiers ?? []) &&
           (i.seatNumber ?? null) === (itemSeat ?? null)) 
            ? { ...i, qty: i.qty + 1 } 
            : i
        ) 
      });
    } else {
      set({ items: [...items, { 
        ...item, 
        qty: 1, 
        course: item.course ?? 'Mains', 
        prepState: item.prepState ?? 'fired',
        seatNumber: itemSeat
      }] });
    }
  },

  removeItem: (id, selectedModifiers) => {
    if (useGiftCardStore.getState().giftCardCode) {
      useGiftCardStore.getState().clearGiftCard();
    }
    // If selectedModifiers provided, match both id AND modifiers to avoid removing
    // a different variant of the same item (e.g. same dish with different add-ons)
    if (selectedModifiers !== undefined) {
      const modKey = JSON.stringify(selectedModifiers ?? []);
      set({ items: get().items.filter(i => !(i.id === id && JSON.stringify(i.selectedModifiers ?? []) === modKey)) });
    } else {
      set({ items: get().items.filter(i => i.id !== id) });
    }
  },

  updateQty: (id, qty, selectedModifiers) => {
    if (useGiftCardStore.getState().giftCardCode) {
      useGiftCardStore.getState().clearGiftCard();
    }
    if (qty <= 0) { get().removeItem(id, selectedModifiers); return; }
    if (selectedModifiers !== undefined) {
      // Match by both id AND modifiers to avoid updating a different variant
      const modKey = JSON.stringify(selectedModifiers ?? []);
      set({ items: get().items.map(i =>
        (i.id === id && JSON.stringify(i.selectedModifiers ?? []) === modKey) ? { ...i, qty } : i
      )});
    } else {
      set({ items: get().items.map(i => i.id === id ? { ...i, qty } : i) });
    }
  },

  loadOrderToCart: (order) => {
    if (!order) return;
    const rawItems = Array.isArray(order.items) ? order.items : [];
    set({
      items: rawItems.map(i => ({
        id: i.id,
        name: i.name,
        price: Number(i.price) || 0,
        qty: Number(i.qty) || 1,
        selectedModifiers: i.selectedModifiers ?? [],
        modifierTotal: Number(i.modifierTotal) || 0,
        recipe: i.recipe ?? [],
        course: i.course ?? 'Mains',
        prepState: i.prepState ?? 'fired',
        station: i.station ?? 'Kitchen',
        status: i.status ?? 'pending',
        seatNumber: i.seatNumber ?? null
      })),
      orderType: order.type,
      tableId: order.tableId,
      tableName: order.tableName,
      customerName: order.customerName || '',
      customerPhone: order.customerPhone || '',
      note: order.note || '',
      paymentMethod: order.paymentMethod || 'cash',
      editingOrderId: order.id,
      discount: Number(order.discount) || 0,
      discountType: order.discountType ?? 'fixed',
      splitPayments: order.splitPayments ?? [],
      settledChecks: Array.isArray(order.settledChecks) ? order.settledChecks : [],
      upiRef: order.upiRef ?? '',
      tokenNumber: order.token ?? null,
      assignedWaiterId: order.assignedWaiterId ?? null,
      assignedWaiterName: order.assignedWaiterName ?? null
    });
  },

  clearCart: () => {
    clearPersistedCart();
    set({
      items: [], activeSeat: null, settledChecks: [], orderType: 'dine-in', tokenNumber: null, tableId: null, tableName: null,
      customerName: '', customerPhone: '', note: '', editingOrderId: null,
      discount: 0, discountType: 'fixed', splitPayments: [],
      customer: null, redeemingPoints: false,
      tipAmount: 0, upiRef: '', terminalTx: null,
      assignedWaiterId: null, assignedWaiterName: null
    });
    useGiftCardStore.getState().clearGiftCard();
  },

  setItemSeat: (id, seatNumber, selectedModifiers) => {
    const modKey = selectedModifiers !== undefined ? JSON.stringify(selectedModifiers ?? []) : null;
    const seatVal = (seatNumber !== undefined && seatNumber !== null && Number(seatNumber) > 0) ? Number(seatNumber) : null;
    set({
      items: get().items.map(i => {
        if (i.id === id && (modKey === null || JSON.stringify(i.selectedModifiers ?? []) === modKey)) {
          return { ...i, seatNumber: seatVal };
        }
        return i;
      })
    });
  },

  splitItemQty: (id, moveQty, targetSeat, selectedModifiers) => {
    const items = get().items;
    const modKey = selectedModifiers !== undefined ? JSON.stringify(selectedModifiers ?? []) : null;
    const targetIdx = items.findIndex(i => i.id === id && (modKey === null || JSON.stringify(i.selectedModifiers ?? []) === modKey));
    if (targetIdx === -1) return;

    const currentItem = items[targetIdx];
    const totalQty = currentItem.qty || 1;
    const qtyToMove = Math.max(1, Math.min(totalQty - 1, Number(moveQty) || 1));
    if (qtyToMove <= 0 || totalQty <= 1) return;

    const targetSeatVal = (targetSeat !== undefined && targetSeat !== null && Number(targetSeat) > 0) ? Number(targetSeat) : null;
    const updatedRemaining = { ...currentItem, qty: totalQty - qtyToMove };
    const newItem = {
      ...currentItem,
      qty: qtyToMove,
      seatNumber: targetSeatVal
    };

    const newItems = [...items];
    newItems.splice(targetIdx, 1, updatedRemaining, newItem);
    set({ items: newItems });
  },

  setItemDetails: (id, updates = {}, selectedModifiers) => {
    const modKey = selectedModifiers !== undefined ? JSON.stringify(selectedModifiers ?? []) : null;
    set({
      items: get().items.map(i => {
        if (i.id === id && (modKey === null || JSON.stringify(i.selectedModifiers ?? []) === modKey)) {
          return {
            ...i,
            course: updates.course !== undefined ? updates.course : i.course,
            prepState: updates.prepState !== undefined ? updates.prepState : i.prepState,
            seatNumber: updates.seatNumber !== undefined ? updates.seatNumber : i.seatNumber,
            allergies: updates.allergies !== undefined ? updates.allergies : i.allergies,
            itemNote: updates.itemNote !== undefined ? updates.itemNote : (updates.notes !== undefined ? updates.notes : i.itemNote)
          };
        }
        return i;
      })
    });
  },

  fireHeldItems: async (restaurant, course = 'all') => {
    const state = get();
    let updatedCount = 0;
    const newItems = state.items.map(item => {
      const matchCourse = course === 'all' || (item.course && item.course.toLowerCase() === course.toLowerCase());
      if (item.prepState === 'hold' && matchCourse) {
        updatedCount++;
        return { ...item, prepState: 'fired' };
      }
      return item;
    });

    if (updatedCount === 0) return { firedCount: 0 };

    set({ items: newItems });

    // If an existing order is active in Firestore, sync the updated prepState
    if (state.editingOrderId && restaurant?.id) {
      try {
        const orderRef = doc(db, 'restaurants', restaurant.id, 'orders', state.editingOrderId);
        await updateDoc(orderRef, {
          items: newItems,
          updatedAt: serverTimestamp(),
          lastFiredAt: serverTimestamp(),
          lastFiredCourse: course
        });
      } catch (err) {
        console.warn('Failed to update fired course in Firestore:', err);
      }
    }

    return { firedCount: updatedCount, course };
  },

  settleSubCheck: async (restaurant, check, paymentMethod, paymentDetails = {}) => {
    const state = get();
    const orderId = state.editingOrderId;
    const restaurantId = restaurant?.id;
    const staffDoc = useAuthStore.getState().staffDoc;

    const settledEntry = {
      checkId: check.id,
      checkNumber: check.checkNumber,
      title: check.title,
      seatNumber: check.seatNumber ?? null,
      items: (check.items || []).map(i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        qty: i.qty,
        selectedModifiers: i.selectedModifiers ?? [],
        seatNumber: i.seatNumber ?? null
      })),
      subtotal: check.subtotal,
      taxTotal: check.taxTotal || 0,
      serviceChargeAmount: check.serviceChargeAmount || 0,
      discountAmount: check.discountAmount || 0,
      total: check.total,
      paymentMethod,
      paidAt: new Date().toISOString(),
      staffId: staffDoc?.id || null,
      staffName: staffDoc?.name || 'Staff',
      ...paymentDetails
    };

    const updatedSettled = [...(state.settledChecks || []), settledEntry];
    set({ settledChecks: updatedSettled });

    if (paymentMethod !== 'unpaid') {
      useShiftStore.getState().applySaleToActiveShift({
        total: check.total,
        method: paymentMethod
      });
    }

    if (orderId && restaurantId) {
      try {
        await useAuthStore.getState().ensureAnonymousAuth();
        const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
        await updateDoc(orderRef, {
          settledChecks: updatedSettled,
          updatedAt: serverTimestamp()
        });

        set(s => ({
          activeOrders: (s.activeOrders || []).map(o => o.id === orderId ? { ...o, settledChecks: updatedSettled } : o)
        }));

        localSyncChannel.broadcast('LOCAL_ORDER_UPDATED', {
          orderId,
          partial: { settledChecks: updatedSettled },
          restaurantId
        });
      } catch (e) {
        console.warn('[settleSubCheck] Remote sync deferred:', e?.message);
      }
    }

    return { ok: true, settledEntry, settledChecks: updatedSettled };
  },

  setOrderType:    (t) => set({ orderType: t }),
  setTable:        (id, name) => set({ tableId: id, tableName: name }),
  setToken:        (n) => set({ tokenNumber: n }),
  setCustomer:     (name, phone) => set({ customerName: name, customerPhone: phone }),
  setNote:         (note) => set({ note }),
  setPaymentMethod:(m) => set({ paymentMethod: m }),
  setSplitPayments:(splits) => set({ splitPayments: splits }),
  setDiscount:     (discount, discountType = 'fixed') => {
    if (useGiftCardStore.getState().giftCardCode) {
      useGiftCardStore.getState().clearGiftCard();
    }
    set({ discount, discountType });
  },
  setCustomerProfile:(c) => set({ customer: c }),
  setRedeemingPoints:(r) => set({ redeemingPoints: r }),
  setTip: (amt) => {
    // Changing the tip changes the total, which makes any applied gift card deduction stale
    if (useGiftCardStore.getState().giftCardCode) {
      useGiftCardStore.getState().clearGiftCard();
    }
    set({ tipAmount: Math.max(0, Math.round(amt * 100) / 100) });
  },
  setUpiRef: (upiRef) => set({ upiRef }),
  setTerminalTx: (tx) => set({ terminalTx: tx }),



  setItemCourse: (id, course) => set({
    items: get().items.map(i => i.id === id ? { ...i, course } : i)
  }),

  toggleItemHold: (id) => set({
    items: get().items.map(i => i.id === id ? { ...i, prepState: i.prepState === 'hold' ? 'fired' : 'hold' } : i)
  }),

  fireCourse: async (restaurantId, orderId, courseName) => {
    try {
      await useAuthStore.getState().ensureAnonymousAuth();
      const docRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return { ok: false, error: 'Order not found' };
      const order = snap.data();
      const updatedItems = order.items.map(i => {
        if (i.course === courseName && i.prepState === 'hold') {
          return { ...i, prepState: 'fired' };
        }
        return i;
      });
      await updateDoc(docRef, { items: updatedItems });
      
      const activeEditingId = get().editingOrderId;
      if (activeEditingId === orderId) {
        set({
          items: get().items.map(i => {
            if (i.course === courseName && i.prepState === 'hold') {
              return { ...i, prepState: 'fired' };
            }
            return i;
          })
        });
      }
      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  },

  transferTable: async (restaurantId, sourceTableId, targetTableId, orderId, targetTableName) => {
    try {
      const isOffline = typeof orderId === 'string' && orderId.startsWith('offline_');
      const isLocalOnly = Boolean(useAuthStore.getState().restaurant?.localStorageOnly);
      const isNetworkOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      if (!isOffline && !isLocalOnly && !isNetworkOffline) {
        try {
          await useAuthStore.getState().ensureAnonymousAuth();
          const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
          await updateDoc(orderRef, {
            tableId: targetTableId,
            tableName: targetTableName
          });
        } catch (cloudErr) {
          console.warn('[transferTable] Cloud transfer deferred, transferring locally:', cloudErr?.message);
        }
      }

      // Update in offline queue if present
      const queue = useOfflineQueueStore.getState().queue || [];
      if (queue.some(o => o.id === orderId)) {
        const updatedQueue = queue.map(o => o.id === orderId ? {
          ...o,
          tableId: targetTableId,
          tableName: targetTableName
        } : o);
        useOfflineQueueStore.setState({ queue: updatedQueue });
        try {
          localStorage.setItem('dineos_offline_order_queue', JSON.stringify(updatedQueue));
        } catch {}
      }

      // Update in activeOrders locally & broadcast to other tabs
      set(s => ({
        activeOrders: (s.activeOrders || []).map(o => o.id === orderId ? {
          ...o,
          tableId: targetTableId,
          tableName: targetTableName
        } : o)
      }));
      localSyncChannel.broadcast('LOCAL_ORDER_UPDATED', {
        orderId,
        partial: { tableId: targetTableId, tableName: targetTableName },
        restaurantId
      });

      await useTableStore.getState().setTableStatus(restaurantId, targetTableId, 'occupied', orderId);
      await useTableStore.getState().freeTable(restaurantId, sourceTableId);

      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  },

  mergeTables: async (restaurantId, primaryTableId, secondaryTableId, primaryOrderId, secondaryOrderId) => {
    try {
      const isOffline = (typeof primaryOrderId === 'string' && primaryOrderId.startsWith('offline_')) ||
                        (typeof secondaryOrderId === 'string' && secondaryOrderId.startsWith('offline_'));
      const isLocalOnly = Boolean(useAuthStore.getState().restaurant?.localStorageOnly);
      const isNetworkOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      let primaryOrder = null;
      let secondaryOrder = null;

      // 1. Try resolving from active orders in memory first
      const active = get().activeOrders || [];
      primaryOrder = active.find(o => o.id === primaryOrderId) || null;
      secondaryOrder = active.find(o => o.id === secondaryOrderId) || null;

      // 2. If online and not local-only, fetch from Firestore if missing
      if (!isOffline && !isLocalOnly && !isNetworkOffline) {
        try {
          await useAuthStore.getState().ensureAnonymousAuth();
          const primaryOrderRef = doc(db, 'restaurants', restaurantId, 'orders', primaryOrderId);
          const secondaryOrderRef = doc(db, 'restaurants', restaurantId, 'orders', secondaryOrderId);

          const [primarySnap, secondarySnap] = await Promise.all([
            getDoc(primaryOrderRef),
            getDoc(secondaryOrderRef)
          ]);

          if (primarySnap.exists()) primaryOrder = primarySnap.data();
          if (secondarySnap.exists()) secondaryOrder = secondarySnap.data();
        } catch (cloudErr) {
          console.warn('[mergeTables] Cloud fetch deferred, using local memory:', cloudErr?.message);
        }
      }

      // Fallback: check offline queue
      if (!primaryOrder || !secondaryOrder) {
        const queue = useOfflineQueueStore.getState().queue || [];
        if (!primaryOrder) primaryOrder = queue.find(o => o.id === primaryOrderId) || null;
        if (!secondaryOrder) secondaryOrder = queue.find(o => o.id === secondaryOrderId) || null;
      }

      if (!primaryOrder || !secondaryOrder) {
        return { ok: false, error: 'One or both orders not found' };
      }

      const mergedItems = [...(primaryOrder.items || [])];

      (secondaryOrder.items || []).forEach(secItem => {
        const existing = mergedItems.find(pItem => 
          pItem.id === secItem.id && 
          JSON.stringify(pItem.selectedModifiers) === JSON.stringify(secItem.selectedModifiers)
        );
        if (existing) {
          existing.qty += secItem.qty;
        } else {
          mergedItems.push(secItem);
        }
      });

      const subtotal = mergedItems.reduce((sum, i) => sum + i.price * i.qty, 0);
      
      let discountAmount = 0;
      if (primaryOrder.discount > 0) {
        if (primaryOrder.discountType === 'percent') {
          discountAmount = (subtotal * primaryOrder.discount) / 100;
        } else {
          discountAmount = primaryOrder.discount;
        }
      }
      
      const pointsDiscount = primaryOrder.pointsDiscount ?? 0;
      const baseTaxable = Math.max(0, subtotal - discountAmount - pointsDiscount);
      
      const rest = useAuthStore.getState().restaurant;
      const serviceChargeRate = rest?.serviceChargeRate ?? 0;
      const serviceChargeAmt = serviceChargeRate > 0
        ? Math.round(((baseTaxable * serviceChargeRate) / 100) * 100) / 100
        : 0;

      let taxableAmountForTax = baseTaxable;
      if (rest?.serviceChargeTaxable === 'yes') {
        taxableAmountForTax += serviceChargeAmt;
      }

      const categories = useMenuStore.getState().categories || [];
      const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c]));
      const taxRes = computeTax(taxableAmountForTax, rest?.taxConfig ?? { type: 'none', rate: 0 }, {
        items: mergedItems,
        categoriesMap,
        discountAmount,
        pointsDiscount,
        serviceChargeAmount: serviceChargeAmt,
        serviceChargeTaxable: rest?.serviceChargeTaxable === 'yes',
        orderType: primaryOrder.type || 'dine-in'
      });
      const tipAmt = primaryOrder.tipAmount ?? 0;
      const taxToAdd = taxRes.mode === 'inclusive' ? 0 : (Number(taxRes.taxTotal) || 0);
      const totalBeforeGiftCard = baseTaxable + taxToAdd + serviceChargeAmt + tipAmt;
      const giftCardDeduction = primaryOrder.giftCardDeduction ?? 0;
      const total = Math.max(0, totalBeforeGiftCard - giftCardDeduction);

      const mergedUpdates = {
        items: mergedItems,
        subtotal,
        discountAmount,
        serviceChargeAmount: serviceChargeAmt,
        taxInfo: taxRes,
        taxTotal: taxRes.taxTotal,
        total,
        updatedAt: new Date().toISOString()
      };

      // Cloud update if online and not an offline order
      if (!isOffline && !isLocalOnly && !isNetworkOffline) {
        try {
          const primaryOrderRef = doc(db, 'restaurants', restaurantId, 'orders', primaryOrderId);
          const secondaryOrderRef = doc(db, 'restaurants', restaurantId, 'orders', secondaryOrderId);
          await updateDoc(primaryOrderRef, { ...mergedUpdates, updatedAt: serverTimestamp() });
          await updateDoc(secondaryOrderRef, {
            status: 'merged',
            mergedIntoOrderId: primaryOrderId,
            updatedAt: serverTimestamp()
          });
        } catch (cloudErr) {
          console.warn('[mergeTables] Cloud update deferred, merged locally:', cloudErr?.message);
        }
      }

      // Update in activeOrders locally & broadcast to other tabs
      set(s => ({
        activeOrders: (s.activeOrders || []).map(o => {
          if (o.id === primaryOrderId) return { ...o, ...mergedUpdates };
          if (o.id === secondaryOrderId) return { ...o, status: 'merged', mergedIntoOrderId: primaryOrderId };
          return o;
        })
      }));

      localSyncChannel.broadcast('LOCAL_ORDER_UPDATED', {
        orderId: primaryOrderId,
        partial: mergedUpdates,
        restaurantId
      });
      localSyncChannel.broadcast('LOCAL_ORDER_STATUS_CHANGED', {
        orderId: secondaryOrderId,
        status: 'merged',
        restaurantId
      });

      // Update in offline queue if present
      const queue = useOfflineQueueStore.getState().queue || [];
      if (queue.some(o => o.id === primaryOrderId || o.id === secondaryOrderId)) {
        const updatedQueue = queue.map(o => {
          if (o.id === primaryOrderId) return { ...o, ...mergedUpdates };
          if (o.id === secondaryOrderId) return { ...o, status: 'merged', mergedIntoOrderId: primaryOrderId };
          return o;
        });
        useOfflineQueueStore.setState({ queue: updatedQueue });
        try {
          localStorage.setItem('dineos_offline_order_queue', JSON.stringify(updatedQueue));
        } catch {}
      }

      await useTableStore.getState().freeTable(restaurantId, secondaryTableId);

      const currentEditingId = get().editingOrderId;
      if (currentEditingId === primaryOrderId || currentEditingId === secondaryOrderId) {
        get().clearCart();
      }

      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  },

  // ── Totals ───────────────────────────────────────────────
  getSubtotal: () => get().items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 0), 0),

  getDiscountAmount: () => {
    const { discount, discountType } = get();
    if (!discount || discount <= 0) return 0;
    const subtotal = get().getSubtotal();
    if (discountType === 'percent') {
      const effectiveRate = Math.min(Math.max(0, discount), 100);
      return Math.round(((subtotal * effectiveRate) / 100) * 100) / 100;
    }
    return Math.min(Math.max(0, discount), subtotal);
  },

  getPointsDiscountAmount: () => {
    const { customer, redeemingPoints } = get();
    if (!redeemingPoints || !customer?.points) return 0;
    const subtotal = get().getSubtotal();
    const discountAmt = get().getDiscountAmount();
    const taxableBeforePoints = Math.max(0, subtotal - discountAmt);
    const maxRedeemValue = customer.points / 10;
    return Math.min(maxRedeemValue, taxableBeforePoints);
  },

  getServiceChargeAmount: (restaurant) => {
    const rate = restaurant?.serviceChargeRate ?? 0;
    if (!rate) return 0;
    const subtotal = get().getSubtotal();
    const discountAmt = get().getDiscountAmount();
    const pointsDiscount = get().getPointsDiscountAmount();
    const taxableAmount = Math.max(0, subtotal - discountAmt - pointsDiscount);
    return Math.round(((taxableAmount * rate) / 100) * 100) / 100;
  },

  getTaxInfo: (restaurant) => {
    const subtotal = get().getSubtotal();
    const discountAmt = get().getDiscountAmount();
    const pointsDiscount = get().getPointsDiscountAmount();
    const serviceChargeAmt = get().getServiceChargeAmount(restaurant);
    const serviceChargeTaxable = restaurant?.serviceChargeTaxable === 'yes';

    const items = get().items || [];
    const categories = useMenuStore.getState().categories || [];
    const categoriesMap = Object.fromEntries(categories.map(c => [c.id, c]));

    return computeTax(subtotal, restaurant?.taxConfig ?? { type: 'none', rate: 0 }, {
      items,
      categoriesMap,
      discountAmount: discountAmt,
      pointsDiscount,
      serviceChargeAmount: serviceChargeAmt,
      serviceChargeTaxable,
      orderType: get().orderType || 'dine-in'
    });
  },

  getSettledTotal: () => {
    const settled = get().settledChecks || [];
    const sum = settled.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
    return Math.round(sum * 100) / 100;
  },

  getRemainingTotal: (restaurant) => {
    const total = get().getTotal(restaurant);
    const settled = get().getSettledTotal();
    return Math.max(0, Math.round((total - settled) * 100) / 100);
  },

  getTotal: (restaurant) => {
    const subtotal = get().getSubtotal();
    const discountAmt = get().getDiscountAmount();
    const pointsDiscount = get().getPointsDiscountAmount();
    const serviceChargeAmt = get().getServiceChargeAmount(restaurant);
    const baseTaxable = Math.max(0, subtotal - discountAmt - pointsDiscount);

    const taxRes = get().getTaxInfo(restaurant);
    const tipAmt = Number(get().tipAmount) || 0;
    const taxToAdd = taxRes?.mode === 'inclusive' ? 0 : (Number(taxRes?.taxTotal) || 0);
    const totalBeforeGiftCard = baseTaxable + taxToAdd + (Number(serviceChargeAmt) || 0) + tipAmt;
    const giftCardDeduction = Number(useGiftCardStore.getState().giftCardDeduction) || 0;
    return Math.max(0, Math.round((totalBeforeGiftCard - giftCardDeduction) * 100) / 100);
  },

  // ── Submit Order ─────────────────────────────────────────
  submitOrder: async (restaurant, staffId) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    const { items, orderType, tableId, tableName, tokenNumber, customerName, customerPhone, note, paymentMethod, splitPayments, discount, discountType, editingOrderId, customer, redeemingPoints, tipAmount, upiRef } = get();
    const { giftCardCode, giftCardDeduction, giftCardBalance } = useGiftCardStore.getState();
    if (!items.length) return { ok: false, error: 'Cart is empty' };

    const subtotal = get().getSubtotal();
    const discountAmount = get().getDiscountAmount();
    const pointsDiscount = get().getPointsDiscountAmount();
    const serviceChargeAmount = get().getServiceChargeAmount(restaurant);
    const taxInfo = get().getTaxInfo(restaurant);
    const taxTotal = Number(taxInfo?.taxTotal) || 0;
    const total    = get().getTotal(restaurant);

    const isPaid = paymentMethod !== 'unpaid';
    const currentStaffDoc = useAuthStore.getState().staffDoc;
    const currentStaffRole = currentStaffDoc?.role;
    const isCurrentStaffWaiter = ['waiter', 'server'].includes(currentStaffRole);
    const cartWaiterId = get().assignedWaiterId;
    const cartWaiterName = get().assignedWaiterName;

    const effectiveWaiterId = isCurrentStaffWaiter
      ? (currentStaffDoc?.id ?? null)
      : (cartWaiterId ?? null);
    const effectiveWaiterName = isCurrentStaffWaiter
      ? (currentStaffDoc?.name ?? null)
      : (cartWaiterName ?? null);

    const orderData = {
      type: orderType,
      status: 'pending',
      paid: isPaid,
      items: items.map(i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        qty: i.qty,
        selectedModifiers: i.selectedModifiers ?? [],
        modifierTotal: i.modifierTotal ?? 0,
        recipe: i.recipe ?? [],
        station: i.station ?? 'Kitchen',
        status: i.status ?? 'pending',
        course: i.course ?? 'Mains',
        prepState: i.prepState ?? 'fired',
        seatNumber: i.seatNumber ?? null
      })),
      settledChecks: get().settledChecks ?? [],
      subtotal,
      discount,
      discountType,
      discountAmount,
      pointsDiscount,
      serviceChargeRate: restaurant?.serviceChargeRate ?? 0,
      serviceChargeAmount,
      tipAmount,
      taxInfo,
      taxTotal,
      total,
      paymentMethod,
      tableId: tableId ?? null,
      tableName: tableName ?? null,
      token: tokenNumber ?? null,
      customerName: customerName || (customer?.name ?? ''),
      customerPhone: customerPhone || (customer?.phone ?? ''),
      loyaltyEarned: Math.floor(total / 10),
      loyaltyRedeemed: redeemingPoints && customer ? Math.round(pointsDiscount * 10) : 0,
      note,
      staffId: staffId ?? (currentStaffDoc?.id ?? null),
      staffName: currentStaffDoc?.name ?? null,
      assignedWaiterId: effectiveWaiterId,
      assignedWaiterName: effectiveWaiterName,
      createdAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
      paidAt: isPaid ? serverTimestamp() : null,
      currency: restaurant?.currency ?? 'INR',
    };

    if (giftCardCode && giftCardDeduction > 0) {
      orderData.giftCardCode = giftCardCode;
      orderData.giftCardDeduction = giftCardDeduction;
    }

    if (paymentMethod === 'upi') {
      if (upiRef) {
        orderData.upiRef = upiRef;
      }
    } else if (paymentMethod === 'split') {
      orderData.splitPayments = splitPayments ?? [];
    } else if (paymentMethod === 'terminal' || paymentMethod === 'card') {
      const { terminalTx } = get();
      if (terminalTx) {
        orderData.terminalTx = terminalTx;
        if (terminalTx.rrn) orderData.rrn = terminalTx.rrn;
        if (terminalTx.authCode) orderData.authCode = terminalTx.authCode;
        if (terminalTx.paymentMethodUsed) orderData.terminalMethod = terminalTx.paymentMethodUsed;
      }
    }

    // Zero-Downtime Fast Path: True network outage, paid sales transaction in Local-Only mode, or editing an existing offline order
    const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isTrueNetworkOffline = isBrowser && (navigator.onLine === false || useOfflineQueueStore.getState().isOnline === false);
    const isOfflineEditing = Boolean(editingOrderId && typeof editingOrderId === 'string' && editingOrderId.startsWith('offline_'));

    // In Local-Only Mode, paid sales data stays 100% on device, while kitchen tickets (unpaid) sync to KDS
    const isLocalOnlySale = isLocalOnly && isPaid;

    if (isTrueNetworkOffline || isLocalOnlySale || isOfflineEditing) {
      if (editingOrderId) {
        orderData.id = editingOrderId;
      }
      const offlineRes = useOfflineQueueStore.getState().enqueueOrder(orderData, restaurant);
      const localActiveOrder = {
        ...orderData,
        id: offlineRes.orderId,
        token: offlineRes.token,
        isOffline: true,
        createdAt: new Date().toISOString(),
      };
      set(s => ({
        activeOrders: editingOrderId
          ? (s.activeOrders || []).map(o => o.id === editingOrderId ? localActiveOrder : o)
          : [localActiveOrder, ...(s.activeOrders || [])]
      }));
      localSyncChannel.broadcast(editingOrderId ? 'LOCAL_ORDER_UPDATED' : 'LOCAL_ORDER_CREATED', {
        orderId: offlineRes.orderId,
        order: localActiveOrder,
        partial: localActiveOrder,
        restaurantId: restaurant?.id
      });

      // Immediately occupy or free table locally if dine-in
      if (orderType === 'dine-in' && tableId) {
        useTableStore.getState().setTableStatus(
          restaurant?.id,
          tableId,
          isPaid ? 'free' : 'occupied',
          isPaid ? null : offlineRes.orderId
        );
      }

      get().clearCart();
      return { ok: true, orderId: offlineRes.orderId, isOffline: true, token: offlineRes.token };
    }

    try {
      let orderId = editingOrderId;
      
      // Calculate shift updates
      const activeShift = useShiftStore.getState().activeShift;
      let shiftUpdate = null;
      if (activeShift?.id && paymentMethod !== 'unpaid') {
        const settledTotal = get().getSettledTotal();
        const val = settledTotal > 0 ? Math.max(0, Math.round((total - settledTotal) * 100) / 100) : total;
        shiftUpdate = {
          totalSalesAmount: increment(val)
        };
        
        if (paymentMethod === 'cash') {
          shiftUpdate.cashSalesCount = increment(1);
          shiftUpdate.cashSalesAmount = increment(val);
          shiftUpdate.expectedCash = increment(val);
        } else if (paymentMethod === 'card' || paymentMethod === 'terminal') {
          shiftUpdate.cardSalesCount = increment(1);
          shiftUpdate.cardSalesAmount = increment(val);
        } else if (paymentMethod === 'upi') {
          shiftUpdate.upiSalesCount = increment(1);
          shiftUpdate.upiSalesAmount = increment(val);
        } else if (paymentMethod === 'split') {
          let cashCount = 0;
          let cashAmt = 0;
          let cardCount = 0;
          let cardAmt = 0;
          let upiCount = 0;
          let upiAmt = 0;
          
          const splits = splitPayments ?? [];
          splits.forEach(p => {
            const m = p.method ?? 'cash';
            const amt = p.amount ?? 0;
            if (m === 'cash') {
              cashCount += 1;
              cashAmt += amt;
            } else if (m === 'card' || m === 'terminal') {
              cardCount += 1;
              cardAmt += amt;
            } else if (m === 'upi') {
              upiCount += 1;
              upiAmt += amt;
            }
          });
          
          if (cashCount > 0) {
            shiftUpdate.cashSalesCount = increment(cashCount);
            shiftUpdate.cashSalesAmount = increment(cashAmt);
            shiftUpdate.expectedCash = increment(cashAmt);
          }
          if (cardCount > 0) {
            shiftUpdate.cardSalesCount = increment(cardCount);
            shiftUpdate.cardSalesAmount = increment(cardAmt);
          }
          if (upiCount > 0) {
            shiftUpdate.upiSalesCount = increment(upiCount);
            shiftUpdate.upiSalesAmount = increment(upiAmt);
          }
        }

        // Apply immediately to local activeShift for instant X/Z report & till drawer accuracy
        useShiftStore.getState().applySaleToActiveShift({
          total,
          method: paymentMethod,
          splitPayments
        });
      }

      if (editingOrderId) {
        // Fetch previous order state to compute ingredient diffs
        const oldOrderRef = doc(db, 'restaurants', restaurant.id, 'orders', editingOrderId);
        const oldOrderSnap = await getDoc(oldOrderRef);
        const oldItems = oldOrderSnap.exists() ? (oldOrderSnap.data().items || []) : [];

        // Preserve original waiter assignment if cashier/admin edits order and had one
        if (!isCurrentStaffWaiter && oldOrderSnap.exists()) {
          const oldData = oldOrderSnap.data();
          if (oldData.assignedWaiterId && !orderData.assignedWaiterId) {
            orderData.assignedWaiterId = oldData.assignedWaiterId;
            orderData.assignedWaiterName = oldData.assignedWaiterName || null;
          }
        }

        const batch = writeBatch(db);
        batch.update(oldOrderRef, orderData);

        if (shiftUpdate) {
          const shiftRef = doc(db, 'restaurants', restaurant.id, 'shifts', activeShift.id);
          batch.update(shiftRef, shiftUpdate);
        }

        // Deduct from gift card balance in Firestore (batch write)
        if (giftCardCode && giftCardDeduction > 0) {
          const newBalance = Math.max(0, giftCardBalance - giftCardDeduction);
          const gcRef = doc(db, 'restaurants', restaurant.id, 'gift_cards', giftCardCode);
          batch.update(gcRef, {
            balance: newBalance,
            status: newBalance <= 0.01 ? 'redeemed' : 'active',
            updatedAt: serverTimestamp()
          });
        }

        // Calculate and apply ingredient stock difference
        const getIngredientUsageMap = (itemsList) => {
          const map = {};
          for (const item of itemsList) {
            const recipe = item.recipe ?? [];
            for (const recipeItem of recipe) {
              if (recipeItem.ingredientId && recipeItem.amount) {
                const qty = item.qty ?? 0;
                const amt = recipeItem.amount * qty;
                map[recipeItem.ingredientId] = (map[recipeItem.ingredientId] ?? 0) + amt;
              }
            }
          }
          return map;
        };

        const oldUsage = getIngredientUsageMap(oldItems);
        const newUsage = getIngredientUsageMap(items);

        // Merge ingredient keys
        const allIngredientIds = new Set([
          ...Object.keys(oldUsage),
          ...Object.keys(newUsage)
        ]);

        for (const ingredientId of allIngredientIds) {
          const oldAmt = oldUsage[ingredientId] ?? 0;
          const newAmt = newUsage[ingredientId] ?? 0;
          const diff = newAmt - oldAmt;
          if (diff !== 0) {
            const ingRef = doc(db, 'restaurants', restaurant.id, 'inventory', ingredientId);
            batch.set(ingRef, {
              qty: increment(-diff)
            }, { merge: true });
          }
        }

        // Update customer profile with loyalty points, visit counts, and lifetime spends if paying now and wasn't paid before
        if (customer && isPaid) {
          const oldWasPaid = oldOrderSnap.exists() && (oldOrderSnap.data().paid === true || (oldOrderSnap.data().paymentMethod && oldOrderSnap.data().paymentMethod !== 'unpaid'));
          if (!oldWasPaid) {
            const pointsEarned = orderData.loyaltyEarned ?? 0;
            const pointsRedeemed = orderData.loyaltyRedeemed ?? 0;
            const custDocRef = doc(db, 'restaurants', restaurant.id, 'customers', customer.phone);
            batch.update(custDocRef, {
              visitCount: increment(1),
              lifetimeSpend: increment(total),
              points: increment(pointsEarned - pointsRedeemed)
            });
          }
        }

        if (orderType === 'dine-in' && tableId) {
          const tableRef = doc(db, 'restaurants', restaurant.id, 'tables', tableId);
          batch.set(tableRef, isPaid ? {
            status: 'free',
            currentOrderId: null
          } : {
            status: 'occupied',
            currentOrderId: orderId
          }, { merge: true });
        }

        await batch.commit();
      } else {
        orderData.createdAt = serverTimestamp();
        const batch = writeBatch(db);
        
        // Auto-generate doc ID for new order reference
        const orderDocRef = doc(collection(db, 'restaurants', restaurant.id, 'orders'));
        orderId = orderDocRef.id;

        // Add new order write to batch with status pending for security rule compatibility
        batch.set(orderDocRef, { ...orderData, status: 'pending' });

        if (shiftUpdate) {
          const shiftRef = doc(db, 'restaurants', restaurant.id, 'shifts', activeShift.id);
          batch.update(shiftRef, shiftUpdate);
        }
        
        // Deplete stock levels for each ingredient in the recipe
        for (const item of items) {
          const recipe = item.recipe ?? [];
          for (const recipeItem of recipe) {
            if (recipeItem.ingredientId && recipeItem.amount) {
              const ingDocRef = doc(db, 'restaurants', restaurant.id, 'inventory', recipeItem.ingredientId);
              batch.set(ingDocRef, {
                qty: increment(-recipeItem.amount * item.qty)
              }, { merge: true });
            }
          }
        }

        // Update customer profile with loyalty points, visit counts, and lifetime spends ONLY if paid immediately
        if (customer && isPaid) {
          const pointsEarned = orderData.loyaltyEarned ?? 0;
          const pointsRedeemed = orderData.loyaltyRedeemed ?? 0;
          const custDocRef = doc(db, 'restaurants', restaurant.id, 'customers', customer.phone);
          batch.update(custDocRef, {
            visitCount: increment(1),
            lifetimeSpend: increment(total),
            points: increment(pointsEarned - pointsRedeemed)
          });
        }

        // Deduct from gift card balance in Firestore (batch write)
        if (giftCardCode && giftCardDeduction > 0) {
          const newBalance = Math.max(0, giftCardBalance - giftCardDeduction);
          const gcRef = doc(db, 'restaurants', restaurant.id, 'gift_cards', giftCardCode);
          batch.update(gcRef, {
            balance: newBalance,
            status: newBalance <= 0.01 ? 'redeemed' : 'active',
            updatedAt: serverTimestamp()
          });
        }

        if (orderType === 'dine-in' && tableId) {
          const tableRef = doc(db, 'restaurants', restaurant.id, 'tables', tableId);
          batch.set(tableRef, isPaid ? {
            status: 'free',
            currentOrderId: null
          } : {
            status: 'occupied',
            currentOrderId: orderId
          }, { merge: true });
        }

        await batch.commit();
      }

      // Optimistically push order into activeOrders so KDS and table views receive it immediately
      const nowIso = new Date().toISOString();
      const newActiveOrder = {
        ...orderData,
        id: orderId,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      set(s => {
        const existing = s.activeOrders || [];
        if (existing.some(o => o.id === orderId)) {
          return { activeOrders: existing.map(o => o.id === orderId ? { ...o, ...newActiveOrder } : o) };
        }
        return { activeOrders: [newActiveOrder, ...existing] };
      });
      localSyncChannel.broadcast('LOCAL_ORDER_CREATED', {
        order: newActiveOrder,
        restaurantId: restaurant?.id
      });

      get().clearCart();
      return { ok: true, orderId };
    } catch (e) {
      console.warn('submitOrder error encountered, evaluating offline recovery:', e);
      // Auto-recover if error was due to network disconnect, timeout, or firestore unavailability
      const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
      const isOfflineError = (isBrowser && navigator.onLine === false) ||
        /offline|network|unavailable|failed to fetch|timeout|deadline|failed-precondition/i.test(e.message || '');
      if (isOfflineError) {
        const safeOrderData = {
          ...orderData,
          createdAt: (typeof orderData.createdAt === 'string' && !isNaN(new Date(orderData.createdAt).getTime()))
            ? orderData.createdAt
            : new Date().toISOString()
        };
        const offlineRes = useOfflineQueueStore.getState().enqueueOrder(safeOrderData, restaurant);
        const localActiveOrder = {
          ...safeOrderData,
          id: offlineRes.orderId,
          token: offlineRes.token,
          isOffline: true,
        };
        set(s => ({
          activeOrders: [localActiveOrder, ...(s.activeOrders || [])]
        }));
        localSyncChannel.broadcast('LOCAL_ORDER_CREATED', {
          order: localActiveOrder,
          restaurantId: restaurant?.id
        });
        get().clearCart();
        return { ok: true, orderId: offlineRes.orderId, isOffline: true, token: offlineRes.token };
      }
      return { ok: false, error: e.message };
    }
  },

  // ── Real-time Order Listeners ────────────────────────────
  subscribeActiveOrders: (restaurantId) => {
    if (!restaurantId) return () => {};

    // Reuse existing listener if already subscribed to this restaurant
    if (subscribedOrdersRestId === restaurantId && activeOrdersUnsub) {
      ordersSubCount++;
      return () => {
        ordersSubCount--;
        if (ordersSubCount <= 0 && activeOrdersUnsub) {
          activeOrdersUnsub();
          activeOrdersUnsub = null;
          subscribedOrdersRestId = null;
          ordersSubCount = 0;
        }
      };
    }

    // Clean up previous subscription if switching restaurants
    if (activeOrdersUnsub) {
      activeOrdersUnsub();
      activeOrdersUnsub = null;
      ordersSubCount = 0;
    }

    subscribedOrdersRestId = restaurantId;
    ordersSubCount = 1;

    // In local mode or offline, merge active orders from local offline queue immediately
    const localQueue = useOfflineQueueStore.getState().queue || [];
    const activeLocalOrders = localQueue.filter(o => 
      (!o.restaurantId || o.restaurantId === restaurantId) &&
      ['pending', 'preparing', 'ready'].includes(o.status || 'pending')
    );
    if (activeLocalOrders.length > 0) {
      set(s => {
        const existing = s.activeOrders || [];
        const merged = [...existing];
        activeLocalOrders.forEach(loc => {
          if (!merged.some(m => m.id === loc.id)) {
            merged.push({
              ...loc,
              createdAt: loc.createdAt || loc.offlineQueuedAt || new Date().toISOString()
            });
          }
        });
        return { activeOrders: merged };
      });
    }

    const q = query(
      collection(db, 'restaurants', restaurantId, 'orders'),
      where('status', 'in', ['pending', 'preparing', 'ready']),
      limit(100)
    );
    let isInitial = true;
    const unsub = onSnapshot(q, snap => {
      const rawOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Sort in memory by createdAt descending to avoid composite index requirement
      const orders = rawOrders.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });
      const online = orders.filter(o => o.type === 'online');

      // Play chime and show toast notifications for order events
      if (!isInitial) {
        snap.docChanges().forEach(change => {
          const data = change.doc.data();
          const orderId = change.doc.id;

          const playChime = () => {
            try {
              const audio = new Audio('/sounds/order-chime.wav');
              audio.play().catch(e => console.log('Chime playback blocked/failed:', e));
            } catch (err) {
              console.warn('Failed to play order chime:', err);
            }
          };

          if (change.type === 'added') {
            // New Online Order (Pending)
            if (data.type === 'online' && data.status === 'pending') {
              playChime();
              toast('🔔 New online order received!', { duration: 6000 });
            }
            // New POS/Dine-In/Takeaway Order placed by another terminal/waiter
            else if (data.status === 'pending') {
              playChime();
              const orderDesc = data.tableName ? `Table ${data.tableName}` : `Order #${orderId.slice(-4).toUpperCase()}`;
              toast(`🍽️ New order placed for ${orderDesc}!`, { duration: 5000 });
            }
          }

          if (change.type === 'modified') {
            // Check if status transitioned to 'ready' (prepared by kitchen)
            if (data.status === 'ready') {
              const notified = get().notifiedReadyOrders || [];
              if (!notified.includes(orderId)) {
                set({ notifiedReadyOrders: [...notified, orderId] });

                const currentRest = useAuthStore.getState().restaurant;
                const currentStaff = useAuthStore.getState().staffDoc;
                const currentRole = currentStaff?.role ?? 'admin';
                if (currentRole === 'kitchen') return;
                const notifConfig = currentRest?.notifications ?? {};

                const tone = notifConfig.readySoundTone || 'reception-bell';
                const isCashier = ['cashier', 'admin', 'super_admin'].includes(currentRole);
                const isWaiter = ['waiter', 'admin', 'super_admin'].includes(currentRole);

                const shouldPlayCashier = isCashier && notifConfig.cashierFoodReadyChime !== false;
                const shouldPlayWaiter = isWaiter && notifConfig.waiterFoodReadyChime !== false;

                if (shouldPlayCashier || shouldPlayWaiter) {
                  playNotificationTone(tone, 0.6);
                  if (notifConfig.vibrateOnReady !== false) {
                    vibrateDevice([200, 100, 200]);
                  }
                } else {
                  playChime();
                }

                const orderDesc = data.tableName ? `Table ${data.tableName}` : `Takeaway #${orderId.slice(-4).toUpperCase()}`;
                const waiterAttribution = data.assignedWaiterName ? ` · Server: ${data.assignedWaiterName}` : '';
                toast.success(`🍳 ${orderDesc} is READY to serve!${waiterAttribution}`, { duration: 6000, icon: '🔔' });
              }
            }
          }

          if (change.type === 'removed') {
            const wasCancelledLocally = localCancelledOrderIds.has(orderId);
            if (wasCancelledLocally) {
              localCancelledOrderIds.delete(orderId);
            } else if (data.status === 'cancelled') {
              playChime();
              const orderDesc = data.tableName ? `Table ${data.tableName}` : `Order #${orderId.slice(-4).toUpperCase()}`;
              toast.error(`❌ ${orderDesc} has been CANCELLED!`, { duration: 6000 });
            }
          }
        });
      }
      isInitial = false;

      const readArr = get().readOnlineOrderIds || [];
      set(s => {
        const localBuffered = (s.activeOrders || []).filter(o => o.isOffline && !orders.some(rem => rem.id === o.id));
        return {
          activeOrders: [...localBuffered, ...orders],
          onlineOrders: online,
          unreadOnlineCount: online.filter(o => o.status === 'pending' && !readArr.includes(o.id)).length,
        };
      });
    }, err => {
      console.error("[Firestore Subscription Error] subscribeActiveOrders:", err);
    });

    activeOrdersUnsub = () => {
      unsub();
      set({ activeOrders: [], onlineOrders: [], unreadOnlineCount: 0 });
    };

    return () => {
      ordersSubCount--;
      if (ordersSubCount <= 0 && activeOrdersUnsub) {
        activeOrdersUnsub();
        activeOrdersUnsub = null;
        subscribedOrdersRestId = null;
        ordersSubCount = 0;
      }
    };
  },

  patchActiveOrder: (orderId, partial) => {
    const currentRestId = useAuthStore.getState().restaurant?.id;
    set(s => ({
      activeOrders: ['billed', 'cancelled', 'completed'].includes(partial.status)
        ? (s.activeOrders || []).filter(o => o.id !== orderId)
        : (s.activeOrders || []).map(o => o.id === orderId ? { ...o, ...partial } : o)
    }));
    localSyncChannel.broadcast('LOCAL_ORDER_UPDATED', {
      orderId,
      partial,
      restaurantId: currentRestId
    });

    const queue = useOfflineQueueStore.getState().queue || [];
    if (queue.some(o => o.id === orderId)) {
      const updatedQueue = queue.map(o => o.id === orderId ? {
        ...o,
        ...partial,
        updatedAt: new Date().toISOString()
      } : o);
      useOfflineQueueStore.setState({ queue: updatedQueue });
      try {
        localStorage.setItem('dineos_offline_order_queue', JSON.stringify(updatedQueue));
      } catch {}
    }
  },

  updateOrderStatus: async (restaurantId, orderId, status) => {
    // 1. Immediately update active order status locally for zero UI lag
    set(s => ({
      activeOrders: ['billed', 'cancelled'].includes(status)
        ? (s.activeOrders || []).filter(o => o.id !== orderId)
        : (s.activeOrders || []).map(o => o.id === orderId ? { ...o, status } : o)
    }));
    localSyncChannel.broadcast('LOCAL_ORDER_STATUS_CHANGED', {
      orderId,
      status,
      restaurantId
    });

    if (status === 'cancelled') {
      localCancelledOrderIds.add(orderId);
    }

    // 2. If present in offline queue, update status in offline queue as well
    const queue = useOfflineQueueStore.getState().queue || [];
    if (queue.some(o => o.id === orderId)) {
      const updatedQueue = queue.map(o => o.id === orderId ? {
        ...o,
        status,
        updatedAt: new Date().toISOString()
      } : o);
      useOfflineQueueStore.setState({ queue: updatedQueue });
      try {
        localStorage.setItem('dineos_offline_order_queue', JSON.stringify(updatedQueue));
      } catch {}
    }

    // 3. If cancelling or completing an order on a table, free the table in tableStore
    if (['cancelled', 'billed'].includes(status)) {
      const active = get().activeOrders || [];
      const targetOrder = active.find(o => o.id === orderId) || queue.find(o => o.id === orderId);
      if (targetOrder?.tableId) {
        try {
          useTableStore.getState().freeTable(restaurantId, targetOrder.tableId);
        } catch (tableErr) {
          console.warn('Failed to free table on status update:', tableErr);
        }
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);

        // If moving to preparing or ready and order is online (or inventory not yet depleted), deplete stock safely
        if (status === 'preparing' || status === 'ready') {
          try {
            const snap = await getDoc(orderRef);
            if (snap.exists()) {
              const order = snap.data();
              if (order.type === 'online' && !order.inventoryDepleted) {
                const batch = writeBatch(db);
                const items = order.items ?? [];
                for (const item of items) {
                  const recipe = item.recipe ?? [];
                  for (const recipeItem of recipe) {
                    if (recipeItem.ingredientId && recipeItem.amount) {
                      const ingDocRef = doc(db, 'restaurants', restaurantId, 'inventory', recipeItem.ingredientId);
                      batch.update(ingDocRef, {
                        qty: increment(-recipeItem.amount * (item.qty || 1))
                      });
                    }
                  }
                }
                batch.update(orderRef, { status, inventoryDepleted: true, updatedAt: serverTimestamp() });
                await batch.commit();
                return;
              }
            }
          } catch (err) {
            console.warn('Inventory depletion on order prepare check failed:', err);
          }
        }

        await updateDoc(orderRef, { status, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.warn('[useOrderStore] updateOrderStatus cloud sync deferred:', e?.message);
    }
  },

  markOnlineOrdersRead: () => {
    const currentOnline = get().onlineOrders || [];
    const existingRead = get().readOnlineOrderIds || [];
    const existingSet = new Set(existingRead);
    currentOnline.forEach(o => existingSet.add(o.id));
    set({ readOnlineOrderIds: Array.from(existingSet), unreadOnlineCount: 0 });
  },

  settleOrder: async (restaurantId, orderId, method, totalAmount, additionalFields = {}) => {
    try {
      const isOfflineOrder = typeof orderId === 'string' && orderId.startsWith('offline_');
      const isLocalOnly = Boolean(useAuthStore.getState().restaurant?.localStorageOnly);
      const isNetworkOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      // 1. Resolve existing order from activeOrders in memory or offline queue
      const active = get().activeOrders || [];
      let existingOrder = active.find(o => o.id === orderId) || null;

      if (!existingOrder) {
        const queue = useOfflineQueueStore.getState().queue || [];
        existingOrder = queue.find(o => o.id === orderId) || null;
      }

      const settlementTotal = totalAmount || existingOrder?.total || 0;
      const nowIso = new Date().toISOString();

      // 2. OPTIMISTIC INSTANT UPDATE (0ms delay):
      // Update in-memory active orders & broadcast to all tabs (KDS, POS, TableMap, Dashboard)
      set(s => ({
        activeOrders: (s.activeOrders || []).filter(o => o.id !== orderId)
      }));

      localSyncChannel.broadcast('LOCAL_ORDER_STATUS_CHANGED', {
        orderId,
        status: 'billed',
        paymentMethod: method,
        restaurantId
      });

      // 3. Free table in local store immediately
      const targetTableId = existingOrder?.tableId || additionalFields?.tableId;
      if (targetTableId) {
        try {
          useTableStore.getState().freeTable(restaurantId, targetTableId);
        } catch (tableErr) {
          console.warn('Failed to free table on settle:', tableErr);
        }
      }

      // 4. Update offline queue if present
      const queue = useOfflineQueueStore.getState().queue || [];
      if (queue.some(o => o.id === orderId)) {
        const updatedQueue = queue.map(o => o.id === orderId ? {
          ...o,
          status: 'billed',
          paymentMethod: method,
          paid: true,
          paidAt: nowIso,
          updatedAt: nowIso,
          ...additionalFields
        } : o);
        useOfflineQueueStore.setState({ queue: updatedQueue });
        try {
          localStorage.setItem('dineos_offline_order_queue', JSON.stringify(updatedQueue));
        } catch {}
      }

      // 5. Apply immediately to activeShift for instant X/Z report & till drawer accuracy
      const wasAlreadyPaid = existingOrder?.paid === true || (existingOrder?.paymentMethod && existingOrder?.paymentMethod !== 'unpaid');
      const activeShift = useShiftStore.getState().activeShift;
      if (activeShift?.id && !wasAlreadyPaid) {
        useShiftStore.getState().applySaleToActiveShift({
          total: settlementTotal,
          method,
          splitPayments: additionalFields.splitPayments
        });
      }

      // 6. ASYNC BACKGROUND CLOUD PERSISTENCE (Runs in parallel, does not block the UI!)
      if (!isOfflineOrder && !isLocalOnly && !isNetworkOffline) {
        (async () => {
          try {
            await useAuthStore.getState().ensureAnonymousAuth();
            const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
            
            // Cloud update for order
            const cloudOrderPromise = updateDoc(orderRef, {
              status: 'billed',
              paymentMethod: method,
              paid: true,
              paidAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              ...additionalFields
            }).catch(e => console.warn('[settleOrder] Order cloud update deferred:', e?.message));

            // Cloud update for shift
            let cloudShiftPromise = Promise.resolve();
            if (activeShift?.id && !wasAlreadyPaid) {
              const shiftRef = doc(db, 'restaurants', restaurantId, 'shifts', activeShift.id);
              const shiftUpdate = {
                totalSalesAmount: increment(settlementTotal)
              };

              if (method === 'cash') {
                shiftUpdate.cashSalesCount = increment(1);
                shiftUpdate.cashSalesAmount = increment(settlementTotal);
                shiftUpdate.expectedCash = increment(settlementTotal);
              } else if (method === 'card' || method === 'terminal') {
                shiftUpdate.cardSalesCount = increment(1);
                shiftUpdate.cardSalesAmount = increment(settlementTotal);
              } else if (method === 'upi') {
                shiftUpdate.upiSalesCount = increment(1);
                shiftUpdate.upiSalesAmount = increment(settlementTotal);
              } else if (method === 'split' && additionalFields.splitPayments) {
                let cashCount = 0;
                let cashAmt = 0;
                let cardCount = 0;
                let cardAmt = 0;
                let upiCount = 0;
                let upiAmt = 0;
                
                const splits = additionalFields.splitPayments;
                splits.forEach(p => {
                  const m = p.method ?? 'cash';
                  const amt = p.amount ?? 0;
                  if (m === 'cash') {
                    cashCount += 1;
                    cashAmt += amt;
                  } else if (m === 'card' || m === 'terminal') {
                    cardCount += 1;
                    cardAmt += amt;
                  } else if (m === 'upi') {
                    upiCount += 1;
                    upiAmt += amt;
                  }
                });
                
                if (cashCount > 0) {
                  shiftUpdate.cashSalesCount = increment(cashCount);
                  shiftUpdate.cashSalesAmount = increment(cashAmt);
                  shiftUpdate.expectedCash = increment(cashAmt);
                }
                if (cardCount > 0) {
                  shiftUpdate.cardSalesCount = increment(cardCount);
                  shiftUpdate.cardSalesAmount = increment(cardAmt);
                }
                if (upiCount > 0) {
                  shiftUpdate.upiSalesCount = increment(upiCount);
                  shiftUpdate.upiSalesAmount = increment(upiAmt);
                }
              }

              cloudShiftPromise = updateDoc(shiftRef, shiftUpdate).catch(e => console.warn('[settleOrder] Shift sync deferred:', e?.message));
            }

            // Cloud update for customer loyalty
            let cloudLoyaltyPromise = Promise.resolve();
            if (existingOrder?.customerPhone && existingOrder?.paymentMethod === 'unpaid') {
              const pointsEarned = existingOrder.loyaltyEarned ?? Math.floor(settlementTotal / 10);
              const pointsRedeemed = existingOrder.loyaltyRedeemed ?? 0;
              const custDocRef = doc(db, 'restaurants', restaurantId, 'customers', existingOrder.customerPhone);
              cloudLoyaltyPromise = updateDoc(custDocRef, {
                visitCount: increment(1),
                lifetimeSpend: increment(settlementTotal),
                points: increment(pointsEarned - pointsRedeemed)
              }).catch(e => console.warn('Could not update customer loyalty points at settle:', e));
            }

            await Promise.allSettled([cloudOrderPromise, cloudShiftPromise, cloudLoyaltyPromise]);
          } catch (cloudErr) {
            console.warn('[settleOrder] Background cloud sync deferred:', cloudErr?.message);
          }
        })();
      }

      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  },
}));

// Automatically persist active cart changes for crash & reload resilience
useOrderStore.subscribe((state) => {
  savePersistedCart(state);
});

// Cross-Tab BroadcastChannel listener: ensures multi-window/multi-screen KDS updates in real time
localSyncChannel.subscribe((msg) => {
  const currentRestId = useAuthStore.getState().restaurant?.id;
  const { type, payload } = msg || {};
  if (!payload) return;
  if (payload.restaurantId && currentRestId && payload.restaurantId !== currentRestId) {
    return;
  }

  if (type === 'LOCAL_ORDER_CREATED' && payload.order) {
    useOrderStore.setState(s => {
      const existing = s.activeOrders || [];
      if (existing.some(o => o.id === payload.order.id)) {
        return s;
      }
      return { activeOrders: [payload.order, ...existing] };
    });
    // Trigger audio chime for new kitchen ticket on other tabs
    try {
      const audio = new Audio('/sounds/order-chime.wav');
      audio.play().catch(() => {});
    } catch {}
  } else if (type === 'LOCAL_ORDER_UPDATED' && payload.orderId) {
    useOrderStore.setState(s => ({
      activeOrders: (s.activeOrders || []).map(o => o.id === payload.orderId ? { ...o, ...payload.partial } : o)
    }));
  } else if (type === 'LOCAL_ORDER_STATUS_CHANGED' && payload.orderId) {
    useOrderStore.setState(s => ({
      activeOrders: (s.activeOrders || []).map(o => o.id === payload.orderId ? { ...o, status: payload.status } : o)
    }));
  }
});


