import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useShiftStore } from '../stores/shiftStore';
import { useTokenStore } from '../stores/tokenStore';
import { useMenuStore } from '../stores/menuStore';
import { useTableStore } from '../stores/tableStore';
import { useShallow } from 'zustand/react/shallow';
import { collection, doc, getDoc, setDoc, query, where, getDocs, addDoc, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/formatCurrency';
import { printReceipt, printTokenTicket, printKitchenTickets } from '../utils/print';
import toast from 'react-hot-toast';
import { 
  ShoppingCart, ShoppingBag, UtensilsCrossed, Trash2, Plus, Minus, X, 
  ChevronRight, ChevronDown, Tag, Banknote, Star, User, Search, 
  FileText, Check, Flame, Leaf, Sparkles, Clock, LayoutGrid, Maximize2, Minimize2 
} from 'lucide-react';
import PaymentModal from '../components/pos/PaymentModal';
import TableSelectModal from '../components/pos/TableSelectModal';
import ModifierModal from '../components/pos/ModifierModal';

const COURSE_ICONS = {
  'Appetizers': '🥗',
  'Mains': '🍲',
  'Desserts': '🍰',
  'Beverages': '🥤',
};

const POS_COURSES = ['Appetizers', 'Mains', 'Desserts', 'Beverages'];

function CartCoursePicker({ currentCourse, onSelectCourse }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 142;
      const popoverHeight = 152;
      
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= popoverHeight ? rect.bottom + 4 : rect.top - popoverHeight - 4;
      const left = Math.max(8, rect.right - popoverWidth);
      setCoords({ top, left });
    }
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleScrollOrResize = () => setOpen(false);

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  const activeCourse = currentCourse ?? 'Mains';

  return (
    <div className="cart-course-picker-wrapper">
      <button
        ref={triggerRef}
        type="button"
        className={`cart-course-btn ${open ? 'active' : ''}`}
        onClick={toggle}
        title="Change course"
      >
        <span className="cart-course-btn-icon">{COURSE_ICONS[activeCourse] || '🍽️'}</span>
        <span className="cart-course-btn-text">{activeCourse}</span>
        <ChevronDown size={10} className={`cart-course-btn-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="cart-course-popover"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 99999,
          }}
        >
          <div className="cart-course-popover-title">Course Stage</div>
          {POS_COURSES.map(c => {
            const isSelected = c === activeCourse;
            return (
              <button
                key={c}
                type="button"
                className={`cart-course-popover-item ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCourse(c);
                  setOpen(false);
                }}
              >
                <span className="cart-course-popover-icon">{COURSE_ICONS[c] || '🍽️'}</span>
                <span className="cart-course-popover-label">{c}</span>
                {isSelected && <Check size={13} className="cart-course-popover-check" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function POS() {
  const { t } = useTranslation();
  const { restaurant, staffDoc, ensureAnonymousAuth } = useAuthStore();
  const {
    items, addItem, removeItem, updateQty, clearCart,
    orderType, setOrderType,
    tableId, tableName, setTable,
    customerName, customerPhone, setCustomer,
    note, setNote,
    getSubtotal, getTaxInfo, getTotal,
    submitOrder,
    paymentMethod,
    setPaymentMethod,
    editingOrderId,
    discount, discountType, setDiscount, getDiscountAmount,
    customer, setCustomerProfile, setRedeemingPoints,
    loadOrderToCart,
    tokenNumber, setToken
  } = useOrderStore(
    useShallow((state) => ({
      items: state.items,
      addItem: state.addItem,
      removeItem: state.removeItem,
      updateQty: state.updateQty,
      clearCart: state.clearCart,
      orderType: state.orderType,
      setOrderType: state.setOrderType,
      tableId: state.tableId,
      tableName: state.tableName,
      setTable: state.setTable,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      setCustomer: state.setCustomer,
      note: state.note,
      setNote: state.setNote,
      getSubtotal: state.getSubtotal,
      getTaxInfo: state.getTaxInfo,
      getTotal: state.getTotal,
      submitOrder: state.submitOrder,
      paymentMethod: state.paymentMethod,
      setPaymentMethod: state.setPaymentMethod,
      editingOrderId: state.editingOrderId,
      discount: state.discount,
      discountType: state.discountType,
      setDiscount: state.setDiscount,
      getDiscountAmount: state.getDiscountAmount,
      customer: state.customer,
      setCustomerProfile: state.setCustomerProfile,
      setRedeemingPoints: state.setRedeemingPoints,
      loadOrderToCart: state.loadOrderToCart,
      tokenNumber: state.tokenNumber,
      setToken: state.setToken
    }))
  );

  const {
    activeShift, openShift, closeShift, recordCashTransaction, subscribeActiveShift
  } = useShiftStore(
    useShallow((state) => ({
      activeShift: state.activeShift,
      openShift: state.openShift,
      closeShift: state.closeShift,
      recordCashTransaction: state.recordCashTransaction,
      subscribeActiveShift: state.subscribeActiveShift
    }))
  );
  const { issueToken } = useTokenStore();
  const { categories, loading: loadingMenu, search, setSearch } = useMenuStore(
    useShallow((state) => ({
      categories: state.categories,
      loading: state.loading,
      search: state.search,
      setSearch: state.setSearch
    }))
  );

  const [adminBypassShift, setAdminBypassShift] = useState(false);
  const [activeCat,  setActiveCat]  = useState('all');
  const [dietaryFilter, setDietaryFilter] = useState('all'); // 'all' | 'veg' | 'non-veg' | 'bestseller'
  const [menuDensity, setMenuDensity] = useState(() => localStorage.getItem('kiwi_pos_density') || 'visual');
  const [activeAddon, setActiveAddon] = useState(null); // null | 'discount' | 'note'
  const [dismissedUpsell, setDismissedUpsell] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(() => localStorage.getItem('kiwi_pos_focus') === 'true');

  useEffect(() => {
    localStorage.setItem('kiwi_pos_density', menuDensity);
  }, [menuDensity]);

  useEffect(() => {
    localStorage.setItem('kiwi_pos_focus', isFocusMode);
    if (isFocusMode) {
      document.body.classList.add('pos-focus-mode');
    } else {
      document.body.classList.remove('pos-focus-mode');
    }
    return () => {
      document.body.classList.remove('pos-focus-mode');
    };
  }, [isFocusMode]);

  const [showPayment, setShowPayment] = useState(false);
  const [showTableSel, setShowTableSel] = useState(false);
  const [activeModifierItem, setActiveModifierItem] = useState(null);

  const tables = useTableStore(s => s.tables);
  const [tableOrders, setTableOrders] = useState({});

  useEffect(() => {
    if (!restaurant?.id) return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('status', 'in', ['pending', 'preparing', 'ready', 'served']),
      where('type', '==', 'dine-in')
    );
    return onSnapshot(q, snap => {
      const map = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.tableId) map[data.tableId] = { id: d.id, ...data };
      });
      setTableOrders(map);
    }, err => {
      console.warn("POS table orders listener error:", err);
    });
  }, [restaurant?.id]);

  const handleTableSelectQuick = (table) => {
    if (table.status === 'occupied') {
      const activeOrder = tableOrders[table.id];
      if (activeOrder) {
        loadOrderToCart(activeOrder);
        toast.success(`Loaded active order for ${table.name}`, { icon: '🍽️' });
      } else {
        setTable(table.id, table.name);
        toast.success(`Selected ${table.name}`, { icon: '🪑' });
      }
    } else {
      if (editingOrderId || tableId) {
        clearCart();
      }
      setTable(table.id, table.name);
      toast.success(`Assigned to ${table.name}`, { icon: '🪑' });
    }
  };

  const [custSearch, setCustSearch] = useState('');
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [sevenDayAvg, setSevenDayAvg] = useState(0);

  useEffect(() => {
    if (!restaurant?.id) return;
    const past7Days = new Date();
    past7Days.setDate(past7Days.getDate() - 7);
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', past7Days),
      limit(100)
    );
    getDocs(q).then(snap => {
      let totalSales = 0;
      snap.docs.forEach(d => totalSales += (d.data().total || 0));
      setSevenDayAvg(snap.docs.length > 0 ? totalSales / snap.docs.length : 0);
    }).catch(console.error);
  }, [restaurant?.id]);

  useEffect(() => {
    if (items.length === 0) {
      // Defer to avoid synchronous setState-in-effect lint rule
      const id = setTimeout(() => setMobileCartOpen(false), 0);
      return () => clearTimeout(id);
    }
  }, [items.length]);
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [showTotalsBreakdown, setShowTotalsBreakdown] = useState(false);

  const [openFloatCash, setOpenFloatCash] = useState('0.00');
  const [checkingShift, setCheckingShift] = useState(true);
  const [openShiftError, setOpenShiftError] = useState(null);
  const [openingShift, setOpeningShift] = useState(false);
  const [closingShift, setClosingShift] = useState(false);

  // Till drawer modal states
  const [showTillModal, setShowTillModal] = useState(false);
  const [tillModalTab, setTillModalTab] = useState('summary'); // 'summary' | 'movement' | 'close'
  const [tillTxType, setTillTxType] = useState('drop'); // 'drop' | 'paidout'
  const [tillTxAmount, setTillTxAmount] = useState('');
  const [tillTxReason, setTillTxReason] = useState('');
  const [closeCountedCash, setCloseCountedCash] = useState('');
  const [showDenomCounter, setShowDenomCounter] = useState(false);
  const [denominations, setDenominations] = useState({ 500: '', 200: '', 100: '', 50: '', 20: '', 10: '', coins: '' });
  const [zReportToShow, setZReportToShow] = useState(null);

  // Manager PIN authorized void states
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidAction, setVoidAction] = useState(null); // { type: 'decrement' | 'remove', item }
  const [voidReason, setVoidReason] = useState('Burnt/Kitchen Error');
  const [managerPin, setManagerPin] = useState('');

  const currency  = restaurant?.currency ?? 'INR';
  const modes     = restaurant?.modes ?? ['pos'];
  const subtotal  = getSubtotal();
  const discountAmount = getDiscountAmount();
  const taxInfo   = getTaxInfo(restaurant);
  const total     = getTotal(restaurant);

  const itemQtyMap = useMemo(() => {
    const map = {};
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.id) map[it.id] = (map[it.id] || 0) + (it.qty || 1);
      if (it.menuItemId) map[it.menuItemId] = (map[it.menuItemId] || 0) + (it.qty || 1);
    }
    return map;
  }, [items]);

  const getItemQty = (item) => itemQtyMap[item.id] || 0;




  const [prevRestId, setPrevRestId] = useState(restaurant?.id);
  if (restaurant?.id !== prevRestId) {
    setPrevRestId(restaurant?.id);
    setCheckingShift(true);
  }

  // Subscribe to active shift in real-time
  useEffect(() => {
    if (restaurant?.id) {
      const unsub = subscribeActiveShift(restaurant.id, restaurant.shiftMode, staffDoc?.id, () => {
        setCheckingShift(false);
      });
      return unsub;
    }
  }, [restaurant?.id, restaurant?.shiftMode, staffDoc?.id, subscribeActiveShift]);

  const handleOpenShiftSubmit = async () => {
    setOpenShiftError(null);
    const floatVal = parseFloat(openFloatCash);
    if (isNaN(floatVal) || floatVal < 0) {
      const errMsg = 'Please enter a valid starting float cash amount.';
      toast.error(errMsg);
      setOpenShiftError(errMsg);
      return;
    }
    setOpeningShift(true);
    // Bug 2 fix: Ensure anonymous Firebase Auth session before writing to Firestore
    await ensureAnonymousAuth();
    const res = await openShift(
      restaurant.id,
      staffDoc?.id || 'unknown',
      staffDoc?.name || 'Cashier',
      floatVal
    );
    setOpeningShift(false);
    if (res.ok) {
      toast.success(`Till opened with starting float: ${formatCurrency(floatVal, currency)}`);
    } else {
      toast.error(`Failed to open till: ${res.error}`);
      setOpenShiftError(res.error);
    }
  };

  const handleTillTxSubmit = async () => {
    const amt = parseFloat(tillTxAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (!tillTxReason.trim()) {
      toast.error('Please provide a reason/description.');
      return;
    }
    if (!activeShift?.id) {
      toast.error('No active shift found.');
      return;
    }
    const res = await recordCashTransaction(
      restaurant.id,
      activeShift.id,
      amt,
      tillTxType,
      tillTxReason.trim()
    );
    if (res.ok) {
      toast.success(`Logged ${tillTxType === 'drop' ? 'Cash Drop' : 'Paid-Out'} successfully!`);
      setTillTxAmount('');
      setTillTxReason('');
    } else {
      toast.error(`Transaction failed: ${res.error}`);
    }
  };

  const handleCloseShiftSubmit = async () => {
    const countedStr = (closeCountedCash ?? '').toString().trim();
    if (!countedStr || isNaN(parseFloat(countedStr))) {
      toast.error('Please enter counted cash amount.');
      return;
    }
    if (!activeShift?.id) {
      toast.error('No active shift found.');
      return;
    }
    setClosingShift(true);
    const res = await closeShift(
      restaurant.id,
      activeShift.id,
      parseFloat(countedStr),
      staffDoc?.id || 'unknown',
      staffDoc?.name || 'Cashier'
    );
    setClosingShift(false);
    if (res.ok) {
      toast.success('Shift closed successfully!');
      setZReportToShow(res.zReport);
      setShowTillModal(false);
      setCloseCountedCash('');
      setDenominations({ 500: '', 200: '', 100: '', 50: '', 20: '', 10: '', coins: '' });
      setShowDenomCounter(false);
      setTillModalTab('summary');
    } else {
      toast.error(`Failed to close shift: ${res.error}`);
    }
  };

  const handleCartDecrement = async (item) => {
    if (!editingOrderId) {
      updateQty(item.id, item.qty - 1);
      return;
    }

    try {
      const orderRef = doc(db, 'restaurants', restaurant.id, 'orders', editingOrderId);
      const snap = await getDoc(orderRef);
      if (!snap.exists()) {
        updateQty(item.id, item.qty - 1);
        return;
      }

      const orderData = snap.data();
      const originalItem = (orderData.items ?? []).find(oi => oi.id === item.id);
      
      if (originalItem && (item.qty - 1) < originalItem.qty) {
        setVoidAction({
          type: 'decrement',
          item,
          currentQty: item.qty,
          targetQty: item.qty - 1
        });
        setVoidReason('Burnt/Kitchen Error');
        setManagerPin('');
        setShowVoidModal(true);
      } else {
        updateQty(item.id, item.qty - 1);
      }
    } catch (e) {
      console.error(e);
      updateQty(item.id, item.qty - 1);
    }
  };

  const handleCartRemove = async (item) => {
    if (!editingOrderId) {
      removeItem(item.id);
      return;
    }

    try {
      const orderRef = doc(db, 'restaurants', restaurant.id, 'orders', editingOrderId);
      const snap = await getDoc(orderRef);
      if (!snap.exists()) {
        removeItem(item.id);
        return;
      }

      const orderData = snap.data();
      const originalItem = (orderData.items ?? []).find(oi => oi.id === item.id);

      if (originalItem) {
        setVoidAction({
          type: 'remove',
          item,
          currentQty: item.qty,
          targetQty: 0
        });
        setVoidReason('Burnt/Kitchen Error');
        setManagerPin('');
        setShowVoidModal(true);
      } else {
        removeItem(item.id);
      }
    } catch (e) {
      console.error(e);
      removeItem(item.id);
    }
  };

  const handleVoidAuthorizeSubmit = async () => {
    if (!managerPin.trim()) {
      toast.error('Please enter manager PIN.');
      return;
    }
    
    try {
      await ensureAnonymousAuth();
      const staffRef = collection(db, 'restaurants', restaurant.id, 'staff');
      const q = query(
        staffRef,
        where('pin', '==', managerPin),
        where('active', '==', true)
      );
      const snap = await getDocs(q);
      
      const managerDoc = snap.docs.find(d => ['admin', 'super_admin'].includes(d.data().role));
      if (!managerDoc) {
        toast.error('Invalid Manager PIN or Insufficient Permissions');
        return;
      }

      const managerData = managerDoc.data();
      const qtyReduced = voidAction.type === 'remove' ? voidAction.item.qty : 1;
      const voidVal = voidAction.item.price * qtyReduced;

      const voidLog = {
        timestamp: new Date(),
        orderId: editingOrderId,
        tableName: tableName || 'N/A',
        itemId: voidAction.item.id,
        itemName: voidAction.item.name,
        itemPrice: voidAction.item.price,
        reducedQty: qtyReduced,
        cashierId: staffDoc?.id || 'unknown',
        cashierName: staffDoc?.name || 'Cashier',
        managerId: managerDoc.id,
        managerName: managerData.name,
        reason: voidReason,
        value: voidVal
      };

      await addDoc(collection(db, 'restaurants', restaurant.id, 'void_logs'), voidLog);

      if (voidAction.type === 'remove') {
        removeItem(voidAction.item.id);
      } else {
        updateQty(voidAction.item.id, voidAction.item.qty - 1);
      }

      setShowVoidModal(false);
      setVoidAction(null);
      toast.success('Void authorized and logged!');
    } catch (e) {
      toast.error('Authorization failed: ' + e.message);
    }
  };

  const handleCustomerLookup = async (phoneStr) => {
    const cleanPhone = phoneStr.replace(/\D/g, '');
    if (cleanPhone.length < 8) return;

    try {
      await ensureAnonymousAuth();
      const docRef = doc(db, 'restaurants', restaurant.id, 'customers', cleanPhone);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const profile = { id: docSnap.id, ...docSnap.data() };
        setCustomerProfile(profile);
        setCustomer(profile.name, profile.phone);
        setCustSearch('');
        toast.success(`Attached customer: ${profile.name}`);
      } else {
        setShowQuickRegister(true);
      }
    } catch (e) {
      toast.error('Lookup failed: ' + e.message);
    }
  };

  const handleQuickRegister = async () => {
    if (!newCustName.trim()) {
      toast.error('Please enter customer name');
      return;
    }
    const cleanPhone = custSearch.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      toast.error('Valid phone number required');
      return;
    }

    const payload = {
      name: newCustName.trim(),
      phone: cleanPhone,
      points: 0,
      visitCount: 0,
      lifetimeSpend: 0,
      birthday: '',
      notes: '',
      createdAt: new Date()
    };

    try {
      await ensureAnonymousAuth();
      await setDoc(doc(db, 'restaurants', restaurant.id, 'customers', cleanPhone), payload);
      setCustomerProfile(payload);
      setCustomer(payload.name, payload.phone);
      setShowQuickRegister(false);
      setNewCustName('');
      setCustSearch('');
      toast.success(`Registered & Attached: ${payload.name}`);
    } catch (e) {
      toast.error('Registration failed: ' + e.message);
    }
  };

  // Menu items from active category (or all categories when searching) + dietary filter
  const displayItems = useMemo(() => {
    // When searching, search across all items regardless of active category tab
    const rawItems = (activeCat === 'all' || search.trim())
      ? categories.flatMap(c => c.items ?? [])
      : categories.find(c => c.id === activeCat)?.items ?? [];

    let filtered = rawItems;
    if (search.trim()) {
      const lowerSearch = search.toLowerCase().trim();
      filtered = filtered.filter(i => 
        i.name?.toLowerCase().includes(lowerSearch) ||
        i.code?.toLowerCase().includes(lowerSearch) ||
        i.sku?.toLowerCase().includes(lowerSearch) ||
        i.categoryName?.toLowerCase().includes(lowerSearch)
      );
    }

    if (dietaryFilter === 'veg') {
      filtered = filtered.filter(i => i.isVeg === true || i.veg === true || (/veg|paneer|salad|pasta|dal|roti|rice|mushroom|cheese|margherita/i.test(i.name) && !/chicken|mutton|fish|beef|pork|egg|meat|prawn|salmon/i.test(i.name)));
    } else if (dietaryFilter === 'non-veg') {
      filtered = filtered.filter(i => i.isVeg === false || i.veg === false || /chicken|mutton|fish|beef|pork|egg|meat|prawn|salmon|carbonara/i.test(i.name));
    } else if (dietaryFilter === 'bestseller') {
      filtered = filtered.filter(i => i.highMargin || i.isBestseller || i.popular);
    }

    return filtered;
  }, [categories, activeCat, search, dietaryFilter]);

  // Order type buttons with modern Lucide icons
  const orderTypes = [
    { key: 'dine-in',  label: t('dineIn') || 'Dine In',   Icon: UtensilsCrossed, enabled: modes.includes('table') || modes.includes('pos') },
    { key: 'takeaway', label: t('takeaway') || 'Takeaway', Icon: ShoppingBag,    enabled: true },
    { key: 'online',   label: t('online') || 'Online',     Icon: ShoppingCart,   enabled: false }, // online handled separately
  ].filter(o => o.enabled);

  const [tableSelAction, setTableSelAction] = useState('checkout');

  const handleCheckout = async () => {
    if (!items.length) return;
    if (orderType === 'dine-in' && !tableId && modes.includes('table')) {
      setTableSelAction('checkout');
      setShowTableSel(true);
      return;
    }
    setPaymentMethod('cash');
    setTableSelAction('checkout');
    setShowPayment(true);
  };

  const handleSendToKitchen = async () => {
    if (!items.length) return;
    if (orderType === 'dine-in' && !tableId && modes.includes('table')) {
      setTableSelAction('kitchen');
      setShowTableSel(true);
      return;
    }

    let token = tokenNumber;
    if (modes.includes('token') && (orderType === 'takeaway' || orderType === 'dine-in') && !token) {
      token = await issueToken(restaurant.id);
      setToken(token);
    }

    setPaymentMethod('unpaid');
    const res = await submitOrder(restaurant, staffDoc?.id);
    if (!res.ok) { toast.error(res.error); return; }

    toast.success(editingOrderId ? 'Order updated in kitchen!' : 'Order sent to kitchen!', { icon: '🍳' });
    if (token) {
      printTokenTicket({ token, orderType, customerName, restaurant });
    }
  };

  const handlePaymentConfirm = async () => {
    // Instant-close modal for 0ms cashier latency
    setShowPayment(false);
    const toastId = toast.loading('Completing payment & placing order...', { duration: 4000 });

    try {
      // If QSR mode — issue token (if not already set)
      let token = tokenNumber;
      if (modes.includes('token') && (orderType === 'takeaway' || orderType === 'dine-in') && !token) {
        token = await issueToken(restaurant.id);
        setToken(token);
      }

      const res = await submitOrder(restaurant, staffDoc?.id);
      if (!res.ok) {
        toast.error(res.error || 'Failed to place order', { id: toastId });
        return;
      }

      toast.success('Payment completed & order placed! ⚡', { id: toastId });

      const printOrder = {
        id: res.orderId,
        type: orderType,
        tableName,
        token,
        customerName,
        subtotal,
        discount,
        discountType,
        discountAmount,
        total,
        paymentMethod,
        currency,
        note,
      };

      // Print tickets in background without blocking POS interface
      setTimeout(() => {
        printReceipt({
          restaurant,
          order: printOrder,
          items,
          taxInfo,
          staffName: staffDoc?.name,
        });

        printKitchenTickets({
          restaurant,
          order: printOrder,
          items,
          staffName: staffDoc?.name,
        });

        if (token) {
          printTokenTicket({ token, orderType, customerName, restaurant });
        }
      }, 50);
    } catch (err) {
      toast.error(err.message || 'Error processing payment', { id: toastId });
    }
  };

  if (checkingShift) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:'12px' }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
        <div style={{ color: 'var(--color-label-secondary)' }}>Verifying cash till status...</div>
      </div>
    );
  }

  const isAdmin = ['admin', 'super_admin'].includes(staffDoc?.role);

  // If no active shift, overlay a starting float modal
  if (!activeShift && !adminBypassShift) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          maxWidth: '450px',
          width: '100%',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--color-separator-opaque)'
        }}>
          <h2 style={{ fontSize: 'var(--text-title2)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-2)', color: 'var(--color-label)' }}>
            🔑 Cash Till Shift Lock
          </h2>
          <p style={{ color: 'var(--color-label-secondary)', fontSize: 'var(--text-footnote)', marginBottom: 'var(--space-4)' }}>
            To begin processing orders, checkouts, and payments, you must open a new till shift and declare the starting cash float.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-bold)', color: 'var(--color-label-secondary)', marginBottom: 'var(--space-1)' }}>
                Opened By
              </label>
              <div style={{ padding: '8px 12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', color: 'var(--color-label)', fontSize: 'var(--text-body)' }}>
                👤 {staffDoc?.name || 'Cashier'} ({staffDoc?.role || 'Staff'})
              </div>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-bold)', color: 'var(--color-label-secondary)', marginBottom: 'var(--space-1)' }}>
                Starting Float ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="0.00"
                value={openFloatCash}
                onChange={e => setOpenFloatCash(e.target.value)}
                style={{ fontSize: 'var(--text-title3)', padding: 'var(--space-3)', textAlign: 'center', fontWeight: 'var(--weight-bold)' }}
                autoFocus
              />
            </div>
          </div>
          
          {openShiftError && (
            <div style={{
              background: 'var(--color-red-light)',
              border: '1px solid var(--color-red)',
              color: 'var(--color-red)',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-footnote)',
              marginBottom: 'var(--space-4)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              textAlign: 'left',
              lineHeight: '1.4'
            }}>
              <span style={{ fontSize: 'var(--text-callout)', marginTop: '-1px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 'var(--weight-bold)' }}>Failed to open shift:</div>
                <div style={{ opacity: 0.9, wordBreak: 'break-word', marginTop: '2px' }}>{openShiftError}</div>
              </div>
            </div>
          )}
          
          <button
            className="btn btn-primary"
            onClick={handleOpenShiftSubmit}
            disabled={openingShift}
            style={{ width: '100%', height: 48, fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', opacity: openingShift ? 0.7 : 1 }}
          >
            {openingShift ? '⏳ Opening...' : '🔓 Open Shift & Unlock POS'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              const { signOut } = useAuthStore.getState();
              await signOut();
            }}
            style={{ width: '100%', height: 40, marginTop: 'var(--space-2)', fontSize: 'var(--text-footnote)' }}
          >
            ↩ Exit to Login
          </button>
          {isAdmin && (
            <button
              className="btn btn-ghost"
              onClick={() => setAdminBypassShift(true)}
              style={{ width: '100%', height: 40, marginTop: 'var(--space-1)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}
            >
              Skip (Admin)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pos-layout">
      {/* ── Menu Panel ─────────────────────────────── */}
      <div className="pos-menu-panel">


        {/* Category chips with counts */}
        <div className="pos-category-bar">
          <button
            id="cat-all"
            className={`category-chip ${activeCat === 'all' ? 'active' : ''}`}
            onClick={() => { setActiveCat('all'); setSearch(''); }}
          >
            <span>🍽️</span> All Items
            <span className="category-chip-count">{categories.reduce((acc, c) => acc + (c.items?.length || 0), 0)}</span>
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              id={`cat-${c.id}`}
              className={`category-chip ${activeCat === c.id ? 'active' : ''}`}
              onClick={() => { setActiveCat(c.id); setSearch(''); }}
            >
              {c.emoji && <span>{c.emoji}</span>}
              <span>{c.name}</span>
              {c.items?.length > 0 && (
                <span className="category-chip-count">{c.items.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Dietary Quick Filter Bar + View Density & Focus Controls */}
        <div className="menu-dietary-bar">
          {/* Scrollable filter chips */}
          <div className="menu-dietary-chips">
            <button
              type="button"
              className={`dietary-chip dietary-chip--all ${dietaryFilter === 'all' ? 'active' : ''}`}
              onClick={() => setDietaryFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`dietary-chip dietary-chip--veg ${dietaryFilter === 'veg' ? 'active' : ''}`}
              onClick={() => setDietaryFilter(f => f === 'veg' ? 'all' : 'veg')}
            >
              <span className="food-badge-veg" /> Pure Veg
            </button>
            <button
              type="button"
              className={`dietary-chip dietary-chip--nonveg ${dietaryFilter === 'non-veg' ? 'active' : ''}`}
              onClick={() => setDietaryFilter(f => f === 'non-veg' ? 'all' : 'non-veg')}
            >
              <span className="food-badge-nonveg" /> Non-Veg
            </button>
            <button
              type="button"
              className={`dietary-chip dietary-chip--bestseller ${dietaryFilter === 'bestseller' ? 'active' : ''}`}
              onClick={() => setDietaryFilter(f => f === 'bestseller' ? 'all' : 'bestseller')}
            >
              <Sparkles size={12} color="#f59e0b" /> Bestsellers
            </button>
          </div>

          {/* Sticky right: density toggle + focus */}
          <div className="menu-dietary-controls">
            <div className="density-toggle">
              <button
                type="button"
                onClick={() => setMenuDensity('visual')}
                title="Visual Cards with photos"
                className={`density-btn ${menuDensity === 'visual' ? 'active' : ''}`}
              >
                <LayoutGrid size={12} />
                <span className="density-label">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setMenuDensity('dense')}
                title="Fast QSR Touch Keys"
                className={`density-btn ${menuDensity === 'dense' ? 'active' : ''}`}
              >
                ⚡
                <span className="density-label">Fast Keys</span>
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-xs density-expand-btn"
              onClick={() => setIsFocusMode(!isFocusMode)}
              title={isFocusMode ? "Exit Fullscreen Focus Mode" : "Fullscreen POS Focus Mode"}
            >
              {isFocusMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
        </div>

        {/* Menu grid */}
        {loadingMenu ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
            {Array.from({length:12}).map((_,i) => (
              <div key={i} className="skeleton" style={{ aspectRatio: '3/4', borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--color-label-tertiary)', flexDirection:'column', gap:'var(--space-3)' }}>
            <div style={{fontSize:40}}>🍽️</div>
            <div>No items found</div>
          </div>
        ) : (
          <div className={`menu-grid ${menuDensity === 'dense' ? 'dense' : ''}`}>
            {displayItems.map(item => {
              const qty = getItemQty(item);
              const hasModifiers = item.modifierGroups && item.modifierGroups.length > 0;
              const isVegItem = item.isVeg === true || item.veg === true || (/veg|paneer|salad|pasta|dal|roti|rice|mushroom|cheese|margherita/i.test(item.name) && !/chicken|mutton|fish|beef|pork|egg|meat|prawn|salmon/i.test(item.name));
              
              if (menuDensity === 'dense') {
                return (
                  <div
                    key={item.id}
                    id={`menu-item-${item.id}`}
                    role="button"
                    tabIndex={0}
                    className={`menu-key-card ${item.available === false ? 'unavailable' : ''} ${qty > 0 ? 'in-cart' : ''}`}
                    onClick={() => {
                      if (item.available === false) return;
                      if (hasModifiers) setActiveModifierItem(item);
                      else addItem(item);
                    }}
                    onKeyDown={e => {
                      if (item.available === false) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (hasModifiers) setActiveModifierItem(item);
                        else addItem(item);
                      }
                    }}
                  >
                    <div className="menu-key-header">
                      <span className={isVegItem ? "food-badge-veg" : "food-badge-nonveg"} />
                      <span className="menu-key-name" title={item.name}>{item.name}</span>
                      {item.highMargin && <span title="Chef's Special" style={{ fontSize: '11px', flexShrink: 0 }}>⭐</span>}
                    </div>
                    <div className="menu-key-footer">
                      <span className="menu-key-price">{formatCurrency(item.price, currency)}</span>
                      {qty > 0 ? (
                        <span className="menu-key-qty-badge">
                          <Check size={10} strokeWidth={3} /> {qty}
                        </span>
                      ) : (
                        <span className="menu-key-add-btn">
                          <Plus size={11} strokeWidth={2.5} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  id={`menu-item-${item.id}`}
                  role="button"
                  tabIndex={0}
                  className={`menu-item-card ${item.available === false ? 'unavailable' : ''} ${qty > 0 ? 'in-cart' : ''}`}
                  onClick={() => {
                    if (item.available === false) return;
                    if (hasModifiers) {
                      setActiveModifierItem(item);
                    } else {
                      addItem(item);
                    }
                  }}
                  onKeyDown={e => {
                    if (item.available === false) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (hasModifiers) {
                        setActiveModifierItem(item);
                      } else {
                        addItem(item);
                      }
                    }
                  }}
                >
                  {/* Veg / Non-Veg Indicator Badge */}
                  <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 'var(--z-raised)' }}>
                    <span className={isVegItem ? "food-badge-veg" : "food-badge-nonveg"} title={isVegItem ? "Vegetarian" : "Non-Vegetarian"} />
                  </div>

                  {qty > 0 && (
                    <div className="menu-item-qty-badge">{qty}</div>
                  )}
                  <div className="menu-item-img-wrap">
                    {item.imageUrl || item.image
                      ? <img src={item.imageUrl || item.image} alt={item.name} className="menu-item-img" loading="lazy" />
                      : <div className="menu-item-img-placeholder">{item.emoji ?? '🍽️'}</div>
                    }
                  </div>
                  <div className="menu-item-body">
                    <div className="menu-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {item.name}
                      {item.highMargin && <span title="High Margin — chef recommended" style={{ fontSize: '11px' }}>⭐</span>}
                    </div>
                    <div className="menu-item-price">{formatCurrency(item.price, currency)}</div>
                  </div>

                </div>

              );
            })}
          </div>
        )}

        {/* Floating Cart Button for mobile/tablet */}
        <div 
          className={`mobile-cart-toggle-bar ${items.length === 0 ? 'empty' : ''}`} 
          onClick={() => setMobileCartOpen(true)}
          title={t('cart')}
        >
          {items.length > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingCart size={18} />
                <span className="badge badge-blue" style={{ background: 'var(--color-accent)', color: '#fff', padding: '2px 6px', borderRadius: '50%' }}>
                  {items.reduce((sum, i) => sum + i.qty, 0)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 'var(--weight-bold)' }}>{formatCurrency(total, currency)}</span>
                <span style={{ fontSize: '10px' }}>▲</span>
              </div>
            </>
          ) : (
            <ShoppingCart size={20} />
          )}
        </div>
      </div>

      {/* Mobile Cart Overlay */}
      {mobileCartOpen && (
        <div className="mobile-cart-overlay" onClick={() => setMobileCartOpen(false)} />
      )}

      {/* ── Cart Panel ─────────────────────────────── */}
      <div className={`pos-cart-panel ${mobileCartOpen ? 'open' : ''}`}>
        {/* Cart Header */}
        <div className="cart-header">
          <div className="cart-title-wrap">
            <ShoppingBag size={17} color="var(--color-accent)" />
            <span style={{ fontSize: '13.5px', fontWeight: 'var(--weight-bold)', color: 'var(--color-label)' }}>{t('cart')}</span>
            {items.length > 0 && (
              <span className="cart-count-pill">{items.reduce((s, i) => s + i.qty, 0)}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setShowTillModal(true)} 
              id="till-drawer-btn"
              disabled={!activeShift}
              title={!activeShift ? 'Open a shift first' : 'Till Drawer'}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '26px', padding: '0 8px', fontSize: '11px', borderRadius: 'var(--radius-full)', opacity: activeShift ? 1 : 0.4 }}
            >
              <Banknote size={13} /> Till
            </button>
            {items.length > 0 && (
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={clearCart} 
                id="clear-cart-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '26px', padding: '0 6px', fontSize: '11px', color: 'var(--color-label-secondary)' }}
                title="Clear all items"
              >
                <Trash2 size={12} /> {t('clearCart')}
              </button>
            )}
            <button
              className="btn btn-ghost btn-icon mobile-only"
              onClick={() => setMobileCartOpen(false)}
              style={{ width: '26px', height: '26px', padding: 0 }}
              title="Close cart"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {editingOrderId && (
          <div style={{
            background: 'var(--color-accent-light)',
            color: 'var(--color-accent)',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--text-footnote)',
            fontWeight: 'var(--weight-semibold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-separator)'
          }}>
            <span>📝 Modifying Table Order</span>
            <button 
              className="btn btn-ghost btn-xs"
              onClick={clearCart}
              style={{ color: 'var(--color-accent)', padding: '2px 6px', fontSize: 10 }}
            >
              Cancel Edit
            </button>
          </div>
        )}

        {/* Modern Segmented Order Type Control */}
        <div className="cart-type-tabs">
          {orderTypes.map(ot => {
            const Icon = ot.Icon;
            return (
              <button
                key={ot.key}
                id={`order-type-${ot.key}`}
                className={`cart-type-tab ${orderType === ot.key ? 'active' : ''}`}
                onClick={() => setOrderType(ot.key)}
              >
                {Icon && <Icon size={14} />}
                <span>{ot.label}</span>
              </button>
            );
          })}
        </div>

        {/* Service Details: Table and Customer/Loyalty */}
        <div className="cart-service-details" style={{
          gridTemplateColumns: (orderType === 'dine-in' && (restaurant?.features?.table || modes.includes('table'))) ? '1fr 1.2fr' : '1fr'
        }}>
          {orderType === 'dine-in' && (restaurant?.features?.table || modes.includes('table')) && (
            <button
              type="button"
              onClick={() => setShowTableSel(true)}
              className={`cart-table-select-trigger ${tableId ? 'has-table' : ''}`}
              id="select-table-dropdown"
              title={tableId ? `Table ${tableName} selected - click to switch` : (t('selectTable') || 'Select Table')}
            >
              <span className="cart-table-select-content">
                <span className="cart-table-icon">🪑</span>
                <span className="cart-table-label">
                  {tableId ? `Table ${tableName}` : (t('selectTable') || 'Select Table')}
                </span>
              </span>
              <ChevronDown size={11} className="cart-table-chevron" />
            </button>
          )}

          {/* Customer / Loyalty Info column */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {customer ? (
              <div className="cart-customer-vip-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'var(--weight-bold)', color: '#047857', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    👤 {customer.name}
                  </span>
                  <span style={{ fontSize: '10px', color: '#065f46', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                    ⭐ {customer.points} pts
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerProfile(null);
                    setCustomer('', '');
                    setRedeemingPoints(false);
                  }}
                  style={{ color: 'var(--color-red)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                  title="Remove customer"
                >
                  <X size={12} />
                </button>
              </div>
            ) : showQuickRegister ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: '34px' }}>
                <input
                  className="form-input"
                  placeholder="Customer name"
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  style={{ height: 32, fontSize: '11px', padding: '2px 8px', flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-success btn-xs"
                  onClick={handleQuickRegister}
                  style={{ height: 32, padding: '0 8px', fontSize: 11 }}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowQuickRegister(false)}
                  style={{ height: 32, padding: '0 8px', fontSize: 11 }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
                <input
                  className="cart-customer-search-input"
                  placeholder={orderType === 'dine-in' ? "Loyalty Phone..." : "Customer phone / Loyalty..."}
                  value={custSearch}
                  onChange={e => {
                    setCustSearch(e.target.value);
                    if (e.target.value.replace(/\D/g, '').length >= 8) {
                      handleCustomerLookup(e.target.value);
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleCustomerLookup(custSearch);
                    }
                  }}
                  style={{ paddingLeft: '28px' }}
                />
              </div>
            )}
          </div>
        </div>

        {orderType === 'takeaway' && !customer && !showQuickRegister && (
          <div style={{ padding: '6px var(--space-4)', borderBottom: '1px solid var(--color-separator)', display:'flex', gap:'var(--space-2)', background: 'var(--color-bg-secondary)' }}>
            <input className="form-input" placeholder="Customer name" value={customerName}
              onChange={e => setCustomer(e.target.value, customerPhone)}
              id="customer-name-input" style={{ fontSize: '12px', height: '30px', padding: '4px 8px', flex: 1 }} />
            <input className="form-input" placeholder="Phone" value={customerPhone}
              onChange={e => setCustomer(customerName, e.target.value)}
              id="customer-phone-input" style={{ fontSize: '12px', height: '30px', padding: '4px 8px', width: 115 }} />
          </div>
        )}

        {/* Cart Items */}
        <div className="cart-items">
          {items.length === 0 ? (
            <div className="cart-empty">
              <div style={{ fontSize: 44 }}>🛒</div>
              <div className="text-headline" style={{ fontWeight: 700 }}>{t('emptyCart')}</div>
              <div className="text-footnote text-tertiary">{t('emptyCartHint')}</div>
            </div>
          ) : (
            (() => {
              const COURSES = ['Appetizers', 'Mains', 'Desserts', 'Beverages'];
              const courseColors = {
                Appetizers: '#10b981',
                Mains: '#3b82f6',
                Desserts: '#8b5cf6',
                Beverages: '#f59e0b',
              };
              return COURSES.map(courseName => {
                const courseItems = items.filter(i => (i.course ?? 'Mains') === courseName);
                if (courseItems.length === 0) return null;
                return (
                  <div key={courseName}>
                    {/* Course Header */}
                    <div className="cart-course-header">
                      <span className="cart-course-pill">
                        <span className="cart-course-dot" style={{ background: courseColors[courseName] || 'var(--color-accent)' }} />
                        {courseName}
                      </span>
                      <span className="cart-course-count">({courseItems.length})</span>
                      <div className="cart-course-header-line" />
                      {editingOrderId && courseItems.some(i => i.prepState === 'hold') && (
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          onClick={async () => {
                            const res = await useOrderStore.getState().fireCourse(restaurant.id, editingOrderId, courseName);
                            if (res.ok) toast.success(`Fired ${courseName}!`);
                            else toast.error(`Fire failed: ${res.error}`);
                          }}
                          style={{ padding: '2px 8px', fontSize: 9, flexShrink: 0 }}
                        >
                          🔥 Fire
                        </button>
                      )}
                    </div>

                    {/* Course Items */}
                    {courseItems.map(i => (
                      <div key={i.id} className="cart-item-card">
                        {/* Row 1: Name + Price */}
                        <div className="cart-item-card-top">
                          <span className="cart-item-card-name" title={i.name}>
                            {i.name}
                          </span>
                          <span className="cart-item-card-price">
                            {formatCurrency(i.price * i.qty, currency)}
                          </span>
                        </div>

                        {/* Optional Modifiers */}
                        {i.selectedModifiers?.length > 0 && (
                          <div className="cart-item-modifiers">
                            {i.selectedModifiers.map((m, idx) => (
                              <span key={idx} className="cart-modifier-chip">
                                +{m.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Row 2: Tactile Stepper + Status + Course + Remove */}
                        <div className="cart-item-card-bottom">
                          {/* Tactile Stepper */}
                          <div className="cart-stepper">
                            <button 
                              type="button"
                              className="cart-stepper-btn" 
                              onClick={() => handleCartDecrement(i)}
                              title="Decrease quantity"
                            >
                              <Minus size={11} strokeWidth={2.5} />
                            </button>
                            <span className="cart-stepper-count">{i.qty}</span>
                            <button 
                              type="button"
                              className="cart-stepper-btn" 
                              onClick={() => updateQty(i.id, i.qty + 1)}
                              title="Increase quantity"
                            >
                              <Plus size={11} strokeWidth={2.5} />
                            </button>
                          </div>

                          {/* Status Badge (Fired vs Hold) */}
                          <button
                            type="button"
                            className={`cart-status-badge ${i.prepState === 'hold' ? 'hold' : 'fired'}`}
                            onClick={() => useOrderStore.getState().toggleItemHold(i.id)}
                            title={i.prepState === 'hold' ? 'On hold - click to fire' : 'Fired - click to hold'}
                          >
                            {i.prepState === 'hold' ? (
                              <><Clock size={10} /> Hold</>
                            ) : (
                              <><Flame size={10} /> Fired</>
                            )}
                          </button>

                          {/* Custom Course Picker Popover (Eliminates ugly OS select bubble) */}
                          <CartCoursePicker
                            currentCourse={i.course}
                            onSelectCourse={(course) => useOrderStore.getState().setItemCourse(i.id, course)}
                          />

                          {/* Remove Button */}
                          <button 
                            type="button"
                            className="cart-item-card-remove"
                            onClick={() => handleCartRemove(i)} 
                            title="Remove item"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              });
            })()
          )}
        </div>

        {/* Smart Collapsible Add-ons & Upsell Bar */}
        {items.length > 0 && (
          <>
            {/* Dismissible Compact Upsell Nudge */}
            {!dismissedUpsell && sevenDayAvg > 0 && total > 0 && total < sevenDayAvg && (
              <div className="cart-upsell-chip">
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>💡</span> Order is below avg ({formatCurrency(sevenDayAvg, currency)}). Add drink?
                </span>
                <button
                  type="button"
                  onClick={() => setDismissedUpsell(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex', opacity: 0.6 }}
                  title="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Collapsed Pill Row */}
            <div className="cart-addons-bar">
              {/* Discount Pill / Active Chip */}
              {discount > 0 ? (
                <div className="cart-addon-chip">
                  <Tag size={11} />
                  <span 
                    onClick={() => setActiveAddon(activeAddon === 'discount' ? null : 'discount')}
                    style={{ cursor: 'pointer' }}
                    title="Click to edit discount"
                  >
                    {discountType === 'percent' ? `${discount}%` : formatCurrency(discount, currency)} (-{formatCurrency(discountAmount, currency)})
                  </span>
                  <button
                    type="button"
                    className="cart-addon-remove"
                    onClick={() => { setDiscount(0, discountType); if (activeAddon === 'discount') setActiveAddon(null); }}
                    title="Remove discount"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`cart-addon-btn ${activeAddon === 'discount' ? 'active' : ''}`}
                  onClick={() => setActiveAddon(activeAddon === 'discount' ? null : 'discount')}
                >
                  <Tag size={11} /> + Discount
                </button>
              )}

              {/* Note Pill / Active Chip */}
              {note ? (
                <div className="cart-addon-chip note-chip">
                  <FileText size={11} />
                  <span 
                    onClick={() => setActiveAddon(activeAddon === 'note' ? null : 'note')}
                    style={{ cursor: 'pointer', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={note}
                  >
                    "{note}"
                  </span>
                  <button
                    type="button"
                    className="cart-addon-remove"
                    onClick={() => { setNote(''); if (activeAddon === 'note') setActiveAddon(null); }}
                    title="Clear note"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`cart-addon-btn ${activeAddon === 'note' ? 'active' : ''}`}
                  onClick={() => setActiveAddon(activeAddon === 'note' ? null : 'note')}
                >
                  <FileText size={11} /> + Note
                </button>
              )}
            </div>

            {/* Inline Addon Expandable Drawer */}
            {activeAddon === 'discount' && (
              <div className="cart-addon-drawer">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-label)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Tag size={12} /> Add Order Discount
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveAddon(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-label-tertiary)', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: '4px', border: '1px solid var(--color-separator)', padding: '1px' }}>
                    <button
                      type="button"
                      onClick={() => setDiscount(discount, 'percent')}
                      style={{
                        border: 'none',
                        background: discountType === 'percent' ? 'var(--color-label)' : 'transparent',
                        color: discountType === 'percent' ? 'var(--color-bg)' : 'var(--color-label-secondary)',
                        fontSize: '9.5px',
                        fontWeight: '700',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscount(discount, 'fixed')}
                      style={{
                        border: 'none',
                        background: discountType === 'fixed' ? 'var(--color-label)' : 'transparent',
                        color: discountType === 'fixed' ? 'var(--color-bg)' : 'var(--color-label-secondary)',
                        fontSize: '9.5px',
                        fontWeight: '700',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      {currency}
                    </button>
                  </div>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    value={discount === 0 ? '' : discount}
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0, discountType)}
                    placeholder="Enter value"
                    autoFocus
                    style={{ flex: 1, height: 26, padding: '2px 8px', fontSize: 11, textAlign: 'right', borderRadius: '4px', border: '1px solid var(--color-separator)' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[5, 10, 15, 20].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      className="cart-discount-preset-btn"
                      onClick={() => setDiscount(pct, 'percent')}
                    >
                      {pct}%
                    </button>
                  ))}
                  {discount > 0 && (
                    <button
                      type="button"
                      className="cart-discount-preset-btn"
                      onClick={() => setDiscount(0, discountType)}
                      style={{ color: 'var(--color-red)', marginLeft: 'auto' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeAddon === 'note' && (
              <div className="cart-addon-drawer">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-label)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FileText size={12} /> Kitchen Special Note
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveAddon(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-label-tertiary)', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                  <input
                    className="form-input"
                    placeholder="e.g. less spicy, no onion..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    id="order-note-input"
                    style={{ fontSize: '11.5px', height: '28px', padding: '4px 8px', flex: 1 }}
                    autoFocus
                  />
                  {note && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setNote('')}
                      style={{ padding: '2px', height: '28px', minWidth: '28px' }}
                      title="Clear text"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {['Less Spicy', 'No Onion', 'Pack Sep.', 'Extra Chutney'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      className="cart-note-preset-chip"
                      onClick={() => setNote(note ? `${note}, ${preset}` : preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Totals & Financial Summary Card */}
        {items.length > 0 && (
          <div className="cart-totals">
            {/* Collapsible Subtotal and Taxes Breakdown */}
            {showTotalsBreakdown && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '6px', borderBottom: '1px solid var(--color-separator)' }}>
                <div className="cart-total-row" style={{ fontSize: '12px' }}>
                  <span>{t('subtotal')}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(subtotal, currency)}</span>
                </div>
                {taxInfo.lines.map(l => (
                  <div key={l.label} className="cart-total-row" style={{ fontSize: '12px' }}>
                    <span>{l.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(l.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Grand Total */}
            <div 
              className="cart-total-row grand-total" 
              onClick={() => setShowTotalsBreakdown(!showTotalsBreakdown)}
              style={{ cursor: 'pointer', padding: '6px 0 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              title="Click to toggle tax breakdown details"
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {t('total')}
                <span style={{ fontSize: 9.5, color: 'var(--color-label-tertiary)', fontWeight: '600', border: '1px solid var(--color-separator)', borderRadius: '4px', padding: '2px 6px', background: 'var(--color-bg-secondary)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  {showTotalsBreakdown ? 'Hide Details ▲' : 'Show Details ▼'}
                </span>
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total, currency)}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        {(orderType === 'dine-in' && modes.includes('kds')) ? (
          <div className="cart-action-buttons">
            <button
              className="cart-action-btn-kitchen"
              id="send-to-kitchen-btn"
              onClick={handleSendToKitchen}
              disabled={!items.length}
              type="button"
              style={{ opacity: items.length ? 1 : 0.4 }}
              title="Send order to Kitchen (KOT)"
            >
              <span className="btn-3d-emoji">🍳</span>
              <span>Kitchen</span>
            </button>
            <button
              className="cart-action-btn-checkout"
              id="checkout-btn"
              onClick={handleCheckout}
              disabled={!items.length}
              type="button"
              style={{ opacity: items.length ? 1 : 0.4 }}
              title="Proceed to payment & checkout"
            >
              <span className="btn-3d-emoji">⚡</span>
              <span>Checkout</span>
            </button>
          </div>
        ) : (
          <button
            className="cart-checkout-btn"
            id="checkout-btn"
            onClick={handleCheckout}
            disabled={!items.length}
            type="button"
            style={{ opacity: items.length ? 1 : 0.4 }}
          >
            <span className="btn-3d-emoji">⚡</span>
            <span>{t('checkout')} ({items.reduce((s, i) => s + i.qty, 0)})</span>
            <span style={{ margin: '0 4px', opacity: 0.5 }}>·</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(total, currency)}</span>
            <ChevronRight size={18} style={{ marginLeft: 'auto' }} />
          </button>
        )}
      </div>

      {/* Modals */}
      {showTableSel && (
        <TableSelectModal
          restaurantId={restaurant?.id}
          tableOrders={tableOrders}
          onSelect={async (id, name) => {
            setTable(id, name);
            setShowTableSel(false);
            if (items.length) {
              if (tableSelAction === 'checkout') {
                setShowPayment(true);
              } else {
                setPaymentMethod('unpaid');
                const res = await submitOrder(restaurant, staffDoc?.id);
                if (!res.ok) { toast.error(res.error); return; }
                toast.success(editingOrderId ? 'Order updated in kitchen!' : 'Order sent to kitchen!', { icon: '🍳' });
              }
            }
          }}
          onClose={() => setShowTableSel(false)}
        />
      )}
      {showPayment && (
        <PaymentModal
          total={total}
          currency={currency}
          onConfirm={handlePaymentConfirm}
          onClose={() => setShowPayment(false)}
        />
      )}
      {activeModifierItem && (
        <ModifierModal
          item={activeModifierItem}
          currency={currency}
          onClose={() => setActiveModifierItem(null)}
          onConfirm={(selectedModifiers) => {
            const modifierTotal = selectedModifiers.reduce((sum, m) => sum + m.priceAdd, 0);
            const customId = activeModifierItem.id + '-' + selectedModifiers.map(m => m.id).sort().join('-');
            const cartItem = {
              ...activeModifierItem,
              id: customId,
              menuItemId: activeModifierItem.id,
              name: activeModifierItem.name,
              selectedModifiers,
              modifierTotal,
              price: activeModifierItem.price + modifierTotal
            };
            addItem(cartItem);
            setActiveModifierItem(null);
          }}
        />
      )}

      {/* Till Drawer Modal */}
      {showTillModal && activeShift && (() => {
        const drops = activeShift?.cashDrops ?? [];
        const paidOuts = activeShift?.paidOuts ?? [];
        const dropsAmt = drops.reduce((sum, d) => sum + (d.amount || 0), 0);
        const paidOutsAmt = paidOuts.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalSalesAmt = (activeShift?.cashSalesAmount || 0) + (activeShift?.cardSalesAmount || 0) + (activeShift?.upiSalesAmount || 0);
        const totalOrdersCount = (activeShift?.cashSalesCount || 0) + (activeShift?.cardSalesCount || 0) + (activeShift?.upiSalesCount || 0);
        const expectedCash = activeShift?.expectedCash ?? activeShift?.startCash ?? 0;

        const hasCountedInput = closeCountedCash.toString().trim() !== '';
        const countedNum = hasCountedInput ? parseFloat(closeCountedCash) || 0 : null;
        const variance = countedNum !== null ? Math.round((countedNum - expectedCash) * 100) / 100 : null;

        const updateDenom = (denom, val) => {
          const next = { ...denominations, [denom]: val };
          setDenominations(next);
          let sum = 0;
          [500, 200, 100, 50, 20, 10].forEach(d => {
            const qty = parseInt(next[d], 10);
            if (!isNaN(qty) && qty > 0) sum += qty * d;
          });
          const coins = parseFloat(next.coins);
          if (!isNaN(coins) && coins > 0) sum += coins;
          setCloseCountedCash(sum > 0 ? sum.toString() : '');
        };

        const printXReport = () => {
          const printWin = window.open('', '_blank', 'width=600,height=600');
          if (!printWin) {
            toast.error('Please allow popups to print X-Report');
            return;
          }
          const openedDate = activeShift.openedAt ? new Date(activeShift.openedAt.seconds ? activeShift.openedAt.seconds * 1000 : activeShift.openedAt).toLocaleString() : '';
          const formatMonospace = (label, value) => {
            const paddingLen = 38 - label.length - value.length;
            const pad = paddingLen > 0 ? '.'.repeat(paddingLen) : ' ';
            return `${label}${pad}${value}\n`;
          };
          let report = `======================================\n`;
          report += `          ${restaurant?.name?.toUpperCase() || 'POS RESTAURANT'}\n`;
          report += `          X-REPORT: MID-SHIFT AUDIT    \n`;
          report += `======================================\n`;
          report += `Shift ID: ${activeShift.id?.substring(0, 8) || 'N/A'}\n`;
          report += `Opened By: ${activeShift.openedBy || 'N/A'}\n`;
          report += `Opened At: ${openedDate}\n`;
          report += `Printed At: ${new Date().toLocaleString()}\n`;
          report += `--------------------------------------\n`;
          report += formatMonospace('STARTING FLOAT', formatCurrency(activeShift.startCash || 0, currency));
          report += `--------------------------------------\n`;
          report += formatMonospace(`CASH SALES (${activeShift.cashSalesCount || 0})`, formatCurrency(activeShift.cashSalesAmount || 0, currency));
          report += formatMonospace(`CARD SALES (${activeShift.cardSalesCount || 0})`, formatCurrency(activeShift.cardSalesAmount || 0, currency));
          report += formatMonospace(`UPI SALES (${activeShift.upiSalesCount || 0})`, formatCurrency(activeShift.upiSalesAmount || 0, currency));
          report += `--------------------------------------\n`;
          report += formatMonospace('TOTAL SALES', formatCurrency(totalSalesAmt, currency));
          report += `--------------------------------------\n`;
          report += formatMonospace('TOTAL CASH DROPS', `-${formatCurrency(dropsAmt, currency)}`);
          report += formatMonospace('TOTAL PAID-OUTS', `-${formatCurrency(paidOutsAmt, currency)}`);
          report += `--------------------------------------\n`;
          report += formatMonospace('EXPECTED CASH', formatCurrency(expectedCash, currency));
          report += `======================================\n\n`;
          report += `Audited By: __________________________\n`;

          printWin.document.write(`<html><head><title>X-Report (Mid-Shift)</title><style>body{font-family:monospace;white-space:pre;padding:20px;color:#18181b;}</style></head><body>${report}</body></html>`);
          printWin.document.close();
          printWin.focus();
          printWin.print();
          printWin.close();
        };

        const movementsList = [
          ...drops.map(d => ({ ...d, kind: 'drop', kindLabel: 'Safe Drop' })),
          ...paidOuts.map(p => ({ ...p, kind: 'paidout', kindLabel: 'Expense Paid-Out' }))
        ].sort((a, b) => {
          const tA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp || 0).getTime();
          const tB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp || 0).getTime();
          return tB - tA;
        });

        return (
          <div
            onClick={e => e.target === e.currentTarget && setShowTillModal(false)}
            className="modal-overlay"
            style={{ zIndex: 1000 }}
          >
            <div
              className="modal till-modal-card"
              style={{
                maxWidth: '660px', width: 'min(660px, 94vw)',
                maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                borderRadius: 20, overflow: 'hidden', padding: 0
              }}
            >
              {/* Header */}
              <div style={{
                padding: '16px 22px 14px',
                borderBottom: '1px solid var(--color-separator)',
                background: 'var(--color-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>💰</span>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--color-label)', letterSpacing: '-0.02em' }}>
                      Till Drawer Management
                    </h2>
                    <p style={{ fontSize: 11.5, color: 'var(--color-label-tertiary)', margin: '2px 0 0' }}>
                      Shift opened by <strong style={{ color: 'var(--color-label-secondary)' }}>{activeShift?.openedBy || 'Staff'}</strong>
                      {activeShift?.openedAt && (
                        <span> · {new Date(activeShift.openedAt.seconds ? activeShift.openedAt.seconds * 1000 : activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTillModal(false)}
                  className="btn btn-secondary btn-icon"
                  style={{ width: 32, height: 32, borderRadius: 8, padding: 0 }}
                  title="Close modal"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Segmented Tab Navigation */}
              <div style={{
                display: 'flex',
                background: 'var(--color-bg-secondary)',
                padding: '6px 14px',
                gap: 6,
                borderBottom: '1px solid var(--color-separator)'
              }}>
                <button
                  type="button"
                  onClick={() => setTillModalTab('summary')}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 10,
                    border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: tillModalTab === 'summary' ? 700 : 500,
                    background: tillModalTab === 'summary' ? 'var(--color-card)' : 'transparent',
                    color: tillModalTab === 'summary' ? 'var(--color-primary)' : 'var(--color-label-secondary)',
                    boxShadow: tillModalTab === 'summary' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>📊</span> Drawer Overview
                </button>
                <button
                  type="button"
                  onClick={() => setTillModalTab('movement')}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 10,
                    border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: tillModalTab === 'movement' ? 700 : 500,
                    background: tillModalTab === 'movement' ? 'var(--color-card)' : 'transparent',
                    color: tillModalTab === 'movement' ? 'var(--color-primary)' : 'var(--color-label-secondary)',
                    boxShadow: tillModalTab === 'movement' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>💸</span> Cash In / Out
                  {(drops.length > 0 || paidOuts.length > 0) && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                      background: 'rgba(0,122,255,0.12)', color: 'var(--color-primary)'
                    }}>
                      {drops.length + paidOuts.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTillModalTab('close')}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 10,
                    border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: tillModalTab === 'close' ? 700 : 500,
                    background: tillModalTab === 'close' ? 'var(--color-card)' : 'transparent',
                    color: tillModalTab === 'close' ? 'var(--color-red)' : 'var(--color-label-secondary)',
                    boxShadow: tillModalTab === 'close' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>🔒</span> Close Shift
                </button>
              </div>

              {/* Modal Body Scrollable */}
              <div style={{ padding: '18px 22px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {tillModalTab === 'summary' && (
                  <>
                    {/* Expected Cash Hero Banner */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(52,199,89,0.09) 0%, rgba(0,122,255,0.06) 100%)',
                      border: '1px solid rgba(52,199,89,0.25)',
                      borderRadius: 16, padding: '18px 20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      position: 'relative', overflow: 'hidden'
                    }}>
                      <div>
                        <div style={{
                          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.08em', color: 'var(--color-green)',
                          marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6
                        }}>
                          <span>💵</span> Expected Cash In Drawer
                        </div>
                        <div style={{
                          fontSize: 28, fontWeight: 800, color: 'var(--color-label)',
                          letterSpacing: '-0.03em', lineHeight: 1.15
                        }}>
                          {formatCurrency(expectedCash, currency)}
                        </div>
                        <div style={{
                          fontSize: 11, color: 'var(--color-label-tertiary)', marginTop: 6,
                          background: 'rgba(255,255,255,0.6)', padding: '3px 8px', borderRadius: 6,
                          display: 'inline-block'
                        }}>
                          Float ({formatCurrency(activeShift?.startCash || 0, currency)}) + Cash Sales ({formatCurrency(activeShift?.cashSalesAmount || 0, currency)}) - Outflows ({formatCurrency(dropsAmt + paidOutsAmt, currency)})
                        </div>
                      </div>
                      <div style={{
                        width: 52, height: 52, borderRadius: 14,
                        background: 'rgba(52,199,89,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 26, flexShrink: 0
                      }}>
                        🏦
                      </div>
                    </div>

                    {/* Sales & Movements Summary Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                      {/* Left: Sales Breakdown */}
                      <div style={{
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 14, padding: '14px 16px',
                        border: '1px solid var(--color-separator)'
                      }}>
                        <div style={{
                          fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
                          color: 'var(--color-label-secondary)', letterSpacing: '0.05em',
                          marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6
                        }}>
                          <span>📊</span> Sales Breakdown ({totalOrdersCount} Orders)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--color-label-secondary)' }}>Starting Float:</span>
                            <strong style={{ color: 'var(--color-label)' }}>{formatCurrency(activeShift?.startCash || 0, currency)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--color-label-secondary)' }}>Cash Sales ({activeShift?.cashSalesCount || 0}):</span>
                            <strong style={{ color: 'var(--color-green)' }}>+{formatCurrency(activeShift?.cashSalesAmount || 0, currency)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--color-label-secondary)' }}>Card Sales ({activeShift?.cardSalesCount || 0}):</span>
                            <span style={{ color: 'var(--color-label)' }}>{formatCurrency(activeShift?.cardSalesAmount || 0, currency)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--color-label-secondary)' }}>UPI / QR Sales ({activeShift?.upiSalesCount || 0}):</span>
                            <span style={{ color: 'var(--color-label)' }}>{formatCurrency(activeShift?.upiSalesAmount || 0, currency)}</span>
                          </div>
                          <div style={{
                            borderTop: '1px dashed var(--color-separator)',
                            paddingTop: 8, marginTop: 2,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}>
                            <span style={{ fontWeight: 700, color: 'var(--color-label)' }}>Total Gross Sales:</span>
                            <strong style={{ fontSize: 13, color: 'var(--color-primary)' }}>{formatCurrency(totalSalesAmt, currency)}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Right: Drawer Outflows & Audit */}
                      <div style={{
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 14, padding: '14px 16px',
                        border: '1px solid var(--color-separator)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                      }}>
                        <div>
                          <div style={{
                            fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
                            color: 'var(--color-label-secondary)', letterSpacing: '0.05em',
                            marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6
                          }}>
                            <span>🔄</span> Drawer Movements
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--color-label-secondary)' }}>Safe Drops ({drops.length}):</span>
                              <strong style={{ color: dropsAmt > 0 ? 'var(--color-red)' : 'var(--color-label-tertiary)' }}>
                                {dropsAmt > 0 ? `-${formatCurrency(dropsAmt, currency)}` : '₹0.00'}
                              </strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--color-label-secondary)' }}>Expense Paid-Outs ({paidOuts.length}):</span>
                              <strong style={{ color: paidOutsAmt > 0 ? 'var(--color-red)' : 'var(--color-label-tertiary)' }}>
                                {paidOutsAmt > 0 ? `-${formatCurrency(paidOutsAmt, currency)}` : '₹0.00'}
                              </strong>
                            </div>
                            <div style={{
                              borderTop: '1px dashed var(--color-separator)',
                              paddingTop: 8, marginTop: 2,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                              <span style={{ fontWeight: 600, color: 'var(--color-label-secondary)' }}>Total Cash Deductions:</span>
                              <strong style={{ color: 'var(--color-label)' }}>{formatCurrency(dropsAmt + paidOutsAmt, currency)}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Mid-Shift X-Report Action */}
                        <div style={{
                          marginTop: 12, paddingTop: 10,
                          borderTop: '1px solid var(--color-separator)'
                        }}>
                          <button
                            type="button"
                            onClick={printXReport}
                            className="btn btn-secondary"
                            style={{
                              width: '100%', height: 38, borderRadius: 10,
                              fontSize: 12, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                            }}
                          >
                            <span>🖨️</span> Print Mid-Shift X-Report
                          </button>
                          <p style={{ fontSize: 10.5, color: 'var(--color-label-tertiary)', textAlign: 'center', margin: '4px 0 0' }}>
                            Snapshot audit for change verification. Does not close shift.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Action Navigation Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => setTillModalTab('movement')}
                        className="btn btn-secondary"
                        style={{
                          height: 44, borderRadius: 12, fontSize: 13, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}
                      >
                        <span>💸</span> Log Cash In / Out
                      </button>
                      <button
                        type="button"
                        onClick={() => setTillModalTab('close')}
                        className="btn"
                        style={{
                          height: 44, borderRadius: 12, fontSize: 13, fontWeight: 700,
                          background: 'rgba(255,59,48,0.1)', color: 'var(--color-red)',
                          border: '1px solid rgba(255,59,48,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}
                      >
                        <span>🔒</span> Close Shift Till
                      </button>
                    </div>
                  </>
                )}

                {tillModalTab === 'movement' && (
                  <>
                    {/* Log Movement Form */}
                    <div style={{
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 16, padding: '16px 18px',
                      border: '1px solid var(--color-separator)'
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                        color: 'var(--color-label-secondary)', letterSpacing: '0.05em',
                        marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6
                      }}>
                        <span>💸</span> Record Drawer Cash Movement
                      </div>

                      {/* Transaction Type Radios */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <div
                          onClick={() => setTillTxType('drop')}
                          style={{
                            padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                            background: tillTxType === 'drop' ? 'rgba(0,122,255,0.08)' : 'var(--color-card)',
                            border: `1.5px solid ${tillTxType === 'drop' ? 'var(--color-primary)' : 'var(--color-separator)'}`,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 18 }}>🏦</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-label)' }}>Safe Drop</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', lineHeight: 1.3 }}>
                            Move excess cash to safe
                          </div>
                        </div>

                        <div
                          onClick={() => setTillTxType('paidout')}
                          style={{
                            padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                            background: tillTxType === 'paidout' ? 'rgba(255,149,0,0.08)' : 'var(--color-card)',
                            border: `1.5px solid ${tillTxType === 'paidout' ? '#ff9500' : 'var(--color-separator)'}`,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 18 }}>🛒</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-label)' }}>Expense Paid-Out</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', lineHeight: 1.3 }}>
                            Daily supplies, veggies, courier
                          </div>
                        </div>
                      </div>

                      {/* Amount Input with Quick Presets */}
                      <div style={{ marginBottom: 14 }}>
                        <label style={{
                          display: 'block', fontSize: 11.5, fontWeight: 700,
                          color: 'var(--color-label-secondary)', marginBottom: 6,
                          textTransform: 'uppercase', letterSpacing: '0.04em'
                        }}>
                          Amount ({currency})
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={tillTxAmount}
                            onChange={e => setTillTxAmount(e.target.value)}
                            style={{
                              width: '100%', height: 44, padding: '0 14px',
                              borderRadius: 10, border: '1px solid var(--color-separator)',
                              background: 'var(--color-card)', fontSize: 17, fontWeight: 700,
                              color: 'var(--color-label)', boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        {/* Quick Amount Chips */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {[100, 200, 500, 1000, 2000].map(amt => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => {
                                const current = parseFloat(tillTxAmount) || 0;
                                setTillTxAmount((current + amt).toString());
                              }}
                              style={{
                                padding: '4px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                                background: 'var(--color-card)', border: '1px solid var(--color-separator)',
                                cursor: 'pointer', color: 'var(--color-label-secondary)'
                              }}
                            >
                              +₹{amt}
                            </button>
                          ))}
                          {tillTxAmount && (
                            <button
                              type="button"
                              onClick={() => setTillTxAmount('')}
                              style={{
                                padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                background: 'transparent', border: 'none',
                                cursor: 'pointer', color: 'var(--color-red)'
                              }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reason / Description with Preset Chips */}
                      <div style={{ marginBottom: 16 }}>
                        <label style={{
                          display: 'block', fontSize: 11.5, fontWeight: 700,
                          color: 'var(--color-label-secondary)', marginBottom: 6,
                          textTransform: 'uppercase', letterSpacing: '0.04em'
                        }}>
                          Reason / Description
                        </label>
                        <input
                          type="text"
                          placeholder={tillTxType === 'drop' ? 'e.g., Safe drop above ₹10,000 threshold' : 'e.g., Dairy delivery, kitchen emergency supplies'}
                          value={tillTxReason}
                          onChange={e => setTillTxReason(e.target.value)}
                          style={{
                            width: '100%', height: 40, padding: '0 14px',
                            borderRadius: 10, border: '1px solid var(--color-separator)',
                            background: 'var(--color-card)', fontSize: 13,
                            color: 'var(--color-label)', boxSizing: 'border-box'
                          }}
                        />
                        {/* Preset Reason Chips */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {(tillTxType === 'drop'
                            ? ['Routine Safe Drop', 'Excess Cash Safe Stash', 'Bank Transit']
                            : ['🥛 Milk / Dairy', '🥬 Veggies / Grocery', '📦 Courier / Delivery', '🧹 Cleaning Supplies', '🧊 Ice Bags']
                          ).map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setTillTxReason(tag)}
                              style={{
                                padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                                background: tillTxReason === tag ? 'var(--color-card)' : 'transparent',
                                border: `1px solid ${tillTxReason === tag ? 'var(--color-primary)' : 'var(--color-separator)'}`,
                                cursor: 'pointer', color: tillTxReason === tag ? 'var(--color-primary)' : 'var(--color-label-secondary)'
                              }}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="button"
                        onClick={handleTillTxSubmit}
                        className="btn btn-primary"
                        style={{
                          width: '100%', height: 44, borderRadius: 12,
                          fontSize: 14, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}
                      >
                        <span>✓</span> Record {tillTxType === 'drop' ? 'Safe Drop' : 'Paid-Out'}
                      </button>
                    </div>

                    {/* Shift Movements History List */}
                    <div style={{
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 16, padding: '14px 16px',
                      border: '1px solid var(--color-separator)'
                    }}>
                      <div style={{
                        fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
                        color: 'var(--color-label-secondary)', letterSpacing: '0.05em',
                        marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                      }}>
                        <span>📜 Today's Logged Movements ({movementsList.length})</span>
                      </div>
                      {movementsList.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--color-label-tertiary)', textAlign: 'center', margin: '14px 0' }}>
                          No cash movements logged during this shift yet.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                          {movementsList.map((m, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '8px 12px', borderRadius: 10,
                                background: 'var(--color-card)', border: '1px solid var(--color-separator)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                  background: m.kind === 'drop' ? 'rgba(0,122,255,0.1)' : 'rgba(255,149,0,0.1)',
                                  color: m.kind === 'drop' ? 'var(--color-primary)' : '#e68a00'
                                }}>
                                  {m.kindLabel}
                                </span>
                                <div>
                                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-label)' }}>
                                    {m.reason || 'No description'}
                                  </div>
                                  <div style={{ fontSize: 10.5, color: 'var(--color-label-tertiary)' }}>
                                    {m.timestamp?.seconds
                                      ? new Date(m.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                      : 'Recently'}
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-red)' }}>
                                -{formatCurrency(m.amount || 0, currency)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {tillModalTab === 'close' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Guided Steps Header */}
                    <div style={{
                      background: 'rgba(255,59,48,0.06)',
                      border: '1px solid rgba(255,59,48,0.2)',
                      borderRadius: 14, padding: '12px 16px',
                      display: 'flex', alignItems: 'center', gap: 10
                    }}>
                      <span style={{ fontSize: 20 }}>🔒</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-red)' }}>
                          Shift Closing & Drawer Reconciliation
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-label-secondary)' }}>
                          Count the cash inside the physical register drawer to reconcile against system sales.
                        </div>
                      </div>
                    </div>

                    {/* Step 1: Expected Reference */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--color-bg-secondary)', padding: '12px 16px',
                      borderRadius: 12, border: '1px solid var(--color-separator)'
                    }}>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
                          Step 1 · System Expected Total
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                          Opening Float + Cash Sales - Deductions
                        </div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-label)' }}>
                        {formatCurrency(expectedCash, currency)}
                      </div>
                    </div>

                    {/* Step 2: Physical Counted Cash Input */}
                    <div style={{
                      background: 'var(--color-bg-secondary)', padding: '14px 16px',
                      borderRadius: 14, border: '1px solid var(--color-separator)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
                            Step 2 · Enter Physical Counted Cash
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>
                            Type drawer total directly, or open the note breakdown helper
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDenomCounter(!showDenomCounter)}
                          style={{
                            padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                            background: showDenomCounter ? 'rgba(0,122,255,0.1)' : 'var(--color-card)',
                            color: showDenomCounter ? 'var(--color-primary)' : 'var(--color-label-secondary)',
                            border: '1px solid var(--color-separator)', cursor: 'pointer'
                          }}
                        >
                          {showDenomCounter ? '✕ Hide Counter' : '🧮 Denomination Helper'}
                        </button>
                      </div>

                      <div style={{ position: 'relative', marginTop: 10 }}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Enter physical cash (e.g. 22890.50)"
                          value={closeCountedCash}
                          onChange={e => setCloseCountedCash(e.target.value)}
                          style={{
                            width: '100%', height: 48, borderRadius: 12,
                            border: '1.5px solid var(--color-separator)', background: 'var(--color-card)',
                            fontSize: 20, fontWeight: 800, textAlign: 'center',
                            color: 'var(--color-label)', boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Interactive Denomination Calculator Grid */}
                      {showDenomCounter && (
                        <div style={{
                          marginTop: 12, paddingTop: 12,
                          borderTop: '1px solid var(--color-separator)'
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-secondary)', marginBottom: 8 }}>
                            Count per denomination (auto-sums above):
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                            {[500, 200, 100, 50, 20, 10].map(d => (
                              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, width: 44, color: 'var(--color-label)' }}>₹{d}</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="qty"
                                  value={denominations[d] || ''}
                                  onChange={e => updateDenom(d, e.target.value)}
                                  style={{
                                    width: '100%', height: 32, padding: '0 8px', borderRadius: 6,
                                    border: '1px solid var(--color-separator)', background: 'var(--color-card)',
                                    fontSize: 12, textAlign: 'center'
                                  }}
                                />
                              </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11.5, fontWeight: 700, width: 44, color: 'var(--color-label)' }}>Coins</span>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="₹ total"
                                value={denominations.coins || ''}
                                onChange={e => updateDenom('coins', e.target.value)}
                                style={{
                                  width: '100%', height: 32, padding: '0 8px', borderRadius: 6,
                                  border: '1px solid var(--color-separator)', background: 'var(--color-card)',
                                  fontSize: 12, textAlign: 'center'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step 3: Variance Status Banner */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)', marginBottom: 6 }}>
                        Step 3 · Reconciliation Status
                      </div>

                      {!hasCountedInput ? (
                        <div style={{
                          padding: '12px 16px', borderRadius: 12,
                          background: 'var(--color-bg-secondary)', border: '1px dashed var(--color-separator)',
                          display: 'flex', alignItems: 'center', gap: 10
                        }}>
                          <span style={{ fontSize: 18 }}>ℹ️</span>
                          <span style={{ fontSize: 12, color: 'var(--color-label-secondary)' }}>
                            Enter counted physical cash above to calculate drawer variance.
                          </span>
                        </div>
                      ) : variance === 0 ? (
                        <div style={{
                          padding: '14px 16px', borderRadius: 12,
                          background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.3)',
                          display: 'flex', alignItems: 'center', gap: 12
                        }}>
                          <span style={{ fontSize: 24 }}>✅</span>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--color-green)' }}>
                              Perfect Match (₹0.00 Variance)
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                              Physical counted cash perfectly balances with all system sales.
                            </div>
                          </div>
                        </div>
                      ) : variance < 0 ? (
                        <div style={{
                          padding: '14px 16px', borderRadius: 12,
                          background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)',
                          display: 'flex', alignItems: 'center', gap: 12
                        }}>
                          <span style={{ fontSize: 24 }}>⚠️</span>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--color-red)' }}>
                              Cash Shortage: -{formatCurrency(Math.abs(variance), currency)}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                              The physical drawer is missing {formatCurrency(Math.abs(variance), currency)}. Please recount or verify if an unrecorded cash payout occurred.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          padding: '14px 16px', borderRadius: 12,
                          background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.3)',
                          display: 'flex', alignItems: 'center', gap: 12
                        }}>
                          <span style={{ fontSize: 24 }}>ℹ️</span>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#e68a00' }}>
                              Cash Surplus: +{formatCurrency(variance, currency)}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                              The physical drawer contains {formatCurrency(variance, currency)} more than registered. Check if tips or float were added.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Destructive Shift Close Button */}
                    <div style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        onClick={handleCloseShiftSubmit}
                        disabled={closingShift || !hasCountedInput}
                        style={{
                          width: '100%', height: 48, borderRadius: 14,
                          background: (!hasCountedInput || closingShift) ? 'var(--color-bg-secondary)' : 'var(--color-red)',
                          color: (!hasCountedInput || closingShift) ? 'var(--color-label-tertiary)' : '#fff',
                          border: 'none', cursor: (!hasCountedInput || closingShift) ? 'not-allowed' : 'pointer',
                          fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em',
                          boxShadow: (!hasCountedInput || closingShift) ? 'none' : '0 4px 12px rgba(255,59,48,0.35)',
                          transition: 'all 0.2s ease',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}
                      >
                        {closingShift ? '⏳ Finalizing & Printing Z-Report...' : '🔴 Close Shift & Print Z-Report'}
                      </button>
                      <p style={{ fontSize: 11, color: 'var(--color-label-tertiary)', textAlign: 'center', margin: '8px 0 0' }}>
                        This permanently closes the active shift, prints the Z-Report audit, and resets the register for the next cashier.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Z-Report Modal */}

      {zReportToShow && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ maxWidth: '420px', width: '100%', padding: '24px', borderRadius: '20px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <span style={{ fontSize: '1.2em' }}>🧾</span> Z-Report
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setZReportToShow(null)} style={{ borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-secondary)' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{
              background: '#fffdf9',
              color: '#1c1c1c',
              padding: '28px 24px',
              fontFamily: '"SF Mono", "Courier New", Courier, monospace',
              fontSize: '13px',
              lineHeight: '1.5',
              whiteSpace: 'pre',
              borderRadius: '2px',
              border: '1px solid #e0dfd5',
              borderTop: '2px dashed #d1d0c5',
              borderBottom: '2px dashed #d1d0c5',
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.02), 0 4px 10px rgba(0,0,0,0.05)',
              maxHeight: '50vh',
              overflowY: 'auto',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'center',
              fontWeight: '500',
            }}>
              {(() => {
                const openedDate = zReportToShow.openedAt ? new Date(zReportToShow.openedAt.seconds ? zReportToShow.openedAt.seconds * 1000 : zReportToShow.openedAt).toLocaleString() : '';
                const closedDate = zReportToShow.closedAt ? new Date(zReportToShow.closedAt.seconds ? zReportToShow.closedAt.seconds * 1000 : zReportToShow.closedAt).toLocaleString() : '';
                const formatMonospace = (label, value) => {
                  const paddingLen = 38 - label.length - value.length;
                  const pad = paddingLen > 0 ? '.'.repeat(paddingLen) : ' ';
                  return `${label}${pad}${value}\n`;
                };
                
                let report = `======================================\n`;
                report += `          ${restaurant?.name?.toUpperCase() || 'POS RESTAURANT'}\n`;
                report += `          Z-REPORT: SHIFT CLOSURE     \n`;
                report += `======================================\n`;
                report += `Shift ID: ${zReportToShow.id?.substring(0, 8) || 'N/A'}\n`;
                report += `Opened By: ${zReportToShow.openedBy || 'N/A'}\n`;
                report += `Opened At: ${openedDate}\n`;
                report += `Closed By: ${zReportToShow.closedBy || 'N/A'}\n`;
                report += `Closed At: ${closedDate}\n`;
                report += `--------------------------------------\n`;
                report += formatMonospace('STARTING FLOAT', formatCurrency(zReportToShow.startCash || 0, currency));
                report += `--------------------------------------\n`;
                report += formatMonospace(`CASH SALES (${zReportToShow.cashSalesCount || 0})`, formatCurrency(zReportToShow.cashSalesAmount || 0, currency));
                report += formatMonospace(`CARD SALES (${zReportToShow.cardSalesCount || 0})`, formatCurrency(zReportToShow.cardSalesAmount || 0, currency));
                report += formatMonospace(`UPI SALES (${zReportToShow.upiSalesCount || 0})`, formatCurrency(zReportToShow.upiSalesAmount || 0, currency));
                report += `--------------------------------------\n`;
                report += formatMonospace('TOTAL SALES', formatCurrency(zReportToShow.totalSalesAmount || 0, currency));
                report += `--------------------------------------\n`;
                const dropsAmt = (zReportToShow.cashDrops ?? []).reduce((sum, d) => sum + d.amount, 0);
                const paidOutsAmt = (zReportToShow.paidOuts ?? []).reduce((sum, p) => sum + p.amount, 0);
                report += formatMonospace('TOTAL CASH DROPS', `-${formatCurrency(dropsAmt, currency)}`);
                report += formatMonospace('TOTAL PAID-OUTS', `-${formatCurrency(paidOutsAmt, currency)}`);
                report += `--------------------------------------\n`;
                report += formatMonospace('EXPECTED CASH', formatCurrency(zReportToShow.expectedCash || 0, currency));
                report += formatMonospace('COUNTED CASH', formatCurrency(zReportToShow.actualCash || 0, currency));
                report += formatMonospace('DRAWER VARIANCE', formatCurrency(zReportToShow.variance || 0, currency));
                report += `======================================\n\n`;
                report += `Cashier Sign: ________________________\n\n`;
                report += `Manager Sign: ________________________\n`;
                return report;
              })()}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, height: '48px', borderRadius: '12px', fontWeight: '600' }}
                onClick={() => {
                  const printWin = window.open('', '_blank', 'width=600,height=600');
                  const openedDate = zReportToShow.openedAt ? new Date(zReportToShow.openedAt.seconds ? zReportToShow.openedAt.seconds * 1000 : zReportToShow.openedAt).toLocaleString() : '';
                  const closedDate = zReportToShow.closedAt ? new Date(zReportToShow.closedAt.seconds ? zReportToShow.closedAt.seconds * 1000 : zReportToShow.closedAt).toLocaleString() : '';
                  const formatMonospace = (label, value) => {
                    const paddingLen = 38 - label.length - value.length;
                    const pad = paddingLen > 0 ? '.'.repeat(paddingLen) : ' ';
                    return `${label}${pad}${value}\n`;
                  };
                  
                  let report = `======================================\n`;
                  report += `          ${restaurant?.name?.toUpperCase() || 'POS RESTAURANT'}\n`;
                  report += `          Z-REPORT: SHIFT CLOSURE     \n`;
                  report += `======================================\n`;
                  report += `Shift ID: ${zReportToShow.id?.substring(0, 8) || 'N/A'}\n`;
                  report += `Opened By: ${zReportToShow.openedBy || 'N/A'}\n`;
                  report += `Opened At: ${openedDate}\n`;
                  report += `Closed By: ${zReportToShow.closedBy || 'N/A'}\n`;
                  report += `Closed At: ${closedDate}\n`;
                  report += `--------------------------------------\n`;
                  report += formatMonospace('STARTING FLOAT', formatCurrency(zReportToShow.startCash || 0, currency));
                  report += `--------------------------------------\n`;
                  report += formatMonospace(`CASH SALES (${zReportToShow.cashSalesCount || 0})`, formatCurrency(zReportToShow.cashSalesAmount || 0, currency));
                  report += formatMonospace(`CARD SALES (${zReportToShow.cardSalesCount || 0})`, formatCurrency(zReportToShow.cardSalesAmount || 0, currency));
                  report += formatMonospace(`UPI SALES (${zReportToShow.upiSalesCount || 0})`, formatCurrency(zReportToShow.upiSalesAmount || 0, currency));
                  report += `--------------------------------------\n`;
                  report += formatMonospace('TOTAL SALES', formatCurrency(zReportToShow.totalSalesAmount || 0, currency));
                  report += `--------------------------------------\n`;
                  const dropsAmt = (zReportToShow.cashDrops ?? []).reduce((sum, d) => sum + d.amount, 0);
                  const paidOutsAmt = (zReportToShow.paidOuts ?? []).reduce((sum, p) => sum + p.amount, 0);
                  report += formatMonospace('TOTAL CASH DROPS', `-${formatCurrency(dropsAmt, currency)}`);
                  report += formatMonospace('TOTAL PAID-OUTS', `-${formatCurrency(paidOutsAmt, currency)}`);
                  report += `--------------------------------------\n`;
                  report += formatMonospace('EXPECTED CASH', formatCurrency(zReportToShow.expectedCash || 0, currency));
                  report += formatMonospace('COUNTED CASH', formatCurrency(zReportToShow.actualCash || 0, currency));
                  report += formatMonospace('DRAWER VARIANCE', formatCurrency(zReportToShow.variance || 0, currency));
                  report += `======================================\n\n`;
                  report += `Cashier Sign: ________________________\n\n`;
                  report += `Manager Sign: ________________________\n`;

                  printWin.document.write(`<html><head><title>Z-Report</title><style>body{font-family:monospace;white-space:pre;padding:20px;color:#18181b;}</style></head><body>${report}</body></html>`);
                  printWin.document.close();
                  printWin.focus();
                  printWin.print();
                  printWin.close();
                }}
              >
                🖨️ Print Receipt
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, height: '48px', borderRadius: '12px', fontWeight: '600' }}
                onClick={() => setZReportToShow(null)}
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authorize Void Modal */}
      {showVoidModal && voidAction && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '100%', padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-separator)', paddingBottom: '8px' }}>
              <h3 style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', color: 'var(--color-red)' }}>
                🔑 Authorize Void / Comp
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowVoidModal(false); setVoidAction(null); }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-footnote)' }}>
              <p style={{ color: 'var(--color-label-secondary)' }}>
                You are reducing or removing a fired item from a saved order. This action requires manager authorization.
              </p>
              <div style={{ padding: '8px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', marginTop: '8px', borderLeft: '3px solid var(--color-red)' }}>
                <strong>Item:</strong> {voidAction.item.name} <br />
                <strong>Change:</strong> {voidAction.currentQty} → {voidAction.targetQty} (Reduced: {voidAction.type === 'remove' ? voidAction.item.qty : 1})
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-bold)', color: 'var(--color-label-secondary)', marginBottom: '4px' }}>
                  Reason Code
                </label>
                <select
                  className="form-select"
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                >
                  <option value="Burnt/Kitchen Error">Burnt/Kitchen Error</option>
                  <option value="Customer Rejected">Customer Rejected</option>
                  <option value="Input Error">Input Error</option>
                  <option value="Promotion Comp">Promotion Comp</option>
                  <option value="Spillage">Spillage</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-bold)', color: 'var(--color-label-secondary)', marginBottom: '4px' }}>
                  Manager PIN
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter PIN"
                  maxLength={6}
                  value={managerPin}
                  onChange={e => setManagerPin(e.target.value)}
                  style={{ textAlign: 'center', fontSize: 'var(--text-title3)', letterSpacing: '8px', fontWeight: 'var(--weight-bold)' }}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleVoidAuthorizeSubmit();
                    }
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => { setShowVoidModal(false); setVoidAction(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={handleVoidAuthorizeSubmit}
              >
                Authorize Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
