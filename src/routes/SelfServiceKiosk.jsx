import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { 
  collection, doc, getDoc, getDocs, query, limit, 
  serverTimestamp, setDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from '../stores/authStore';
import { useMenuStore } from '../stores/menuStore';
import { useTokenStore } from '../stores/tokenStore';
import { formatCurrency } from '../utils/formatCurrency';
import { computeOrderTaxes } from '../utils/taxUtils';
import { transliterateFood, SUPPORTED_WAITER_LANGUAGES } from '../utils/foodTransliteration';
import { printTokenTicket } from '../utils/print';
import { playNotificationTone, hapticTap } from '../utils/soundNotifications';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { 
  ShoppingCart, ArrowLeft, QrCode, Banknote, AlertTriangle, 
  Maximize2, Minimize2, Plus, Minus, Trash2, X, Search, ChevronRight,
  Clock, Printer
} from 'lucide-react';
import './SelfServiceKiosk.css';

// Standard Category Icons
const CATEGORY_ICONS = {
  burger: '🍔',
  pizza: '🍕',
  starter: '🥟',
  appetizer: '🥗',
  main: '🍛',
  pasta: '🍝',
  biryani: '🍚',
  drink: '🥤',
  beverage: '🍹',
  coffee: '☕',
  dessert: '🍰',
  ice: '🍨',
  side: '🍟',
  wrap: '🌯',
  taco: '🌮',
  default: '🍽️'
};

function getCategoryIcon(name = '') {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return CATEGORY_ICONS.default;
}

export default function SelfServiceKiosk({ initialRestaurant = null, initialCategories = null }) {
  const { restaurantId: paramId } = useParams();

  // Stores
  const authRestaurant = useAuthStore(s => s.restaurant);
  const storeCategories = useMenuStore(s => s.categories);
  const subscribeMenu = useMenuStore(s => s.subscribeMenu);
  const issueToken = useTokenStore(s => s.issueToken);

  // Restaurant Resolution
  const [restaurant, setRestaurant] = useState(initialRestaurant || authRestaurant || null);
  const [loadingRest, setLoadingRest] = useState(!initialRestaurant && !authRestaurant);
  const restaurantId = paramId || restaurant?.id || authRestaurant?.id;
  const categories = initialCategories || storeCategories;

  // Kiosk Flow States: 'attract' | 'menu' | 'success'
  const [step, setStep] = useState('attract');
  const [orderType, setOrderType] = useState('dine-in'); // 'dine-in' | 'takeaway'
  const [lang, setLang] = useState('en'); // 'en' | 'ml' | 'hi'

  // Kiosk Config
  const configuredTimeout = Number(restaurant?.kioskConfig?.inactivityTimeout) || 60;
  const allowedPayment = restaurant?.kioskConfig?.allowedPayment || 'both';
  const autoPrintToken = restaurant?.kioskConfig?.autoPrintToken !== false;

  // Menu Navigation & Filtering
  const [activeCategory, setActiveCategory] = useState('all');
  const [dietaryFilter, setDietaryFilter] = useState('all'); // 'all' | 'veg' | 'nonveg'
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Modifiers
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedModifierItem, setSelectedModifierItem] = useState(null);
  const [cookingNote, setCookingNote] = useState('');

  // Checkout & Payment
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(allowedPayment === 'counter_only' ? 'counter' : 'upi'); // 'upi' | 'counter'
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  useEffect(() => {
    if (allowedPayment === 'counter_only') setPaymentMethod('counter');
    else if (allowedPayment === 'upi_only') setPaymentMethod('upi');
  }, [allowedPayment]);

  // Success Confirmation
  const [placedOrderInfo, setPlacedOrderInfo] = useState(null);
  const [successCountdown, setSuccessCountdown] = useState(15);

  // Inactivity Watchdog
  const [inactivityTimer, setInactivityTimer] = useState(configuredTimeout);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ─── 1. Resolve Restaurant Profile ─────────────────────────
  useEffect(() => {
    let active = true;

    const resolve = async () => {
      if (restaurantId && restaurant?.id === restaurantId) {
        setLoadingRest(false);
        return;
      }

      setLoadingRest(true);
      try {
        let restData = null;
        if (restaurantId) {
          const docRef = doc(db, 'restaurants', restaurantId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            restData = { id: snap.id, ...snap.data() };
          }
        } else {
          // Fallback to first available restaurant
          const q = query(collection(db, 'restaurants'), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            restData = { id: snap.docs[0].id, ...snap.docs[0].data() };
          }
        }

        if (active && restData) {
          setRestaurant(restData);
        }
      } catch (err) {
        console.error('[SelfServiceKiosk] Failed to load restaurant:', err);
      } finally {
        if (active) setLoadingRest(false);
      }
    };

    resolve();
    return () => { active = false; };
  }, [restaurantId, restaurant?.id]);

  // ─── 2. Subscribe to Menu ──────────────────────────────────
  useEffect(() => {
    if (!restaurant?.id || initialCategories) return;
    const unsub = subscribeMenu(restaurant.id);
    return () => {
      if (unsub) unsub();
    };
  }, [restaurant?.id, subscribeMenu, initialCategories]);

  // Extract all items flattened
  const allMenuItems = useMemo(() => {
    if (!Array.isArray(categories)) return [];
    return categories.flatMap(cat => 
      (cat.items || []).map(item => ({
        ...item,
        categoryId: cat.id,
        categoryName: cat.name
      }))
    );
  }, [categories]);

  // Filtered Items for Display
  const filteredItems = useMemo(() => {
    return allMenuItems.filter(item => {
      if (item.available === false) return false;
      if (activeCategory !== 'all' && item.categoryId !== activeCategory) return false;
      if (dietaryFilter === 'veg' && !item.isVeg) return false;
      if (dietaryFilter === 'nonveg' && item.isVeg) return false;
      if (searchQuery.trim()) {
        const queryClean = searchQuery.toLowerCase().trim();
        const matchesName = (item.name || '').toLowerCase().includes(queryClean);
        const matchesMl = (item.mlName || '').includes(queryClean);
        const matchesHi = (item.hiName || '').includes(queryClean);
        if (!matchesName && !matchesMl && !matchesHi) return false;
      }
      return true;
    });
  }, [allMenuItems, activeCategory, dietaryFilter, searchQuery]);

  // ─── 3. Inactivity Watchdog ────────────────────────────────
  const resetWatchdog = useCallback(() => {
    setInactivityTimer(configuredTimeout);
    setShowInactivityWarning(false);
  }, [configuredTimeout]);

  useEffect(() => {
    if (step === 'attract') return; // No timer needed on attract screensaver

    const interval = setInterval(() => {
      setInactivityTimer(prev => {
        if (prev <= 1) {
          // Timeout expired -> reset completely
          handleResetToAttract();
          return configuredTimeout;
        }
        if (prev <= 11) {
          setShowInactivityWarning(true);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, configuredTimeout]);

  // Reset watchdog on user interaction
  useEffect(() => {
    const handleActivity = () => resetWatchdog();
    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [resetWatchdog]);

  // Fullscreen Detection
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    } catch {}
  };

  // ─── 4. Cart Operations ────────────────────────────────────
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty) + (item.modifierTotal || 0) * item.qty, 0);
  }, [cart]);

  const cartTotalQty = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  const taxDetails = useMemo(() => {
    if (!restaurant) return { taxTotal: 0, lines: [] };
    const catsMap = {};
    (categories || []).forEach(c => { catsMap[c.id] = c; });
    return computeOrderTaxes(cart, catsMap, restaurant.taxConfig || {}, { orderType });
  }, [cart, restaurant, categories, orderType]);

  const cartGrandTotal = useMemo(() => {
    return Math.max(0, cartSubtotal + (taxDetails.taxTotal || 0));
  }, [cartSubtotal, taxDetails]);

  const addToCart = (item, selectedModifiers = [], modifierTotal = 0) => {
    hapticTap('light');
    playNotificationTone('reception-bell', 0.2);

    setCart(prev => {
      const matchIndex = prev.findIndex(ci => 
        ci.id === item.id && 
        JSON.stringify(ci.selectedModifiers || []) === JSON.stringify(selectedModifiers)
      );

      if (matchIndex > -1) {
        const next = [...prev];
        next[matchIndex].qty += 1;
        return next;
      }

      return [
        ...prev,
        {
          id: item.id,
          cartItemId: `${item.id}_${Date.now()}`,
          name: item.name,
          mlName: item.mlName,
          hiName: item.hiName,
          price: Number(item.price) || 0,
          qty: 1,
          isVeg: item.isVeg,
          selectedModifiers,
          modifierTotal,
          station: item.station || 'Kitchen',
          recipe: item.recipe || []
        }
      ];
    });
  };

  const updateCartItemQty = (cartItemId, delta) => {
    hapticTap('light');
    setCart(prev => {
      return prev.map(ci => {
        if (ci.cartItemId === cartItemId) {
          const nextQty = ci.qty + delta;
          return nextQty > 0 ? { ...ci, qty: nextQty } : null;
        }
        return ci;
      }).filter(Boolean);
    });
  };

  const clearCartItem = (cartItemId) => {
    hapticTap('medium');
    setCart(prev => prev.filter(ci => ci.cartItemId !== cartItemId));
  };

  const handleResetToAttract = () => {
    setCart([]);
    setIsCartOpen(false);
    setIsCheckoutOpen(false);
    setSelectedModifierItem(null);
    setPlacedOrderInfo(null);
    setShowInactivityWarning(false);
    setStep('attract');
    setSearchQuery('');
    setActiveCategory('all');
  };

  // ─── 5. Dynamic UPI QR Generation ──────────────────────────
  useEffect(() => {
    if (!isCheckoutOpen || paymentMethod !== 'upi' || cartGrandTotal <= 0) return;

    const vpa = restaurant?.upiConfig?.vpa || 'dineos@upi';
    const name = restaurant?.upiConfig?.name || restaurant?.name || 'Restaurant Kiosk';
    const currency = restaurant?.currency || 'INR';
    const sanitizedNote = `Kiosk Order ${Date.now().toString().slice(-4)}`;

    const upiUrl = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${cartGrandTotal.toFixed(2)}&cu=${currency}&tn=${encodeURIComponent(sanitizedNote)}`;

    QRCode.toDataURL(upiUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then(url => setQrCodeUrl(url))
      .catch(() => {
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiUrl)}`);
      });
  }, [isCheckoutOpen, paymentMethod, cartGrandTotal, restaurant]);

  // ─── 6. Place Kiosk Order ──────────────────────────────────
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || isPlacingOrder || !restaurant?.id) return;

    setIsPlacingOrder(true);
    try {
      // 1. Transactionally issue next Token Number
      const tokenNum = await issueToken(restaurant.id);

      // 2. Build order payload
      const currency = restaurant.currency || 'INR';
      const orderPayload = {
        type: orderType,
        orderType: orderType,
        source: 'kiosk',
        status: 'pending',
        token: tokenNum,
        tokenNumber: tokenNum,
        floor: 'Ground Floor',
        items: cart.map(i => ({
          id: i.id,
          name: i.name,
          mlName: i.mlName || '',
          hiName: i.hiName || '',
          price: i.price,
          qty: i.qty,
          selectedModifiers: i.selectedModifiers || [],
          modifierTotal: i.modifierTotal || 0,
          station: i.station || 'Kitchen',
          status: 'pending'
        })),
        subtotal: cartSubtotal,
        taxAmount: taxDetails.taxTotal,
        taxTotal: taxDetails.taxTotal,
        taxLines: taxDetails.lines || [],
        total: cartGrandTotal,
        note: cookingNote.trim(),
        paymentMethod: paymentMethod === 'upi' ? 'upi' : 'counter_cash',
        paymentStatus: paymentMethod === 'upi' ? 'paid' : 'unpaid',
        paid: paymentMethod === 'upi',
        createdAt: serverTimestamp(),
        currency
      };

      // 3. Save order to Firestore
      const orderRef = doc(collection(db, 'restaurants', restaurant.id, 'orders'));
      await setDoc(orderRef, orderPayload);

      // 4. Trigger Token Print (optional, auto-prints if printer configured and enabled)
      if (autoPrintToken) {
        try {
          printTokenTicket({
            token: tokenNum,
            orderType,
            customerName: `Kiosk #${tokenNum}`,
            restaurant,
            isOffline: !navigator.onLine
          });
        } catch (err) {
          console.debug('Kiosk auto-print skipped:', err);
        }
      }

      // 5. Success state & Confetti
      setPlacedOrderInfo({
        id: orderRef.id,
        token: tokenNum,
        total: cartGrandTotal,
        items: [...cart],
        orderType,
        currency,
        paymentMethod
      });

      setCart([]);
      setIsCheckoutOpen(false);
      setIsCartOpen(false);
      setStep('success');
      setSuccessCountdown(15);

      // Launch celebration confetti
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
      playNotificationTone('reception-bell', 0.8);
      hapticTap('heavy');
    } catch (err) {
      console.error('[SelfServiceKiosk] Order failed:', err);
      toast.error('Could not complete order. Please try again or ask counter staff.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // ─── 7. Success Screen Auto-Reset Countdown ────────────────
  useEffect(() => {
    if (step !== 'success') return;

    const timer = setInterval(() => {
      setSuccessCountdown(prev => {
        if (prev <= 1) {
          handleResetToAttract();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  // Transliteration Helper
  const getDishTitle = (item) => {
    if (lang === 'ml') {
      return item.mlName || transliterateFood(item.name, 'ml');
    }
    if (lang === 'hi') {
      return item.hiName || transliterateFood(item.name, 'hi');
    }
    return item.name;
  };

  const currencySymbol = restaurant?.currency || 'INR';

  if (loadingRest && !restaurant) {
    return (
      <div className="kiosk-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8' }}>Loading Kiosk...</div>
      </div>
    );
  }

  // ─── Render Step 1: Attract Screen (Screensaver) ────────────
  if (step === 'attract') {
    return (
      <div className="kiosk-container kiosk-attract-screen" onClick={() => setStep('menu')}>
        {/* Top Header */}
        <div className="kiosk-attract-top" onClick={e => e.stopPropagation()}>
          <div className="kiosk-brand-badge">
            <div className="kiosk-brand-logo">
              {restaurant?.logo ? (
                <img src={restaurant.logo} alt={restaurant?.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : '🍽️'}
            </div>
            <div>
              <div className="kiosk-brand-title">{restaurant?.name || 'Self-Service Kiosk'}</div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>Ground Floor Express Order</div>
            </div>
          </div>

          {/* Language Selector */}
          <div className="kiosk-lang-pills">
            {SUPPORTED_WAITER_LANGUAGES.map(l => (
              <button
                key={l.code}
                type="button"
                className={`kiosk-lang-pill ${lang === l.code ? 'active' : ''}`}
                onClick={() => setLang(l.code)}
              >
                {l.flag} {l.native}
              </button>
            ))}
          </div>
        </div>

        {/* Center Attraction Hero */}
        <div className="kiosk-attract-center">
          <div className="kiosk-attract-hero-icon">
            ✨
          </div>
          <div className="kiosk-attract-headline">
            Touch Anywhere to Order
          </div>
          <p className="kiosk-attract-subline">
            Freshly prepared, fast checkout & automatic pickup token calling.
          </p>

          {/* Dining Choices */}
          <div className="kiosk-dine-choice-row" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="kiosk-choice-btn primary"
              onClick={() => {
                setOrderType('dine-in');
                setStep('menu');
                hapticTap('medium');
              }}
            >
              <span className="kiosk-choice-btn-icon">🍽️</span>
              <span className="kiosk-choice-btn-title">Dine In</span>
              <span className="kiosk-choice-btn-desc">Eat here at tables</span>
            </button>

            <button
              type="button"
              className="kiosk-choice-btn"
              onClick={() => {
                setOrderType('takeaway');
                setStep('menu');
                hapticTap('medium');
              }}
            >
              <span className="kiosk-choice-btn-icon">🛍️</span>
              <span className="kiosk-choice-btn-title">Takeaway</span>
              <span className="kiosk-choice-btn-desc">Pack to go</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="kiosk-attract-footer">
          <span>Tap screen to begin</span>
          <span>•</span>
          <span>Pay via Instant UPI or Cash at Counter</span>
        </div>
      </div>
    );
  }

  // ─── Render Step 3: Success Screen (Token Display) ──────────
  if (step === 'success' && placedOrderInfo) {
    return (
      <div className="kiosk-container kiosk-success-screen">
        <div className="kiosk-token-hero-card">
          <div className="kiosk-token-header-tag">
            {placedOrderInfo.orderType === 'dine-in' ? '🍽️ Dine-In Order' : '🛍️ Takeaway Order'}
          </div>

          <div style={{ fontSize: '16px', color: '#a7f3d0', fontWeight: 700 }}>
            Your Pickup Token Number
          </div>

          <div className="kiosk-token-number-display">
            #{placedOrderInfo.token}
          </div>

          <p className="kiosk-token-instructions">
            Please remember your token number or <strong>take a quick photo with your phone!</strong><br />
            Watch the TV screen above the counter for your token announcement.
          </p>

          <div style={{ padding: '8px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', width: '100%', fontSize: '14px', color: '#ffffff' }}>
            Paid: <strong>{formatCurrency(placedOrderInfo.total, placedOrderInfo.currency)}</strong> via {placedOrderInfo.paymentMethod === 'upi' ? 'UPI QR' : 'Cash at Counter'}
          </div>

          <div className="kiosk-token-countdown">
            Screen resets in {successCountdown} seconds...
          </div>

          <div className="kiosk-token-actions">
            <button
              type="button"
              className="kiosk-token-btn secondary"
              onClick={() => {
                printTokenTicket({
                  token: placedOrderInfo.token,
                  orderType: placedOrderInfo.orderType,
                  customerName: `Kiosk #${placedOrderInfo.token}`,
                  restaurant
                });
                toast.success('Printing token ticket...');
              }}
            >
              <Printer size={16} /> Print Slip
            </button>

            <button
              type="button"
              className="kiosk-token-btn primary"
              onClick={handleResetToAttract}
            >
              Next Customer →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Step 2: Main Interactive Menu ───────────────────
  return (
    <div className="kiosk-container kiosk-main-screen">
      {/* ── Top Header ── */}
      <header className="kiosk-header">
        <div className="kiosk-header-left">
          <button
            type="button"
            className="kiosk-reset-btn"
            onClick={handleResetToAttract}
            title="Start Over"
          >
            <ArrowLeft size={16} /> Start Over
          </button>

          <button
            type="button"
            className="kiosk-header-type-badge"
            onClick={() => setOrderType(ot => ot === 'dine-in' ? 'takeaway' : 'dine-in')}
          >
            {orderType === 'dine-in' ? '🍽️ Dine In' : '🛍️ Takeaway'} (Tap to change)
          </button>
        </div>

        <div className="kiosk-header-right">
          {/* Language Switcher */}
          <div className="kiosk-lang-pills">
            {SUPPORTED_WAITER_LANGUAGES.map(l => (
              <button
                key={l.code}
                type="button"
                className={`kiosk-lang-pill ${lang === l.code ? 'active' : ''}`}
                onClick={() => setLang(l.code)}
              >
                {l.flag} {l.native}
              </button>
            ))}
          </div>

          {/* Inactivity Beacon */}
          <div className="kiosk-inactivity-beacon">
            <Clock size={13} /> {inactivityTimer}s
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            className="kiosk-reset-btn"
            style={{ color: '#94a3b8', borderColor: 'rgba(255,255,255,0.1)', background: 'transparent' }}
            onClick={toggleFullscreen}
            title="Toggle Kiosk Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* ── Main Body: Categories Sidebar + Dishes Grid ── */}
      <div className="kiosk-body">
        {/* Categories Rail */}
        <aside className="kiosk-categories-sidebar">
          <button
            type="button"
            className={`kiosk-cat-item ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            <span className="kiosk-cat-icon">⭐</span>
            <span>All Items</span>
          </button>

          {(categories || []).map(cat => (
            <button
              key={cat.id}
              type="button"
              className={`kiosk-cat-item ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span className="kiosk-cat-icon">{getCategoryIcon(cat.name)}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </aside>

        {/* Content Area */}
        <main className="kiosk-content-area">
          {/* Filter Bar: Dietary + Quick Search */}
          <div className="kiosk-filter-bar">
            <div className="kiosk-dietary-pills">
              <button
                type="button"
                className={`kiosk-dietary-btn ${dietaryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setDietaryFilter('all')}
              >
                All Foods
              </button>
              <button
                type="button"
                className={`kiosk-dietary-btn veg ${dietaryFilter === 'veg' ? 'active' : ''}`}
                onClick={() => setDietaryFilter('veg')}
              >
                🟢 Pure Veg
              </button>
              <button
                type="button"
                className={`kiosk-dietary-btn nonveg ${dietaryFilter === 'nonveg' ? 'active' : ''}`}
                onClick={() => setDietaryFilter('nonveg')}
              >
                🔴 Non-Veg
              </button>
            </div>

            {/* Quick Search */}
            <div style={{ position: 'relative', width: 220 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search food..."
                style={{
                  width: '100%',
                  height: 38,
                  paddingLeft: 34,
                  paddingRight: 12,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#ffffff',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Dishes Grid */}
          <div className="kiosk-dish-grid">
            {filteredItems.map(item => {
              const inCart = cart.find(ci => ci.id === item.id);
              const localizedTitle = getDishTitle(item);

              return (
                <div key={item.id} className="kiosk-dish-card">
                  {/* Image with dietary tag */}
                  <div className="kiosk-dish-img-wrap">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="kiosk-dish-img" loading="lazy" />
                    ) : (
                      <div className="kiosk-dish-img-placeholder">
                        {getCategoryIcon(item.categoryName)}
                      </div>
                    )}
                    <div className={`kiosk-dish-diet-tag ${item.isVeg ? 'veg' : 'nonveg'}`}>
                      <div className="dot" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="kiosk-dish-info">
                    <div>
                      <h4 className="kiosk-dish-title">{item.name}</h4>
                      {lang !== 'en' && localizedTitle !== item.name && (
                        <div className="kiosk-dish-localized">{localizedTitle}</div>
                      )}
                    </div>

                    <div className="kiosk-dish-bottom">
                      <span className="kiosk-dish-price">
                        {formatCurrency(Number(item.price) || 0, currencySymbol)}
                      </span>

                      {inCart ? (
                        <div className="kiosk-dish-qty-stepper">
                          <button
                            type="button"
                            className="kiosk-qty-btn"
                            onClick={() => updateCartItemQty(inCart.cartItemId, -1)}
                          >
                            <Minus size={13} />
                          </button>
                          <span className="kiosk-qty-count">{inCart.qty}</span>
                          <button
                            type="button"
                            className="kiosk-qty-btn"
                            onClick={() => updateCartItemQty(inCart.cartItemId, 1)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="kiosk-dish-add-btn"
                          onClick={() => {
                            if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
                              setSelectedModifierItem(item);
                            } else {
                              addToCart(item);
                            }
                          }}
                        >
                          <Plus size={14} /> Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🍽️</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>No dishes match this selection</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try clearing the search or switching dietary filters.</div>
            </div>
          )}
        </main>
      </div>

      {/* ── Bottom Floating Checkout Bar ── */}
      {cart.length > 0 && (
        <div className="kiosk-footer-bar">
          <div className="kiosk-footer-summary" onClick={() => setIsCartOpen(true)} style={{ cursor: 'pointer' }}>
            <div className="kiosk-cart-badge">
              <ShoppingCart size={22} />
              <div className="kiosk-cart-badge-count">{cartTotalQty}</div>
            </div>
            <div className="kiosk-footer-total-box">
              <span className="kiosk-footer-total-label">Order Total ({cartTotalQty} items)</span>
              <span className="kiosk-footer-total-amt">{formatCurrency(cartGrandTotal, currencySymbol)}</span>
            </div>
          </div>

          <div className="kiosk-footer-actions">
            <button
              type="button"
              className="kiosk-view-cart-btn"
              onClick={() => setIsCheckoutOpen(true)}
            >
              Pay & Place Order <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modifier / Customization Modal ── */}
      {selectedModifierItem && (
        <div className="kiosk-modal-backdrop" onClick={() => setSelectedModifierItem(null)}>
          <div className="kiosk-modal-box" onClick={e => e.stopPropagation()}>
            <div className="kiosk-modal-header">
              <div>
                <h3 className="kiosk-modal-title">{selectedModifierItem.name}</h3>
                <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 700 }}>
                  Base: {formatCurrency(Number(selectedModifierItem.price) || 0, currencySymbol)}
                </span>
              </div>
              <button type="button" onClick={() => setSelectedModifierItem(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="kiosk-modal-body">
              {(selectedModifierItem.modifiers || []).map(mod => (
                <div key={mod.id || mod.name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>{mod.name}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                    {(mod.options || []).map(opt => (
                      <button
                        key={opt.name}
                        type="button"
                        className="kiosk-choice-btn"
                        style={{ padding: '12px 10px', borderRadius: 12 }}
                        onClick={() => {
                          const modTotal = Number(opt.price) || 0;
                          addToCart(selectedModifierItem, [{ modifierName: mod.name, optionName: opt.name, price: modTotal }], modTotal);
                          setSelectedModifierItem(null);
                        }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>{opt.name}</span>
                        {opt.price > 0 && (
                          <span style={{ fontSize: '12px', color: '#10b981' }}>+{formatCurrency(opt.price, currencySymbol)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                className="kiosk-view-cart-btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  addToCart(selectedModifierItem);
                  setSelectedModifierItem(null);
                }}
              >
                Add Standard ({formatCurrency(Number(selectedModifierItem.price) || 0, currencySymbol)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cart Review Drawer Modal ── */}
      {isCartOpen && (
        <div className="kiosk-modal-backdrop" onClick={() => setIsCartOpen(false)}>
          <div className="kiosk-modal-box" onClick={e => e.stopPropagation()}>
            <div className="kiosk-modal-header">
              <h3 className="kiosk-modal-title">Your Order Cart</h3>
              <button type="button" onClick={() => setIsCartOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="kiosk-modal-body">
              {cart.map(ci => (
                <div key={ci.cartItemId} className="kiosk-cart-item-row">
                  <div>
                    <div className="kiosk-cart-item-title">{ci.name}</div>
                    <div className="kiosk-cart-item-sub">
                      {formatCurrency(ci.price, currencySymbol)} x {ci.qty}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="kiosk-dish-qty-stepper">
                      <button type="button" className="kiosk-qty-btn" onClick={() => updateCartItemQty(ci.cartItemId, -1)}>
                        <Minus size={13} />
                      </button>
                      <span className="kiosk-qty-count">{ci.qty}</span>
                      <button type="button" className="kiosk-qty-btn" onClick={() => updateCartItemQty(ci.cartItemId, 1)}>
                        <Plus size={13} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => clearCartItem(ci.cartItemId)}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Cooking Note */}
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                  Cooking Instructions / Allergies (Optional)
                </label>
                <textarea
                  value={cookingNote}
                  onChange={e => setCookingNote(e.target.value)}
                  placeholder="e.g. Less spicy, extra sauce, allergy note..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#ffffff',
                    fontSize: 13,
                    resize: 'none',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Totals */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartSubtotal, currencySymbol)}</span>
                </div>
                {taxDetails.taxTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
                    <span>Taxes</span>
                    <span>{formatCurrency(taxDetails.taxTotal, currencySymbol)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, color: '#10b981', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                  <span>Grand Total</span>
                  <span>{formatCurrency(cartGrandTotal, currencySymbol)}</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                className="kiosk-view-cart-btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  setIsCartOpen(false);
                  setIsCheckoutOpen(true);
                }}
              >
                Proceed to Payment ({formatCurrency(cartGrandTotal, currencySymbol)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout & Payment Modal ── */}
      {isCheckoutOpen && (
        <div className="kiosk-modal-backdrop" onClick={() => !isPlacingOrder && setIsCheckoutOpen(false)}>
          <div className="kiosk-modal-box" onClick={e => e.stopPropagation()}>
            <div className="kiosk-modal-header">
              <h3 className="kiosk-modal-title">Select Payment Method</h3>
              {!isPlacingOrder && (
                <button type="button" onClick={() => setIsCheckoutOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="kiosk-modal-body">
              {/* Payment Option Selector */}
              {allowedPayment === 'both' && (
                <div className="kiosk-pay-options-grid">
                  <button
                    type="button"
                    className={`kiosk-pay-option-btn ${paymentMethod === 'upi' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('upi')}
                  >
                    <QrCode size={30} style={{ color: '#818cf8' }} />
                    <span style={{ fontSize: 15, fontWeight: 800 }}>Scan UPI QR</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>GPay, PhonePe, Paytm</span>
                  </button>

                  <button
                    type="button"
                    className={`kiosk-pay-option-btn ${paymentMethod === 'counter' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('counter')}
                  >
                    <Banknote size={30} style={{ color: '#34d399' }} />
                    <span style={{ fontSize: 15, fontWeight: 800 }}>Pay at Counter</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Pay Cash to Cashier</span>
                  </button>
                </div>
              )}

              {/* Dynamic QR Display for UPI */}
              {paymentMethod === 'upi' ? (
                <div className="kiosk-upi-card">
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>
                    Scan with any UPI App to Pay
                  </div>

                  <div className="kiosk-qr-image-wrap">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="UPI Payment QR" className="kiosk-qr-image" />
                    ) : (
                      <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        Generating QR...
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>
                    {formatCurrency(cartGrandTotal, currencySymbol)}
                  </div>

                  <div className="kiosk-upi-apps-icons">
                    <span>Google Pay</span> • <span>PhonePe</span> • <span>Paytm</span> • <span>BHIM</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 20, borderRadius: 16, background: 'rgba(255,255,255,0.04)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 32 }}>🧾</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff' }}>Pay Cash at Ground Floor Counter</div>
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                    Your order will be sent to the kitchen immediately. Please show your token number at the cash counter to complete payment.
                  </p>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                className="kiosk-view-cart-btn"
                disabled={isPlacingOrder}
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handlePlaceOrder}
              >
                {isPlacingOrder ? 'Confirming Order...' : (paymentMethod === 'upi' ? 'I Have Paid via UPI →' : 'Confirm Order & Get Token →')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inactivity Warning Modal ── */}
      {showInactivityWarning && (
        <div className="kiosk-modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="kiosk-modal-box" style={{ maxWidth: 400, textAlign: 'center', padding: 24, gap: 16 }}>
            <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto' }} />
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff' }}>Are you still there?</h3>
            <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>
              Your order session will reset to protect your privacy in <strong>{inactivityTimer} seconds</strong>.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                className="kiosk-token-btn secondary"
                onClick={handleResetToAttract}
              >
                Cancel Order
              </button>
              <button
                type="button"
                className="kiosk-token-btn primary"
                onClick={resetWatchdog}
              >
                I'm Still Ordering!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
