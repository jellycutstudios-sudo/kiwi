// Order Store — cart state, order type, table assignment
import { create } from 'zustand';
import {
  collection, updateDoc, doc, getDoc, serverTimestamp, onSnapshot, query, where, limit, orderBy, increment, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { computeTax } from '../utils/taxUtils';
import { useTableStore } from './tableStore';
import { useAuthStore } from './authStore';
import { useShiftStore } from './shiftStore';
import { useGiftCardStore } from './giftCardStore';
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
  notifiedReadyOrders: new Set(),

  // Payment
  paymentMethod: 'cash',  // 'cash' | 'card' | 'upi' | 'split'
  splitPayments: [],
  upiRef: '',

  // Discount
  discount: 0,
  discountType: 'fixed', // 'fixed' | 'percent'

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
    upiRef: order.upiRef ?? '',
    tokenNumber: order.token ?? null
  }),

  clearCart: () => {
    set({
      items: [], tokenNumber: null, tableId: null, tableName: null,
      customerName: '', customerPhone: '', note: '', editingOrderId: null,
      discount: 0, discountType: 'fixed', splitPayments: [],
      customer: null, redeemingPoints: false,
      tipAmount: 0, upiRef: ''
    });
    useGiftCardStore.getState().clearGiftCard();
  },

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
    const giftCardDeduction = useGiftCardStore.getState().giftCardDeduction;
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
      const activeShift = useShiftStore.getState().activeShift;
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

        await batch.commit();
      }

      // Automatically set table status to occupied and store orderId
      if (orderType === 'dine-in' && tableId) {
        await useTableStore.getState().setTableStatus(restaurant.id, tableId, 'occupied', orderId);
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
              const notified = get().notifiedReadyOrders || new Set();
              if (!notified.has(orderId)) {
                notified.add(orderId);
                set({ notifiedReadyOrders: notified });
                playChime();
                
                const orderDesc = data.tableName ? `Table ${data.tableName}` : `Takeaway #${orderId.slice(-4).toUpperCase()}`;
                toast(`🍳 ${orderDesc} is READY to serve!`, { duration: 6000 });
              }
            }
          }

          if (change.type === 'removed') {
            // Check if order was cancelled
            if (data.status === 'cancelled') {
              playChime();
              const orderDesc = data.tableName ? `Table ${data.tableName}` : `Order #${orderId.slice(-4).toUpperCase()}`;
              toast.error(`❌ ${orderDesc} has been CANCELLED!`, { duration: 6000 });
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



  markOnlineOrdersRead: () => set({ unreadOnlineCount: 0 }),



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

      const activeShift = useShiftStore.getState().activeShift;
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
        
        await updateDoc(shiftRef, shiftUpdate);
      }
      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  },
}));
