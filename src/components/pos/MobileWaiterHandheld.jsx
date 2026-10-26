import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Search, X, Plus, Minus, Check, Flame, Clock, 
  ChevronUp, ChevronDown, UtensilsCrossed, Printer, CreditCard, 
  Split, AlertTriangle, ArrowLeft, Trash2, SlidersHorizontal 
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { useOrderStore } from '../../stores/orderStore';
import { useTableStore } from '../../stores/tableStore';
import { hapticTap } from '../../utils/soundNotifications';
import toast from 'react-hot-toast';

const COMMON_ALLERGIES = [
  { id: 'nut_free', label: '🥜 Nut Allergy' },
  { id: 'gluten_free', label: '🌾 Gluten-Free' },
  { id: 'dairy_free', label: '🥛 Dairy-Free' },
  { id: 'no_onion_garlic', label: '🧅 No Onion/Garlic' },
  { id: 'extra_spicy', label: '🌶️ Extra Spicy' },
  { id: 'mild', label: '🍃 Mild / Non-Spicy' },
  { id: 'less_oil', label: '🥗 Less Oil' },
  { id: 'kids_meal', label: '👶 Kids Meal' },
];

const COURSES = [
  { id: 'Drinks', label: '🍸 Drinks', icon: '🍸' },
  { id: 'Starters', label: '🥗 Starters', icon: '🥗' },
  { id: 'Mains', label: '🍲 Mains', icon: '🍲' },
  { id: 'Desserts', label: '🍰 Desserts', icon: '🍰' }
];

export default function MobileWaiterHandheld({
  restaurant,
  currency,
  menuItems = [],
  categories = [],
  tableOrders = {},
  staffName = 'Server',
  onCloseHandheld,
  onSendToKitchen,
  onPrintPreBill,
  onOpenSplitModal,
  onOpenPayment
}) {
  const { t } = useTranslation();
  const { tables, subscribe } = useTableStore();
  const { 
    items, addItem, updateQty, removeItem, clearCart,
    tableId, tableName, setTable, setOrderType, orderType,
    loadOrderToCart, editingOrderId, setItemDetails, fireHeldItems
  } = useOrderStore();

  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState('all'); // 'all' | 'veg' | 'non-veg' | 'bestseller'
  
  // Sheet States
  const [showTableSheet, setShowTableSheet] = useState(false);
  const [showCartSheet, setShowCartSheet] = useState(false);
  const [customizingItem, setCustomizingItem] = useState(null); // item being customized with course/allergy
  const [itemCustomForm, setItemCustomForm] = useState({
    course: 'Mains',
    prepState: 'fired',
    seatNumber: null,
    allergies: [],
    itemNote: ''
  });

  // Subscribe to real-time table statuses
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = subscribe(restaurant.id);
    return unsub;
  }, [restaurant?.id, subscribe]);

  // Count held items
  const heldItems = useMemo(() => {
    return items.filter(i => i.prepState === 'hold');
  }, [items]);

  // Subtotal & Item Count
  const cartSummary = useMemo(() => {
    const count = items.reduce((sum, i) => sum + (Number(i.qty) || 1), 0);
    const subtotal = items.reduce((sum, i) => {
      const price = Number(i.price) || 0;
      const modTotal = Number(i.modifierTotal) || 0;
      return sum + ((price + modTotal) * (Number(i.qty) || 1));
    }, 0);
    return { count, subtotal };
  }, [items]);

  // Filter menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      // Category filter
      if (activeCategory !== 'all' && item.categoryId !== activeCategory) {
        return false;
      }
      // Dietary filter
      if (dietaryFilter === 'veg' && !item.isVeg) return false;
      if (dietaryFilter === 'non-veg' && item.isVeg) return false;
      if (dietaryFilter === 'bestseller' && !item.isBestseller && !item.bestseller && !item.popular) return false;
      
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.name?.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [menuItems, activeCategory, dietaryFilter, searchQuery]);

  // Handle table switch from bottom sheet
  const handleSelectTable = (tbl) => {
    hapticTap('medium');
    setShowTableSheet(false);
    const activeOrder = tableOrders[tbl.id];
    if (activeOrder && items.length === 0) {
      loadOrderToCart(activeOrder);
      toast.success(`Loaded active order for Table ${tbl.name}`, { icon: '🍽️' });
    } else {
      setTable(tbl.id, tbl.name);
      setOrderType('dine-in');
      toast.success(`Table ${tbl.name} assigned`, { icon: '🪑' });
    }
  };

  // Open item customization drawer
  const openItemCustomizer = (item, e) => {
    if (e) e.stopPropagation();
    hapticTap('light');
    setCustomizingItem(item);
    setItemCustomForm({
      course: item.course || 'Mains',
      prepState: item.prepState || 'fired',
      seatNumber: item.seatNumber ?? null,
      allergies: Array.isArray(item.allergies) ? [...item.allergies] : [],
      itemNote: item.itemNote || item.notes || ''
    });
  };

  const saveItemCustomization = () => {
    if (!customizingItem) return;
    hapticTap('success');
    setItemDetails(customizingItem.id, itemCustomForm, customizingItem.selectedModifiers);
    setCustomizingItem(null);
    toast.success('Course & instructions updated!', { icon: '✨' });
  };

  const handleFireHeld = async (course = 'all') => {
    hapticTap('heavy');
    const res = await fireHeldItems(restaurant, course);
    if (res.firedCount > 0) {
      toast.success(`Fired ${res.firedCount} held item(s) to kitchen!`, { icon: '🔥' });
    } else {
      toast('No held items to fire', { icon: 'ℹ️' });
    }
  };

  return (
    <div className="mobile-waiter-handheld" id="mobile-waiter-handheld">
      {/* ── Top App Bar ────────────────────────────────────────────── */}
      <header className="handheld-topbar">
        <div className="handheld-topbar-left">
          <button 
            type="button" 
            className={`handheld-table-badge ${tableId ? 'active' : 'unassigned'}`}
            onClick={() => { hapticTap('light'); setShowTableSheet(true); }}
            title="Switch Table"
          >
            <span className="handheld-table-icon">🪑</span>
            <span className="handheld-table-name">
              {tableId ? `Table ${tableName}` : 'Select Table'}
            </span>
            <ChevronDown size={12} className="handheld-table-caret" />
          </button>

          <span className="handheld-staff-chip">
            👤 {staffName}
          </span>
        </div>

        <div className="handheld-topbar-right">
          {heldItems.length > 0 && (
            <button
              type="button"
              className="handheld-fire-held-btn"
              onClick={() => handleFireHeld('all')}
              title="Fire all held items to kitchen"
            >
              <Flame size={13} />
              <span>Fire ({heldItems.length})</span>
            </button>
          )}

          <button
            type="button"
            className="handheld-exit-btn"
            onClick={() => { hapticTap('light'); onCloseHandheld(); }}
            title="Switch back to Standard POS Register"
          >
            <ArrowLeft size={13} />
            <span>POS</span>
          </button>
        </div>
      </header>

      {/* ── Quick Search & Dietary Filter Strip ─────────────────────── */}
      <div className="handheld-filter-strip">
        <div className="handheld-search-box">
          <Search size={14} className="handheld-search-icon" />
          <input
            type="text"
            className="handheld-search-input"
            placeholder="Quick search dishes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              type="button" 
              className="handheld-search-clear"
              onClick={() => setSearchQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="handheld-dietary-row">
          <button
            type="button"
            className={`handheld-dietary-chip ${dietaryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setDietaryFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`handheld-dietary-chip veg ${dietaryFilter === 'veg' ? 'active' : ''}`}
            onClick={() => setDietaryFilter(f => f === 'veg' ? 'all' : 'veg')}
          >
            🌱 Veg
          </button>
          <button
            type="button"
            className={`handheld-dietary-chip nonveg ${dietaryFilter === 'non-veg' ? 'active' : ''}`}
            onClick={() => setDietaryFilter(f => f === 'non-veg' ? 'all' : 'non-veg')}
          >
            🥩 Non-Veg
          </button>
          <button
            type="button"
            className={`handheld-dietary-chip popular ${dietaryFilter === 'bestseller' ? 'active' : ''}`}
            onClick={() => setDietaryFilter(f => f === 'bestseller' ? 'all' : 'bestseller')}
          >
            🔥 Popular
          </button>
        </div>
      </div>

      {/* ── Menu Grid (Thumb-Target Optimized) ──────────────────────── */}
      <main className="handheld-menu-scroll">
        <div className="handheld-menu-grid">
          {filteredItems.map(item => {
            const inCartItem = items.find(i => i.id === item.id);
            const cartQty = inCartItem?.qty || 0;
            const isFired = inCartItem?.prepState !== 'hold';

            return (
              <div 
                key={item.id} 
                className={`handheld-item-card ${cartQty > 0 ? 'selected' : ''}`}
                onClick={() => {
                  if (cartQty === 0) {
                    hapticTap('light');
                    addItem(item);
                  }
                }}
              >
                <div className="handheld-item-info">
                  <div className="handheld-item-title-row">
                    <span className={item.isVeg ? "food-badge-veg" : "food-badge-nonveg"} />
                    <span className="handheld-item-name">{item.name}</span>
                  </div>
                  <div className="handheld-item-price-row">
                    <span className="handheld-item-price">{formatCurrency(item.price, currency)}</span>
                    {item.isBestseller && (
                      <span className="handheld-item-pill bestseller">Popular</span>
                    )}
                  </div>
                </div>

                {/* Inline Rapid Quantity Stepper & Details */}
                <div className="handheld-item-actions">
                  {cartQty > 0 ? (
                    <div className="handheld-stepper-wrap" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="handheld-step-btn minus"
                        onClick={() => { hapticTap('light'); updateQty(item.id, cartQty - 1); }}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={13} strokeWidth={2.5} />
                      </button>
                      <span className="handheld-step-qty">{cartQty}</span>
                      <button
                        type="button"
                        className="handheld-step-btn plus"
                        onClick={() => { hapticTap('light'); updateQty(item.id, cartQty + 1); }}
                        aria-label="Increase quantity"
                      >
                        <Plus size={13} strokeWidth={2.5} />
                      </button>

                      <button
                        type="button"
                        className={`handheld-item-mod-btn ${inCartItem?.prepState === 'hold' ? 'held' : ''}`}
                        onClick={(e) => openItemCustomizer(inCartItem, e)}
                        title="Edit course, prep hold, or allergy notes"
                      >
                        {inCartItem?.prepState === 'hold' ? '⏸️ Hold' : (inCartItem?.course || 'Tag')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="handheld-add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        hapticTap('light');
                        addItem(item);
                      }}
                      aria-label={`Add ${item.name}`}
                    >
                      <Plus size={15} strokeWidth={3} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ── Thumb-Zone Bottom Category Bar ─────────────────────────── */}
      <nav className="handheld-thumb-categories" aria-label="Menu Categories">
        <button
          type="button"
          className={`handheld-category-pill ${activeCategory === 'all' ? 'active' : ''}`}
          onClick={() => { hapticTap('light'); setActiveCategory('all'); }}
        >
          All Items
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`handheld-category-pill ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => { hapticTap('light'); setActiveCategory(cat.id); }}
          >
            {cat.name}
          </button>
        ))}
      </nav>

      {/* ── Bottom Floating Cart Action Bar ────────────────────────── */}
      <footer className="handheld-bottom-action-bar">
        <div 
          className="handheld-cart-summary-trigger"
          onClick={() => { hapticTap('light'); setShowCartSheet(!showCartSheet); }}
          role="button"
          tabIndex={0}
        >
          <div className="handheld-cart-count-badge">
            {cartSummary.count}
          </div>
          <div className="handheld-cart-text">
            <span className="handheld-cart-total-label">Subtotal</span>
            <span className="handheld-cart-total-value">
              {formatCurrency(cartSummary.subtotal, currency)}
            </span>
          </div>
          <ChevronUp size={14} className={`handheld-cart-caret ${showCartSheet ? 'open' : ''}`} />
        </div>

        <div className="handheld-cart-main-actions">
          {items.length > 0 && (
            <button
              type="button"
              className="btn btn-primary handheld-fire-btn"
              onClick={() => {
                hapticTap('success');
                onSendToKitchen();
              }}
            >
              <Flame size={15} />
              <span>Send Kitchen</span>
            </button>
          )}

          {items.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary handheld-more-btn"
              onClick={() => { hapticTap('light'); setShowCartSheet(true); }}
              title="View Cart & Actions"
            >
              <SlidersHorizontal size={15} />
            </button>
          )}
        </div>
      </footer>

      {/* ── Mobile Cart Bottom Sheet ────────────────────────────────── */}
      {showCartSheet && (
        <div className="handheld-sheet-overlay" onClick={() => setShowCartSheet(false)}>
          <div className="handheld-sheet animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="handheld-sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🛒</span>
                <span style={{ fontWeight: 800, fontSize: 16 }}>Table Order Details</span>
                {tableName && (
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: '#10b98122', color: '#10b981', fontWeight: 800 }}>
                    Table {tableName}
                  </span>
                )}
              </div>
              <button 
                type="button" 
                className="handheld-sheet-close"
                onClick={() => setShowCartSheet(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="handheld-sheet-body">
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-label-secondary)' }}>
                  Cart is empty. Tap dishes above to build the table order.
                </div>
              ) : (
                <div className="handheld-cart-item-list">
                  {items.map((cartItem, idx) => (
                    <div key={`${cartItem.id}-${idx}`} className="handheld-cart-row">
                      <div className="handheld-cart-row-main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 14 }}>{cartItem.name}</span>
                          {cartItem.prepState === 'hold' && (
                            <span style={{ fontSize: 10, background: '#f59e0b22', color: '#f59e0b', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>
                              ⏸️ HOLD
                            </span>
                          )}
                          {cartItem.seatNumber && (
                            <span style={{ fontSize: 10, background: '#3b82f622', color: '#3b82f6', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>
                              🪑 S{cartItem.seatNumber}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                          {cartItem.course || 'Mains'} · {formatCurrency(cartItem.price, currency)} each
                        </div>

                        {cartItem.allergies && cartItem.allergies.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {cartItem.allergies.map(al => (
                              <span key={al} style={{ fontSize: 9.5, background: '#ef444422', color: '#ef4444', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                ⚠️ {al}
                              </span>
                            ))}
                          </div>
                        )}

                        {cartItem.itemNote && (
                          <div style={{ fontSize: 11, color: '#f59e0b', fontStyle: 'italic', marginTop: 2 }}>
                            Note: "{cartItem.itemNote}"
                          </div>
                        )}
                      </div>

                      <div className="handheld-cart-row-stepper">
                        <button
                          type="button"
                          className="handheld-step-btn minus"
                          onClick={() => updateQty(cartItem.id, cartItem.qty - 1, cartItem.selectedModifiers)}
                        >
                          <Minus size={12} />
                        </button>
                        <span style={{ fontWeight: 800, fontSize: 13, minWidth: 20, textAlign: 'center' }}>
                          {cartItem.qty}
                        </span>
                        <button
                          type="button"
                          className="handheld-step-btn plus"
                          onClick={() => updateQty(cartItem.id, cartItem.qty + 1, cartItem.selectedModifiers)}
                        >
                          <Plus size={12} />
                        </button>

                        <button
                          type="button"
                          className="handheld-cart-row-del"
                          onClick={() => removeItem(cartItem.id, cartItem.selectedModifiers)}
                          title="Remove item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tableside Quick Actions */}
              {items.length > 0 && (
                <div className="handheld-sheet-quick-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setShowCartSheet(false);
                      onPrintPreBill();
                    }}
                  >
                    <Printer size={13} />
                    <span>Print Pre-Bill</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setShowCartSheet(false);
                      onOpenSplitModal();
                    }}
                  >
                    <Split size={13} />
                    <span>Split Check</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setShowCartSheet(false);
                      onOpenPayment();
                    }}
                  >
                    <CreditCard size={13} />
                    <span>Pay at Table</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Table Selector Bottom Sheet ──────────────────────── */}
      {showTableSheet && (
        <div className="handheld-sheet-overlay" onClick={() => setShowTableSheet(false)}>
          <div className="handheld-sheet animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="handheld-sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🪑</span>
                <span style={{ fontWeight: 800, fontSize: 16 }}>Floor Tables</span>
              </div>
              <button 
                type="button" 
                className="handheld-sheet-close"
                onClick={() => setShowTableSheet(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="handheld-sheet-body">
              <div className="handheld-table-grid">
                {tables.map(tbl => {
                  const activeOrder = tableOrders[tbl.id];
                  const isOccupied = Boolean(activeOrder) || tbl.status === 'occupied';
                  const isCurrent = tbl.id === tableId;

                  return (
                    <button
                      key={tbl.id}
                      type="button"
                      className={`handheld-table-card ${isOccupied ? 'occupied' : 'free'} ${isCurrent ? 'current' : ''}`}
                      onClick={() => handleSelectTable(tbl)}
                    >
                      <div className="handheld-table-card-top">
                        <span className="handheld-table-card-title">Table {tbl.name}</span>
                        <span className={`handheld-table-status-dot ${isOccupied ? 'occupied' : 'free'}`} />
                      </div>
                      
                      <div className="handheld-table-card-meta">
                        <span>👥 {tbl.capacity || 2} Seats</span>
                        {isOccupied && activeOrder?.total && (
                          <span style={{ fontWeight: 800, color: 'var(--color-accent)' }}>
                            {formatCurrency(activeOrder.total, currency)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Item Course & Allergy Customization Bottom Sheet ───────── */}
      {customizingItem && (
        <div className="handheld-sheet-overlay" onClick={() => setCustomizingItem(null)}>
          <div className="handheld-sheet animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="handheld-sheet-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{customizingItem.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>Kitchen Course &amp; Special Instructions</div>
              </div>
              <button 
                type="button" 
                className="handheld-sheet-close"
                onClick={() => setCustomizingItem(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="handheld-sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Course Selection */}
              <div>
                <div className="handheld-form-label">Kitchen Course:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {COURSES.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={`handheld-choice-chip ${itemCustomForm.course === c.id ? 'active' : ''}`}
                      onClick={() => setItemCustomForm(prev => ({ ...prev, course: c.id }))}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hold vs Fire */}
              <div>
                <div className="handheld-form-label">Kitchen Timing:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className={`handheld-choice-chip ${itemCustomForm.prepState === 'fired' ? 'active' : ''}`}
                    onClick={() => setItemCustomForm(prev => ({ ...prev, prepState: 'fired' }))}
                  >
                    🔥 Fire with Order
                  </button>
                  <button
                    type="button"
                    className={`handheld-choice-chip hold ${itemCustomForm.prepState === 'hold' ? 'active' : ''}`}
                    onClick={() => setItemCustomForm(prev => ({ ...prev, prepState: 'hold' }))}
                  >
                    ⏸️ Hold for Later
                  </button>
                </div>
              </div>

              {/* Seat Selection */}
              <div>
                <div className="handheld-form-label">Assign Guest Seat:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {[null, 1, 2, 3, 4].map(s => (
                    <button
                      key={String(s)}
                      type="button"
                      className={`handheld-choice-chip ${itemCustomForm.seatNumber === s ? 'active' : ''}`}
                      onClick={() => setItemCustomForm(prev => ({ ...prev, seatNumber: s }))}
                    >
                      {s === null ? 'Table' : `Seat ${s}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Allergy Quick Tags */}
              <div>
                <div className="handheld-form-label">Quick Allergy Tags:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {COMMON_ALLERGIES.map(al => {
                    const isSelected = itemCustomForm.allergies.includes(al.label);
                    return (
                      <button
                        key={al.id}
                        type="button"
                        className={`handheld-allergy-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setItemCustomForm(prev => ({
                            ...prev,
                            allergies: isSelected 
                              ? prev.allergies.filter(a => a !== al.label)
                              : [...prev.allergies, al.label]
                          }));
                        }}
                      >
                        {al.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note */}
              <div>
                <div className="handheld-form-label">Custom Cooking Note:</div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Extra dressing on side, well done"
                  value={itemCustomForm.itemNote}
                  onChange={e => setItemCustomForm(prev => ({ ...prev, itemNote: e.target.value }))}
                  style={{ height: 38, fontSize: 13, borderRadius: 8 }}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={saveItemCustomization}
                style={{ height: 42, fontWeight: 800, marginTop: 4 }}
              >
                Save Course &amp; Tags
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
