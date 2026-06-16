import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useTokenStore } from '../stores/tokenStore';
import { useMenuStore } from '../stores/menuStore';
import { collection, onSnapshot, doc, getDoc, setDoc, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/formatCurrency';
import { printReceipt, printTokenTicket } from '../utils/print';
import toast from 'react-hot-toast';
import { ShoppingCart, Trash2, Plus, Minus, X, ChevronRight, Tag } from 'lucide-react';
import PaymentModal from '../components/pos/PaymentModal';
import TableSelectModal from '../components/pos/TableSelectModal';
import ModifierModal from '../components/pos/ModifierModal';

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
    activeShift, openShift, closeShift, recordCashTransaction, subscribeActiveShift
  } = useOrderStore();
  const { issueToken, setToken } = useTokenStore();
  const { categories, loading: loadingMenu, search, setSearch } = useMenuStore();

  const [activeCat,  setActiveCat]  = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showTableSel, setShowTableSel] = useState(false);
  const [activeModifierItem, setActiveModifierItem] = useState(null);

  const [custSearch, setCustSearch] = useState('');
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [showTotalsBreakdown, setShowTotalsBreakdown] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);

  const [openFloatCash, setOpenFloatCash] = useState('0.00');
  const [checkingShift, setCheckingShift] = useState(true);
  const [openShiftError, setOpenShiftError] = useState(null);
  const [openingShift, setOpeningShift] = useState(false);
  const [closingShift, setClosingShift] = useState(false);

  // Till drawer modal states
  const [showTillModal, setShowTillModal] = useState(false);
  const [tillTxType, setTillTxType] = useState('drop'); // 'drop' | 'paidout'
  const [tillTxAmount, setTillTxAmount] = useState('');
  const [tillTxReason, setTillTxReason] = useState('');
  const [closeCountedCash, setCloseCountedCash] = useState('');
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

  // Set default active category when menu is loaded
  useEffect(() => {
    if (categories.length) {
      setActiveCat(prev => prev || 'all');
    }
  }, [categories]);

  const [prevRestId, setPrevRestId] = useState(restaurant?.id);
  if (restaurant?.id !== prevRestId) {
    setPrevRestId(restaurant?.id);
    setCheckingShift(true);
  }

  // Subscribe to active shift in real-time
  useEffect(() => {
    if (restaurant?.id) {
      const unsub = subscribeActiveShift(restaurant.id, () => {
        setCheckingShift(false);
      });
      return unsub;
    }
  }, [restaurant?.id, subscribeActiveShift]);

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
    if (!closeCountedCash.trim() || isNaN(parseFloat(closeCountedCash))) {
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
      parseFloat(closeCountedCash),
      staffDoc?.id || 'unknown',
      staffDoc?.name || 'Cashier'
    );
    setClosingShift(false);
    if (res.ok) {
      toast.success('Shift closed successfully!');
      setZReportToShow(res.zReport);
      setShowTillModal(false);
      setCloseCountedCash('');
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

  // Menu items from active category
  const displayItems = (activeCat === 'all'
    ? categories.flatMap(c => c.items ?? [])
    : categories.find(c => c.id === activeCat)?.items ?? [])
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  // Order type buttons
  const orderTypes = [
    { key: 'dine-in',  label: t('dineIn'),   icon: '🍽️', enabled: modes.includes('table') || modes.includes('pos') },
    { key: 'takeaway', label: t('takeaway'),  icon: '🛍️', enabled: true },
    { key: 'online',   label: t('online'),    icon: '📱', enabled: false }, // online handled separately
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

    setPaymentMethod('unpaid');
    const res = await submitOrder(restaurant, staffDoc?.id);
    if (!res.ok) { toast.error(res.error); return; }

    toast.success(editingOrderId ? 'Order updated in kitchen!' : 'Order sent to kitchen!', { icon: '🍳' });
    // Bug 4 fix: Only print token ticket in token/QSR mode for takeaway orders
    if (modes.includes('token') && orderType === 'takeaway') {
      printTokenTicket({ token: null, orderType, customerName, restaurant });
    }
  };

  const handlePaymentConfirm = async () => {
    // If QSR mode — issue token
    let token = null;
    if (modes.includes('token') && orderType === 'takeaway') {
      token = await issueToken(restaurant.id);
      setToken(token);
    }

    const res = await submitOrder(restaurant, staffDoc?.id);
    if (!res.ok) { toast.error(res.error); return; }

    toast.success('Order placed!');
    setShowPayment(false);

    // Print receipt
    printReceipt({
      restaurant,
      order: {
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
      },
      items,
      taxInfo,
      staffName: staffDoc?.name,
    });

    // Print token ticket if QSR
    if (token) {
      printTokenTicket({ token, orderType, customerName, restaurant });
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

  // If no active shift, overlay a starting float modal
  if (!activeShift) {
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
        </div>
      </div>
    );
  }

  return (
    <div className="pos-layout">
      {/* ── Menu Panel ─────────────────────────────── */}
      <div className="pos-menu-panel">

        {/* Category chips */}
        <div className="pos-category-bar">
          <button
            id="cat-all"
            className={`category-chip ${activeCat === 'all' ? 'active' : ''}`}
            onClick={() => { setActiveCat('all'); setSearch(''); }}
          >
            <span>🍽️</span> All Items
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              id={`cat-${c.id}`}
              className={`category-chip ${activeCat === c.id ? 'active' : ''}`}
              onClick={() => { setActiveCat(c.id); setSearch(''); }}
            >
              {c.emoji && <span>{c.emoji}</span>}
              {c.name}
            </button>
          ))}
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
          <div className="menu-grid">
            {displayItems.map(item => (
              <button
                key={item.id}
                id={`menu-item-${item.id}`}
                className={`menu-item-card ${item.available === false ? 'unavailable' : ''}`}
                onClick={() => {
                  if (item.modifierGroups && item.modifierGroups.length > 0) {
                    setActiveModifierItem(item);
                  } else {
                    addItem(item);
                  }
                }}
              >
                {item.imageUrl || item.image
                  ? <img src={item.imageUrl || item.image} alt={item.name} className="menu-item-img" loading="lazy" />
                  : <div className="menu-item-img-placeholder">{item.emoji ?? '🍽️'}</div>
                }
                <div className="menu-item-body">
                  <div className="menu-item-name">{item.name}</div>
                  <div className="menu-item-price">{formatCurrency(item.price, currency)}</div>
                </div>
                <div className="menu-item-add-btn">+</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Cart Panel ─────────────────────────────── */}
      <div className="pos-cart-panel">
        <div className="cart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
            <ShoppingCart size={18} color="var(--color-accent)" />
            <span className="text-headline">{t('cart')}</span>
            {items.length > 0 && <span className="badge badge-blue">{items.length}</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setShowTillModal(true)} 
              id="till-drawer-btn"
              disabled={!activeShift}
              title={!activeShift ? 'Open a shift first' : 'Till Drawer'}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: activeShift ? 1 : 0.4 }}
            >
              💰 Till
            </button>
            {items.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearCart} id="clear-cart-btn">
                <Trash2 size={14} /> {t('clearCart')}
              </button>
            )}
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

        {/* Order type */}
        <div className="cart-type-tabs">
          {orderTypes.map(ot => (
            <button
              key={ot.key}
              id={`order-type-${ot.key}`}
              className={`cart-type-tab ${orderType === ot.key ? 'active' : ''}`}
              onClick={() => setOrderType(ot.key)}
            >
              {ot.icon} {ot.label}
            </button>
          ))}
        </div>

        {/* Table / Customer info */}
        {/* Service Details: Table and Customer/Loyalty Side-by-Side */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: orderType === 'dine-in' ? '1fr 1fr' : '1fr',
          gap: '8px',
          padding: 'var(--space-2) var(--space-4)',
          borderBottom: '1px solid var(--color-separator)',
          background: 'var(--color-bg-secondary)'
        }}>
          {orderType === 'dine-in' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTableSel(true)}
              id="select-table-btn"
              style={{ width: '100%', height: '32px', padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {tableName ? `🪑 ${tableName}` : `🪑 ${t('selectTable')}`}
            </button>
          )}

          {/* Customer / Loyalty Info column */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {customer ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: 'var(--color-accent-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-accent-opaque)', height: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ fontSize: '10px', fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    👤 {customer.name}
                  </span>
                  <span style={{ fontSize: 8, color: 'var(--color-label-secondary)', whiteSpace: 'nowrap' }}>
                    {customer.points} pts (+{Math.floor(total / 10)} pts)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerProfile(null);
                    setCustomer('', '');
                    setRedeemingPoints(false);
                  }}
                  style={{ color: 'var(--color-red)', padding: '2px', fontSize: 9, marginLeft: '4px', flexShrink: 0 }}
                >
                  Remove
                </button>
              </div>
            ) : showQuickRegister ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: '32px' }}>
                <input
                  className="form-input"
                  placeholder="Name"
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  style={{ height: 26, fontSize: '10px', padding: '2px 4px', flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-success btn-xs"
                  onClick={handleQuickRegister}
                  style={{ height: 26, padding: '2px 6px', fontSize: 9 }}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowQuickRegister(false)}
                  style={{ height: 26, padding: '2px 6px', fontSize: 9 }}
                >
                  ✗
                </button>
              </div>
            ) : (
              <input
                className="form-input"
                placeholder={orderType === 'dine-in' ? "🔍 Loyalty Phone..." : "🔍 Search / Add loyalty phone number..."}
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
                style={{ height: '32px', fontSize: '11px', padding: '4px 8px', width: '100%' }}
              />
            )}
          </div>
        </div>

        {orderType === 'takeaway' && !customer && !showQuickRegister && (
          <div style={{ padding: 'var(--space-1) var(--space-4)', borderBottom: '1px solid var(--color-separator)', display:'flex', gap:'var(--space-2)', background: 'var(--color-bg-secondary)' }}>
            <input className="form-input" placeholder="Customer name" value={customerName}
              onChange={e => setCustomer(e.target.value, customerPhone)}
              id="customer-name-input" style={{ fontSize: '12px', height: '28px', padding: '4px 8px' }} />
            <input className="form-input" placeholder="Phone" value={customerPhone}
              onChange={e => setCustomer(customerName, e.target.value)}
              id="customer-phone-input" style={{ fontSize: '12px', height: '28px', padding: '4px 8px', width: 110 }} />
          </div>
        )}

        {/* Items */}
        <div className="cart-items">
          {items.length === 0 ? (
            <div className="cart-empty">
              <div style={{ fontSize: 40 }}>🛒</div>
              <div className="text-headline">{t('emptyCart')}</div>
              <div className="text-footnote text-tertiary">{t('emptyCartHint')}</div>
            </div>
          ) : (
            (() => {
              const COURSES = ['Appetizers', 'Mains', 'Desserts', 'Beverages'];
              return COURSES.map(courseName => {
                const courseItems = items.filter(i => (i.course ?? 'Mains') === courseName);
                if (courseItems.length === 0) return null;
                return (
                  <div key={courseName} style={{ marginBottom: 'var(--space-3)' }}>
                    {/* Course Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px var(--space-4)',
                      background: 'var(--color-bg-secondary)',
                      borderBottom: '1px solid var(--color-separator)',
                      fontSize: 11,
                      fontWeight: 'var(--weight-bold)',
                      textTransform: 'uppercase',
                      color: 'var(--color-label-secondary)',
                      letterSpacing: '0.05em'
                    }}>
                      <span>🍽️ {courseName}</span>
                      {editingOrderId && courseItems.some(i => i.prepState === 'hold') && (
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          onClick={async () => {
                            const res = await useOrderStore.getState().fireCourse(restaurant.id, editingOrderId, courseName);
                            if (res.ok) {
                              toast.success(`Fired ${courseName}!`);
                            } else {
                              toast.error(`Fire failed: ${res.error}`);
                            }
                          }}
                          style={{ padding: '2px 8px', fontSize: 9 }}
                        >
                          🔥 Fire Course
                        </button>
                      )}
                    </div>

                    {/* Course Items List */}
                    {courseItems.map(i => (
                      <div key={i.id} className="cart-item" style={{ borderBottom: '1px solid var(--color-separator)', padding: '10px var(--space-4)', gap: '6px' }}>
                        {/* Line 1: Primary Info (Name on left, Qty/Price/X on right) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
                          <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)', color: 'var(--color-label)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                            {i.name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                            <div className="cart-item-qty" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button className="qty-btn" onClick={() => handleCartDecrement(i)}><Minus size={10}/></button>
                              <span className="qty-count">{i.qty}</span>
                              <button className="qty-btn" onClick={() => updateQty(i.id, i.qty + 1)}><Plus size={10}/></button>
                            </div>
                            <div className="cart-item-price" style={{ minWidth: 60, textAlign: 'right', fontWeight: 'var(--weight-semibold)' }}>
                              {formatCurrency(i.price * i.qty, currency)}
                            </div>
                            <button onClick={() => handleCartRemove(i)} style={{ color:'var(--color-red)', background:'none', border:'none', cursor:'pointer', padding:'2px', marginLeft: 4 }}>
                              <X size={12}/>
                            </button>
                          </div>
                        </div>

                        {/* Line 2: Meta Info (Badge, Course select dropdown, Modifiers inline) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                          <span 
                            className={`badge ${i.prepState === 'hold' ? 'badge-orange' : 'badge-green'}`}
                            style={{ fontSize: 9, padding: '2px 6px', cursor: 'pointer', userSelect: 'none', height: '18px', display: 'inline-flex', alignItems: 'center' }}
                            onClick={() => useOrderStore.getState().toggleItemHold(i.id)}
                            title="Click to toggle Hold/Fire"
                          >
                            {i.prepState === 'hold' ? '⏳ HOLD' : '🔥 FIRED'}
                          </span>
                          <select
                            value={i.course ?? 'Mains'}
                            onChange={(e) => useOrderStore.getState().setItemCourse(i.id, e.target.value)}
                            style={{
                              fontSize: 9,
                              padding: '2px 6px',
                              height: '18px',
                              borderRadius: '4px',
                              background: 'var(--color-bg-secondary)',
                              color: 'var(--color-label-secondary)',
                              border: '1px solid var(--color-separator)',
                              cursor: 'pointer',
                              outline: 'none'
                            }}
                          >
                            {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {i.selectedModifiers?.length > 0 && (
                            <span style={{ fontSize: '9px', color: 'var(--color-label-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={i.selectedModifiers.map(m => m.name).join(', ')}>
                              (+ {i.selectedModifiers.map(m => m.name).join(', ')})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              });
            })()
          )}
        </div>

        {/* Note */}
        {items.length > 0 && (
          <div style={{ padding: '0 var(--space-4) var(--space-2)', display: 'flex', alignItems: 'center' }}>
            {showNoteInput || note ? (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%' }}>
                <input 
                  className="form-input" 
                  placeholder="📝 Order note..." 
                  value={note}
                  onChange={e => setNote(e.target.value)} 
                  id="order-note-input"
                  style={{ fontSize: '12px', height: '28px', padding: '4px 8px', flex: 1 }} 
                  autoFocus
                />
                {!note && (
                  <button 
                    className="btn btn-ghost btn-xs" 
                    onClick={() => setShowNoteInput(false)}
                    style={{ padding: '2px', height: '28px', minWidth: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <button 
                onClick={() => setShowNoteInput(true)} 
                style={{ 
                  fontSize: 'var(--text-caption1)', 
                  color: 'var(--color-accent)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  fontWeight: 'var(--weight-semibold)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 0'
                }}
              >
                📝 + Add Order Note
              </button>
            )}
          </div>
        )}

        {/* Totals */}
        {items.length > 0 && (
          <div className="cart-totals" style={{ padding: 'var(--space-2) var(--space-4)', gap: '4px' }}>
            {/* Collapsible Subtotal and Taxes Breakdown */}
            {showTotalsBreakdown && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '4px', borderBottom: '1px solid var(--color-separator)' }}>
                <div className="cart-total-row" style={{ fontSize: '12px' }}>
                  <span>{t('subtotal')}</span>
                  <span>{formatCurrency(subtotal, currency)}</span>
                </div>
                {taxInfo.lines.map(l => (
                  <div key={l.label} className="cart-total-row" style={{ fontSize: '12px' }}>
                    <span>{l.label}</span>
                    <span>{formatCurrency(l.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Discount Row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0', borderBottom: '1px dashed var(--color-separator)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px' }}>
                  <Tag size={12} color="var(--color-accent)" /> Discount
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <select
                    className="form-select"
                    value={discountType}
                    onChange={e => setDiscount(discount, e.target.value)}
                    style={{ width: 60, height: 24, padding: '2px 4px', fontSize: 10, borderRadius: 'var(--radius-xs)', border: '1px solid var(--color-separator-opaque)' }}
                  >
                    <option value="percent">%</option>
                    <option value="fixed">{currency}</option>
                  </select>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    value={discount === 0 ? '' : discount}
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0, discountType)}
                    placeholder="0"
                    style={{ width: 60, height: 24, padding: '2px 4px', fontSize: 10, textAlign: 'right', borderRadius: 'var(--radius-xs)', border: '1px solid var(--color-separator-opaque)' }}
                  />
                </div>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-green)', fontWeight: 'var(--weight-semibold)' }}>
                  <span>Applied Discount</span>
                  <span>-{formatCurrency(discountAmount, currency)}</span>
                </div>
              )}
            </div>

            <div 
              className="cart-total-row grand-total" 
              onClick={() => setShowTotalsBreakdown(!showTotalsBreakdown)}
              style={{ cursor: 'pointer', padding: '4px 0 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              title="Click to toggle tax breakdown details"
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {t('total')}{' '}
                <span style={{ fontSize: 9, color: 'var(--color-label-tertiary)', fontWeight: 'normal', border: '1px solid var(--color-separator)', borderRadius: '4px', padding: '1px 4px', background: 'var(--color-bg)' }}>
                  {showTotalsBreakdown ? 'Hide Details ▲' : 'Show Details ▼'}
                </span>
              </span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        {orderType === 'dine-in' ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)' }}>
            <button
              className="btn btn-secondary"
              id="send-to-kitchen-btn"
              onClick={handleSendToKitchen}
              disabled={!items.length}
              type="button"
              style={{ flex: 1, height: 44, borderRadius: 'var(--radius-lg)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
            >
              🍳 Send to Kitchen
            </button>
            <button
              className="btn btn-primary"
              id="checkout-btn"
              onClick={handleCheckout}
              disabled={!items.length}
              type="button"
              style={{ flex: 1, height: 44, borderRadius: 'var(--radius-lg)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
            >
              💳 Pay & Free
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
            <ChevronRight size={20} />
            {t('checkout')} · {formatCurrency(total, currency)}
          </button>
        )}
      </div>

      {/* Modals */}
      {showTableSel && (
        <TableSelectModal
          restaurantId={restaurant?.id}
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
      {showTillModal && activeShift && (
        <div
          onClick={e => e.target === e.currentTarget && setShowTillModal(false)}
          className="till-modal-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
          }}
        >
          <style dangerouslySetInnerHTML={{__html: `
            @media (max-width: 540px) {
              .till-modal-overlay {
                padding: 8px !important;
              }
              .till-modal-card {
                border-radius: 16px !important;
              }
              .till-modal-header {
                padding: 12px 16px 10px !important;
              }
              .till-modal-emoji {
                font-size: 22px !important;
                margin-bottom: 2px !important;
              }
              .till-modal-title {
                font-size: 17px !important;
              }
              .till-modal-body {
                padding: 10px 14px 14px !important;
                gap: 8px !important;
              }
              .till-modal-grid-2 {
                grid-template-columns: 1fr !important;
                gap: 8px !important;
              }
              .till-modal-hero-val {
                font-size: 22px !important;
              }
              .till-modal-hero-emoji {
                font-size: 26px !important;
              }
              .till-modal-counted-input {
                font-size: 15px !important;
                height: 38px !important;
              }
              .till-modal-variance-box {
                font-size: 15px !important;
                height: 38px !important;
              }
              .till-modal-btn {
                height: 38px !important;
                font-size: 13px !important;
              }
              .till-modal-close-btn {
                height: 42px !important;
                font-size: 14px !important;
              }
            }
          `}} />
          <div className="till-modal-card" style={{
            background: 'var(--color-bg)',
            borderRadius: '24px',
            width: '100%', maxWidth: '620px',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--color-separator)',
          }}>
            {/* Header Banner */}
            <div className="till-modal-header" style={{
              background: 'var(--color-label)',
              borderRadius: '24px 24px 0 0',
              padding: '16px 24px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div>
                <div className="till-modal-emoji" style={{ fontSize: 28, marginBottom: 4 }}>💰</div>
                <h2 className="till-modal-title" style={{ color: 'var(--color-on-dark)', fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
                  Till Drawer Management
                </h2>
                <p style={{ color: 'var(--color-on-dark-soft)', fontSize: 12, margin: '4px 0 0', fontWeight: 500 }}>
                  Shift opened by <strong style={{ color: 'var(--color-on-dark)' }}>{activeShift?.openedBy}</strong>
                  {activeShift?.openedAt && (
                    <span> · {new Date(activeShift.openedAt.seconds ? activeShift.openedAt.seconds * 1000 : activeShift.openedAt).toLocaleString()}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowTillModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.10)', border: 'none', borderRadius: '50%',
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--color-on-dark)', fontSize: 18, transition: 'background 0.15s',
                  flexShrink: 0
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="till-modal-body" style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Expected Cash Hero Card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(52,199,89,0.12) 0%, rgba(52,199,89,0.04) 100%)',
                border: '1px solid rgba(52,199,89,0.25)',
                borderRadius: 14, padding: '12px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Expected Cash in Drawer</div>
                  <div className="till-modal-hero-val" style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-green)', letterSpacing: '-0.5px' }}>
                    {formatCurrency(activeShift?.expectedCash || 0, currency)}
                  </div>
                </div>
                <div className="till-modal-hero-emoji" style={{ fontSize: 32, opacity: 0.6 }}>🏦</div>
              </div>

              {/* Sales Breakdown + Movements Grid */}
              <div className="till-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Sales Breakdown */}
                <div style={{
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 12, padding: '12px 14px',
                  border: '1px solid var(--color-separator)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                    📊 Sales Breakdown
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Starting Float', val: formatCurrency(activeShift?.startCash || 0, currency), color: null },
                      { label: `Cash (${activeShift?.cashSalesCount || 0})`, val: `+${formatCurrency(activeShift?.cashSalesAmount || 0, currency)}`, color: 'var(--color-green)' },
                      { label: `Card (${activeShift?.cardSalesCount || 0})`, val: formatCurrency(activeShift?.cardSalesAmount || 0, currency), color: null },
                      { label: `UPI (${activeShift?.upiSalesCount || 0})`, val: formatCurrency(activeShift?.upiSalesAmount || 0, currency), color: null },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span style={{ color: 'var(--color-label-secondary)' }}>{row.label}</span>
                        <span style={{ fontWeight: 600, color: row.color || 'var(--color-label)' }}>{row.val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Drawer Movements */}
                <div style={{
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 12, padding: '12px 14px',
                  border: '1px solid var(--color-separator)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                    🔄 Drawer Movements
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                      <span style={{ color: 'var(--color-label-secondary)' }}>Cash Drops ({(activeShift?.cashDrops ?? []).length})</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-red)' }}>
                        -{formatCurrency((activeShift?.cashDrops ?? []).reduce((s, d) => s + d.amount, 0), currency)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: 'var(--color-label-secondary)' }}>Paid-Outs ({(activeShift?.paidOuts ?? []).length})</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-red)' }}>
                        -{formatCurrency((activeShift?.paidOuts ?? []).reduce((s, p) => s + p.amount, 0), currency)}
                      </span>
                    </div>
                    {/* Recent movements list */}
                    {[...(activeShift?.cashDrops ?? []).map(d => ({ ...d, kind: 'Drop' })), ...(activeShift?.paidOuts ?? []).map(p => ({ ...p, kind: 'Paid-Out' }))].length === 0 && (
                      <div style={{ marginTop: 8, textAlign: 'center', color: 'var(--color-label-tertiary)', fontSize: 11 }}>No movements logged yet</div>
                    )}
                    {[...(activeShift?.cashDrops ?? []).map(d => ({ ...d, kind: 'Drop' })), ...(activeShift?.paidOuts ?? []).map(p => ({ ...p, kind: 'Paid-Out' }))]
                      .slice(-3)
                      .map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: 'var(--color-bg-elevated)', borderRadius: 8, fontSize: 11 }}>
                          <span style={{ color: 'var(--color-label-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-label)' }}>{m.kind}</span>: {m.reason}
                          </span>
                          <span style={{ fontWeight: 700, color: 'var(--color-red)', marginLeft: 8, flexShrink: 0 }}>-{formatCurrency(m.amount, currency)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Log Cash Drop / Paid-Out */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 12, padding: '12px 14px',
                border: '1px solid var(--color-separator)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  💸 Log Cash Movement
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="till-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</label>
                      <select
                        className="form-select"
                        value={tillTxType}
                        onChange={e => setTillTxType(e.target.value)}
                        style={{ width: '100%', height: 36, fontSize: 13, borderRadius: 10 }}
                      >
                        <option value="drop">💵 Cash Drop</option>
                        <option value="paidout">🧾 Petty Paid-Out</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount ({currency})</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="0.00"
                        value={tillTxAmount}
                        onChange={e => setTillTxAmount(e.target.value)}
                        style={{ width: '100%', height: 36, fontSize: 13, fontWeight: 600, textAlign: 'right', borderRadius: 10 }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason / Description</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Office supplies, safe drop..."
                      value={tillTxReason}
                      onChange={e => setTillTxReason(e.target.value)}
                      style={{ width: '100%', height: 40, fontSize: 13, borderRadius: 10 }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary till-modal-btn"
                    onClick={handleTillTxSubmit}
                    style={{ width: '100%', height: 36, fontSize: 13, fontWeight: 600, borderRadius: 10, marginTop: 2 }}
                  >
                    ✓ Log Transaction
                  </button>
                </div>
              </div>

              {/* Close Shift Section */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(255,59,48,0.07) 0%, rgba(255,59,48,0.03) 100%)',
                border: '1px solid rgba(255,59,48,0.2)',
                borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-red)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠️ Close Shift Till
                </div>
                <div className="till-modal-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Physical Counted Cash
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input till-modal-counted-input"
                      placeholder="0.00"
                      value={closeCountedCash}
                      onChange={e => setCloseCountedCash(e.target.value)}
                      style={{ width: '100%', height: 42, fontSize: 18, fontWeight: 700, textAlign: 'center', borderRadius: 10 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Drawer Variance
                    </label>
                    <div className="till-modal-variance-box" style={{
                      height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 800,
                      background: (parseFloat(closeCountedCash || 0) - (activeShift?.expectedCash || 0)) === 0
                        ? 'rgba(52,199,89,0.1)' : 'rgba(255,59,48,0.1)',
                      color: (parseFloat(closeCountedCash || 0) - (activeShift?.expectedCash || 0)) === 0
                        ? 'var(--color-green)' : 'var(--color-red)',
                      border: `1px solid ${(parseFloat(closeCountedCash || 0) - (activeShift?.expectedCash || 0)) === 0
                        ? 'rgba(52,199,89,0.25)' : 'rgba(255,59,48,0.25)'}`,
                      letterSpacing: '-0.5px'
                    }}>
                      {(parseFloat(closeCountedCash || 0) - (activeShift?.expectedCash || 0)) >= 0 ? '+' : ''}
                      {formatCurrency(parseFloat(closeCountedCash || 0) - (activeShift?.expectedCash || 0), currency)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="till-modal-close-btn"
                  onClick={handleCloseShiftSubmit}
                  disabled={closingShift}
                  style={{
                    width: '100%', height: 48, borderRadius: 'var(--radius-md)',
                    background: closingShift ? 'var(--color-red-light)' : 'var(--color-red)',
                    color: closingShift ? 'var(--color-red)' : 'var(--color-on-dark)', border: 'none', cursor: closingShift ? 'not-allowed' : 'pointer',
                    fontSize: 15, fontWeight: 700, letterSpacing: '-0.2px',
                    boxShadow: closingShift ? 'none' : 'var(--shadow-md)',
                    transition: 'all 0.2s',
                  }}
                >
                  {closingShift ? '⏳ Closing Shift...' : '🔴 Close Shift & Print Z-Report'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Z-Report Modal */}

      {zReportToShow && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '100%', padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-separator)', paddingBottom: '8px' }}>
              <h3 style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>⎙ Z-Report Shift Closure</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setZReportToShow(null)}>
                <X size={16} />
              </button>
            </div>
            
            <div style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-label)',
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '11px',
              whiteSpace: 'pre',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator)',
              maxHeight: '400px',
              overflowY: 'auto',
              marginBottom: '16px'
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

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
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
                style={{ flex: 1 }}
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
