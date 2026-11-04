import { useState, useMemo, useEffect } from 'react';
import { 
  Search, X, Plus, Minus, Flame, 
  ChevronUp, ChevronDown, Printer, CreditCard, 
  Split, ArrowLeft, Trash2, SlidersHorizontal, FileText,
  Languages, LayoutGrid, List, Check
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { useOrderStore } from '../../stores/orderStore';
import { useTableStore } from '../../stores/tableStore';
import { hapticTap, playNotificationTone, vibrateDevice } from '../../utils/soundNotifications';
import { localSyncChannel } from '../../utils/localSyncChannel';
import { transliterateFood, SUPPORTED_WAITER_LANGUAGES } from '../../utils/foodTransliteration';
import toast from 'react-hot-toast';
import ModifierModal from './ModifierModal';

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

const COMMON_COOKING_NOTES = [
  'Extra Spicy 🌶️',
  'Mild / Non-Spicy 🍃',
  'Less Oil / Low Salt',
  'Dressing on Side',
  'No Ice 🧊',
  'Extra Crispy',
  'Well Done'
];

const ORDER_NOTE_PRESETS = [
  '🔥 Rush Order',
  '⭐ VIP Table',
  '🎂 Birthday / Cake',
  '🪑 High Chair Needed',
  '🌿 Bring All Together',
  '👶 Kids Meal First'
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
  isFloorStaff = false,
  onCloseHandheld,
  onSendToKitchen,
  onPrintPreBill,
  onOpenSplitModal,
  onOpenPayment
}) {
  const { tables, subscribe } = useTableStore();
  const { 
    items, addItem, updateQty, removeItem,
    tableId, tableName, setTable, setOrderType, orderType,
    loadOrderToCart, setItemDetails, fireHeldItems,
    note, setNote
  } = useOrderStore();

  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState('all'); // 'all' | 'veg' | 'non-veg' | 'bestseller'
  
  // Waiter Language & Script Preference ('en' | 'ml' | 'hi')
  const [waiterLang, setWaiterLang] = useState(() => {
    try {
      return localStorage.getItem('kiwi_waiter_lang') || 'en';
    } catch {
      return 'en';
    }
  });
  const [showLangSheet, setShowLangSheet] = useState(false);

  // Layout View Mode ('grid' = 2-Column Touch Tiles | 'list' = Compact List)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('kiwi_waiter_view_mode') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const handleSelectLang = (code) => {
    setWaiterLang(code);
    setShowLangSheet(false);
    hapticTap('success');
    try {
      localStorage.setItem('kiwi_waiter_lang', code);
    } catch {}
    const langObj = SUPPORTED_WAITER_LANGUAGES.find(l => l.code === code);
    toast.success(`Language: ${langObj?.native || code}`, { icon: '🌐' });
  };

  const handleToggleViewMode = () => {
    const next = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    hapticTap('light');
    try {
      localStorage.setItem('kiwi_waiter_view_mode', next);
    } catch {}
  };

  // Sheet States
  const [showTableSheet, setShowTableSheet] = useState(false);
  const [showCartSheet, setShowCartSheet] = useState(false);
  const [activeModifierItem, setActiveModifierItem] = useState(null);
  const [customizingItem, setCustomizingItem] = useState(null); // item being customized with course/allergy
  const [itemCustomForm, setItemCustomForm] = useState({
    course: 'Mains',
    prepState: 'fired',
    seatNumber: null,
    allergies: [],
    itemNote: ''
  });

  const handleConfirmModifier = (selectedModifiers, flatPrice) => {
    if (!activeModifierItem) return;
    const isVariant = flatPrice !== undefined && flatPrice !== null;
    const modifierTotal = isVariant
      ? 0
      : selectedModifiers.reduce((sum, m) => sum + m.priceAdd, 0);
    const unitPrice = isVariant
      ? flatPrice
      : (activeModifierItem.price + modifierTotal);
    const customId = activeModifierItem.id + '-' + selectedModifiers.map(m => m.id).sort().join('-');
    const cartItem = {
      ...activeModifierItem,
      id: customId,
      menuItemId: activeModifierItem.id,
      name: activeModifierItem.name,
      selectedModifiers,
      modifierTotal: isVariant ? flatPrice : modifierTotal,
      price: unitPrice
    };
    hapticTap('medium');
    addItem(cartItem);
    setActiveModifierItem(null);
  };

  // Subscribe to real-time table statuses
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = subscribe(restaurant.id);
    return unsub;
  }, [restaurant?.id, subscribe]);

  const [foodReadyAlert, setFoodReadyAlert] = useState(null);
  const markOrderOrItemsServed = useOrderStore(s => s.markOrderOrItemsServed);

  // Real-time kitchen food ready alerts via local sync channel
  useEffect(() => {
    const unsub = localSyncChannel.subscribe((msg) => {
      if (msg.type === 'FOOD_READY_ALERT' && msg.payload) {
        const payload = msg.payload;
        try {
          playNotificationTone('kitchen-bell', 1.0);
          vibrateDevice([250, 150, 250]);
        } catch {}

        setFoodReadyAlert({
          tableName: payload.tableName || 'Table',
          itemName: payload.itemName || 'Food Plated at Pass',
          orderId: payload.orderId,
          timestamp: payload.timestamp || Date.now()
        });
      } else if (msg.type === 'LOCAL_FOOD_SERVED' && msg.payload) {
        setFoodReadyAlert(prev => prev?.orderId === msg.payload.orderId ? null : prev);
      }
    });

    return () => unsub();
  }, []);

  // Listen to active orders in tableOrders for any recent ready dishes
  useEffect(() => {
    if (!tableOrders) return;
    const now = Date.now();
    for (const order of Object.values(tableOrders)) {
      if (order?.lastFoodReadyAlert?.timestamp) {
        const ageMs = now - order.lastFoodReadyAlert.timestamp;
        if (ageMs < 300000 && (!foodReadyAlert || foodReadyAlert.timestamp < order.lastFoodReadyAlert.timestamp)) {
          setFoodReadyAlert({
            tableName: order.lastFoodReadyAlert.tableName,
            itemName: order.lastFoodReadyAlert.itemName,
            orderId: order.id,
            timestamp: order.lastFoodReadyAlert.timestamp
          });
          break;
        }
      }
    }
  }, [tableOrders]);

  const handleAcknowledgePickedUp = async (orderId) => {
    hapticTap('medium');
    const targetItemName = foodReadyAlert?.itemName;
    setFoodReadyAlert(null);
    if (orderId && restaurant?.id) {
      await markOrderOrItemsServed(restaurant.id, orderId, null, targetItemName);
      toast.success('Food marked as Picked Up & Served! ✓');
    }
  };

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
      
      // Search across English and phonetic native scripts
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name?.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query);
        const translitMl = transliterateFood(item.name, 'ml').toLowerCase();
        const translitHi = transliterateFood(item.name, 'hi').toLowerCase();
        const matchesNative = translitMl.includes(query) || translitHi.includes(query);
        if (!matchesName && !matchesDesc && !matchesNative) return false;
      }
      return true;
    });
  }, [menuItems, activeCategory, dietaryFilter, searchQuery]);

  // Handle table switch from bottom sheet
  const handleSelectTable = (tbl) => {
    hapticTap('medium');
    setShowTableSheet(false);
    const activeOrder = tableOrders[tbl.id];
    if (activeOrder) {
      if (items.length === 0) {
        loadOrderToCart(activeOrder);
        toast.success(`Loaded active order for Table ${tbl.name}`, { icon: '🍽️' });
      } else {
        const existingItems = activeOrder.items || [];
        const currentCartItems = [...items];
        const merged = [...existingItems];

        currentCartItems.forEach(cartItem => {
          const match = merged.find(m => 
            m.id === cartItem.id && 
            JSON.stringify(m.selectedModifiers || []) === JSON.stringify(cartItem.selectedModifiers || []) &&
            m.seatNumber === cartItem.seatNumber
          );
          if (match) {
            match.qty += cartItem.qty;
          } else {
            merged.push({ ...cartItem });
          }
        });

        loadOrderToCart({
          ...activeOrder,
          items: merged
        });
        toast.success(`Added items to Table ${tbl.name}'s active order`, { icon: '🍽️' });
      }
    } else {
      setTable(tbl.id, tbl.name);
      setOrderType('dine-in');
      toast.success(`Table ${tbl.name} assigned`, { icon: '🪑' });
    }
  };

  const handleSendKitchenClick = async () => {
    hapticTap('success');
    if (!items.length) {
      toast.error('Add items to cart first');
      return;
    }
    if (orderType === 'dine-in' && !tableId) {
      setShowTableSheet(true);
      toast('Please select a table to send order to kitchen', { icon: '🪑' });
      return;
    }
    const res = await onSendToKitchen();
    if (res?.needsTable) {
      setShowTableSheet(true);
    } else if (res?.ok !== false && !res?.error) {
      setShowCartSheet(false);
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

          {/* Language Switcher Pill */}
          <button
            type="button"
            className={`handheld-lang-btn ${waiterLang !== 'en' ? 'active-lang' : ''}`}
            onClick={() => { hapticTap('light'); setShowLangSheet(true); }}
            title="Switch Waiter Language (Phonetic Malayalam / Hindi / English)"
            aria-label="Switch Language"
          >
            <Languages size={13} />
            <span>{SUPPORTED_WAITER_LANGUAGES.find(l => l.code === waiterLang)?.native || 'EN'}</span>
          </button>

          {/* Grid / List View Toggle */}
          <button
            type="button"
            className="handheld-view-toggle-btn"
            onClick={handleToggleViewMode}
            title={viewMode === 'grid' ? "Switch to List View" : "Switch to 2-Column Grid View"}
            aria-label="Toggle View Mode"
          >
            {viewMode === 'grid' ? <List size={14} /> : <LayoutGrid size={14} />}
          </button>

          <button
            type="button"
            className="handheld-exit-btn"
            onClick={() => { hapticTap('light'); onCloseHandheld(); }}
            title={isFloorStaff ? "Return to Floor Plan" : "Switch back to Standard POS Register"}
          >
            <ArrowLeft size={13} />
            <span>{isFloorStaff ? "Tables" : "POS"}</span>
          </button>
        </div>
      </header>

      {/* ── Kitchen Food Ready Pocket Alert Banner ─────────────────── */}
      {foodReadyAlert && (
        <div className="handheld-ready-banner animate-slide-down">
          <div className="handheld-ready-banner-info">
            <span className="handheld-ready-bell">🔔</span>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{foodReadyAlert.tableName}</span>
                <span className="handheld-ready-tag">FOOD READY</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {foodReadyAlert.itemName}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="handheld-ready-pickup-btn"
              onClick={() => handleAcknowledgePickedUp(foodReadyAlert.orderId)}
            >
              ✓ Picked Up
            </button>
            <button
              type="button"
              className="handheld-ready-dismiss-btn"
              onClick={() => setFoodReadyAlert(null)}
              title="Dismiss alert"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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

      {/* ── Menu Grid / List (Thumb-Target Optimized) ─────────────────── */}
      <main className={`handheld-menu-scroll ${viewMode === 'grid' ? 'grid-view' : 'list-view'}`}>
        <div className={`handheld-menu-layout ${viewMode === 'grid' ? 'handheld-grid' : 'handheld-list'}`}>
          {filteredItems.map(item => {
            const hasModifiers = Boolean(item.modifierGroups && item.modifierGroups.length > 0);
            const cartItemsForItem = items.filter(i => i.id === item.id || i.menuItemId === item.id);
            const cartQty = cartItemsForItem.reduce((sum, i) => sum + i.qty, 0);
            const singleCartItem = cartItemsForItem.length === 1 ? cartItemsForItem[0] : null;

            // Formatted price label for modifier items with base price 0
            let priceLabel = formatCurrency(item.price, currency);
            if (hasModifiers && parseFloat(item.price) === 0) {
              const allPrices = item.modifierGroups.flatMap(g => g.options?.map(o => o.priceAdd) || []).filter(p => p > 0);
              const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
              if (minPrice > 0) {
                priceLabel = `From ${formatCurrency(minPrice, currency)}`;
              }
            }

            // Phonetic Script Resolution:
            // In Malayalam/Hindi mode: Display native phonetic script prominently (e.g. "ഗാർലിക് ചിക്കൻ") with English original subtitled
            const nativeScript = waiterLang === 'en'
              ? null
              : (item[`name_${waiterLang}`] || item[`name${waiterLang.toUpperCase()}`] || transliterateFood(item.name, waiterLang));
            const primaryTitle = nativeScript || item.name;
            const subtitleText = nativeScript ? item.name : null;

            const handleCardTap = () => {
              if (item.available === false) return;
              if (hasModifiers) {
                hapticTap('light');
                setActiveModifierItem(item);
              } else if (cartQty === 0) {
                hapticTap('light');
                addItem(item);
              }
            };

            const handleIncrement = (e) => {
              if (e) e.stopPropagation();
              hapticTap('light');
              if (hasModifiers) {
                setActiveModifierItem(item);
              } else if (cartQty === 0) {
                addItem(item);
              } else {
                updateQty(item.id, cartQty + 1);
              }
            };

            const handleDecrement = (e) => {
              if (e) e.stopPropagation();
              hapticTap('light');
              if (hasModifiers) {
                if (singleCartItem) {
                  updateQty(singleCartItem.id, singleCartItem.qty - 1, singleCartItem.selectedModifiers);
                } else {
                  setShowCartSheet(true);
                }
              } else {
                updateQty(item.id, cartQty - 1);
              }
            };

            return (
              <div 
                key={item.id} 
                className={`handheld-item-card ${viewMode === 'grid' ? 'grid-card' : 'list-card'} ${cartQty > 0 ? 'selected' : ''}`}
                onClick={handleCardTap}
              >
                {/* Visual badge for current cart quantity on card */}
                {cartQty > 0 && (
                  <div className="handheld-card-badge">
                    <span>{cartQty}</span>
                  </div>
                )}

                <div className="handheld-item-header">
                  <div className="handheld-dietary-price">
                    <span className={item.isVeg ? "food-badge-veg" : "food-badge-nonveg"} />
                    <span className="handheld-item-price">{priceLabel}</span>
                  </div>

                  <div className="handheld-badge-tags">
                    {hasModifiers && (
                      <span className="handheld-item-pill options">
                        Options
                      </span>
                    )}
                    {item.isBestseller && (
                      <span className="handheld-item-pill bestseller">Popular</span>
                    )}
                  </div>
                </div>

                <div className="handheld-item-info">
                  <div className="handheld-item-name-wrap">
                    <span className={`handheld-item-name ${waiterLang !== 'en' ? 'native-font' : ''}`}>
                      {primaryTitle}
                    </span>
                    {subtitleText && (
                      <span className="handheld-item-subname">
                        {subtitleText}
                      </span>
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
                        onClick={handleDecrement}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={15} strokeWidth={2.8} />
                      </button>
                      <span className="handheld-step-qty">{cartQty}</span>
                      <button
                        type="button"
                        className="handheld-step-btn plus"
                        onClick={handleIncrement}
                        aria-label={hasModifiers ? "Choose options to add" : "Increase quantity"}
                      >
                        <Plus size={15} strokeWidth={2.8} />
                      </button>

                      <button
                        type="button"
                        className={`handheld-item-mod-btn ${singleCartItem?.prepState === 'hold' ? 'held' : ''}`}
                        onClick={(e) => {
                          if (hasModifiers) {
                            hapticTap('light');
                            setActiveModifierItem(item);
                          } else {
                            openItemCustomizer(singleCartItem, e);
                          }
                        }}
                        title={hasModifiers ? "View/select options" : "Edit course, prep hold, or allergy notes"}
                      >
                        {hasModifiers ? 'Options' : (singleCartItem?.prepState === 'hold' ? '⏸️ Hold' : (singleCartItem?.course || 'Tag'))}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="handheld-add-btn"
                      onClick={handleIncrement}
                      aria-label={`Add ${item.name}`}
                    >
                      <Plus size={16} strokeWidth={3} />
                      {viewMode === 'grid' && <span className="handheld-add-label">Add</span>}
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
              onClick={handleSendKitchenClick}
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

                        {cartItem.selectedModifiers && cartItem.selectedModifiers.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--color-accent, #3b82f6)', fontWeight: 600, marginTop: 2 }}>
                            {cartItem.selectedModifiers.map(m => m.name).join(' · ')}
                          </div>
                        )}

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

              {/* Overall Table / Kitchen Order Note */}
              {items.length > 0 && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: 10, border: '1px solid var(--color-separator)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-label-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <FileText size={12} /> Table / Kitchen Instructions:
                    </span>
                    {note && (
                      <button 
                        type="button" 
                        onClick={() => setNote('')} 
                        style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  
                  {/* Quick Presets */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {ORDER_NOTE_PRESETS.map(preset => {
                      const isActive = (note || '').includes(preset);
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            hapticTap('light');
                            if (isActive) {
                              setNote((note || '').replace(preset, '').replace(/^,\s*|,\s*$/g, '').trim());
                            } else {
                              setNote(note ? `${note}, ${preset}` : preset);
                            }
                          }}
                          style={{
                            fontSize: 10.5,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'var(--color-bg)',
                            border: isActive ? '1px solid #38bdf8' : '1px solid var(--color-separator)',
                            color: isActive ? '#38bdf8' : 'var(--color-label)',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    className="form-input"
                    placeholder="Add special instructions for kitchen/bar..."
                    value={note || ''}
                    onChange={e => setNote(e.target.value)}
                    style={{ height: 34, fontSize: 12, borderRadius: 6 }}
                  />
                </div>
              )}

              {/* Primary Fire Button Inside Sheet */}
              {items.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    height: 44,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderRadius: 10,
                    marginTop: 10,
                    fontSize: 14,
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                  }}
                  onClick={handleSendKitchenClick}
                >
                  <Flame size={17} />
                  <span>Send Order to Kitchen</span>
                </button>
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
                  const readyItems = (activeOrder?.items || []).filter(i => i.status === 'ready');
                  const hasFoodReady = activeOrder && (activeOrder.status === 'ready' || readyItems.length > 0);

                  return (
                    <button
                      key={tbl.id}
                      type="button"
                      className={`handheld-table-card ${hasFoodReady ? 'ready' : (isOccupied ? 'occupied' : 'free')} ${isCurrent ? 'current' : ''}`}
                      onClick={() => handleSelectTable(tbl)}
                    >
                      <div className="handheld-table-card-top">
                        <span className="handheld-table-card-title">Table {tbl.name}</span>
                        {hasFoodReady ? (
                          <span style={{ fontSize: 9.5, background: '#10b981', color: '#000', padding: '1px 5px', borderRadius: 4, fontWeight: 900 }}>
                            🔔 READY
                          </span>
                        ) : (
                          <span className={`handheld-table-status-dot ${isOccupied ? 'occupied' : 'free'}`} />
                        )}
                      </div>
                      
                      <div className="handheld-table-card-meta">
                        <span>👥 {tbl.capacity || 2} Seats</span>
                        {hasFoodReady ? (
                          <span style={{ fontWeight: 800, color: '#10b981', fontSize: 11 }}>
                            {readyItems.length > 0 ? `${readyItems.length} at Pass` : 'Food at Pass'}
                          </span>
                        ) : isOccupied && activeOrder?.total ? (
                          <span style={{ fontWeight: 800, color: 'var(--color-accent)' }}>
                            {formatCurrency(activeOrder.total, currency)}
                          </span>
                        ) : null}
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {COMMON_COOKING_NOTES.map(preset => {
                    const isSelected = (itemCustomForm.itemNote || '').includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          hapticTap('light');
                          if (isSelected) {
                            setItemCustomForm(prev => ({
                              ...prev,
                              itemNote: (prev.itemNote || '').replace(preset, '').replace(/^,\s*|,\s*$/g, '').trim()
                            }));
                          } else {
                            setItemCustomForm(prev => ({
                              ...prev,
                              itemNote: prev.itemNote ? `${prev.itemNote}, ${preset}` : preset
                            }));
                          }
                        }}
                        style={{
                          fontSize: 10.5,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-bg-secondary)',
                          border: isSelected ? '1px solid #f59e0b' : '1px solid var(--color-separator)',
                          color: isSelected ? '#f59e0b' : 'var(--color-label)',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
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

      {/* ── Waiter Dish Language & Script Switcher Sheet ───────────── */}
      {showLangSheet && (
        <div className="handheld-sheet-backdrop animate-fade-in" onClick={() => setShowLangSheet(false)}>
          <div className="handheld-sheet animate-slide-up" onClick={e => e.stopPropagation()} style={{ maxHeight: '60vh' }}>
            <div className="handheld-sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Languages size={18} style={{ color: 'var(--color-accent, #38bdf8)' }} />
                <div>
                  <h3 className="handheld-sheet-title" style={{ margin: 0, fontSize: 15 }}>Waiter Dish Script</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-label-secondary, #94a3b8)' }}>
                    Dishes written phonetically in native script for instant table reading
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                className="handheld-sheet-close"
                onClick={() => setShowLangSheet(false)}
                aria-label="Close language selector"
              >
                ✕
              </button>
            </div>

            <div className="handheld-lang-options-list">
              {SUPPORTED_WAITER_LANGUAGES.map(lang => {
                const isSelected = waiterLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    className={`handheld-lang-option-row ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelectLang(lang.code)}
                  >
                    <div className="handheld-lang-option-left">
                      <span className="handheld-lang-flag">{lang.flag}</span>
                      <div className="handheld-lang-option-text">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="handheld-lang-native">{lang.native}</span>
                          <span className="handheld-lang-code">({lang.label})</span>
                        </div>
                        <span className="handheld-lang-sub">
                          {lang.code === 'ml' && 'Phonetic Malayalam — e.g. ഗാർലിക് ചിക്കൻ'}
                          {lang.code === 'hi' && 'Phonetic Hindi — e.g. गार्लिक चिकन'}
                          {lang.code === 'en' && 'Standard English Menu Names'}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="handheld-lang-check">
                        <Check size={16} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Modifier & Style/Portion Options Modal ── */}
      {activeModifierItem && (
        <ModifierModal
          item={activeModifierItem}
          currency={currency}
          onClose={() => setActiveModifierItem(null)}
          onConfirm={handleConfirmModifier}
        />
      )}
    </div>
  );
}
