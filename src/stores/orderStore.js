// Order Store — cart state, order type, table assignment
import { create } from 'zustand';
import {
  collection, addDoc, updateDoc, doc, getDoc, getDocs, serverTimestamp, onSnapshot, query, where, limit, writeBatch, increment
} from 'firebase/firestore';
import { db } from '../firebase';
import { computeTax } from '../utils/taxUtils';
import { useTableStore } from './tableStore';
import { useAuthStore } from './authStore';
import toast from 'react-hot-toast';

export const useOrderStore = create((set, get) => ({
  // Cart
  items: [],
  orderType: 'dine-in',   // 'dine-in' | 'takeaway' | 'online'
  tableId: null,
  tableName: null,
  tokenNumber: null,
  customerName: '',
  customerPhone: '',
  note: '',
  customer: null,
  redeemingPoints: false,

  // Active orders list (realtime)
  activeOrders: [],
  onlineOrders: [],
  unreadOnlineCount: 0,

  // Payment
  paymentMethod: 'cash',  // 'cash' | 'card' | 'upi' | 'split'
  splitPayments: [],
  upiRef: '',

  // Discount
  discount: 0,
  discountType: 'fixed', // 'fixed' | 'percent'

  // Shift Drawer Till
  activeShift: null,

  // Tips
  tipAmount: 0,

  // ── Cart Operations ──────────────────────────────────────
  addItem: (item) => {
    const items = get().items;
    const existing = items.find(i => i.id === item.id);
    if (existing) {
      set({ items: items.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i) });
    } else {
      set({ items: [...items, { 
        ...item, 
        qty: 1, 
        course: item.course ?? 'Mains', 
        prepState: item.prepState ?? 'fired' 
      }] });
    }
  },

  removeItem: (id) => set({ items: get().items.filter(i => i.id !== id) }),

  updateQty: (id, qty) => {
    if (qty <= 0) { get().removeItem(id); return; }
    set({ items: get().items.map(i => i.id === id ? { ...i, qty } : i) });
  },

  editingOrderId: null,

  loadOrderToCart: (order) => set({
    items: order.items.map(i => ({
      id: i.id,
      name: i.name,
      price: i.price,
      qty: i.qty,
      selectedModifiers: i.selectedModifiers ?? [],
      modifierTotal: i.modifierTotal ?? 0,
      recipe: i.recipe ?? [],
      course: i.course ?? 'Mains',
      prepState: i.prepState ?? 'fired',
      station: i.station ?? 'Kitchen',
      status: i.status ?? 'pending'
    })),
    orderType: order.type,
    tableId: order.tableId,
    tableName: order.tableName,
    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    note: order.note || '',
    paymentMethod: order.paymentMethod || 'cash',
    editingOrderId: order.id,
    discount: order.discount ?? 0,
    discountType: order.discountType ?? 'fixed',
    splitPayments: order.splitPayments ?? [],
    upiRef: order.upiRef ?? ''
  }),

  clearCart: () => set({
    items: [], tokenNumber: null, tableId: null, tableName: null,
    customerName: '', customerPhone: '', note: '', editingOrderId: null,
    discount: 0, discountType: 'fixed', splitPayments: [],
    customer: null, redeemingPoints: false,
    giftCardCode: null, giftCardBalance: 0, giftCardDeduction: 0,
    tipAmount: 0, upiRef: ''
  }),

  setOrderType:    (t) => set({ orderType: t }),
  setTable:        (id, name) => set({ tableId: id, tableName: name }),
  setToken:        (n) => set({ tokenNumber: n }),
  setCustomer:     (name, phone) => set({ customerName: name, customerPhone: phone }),
  setNote:         (note) => set({ note }),
  setPaymentMethod:(m) => set({ paymentMethod: m }),
  setSplitPayments:(splits) => set({ splitPayments: splits }),
  setDiscount:     (discount, discountType = 'fixed') => set({ discount, discountType }),
  setCustomerProfile:(c) => set({ customer: c }),
  setRedeemingPoints:(r) => set({ redeemingPoints: r }),
  setTip: (amt) => set({ tipAmount: Math.max(0, Math.round(amt * 100) / 100) }),
  setUpiRef: (upiRef) => set({ upiRef }),

  // Gift Card Vouchers
  giftCardCode: null,
  giftCardBalance: 0,
  giftCardDeduction: 0,

  applyGiftCard: (code, balance, restaurant) => {
    const subtotal = get().getSubtotal();
    const discountAmt = get().getDiscountAmount();
    const pointsDiscount = get().getPointsDiscountAmount();
    const taxableAmount = Math.max(0, subtotal - discountAmt - pointsDiscount);
    const { taxTotal } = computeTax(taxableAmount, restaurant?.taxConfig ?? { type: 'none', rate: 0 });
    const totalBeforeGiftCard = taxableAmount + taxTotal;

    const deduction = Math.round(Math.min(balance, totalBeforeGiftCard) * 100) / 100;
    set({
      giftCardCode: code,
      giftCardBalance: balance,
      giftCardDeduction: deduction
    });
  },

  removeGiftCard: () => set({
    giftCardCode: null,
    giftCardBalance: 0,
    giftCardDeduction: 0
  }),

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
      await useAuthStore.getState().ensureAnonymousAuth();
      const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
      await updateDoc(orderRef, {
        tableId: targetTableId,
        tableName: targetTableName
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
      await useAuthStore.getState().ensureAnonymousAuth();
      const primaryOrderRef = doc(db, 'restaurants', restaurantId, 'orders', primaryOrderId);
      const secondaryOrderRef = doc(db, 'restaurants', restaurantId, 'orders', secondaryOrderId);

      const [primarySnap, secondarySnap] = await Promise.all([
        getDoc(primaryOrderRef),
        getDoc(secondaryOrderRef)
      ]);

      if (!primarySnap.exists() || !secondarySnap.exists()) {
        return { ok: false, error: 'One or both orders not found' };
      }

      const primaryOrder = primarySnap.data();
      const secondaryOrder = secondarySnap.data();

      const mergedItems = [...primaryOrder.items];

      secondaryOrder.items.forEach(secItem => {
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
      const taxableAmount = Math.max(0, subtotal - discountAmount - pointsDiscount);
      
      const restRef = doc(db, 'restaurants', restaurantId);
      const restSnap = await getDoc(restRef);
      const restaurantData = restSnap.exists() ? restSnap.data() : null;

      const { taxTotal } = computeTax(taxableAmount, restaurantData?.taxConfig ?? { type: 'none', rate: 0 });
      const totalBeforeGiftCard = taxableAmount + taxTotal;
      const giftCardDeduction = primaryOrder.giftCardDeduction ?? 0;
      const total = Math.max(0, totalBeforeGiftCard - giftCardDeduction);

      await updateDoc(primaryOrderRef, {
        items: mergedItems,
        subtotal,
        discountAmount,
        total,
        updatedAt: serverTimestamp()
      });

      await updateDoc(secondaryOrderRef, {
        status: 'merged',
        mergedIntoOrderId: primaryOrderId,
        updatedAt: serverTimestamp()
      });

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
  getSubtotal: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),

  getDiscountAmount: () => {
    const { discount, discountType } = get();
    if (!discount) return 0;
    const subtotal = get().getSubtotal();
    if (discountType === 'percent') {
      return (subtotal * discount) / 100;
    }
    return discount;
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
    let taxableAmount = Math.max(0, subtotal - discountAmt - pointsDiscount);
    if (restaurant?.serviceChargeTaxable === 'yes') {
      taxableAmount += get().getServiceChargeAmount(restaurant);
    }
    return computeTax(taxableAmount, restaurant?.taxConfig ?? { type: 'none', rate: 0 });
  },

  getTotal: (restaurant) => {
    const subtotal = get().getSubtotal();
    const discountAmt = get().getDiscountAmount();
    const pointsDiscount = get().getPointsDiscountAmount();
    const serviceChargeAmt = get().getServiceChargeAmount(restaurant);
    let taxableAmountForTax = Math.max(0, subtotal - discountAmt - pointsDiscount);
    const baseTaxable = taxableAmountForTax;
    if (restaurant?.serviceChargeTaxable === 'yes') {
      taxableAmountForTax += serviceChargeAmt;
    }
    const { taxTotal } = computeTax(taxableAmountForTax, restaurant?.taxConfig ?? { type: 'none', rate: 0 });
    const tipAmt = get().tipAmount ?? 0;
    const totalBeforeGiftCard = baseTaxable + taxTotal + serviceChargeAmt + tipAmt;
    const giftCardDeduction = get().giftCardDeduction;
    return Math.max(0, Math.round((totalBeforeGiftCard - giftCardDeduction) * 100) / 100);
  },

  // ── Submit Order ─────────────────────────────────────────
  submitOrder: async (restaurant, staffId) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    const { items, orderType, tableId, tableName, tokenNumber, customerName, customerPhone, note, paymentMethod, splitPayments, discount, discountType, editingOrderId, customer, redeemingPoints, giftCardCode, giftCardDeduction, giftCardBalance, tipAmount, upiRef } = get();
    if (!items.length) return { ok: false, error: 'Cart is empty' };

    const subtotal = get().getSubtotal();
    const discountAmount = get().getDiscountAmount();
    const pointsDiscount = get().getPointsDiscountAmount();
    const serviceChargeAmount = get().getServiceChargeAmount(restaurant);
    const total    = get().getTotal(restaurant);

    const orderData = {
      type: orderType,
      status: 'pending',
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
        prepState: i.prepState ?? 'fired'
      })),
      subtotal,
      discount,
      discountType,
      discountAmount,
      pointsDiscount,
      serviceChargeRate: restaurant?.serviceChargeRate ?? 0,
      serviceChargeAmount,
      tipAmount,
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
      staffId,
      updatedAt: serverTimestamp(),
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
    }

    try {
      let orderId = editingOrderId;
      
      // Calculate shift updates
      const activeShift = get().activeShift;
      let shiftUpdate = null;
      if (activeShift?.id && paymentMethod !== 'unpaid') {
        const val = total;
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
          const splits = splitPayments ?? [];
          splits.forEach(p => {
            const m = p.method ?? 'cash';
            const amt = p.amount ?? 0;
            if (m === 'cash') {
              shiftUpdate.cashSalesCount = (shiftUpdate.cashSalesCount ?? increment(0)) + increment(1);
              shiftUpdate.cashSalesAmount = (shiftUpdate.cashSalesAmount ?? increment(0)) + increment(amt);
              shiftUpdate.expectedCash = (shiftUpdate.expectedCash ?? increment(0)) + increment(amt);
            } else if (m === 'card' || m === 'terminal') {
              shiftUpdate.cardSalesCount = (shiftUpdate.cardSalesCount ?? increment(0)) + increment(1);
              shiftUpdate.cardSalesAmount = (shiftUpdate.cardSalesAmount ?? increment(0)) + increment(amt);
            } else if (m === 'upi') {
              shiftUpdate.upiSalesCount = (shiftUpdate.upiSalesCount ?? increment(0)) + increment(1);
              shiftUpdate.upiSalesAmount = (shiftUpdate.upiSalesAmount ?? increment(0)) + increment(amt);
            }
          });
        }
      }

      if (editingOrderId) {
        // Fetch previous order state to compute ingredient diffs
        const oldOrderRef = doc(db, 'restaurants', restaurant.id, 'orders', editingOrderId);
        const oldOrderSnap = await getDoc(oldOrderRef);
        const oldItems = oldOrderSnap.exists() ? (oldOrderSnap.data().items || []) : [];

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
            batch.update(ingRef, {
              qty: increment(-diff)
            });
          }
        }

        await batch.commit();
      } else {
        orderData.createdAt = serverTimestamp();
        const batch = writeBatch(db);
        
        // Auto-generate doc ID for new order reference
        const orderDocRef = doc(collection(db, 'restaurants', restaurant.id, 'orders'));
        orderId = orderDocRef.id;
        
        // Add new order write to batch
        batch.set(orderDocRef, orderData);

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
              batch.update(ingDocRef, {
                qty: increment(-recipeItem.amount * item.qty)
              });
            }
          }
        }

        // Update customer profile with loyalty points, visit counts, and lifetime spends
        if (customer) {
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
        
        // Execute batched write atomically
        await batch.commit();
      }

      // Automatically set table status to occupied and store orderId
      if (orderType === 'dine-in' && tableId) {
        await useTableStore.getState().setTableStatus(restaurant.id, tableId, 'occupied', orderId);
      }

      const isOffline = (typeof window !== 'undefined' && (window.__simulateOffline || !navigator.onLine));
      if (isOffline) {
        toast.success(
          editingOrderId 
            ? 'Order updated locally (Offline Mode)' 
            : 'Order queued locally (Offline Mode)', 
          { icon: '💾', duration: 4000 }
        );
      }

      get().clearCart();
      return { ok: true, orderId };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ── Real-time Order Listeners ────────────────────────────
  subscribeActiveOrders: (restaurantId) => {
    const q = query(
      collection(db, 'restaurants', restaurantId, 'orders'),
      where('status', 'in', ['pending', 'preparing', 'ready']),
      limit(100)
    );
    let isInitial = true;
    return onSnapshot(q, snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort in-memory (descending by createdAt)
      orders.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : 0);
        return dateB - dateA;
      });
      const online = orders.filter(o => o.type === 'online');

      // Play chime for newly added online pending orders
      if (!isInitial) {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.type === 'online' && data.status === 'pending') {
              try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-200.wav');
                audio.play().catch(e => console.log('Chime playback blocked/failed:', e));
              } catch (err) {
                console.warn('Failed to play order chime:', err);
              }
              toast('New online order received!', { icon: '🔔', duration: 6000 });
            }
          }
        });
      }
      isInitial = false;

      set({
        activeOrders: orders,
        onlineOrders: online,
        unreadOnlineCount: online.filter(o => o.status === 'pending').length,
      });
    }, err => {
      console.error("[Firestore Subscription Error] subscribeActiveOrders:", err);
    });
  },

  updateOrderStatus: async (restaurantId, orderId, status) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', orderId), { status });
  },

  updateKDSItemStatus: async (restaurantId, order, itemIndex, newStatus) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    const toDate = (ts) => {
      if (!ts) return new Date();
      if (typeof ts.toDate === 'function') return ts.toDate();
      return new Date(ts);
    };

    const updatedItems = order.items.map((item, idx) => {
      if (idx === itemIndex) {
        return { ...item, status: newStatus };
      }
      return item;
    });

    const hasPreparing = updatedItems.some(i => i.status === 'preparing' || i.status === 'ready');
    const allReady = updatedItems.every(i => i.status === 'ready');

    let overallStatus = order.status;
    const updates = { items: updatedItems };

    if (newStatus === 'preparing' && order.status === 'pending') {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = new Date();
    }

    if (allReady) {
      updates.status = 'ready';
      updates.prepCompletedAt = new Date();
      
      const startTime = order.prepStartedAt ? toDate(order.prepStartedAt) : (order.createdAt ? toDate(order.createdAt) : new Date());
      const durationSeconds = Math.floor((new Date() - startTime) / 1000);
      updates.prepDuration = Math.max(0, durationSeconds);
    } else if (hasPreparing && overallStatus === 'pending') {
      updates.status = 'preparing';
      updates.prepStartedAt = new Date();
    }

    await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', order.id), updates);
  },

  updateKDSStationStatus: async (restaurantId, order, stationName, newStatus) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    const toDate = (ts) => {
      if (!ts) return new Date();
      if (typeof ts.toDate === 'function') return ts.toDate();
      return new Date(ts);
    };

    const updatedItems = order.items.map(item => {
      if (stationName === 'All' || item.station === stationName) {
        return { ...item, status: newStatus };
      }
      return item;
    });

    const hasPreparing = updatedItems.some(i => i.status === 'preparing' || i.status === 'ready');
    const allReady = updatedItems.every(i => i.status === 'ready');

    let overallStatus = order.status;
    const updates = { items: updatedItems };

    if (newStatus === 'preparing' && order.status === 'pending') {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = new Date();
    }

    if (allReady) {
      updates.status = 'ready';
      updates.prepCompletedAt = new Date();
      
      const startTime = order.prepStartedAt ? toDate(order.prepStartedAt) : (order.createdAt ? toDate(order.createdAt) : new Date());
      const durationSeconds = Math.floor((new Date() - startTime) / 1000);
      updates.prepDuration = Math.max(0, durationSeconds);
    } else if (hasPreparing && overallStatus === 'pending') {
      updates.status = 'preparing';
      updates.prepStartedAt = new Date();
    }

    await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', order.id), updates);
  },

  markOnlineOrdersRead: () => set({ unreadOnlineCount: 0 }),

  subscribeActiveShift: (restaurantId, onReady) => {
    const q = query(
      collection(db, 'restaurants', restaurantId, 'shifts'),
      where('status', '==', 'open'),
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

  checkActiveShift: async (restaurantId) => {
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'shifts'),
        where('status', '==', 'open'),
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
      const snap = await getDoc(docRef);
      if (!snap.exists()) return { ok: false, error: 'Shift not found' };
      const data = snap.data();
      
      const numAmt = parseFloat(amount) || 0;
      let newExpected = data.expectedCash ?? data.startCash;
      
      const txObj = {
        amount: numAmt,
        reason: reason || '',
        timestamp: new Date()
      };
      
      const updates = {};
      if (type === 'drop') {
        newExpected -= numAmt;
        updates.cashDrops = [...(data.cashDrops ?? []), txObj];
      } else if (type === 'paidout') {
        newExpected -= numAmt;
        updates.paidOuts = [...(data.paidOuts ?? []), txObj];
      }
      
      updates.expectedCash = newExpected;
      await updateDoc(docRef, updates);
      
      set({
        activeShift: {
          ...get().activeShift,
          ...updates
        }
      });
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
      const closedAtDate = new Date(); // real JS Date for Z-Report rendering

      const updates = {
        status: 'closed',
        closedAt: serverTimestamp(),  // Firestore server timestamp
        closedBy: staffName,
        closedById: staffId,
        actualCash: numCounted,
        variance: Math.round(variance * 100) / 100
      };
      
      await updateDoc(docRef, updates);
      set({ activeShift: null });

      // Bug 6: Use closedAtDate (real JS Date) so Z-Report renders correctly.
      // serverTimestamp() is a sentinel and can't be formatted until Firestore resolves it.
      // Bug 8: Include id so Z-Report shows the shift ID.
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

  settleOrder: async (restaurantId, orderId, method, totalAmount, additionalFields = {}) => {
    try {
      await useAuthStore.getState().ensureAnonymousAuth();
      const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
      await updateDoc(orderRef, {
        status: 'billed',
        paymentMethod: method,
        paid: true,
        updatedAt: serverTimestamp(),
        ...additionalFields
      });

      const activeShift = get().activeShift;
      if (activeShift?.id) {
        const shiftRef = doc(db, 'restaurants', restaurantId, 'shifts', activeShift.id);
        const val = totalAmount || 0;
        
        const shiftUpdate = {
          totalSalesAmount: increment(val)
        };
        
        if (method === 'cash') {
          shiftUpdate.cashSalesCount = increment(1);
          shiftUpdate.cashSalesAmount = increment(val);
          shiftUpdate.expectedCash = increment(val);
        } else if (method === 'card' || method === 'terminal') {
          shiftUpdate.cardSalesCount = increment(1);
          shiftUpdate.cardSalesAmount = increment(val);
        } else if (method === 'upi') {
          shiftUpdate.upiSalesCount = increment(1);
          shiftUpdate.upiSalesAmount = increment(val);
        }
        
        await updateDoc(shiftRef, shiftUpdate);
      }
      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  },
}));
