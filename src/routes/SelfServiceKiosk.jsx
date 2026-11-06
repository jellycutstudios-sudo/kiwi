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
  ArrowLeft, QrCode, Banknote, AlertTriangle, 
  Maximize2, Minimize2, Plus, Minus, Trash2, X, Search, ChevronRight,
  Clock, Printer, Utensils, ShoppingBag, Sparkles, Receipt,
  LayoutGrid, Tag, TrendingUp
} from 'lucide-react';
import './SelfServiceKiosk.css';

function formatKioskDate(date) {
  try {
    const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day}, ${time}`;
  } catch {
    return '';
  }
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
  const [, setLoadingRest] = useState(!initialRestaurant && !authRestaurant);
  const restaurantId = paramId || restaurant?.id || authRestaurant?.id;
  const categories = initialCategories || storeCategories;

  // Real-time clock for top header
  const [currentTime, setCurrentTime] = useState(() => formatKioskDate(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(formatKioskDate(new Date())), 15000);
    return () => clearInterval(timer);
  }, []);

  // Kiosk Flow States: 'attract' | 'menu' | 'success'
  // Kiosk Config
  const configuredTimeout = Number(restaurant?.kioskConfig?.inactivityTimeout) || 60;
  const allowedPayment = restaurant?.kioskConfig?.allowedPayment || 'both';
  const allowedDining = restaurant?.kioskConfig?.allowedDining || 'both';
  const colorTheme = restaurant?.kioskConfig?.colorTheme || 'monochrome';
  const autoPrintToken = restaurant?.kioskConfig?.autoPrintToken !== false;

  const [step, setStep] = useState('attract');
  const [orderType, setOrderType] = useState(allowedDining === 'takeaway' ? 'takeaway' : 'dine-in'); // 'dine-in' | 'takeaway'
  const [lang, setLang] = useState('en'); // 'en' | 'ml' | 'hi'

  // Active Logo Emblem: Kiosk specific logo -> Receipt logo -> Restaurant general logo
  const kioskLogo = restaurant?.kioskConfig?.logoUrl || restaurant?.receiptConfig?.logoUrl || restaurant?.logo || null;
  const heroHeadline = restaurant?.kioskConfig?.headline || 'Touch Anywhere to Order';
  const heroSubtitle = restaurant?.kioskConfig?.subtitle || 'Freshly prepared, fast checkout & automatic pickup token calling.';
  const stationName = restaurant?.kioskConfig?.stationName?.trim() || 'Ground Floor Kiosk';

  // Menu Navigation & Filtering
  const [activeCategory, setActiveCategory] = useState('all');
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'discount' | 'trending' | 'veg' | 'nonveg'
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Modifiers
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cookingNote, setCookingNote] = useState('');

  // Dish Customization & Detail Modal (Matching Reference Image 3)
  const [selectedModifierItem, setSelectedModifierItem] = useState(null);
  const [detailQty, setDetailQty] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState([]); // [{ modifierName, optionName, price }]

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

      // Quick filter
      if (quickFilter === 'discount') {
        const hasDiscount = Boolean(item.originalPrice && Number(item.originalPrice) > Number(item.price));
        if (!hasDiscount) return false;
      } else if (quickFilter === 'trending') {
        const isTrending = Boolean(item.isBestseller || item.popular || item.bestseller);
        if (!isTrending) return false;
      } else if (quickFilter === 'veg' && !item.isVeg) {
        return false;
      } else if (quickFilter === 'nonveg' && item.isVeg) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (item.name || '').toLowerCase().includes(q);
        const translit = transliterateFood(item.name || '', lang);
        const translitMatch = translit.toLowerCase().includes(q);
        const catMatch = (item.categoryName || '').toLowerCase().includes(q);
        return nameMatch || translitMatch || catMatch;
      }

      return true;
    });
  }, [allMenuItems, activeCategory, quickFilter, searchQuery, lang]);

  // ─── 3. Inactivity Reset Watchdog ──────────────────────────
  const resetInactivityTimer = useCallback(() => {
    setInactivityTimer(configuredTimeout);
    setShowInactivityWarning(false);
  }, [configuredTimeout]);

  useEffect(() => {
    if (step === 'attract') return;

    const interval = setInterval(() => {
      setInactivityTimer(prev => {
        if (prev <= 1) {
          // Timeout reached: Hard reset back to screensaver
          setStep('attract');
          setCart([]);
          setIsCartOpen(false);
          setIsCheckoutOpen(false);
          setSelectedModifierItem(null);
          setPlacedOrderInfo(null);
          setShowInactivityWarning(false);
          return configuredTimeout;
        }

        if (prev === 12) {
          setShowInactivityWarning(true);
        }

        return prev - 1;
      });
    }, 1000);

    const userActivityEvents = ['touchstart', 'touchmove', 'mousedown', 'keydown', 'scroll'];
    const handleUserActivity = () => {
      setInactivityTimer(configuredTimeout);
      setShowInactivityWarning(false);
    };

    userActivityEvents.forEach(evt => window.addEventListener(evt, handleUserActivity, { passive: true }));

    return () => {
      clearInterval(interval);
      userActivityEvents.forEach(evt => window.removeEventListener(evt, handleUserActivity));
    };
  }, [step, configuredTimeout]);

  // ─── 4. Success Screen Auto-Reset Countdown ────────────────
  useEffect(() => {
    if (step !== 'success') return;
    setSuccessCountdown(15);

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

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const handleResetToAttract = () => {
    setStep('attract');
    setCart([]);
    setIsCartOpen(false);
    setIsCheckoutOpen(false);
    setSelectedModifierItem(null);
    setPlacedOrderInfo(null);
    setOrderType('dine-in');
    setInactivityTimer(configuredTimeout);
  };

  // ─── 5. Cart Management ────────────────────────────────────
  const addToCart = (item, selectedMods = [], extraModPrice = 0, quantity = 1) => {
    hapticTap('light');
    const basePrice = Number(item.price) || 0;
    const finalItemPrice = basePrice + extraModPrice;
    const modKey = (selectedMods || []).map(m => `${m.modifierName}:${m.optionName}`).sort().join('|');
    const cartItemId = `${item.id}_${modKey}`;

    setCart(prev => {
      const existing = prev.find(i => i.cartItemId === cartItemId);
      if (existing) {
        return prev.map(i => i.cartItemId === cartItemId ? { ...i, qty: i.qty + quantity } : i);
      }
      return [...prev, {
        cartItemId,
        id: item.id,
        name: item.name,
        price: finalItemPrice,
        basePrice,
        qty: quantity,
        imageUrl: item.imageUrl || item.image || '',
        categoryName: item.categoryName,
        isVeg: item.isVeg,
        selectedModifiers: selectedMods,
        mlName: item.mlName,
        hiName: item.hiName
      }];
    });

    playNotificationTone('pop');
  };

  const updateCartItemQty = (cartItemId, delta) => {
    hapticTap('light');
    setCart(prev => {
      return prev.map(item => {
        if (item.cartItemId !== cartItemId) return item;
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }).filter(Boolean);
    });
  };

  const clearCartItem = (cartItemId) => {
    hapticTap('medium');
    setCart(prev => prev.filter(i => i.cartItemId !== cartItemId));
  };

  // Open Dish Detail / Customization Modal (Image 3)
  const handleOpenItemDetail = (item) => {
    hapticTap('light');
    setSelectedModifierItem(item);
    setDetailQty(1);
    setSelectedModifiers([]);
  };

  // Toggle modifier option selection in Detail Modal
  const handleToggleOption = (mod, opt) => {
    hapticTap('light');
    const optPrice = Number(opt.price) || 0;
    setSelectedModifiers(prev => {
      const exists = prev.find(m => m.modifierName === mod.name && m.optionName === opt.name);
      if (exists) {
        return prev.filter(m => !(m.modifierName === mod.name && m.optionName === opt.name));
      }
      // If single-select option in group, replace existing in same modifier group
      const filtered = prev.filter(m => m.modifierName !== mod.name);
      return [...filtered, { modifierName: mod.name, optionName: opt.name, price: optPrice }];
    });
  };

  // Add customized item from Detail Modal to cart
  const handleAddDetailToCart = () => {
    if (!selectedModifierItem) return;
    const extraPrice = selectedModifiers.reduce((acc, m) => acc + (Number(m.price) || 0), 0);
    addToCart(selectedModifierItem, selectedModifiers, extraPrice, detailQty);
    setSelectedModifierItem(null);
  };

  // Totals & Financial Calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number(item.price) * item.qty), 0);
  }, [cart]);

  const cartTotalQty = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  const taxDetails = useMemo(() => {
    const taxRate = Number(restaurant?.taxRate ?? 5);
    const isInclusive = restaurant?.taxInclusive ?? false;
    if (!cart || cart.length === 0) {
      return { baseSubtotal: 0, taxTotal: 0, totalWithTax: 0, lines: [] };
    }
    const res = computeOrderTaxes(cart, {}, {
      type: 'percentage',
      mode: isInclusive ? 'inclusive' : 'exclusive',
      defaultRate: taxRate
    });
    return {
      baseSubtotal: res.baseSubtotal,
      taxTotal: res.taxTotal,
      totalWithTax: res.total || cartSubtotal,
      lines: res.lines || []
    };
  }, [cart, cartSubtotal, restaurant]);

  const cartGrandTotal = taxDetails.totalWithTax || cartSubtotal;
  const currencySymbol = restaurant?.currency || 'INR';

  // ─── 6. Generate UPI QR Code ───────────────────────────────
  useEffect(() => {
    if (!isCheckoutOpen || paymentMethod !== 'upi' || cartGrandTotal <= 0) return;

    const generateQr = async () => {
      try {
        const vpa = restaurant?.upiConfig?.vpa || 'kiwipos@upi';
        const merchantName = restaurant?.upiConfig?.name || restaurant?.name || 'Self-Service Kiosk';
        const note = `Kiosk Order ${Date.now().toString().slice(-4)}`;
        const upiUri = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(merchantName)}&am=${cartGrandTotal.toFixed(2)}&cu=${currencySymbol}&tn=${encodeURIComponent(note)}`;

        const dataUrl = await QRCode.toDataURL(upiUri, {
          width: 320,
          margin: 1,
          color: { dark: '#090a0f', light: '#ffffff' }
        });
        setQrCodeUrl(dataUrl);
      } catch (err) {
        console.error('[SelfServiceKiosk] QR Generation error:', err);
      }
    };

    generateQr();
  }, [isCheckoutOpen, paymentMethod, cartGrandTotal, restaurant, currencySymbol]);

  // ─── 7. Order Placement & Token Issuance ───────────────────
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || isPlacingOrder) return;
    setIsPlacingOrder(true);
    const toastId = toast.loading('Confirming your order & issuing token...');

    try {
      // 1. Issue Next QSR Pickup Token
      let tokenNum = '1';
      try {
        tokenNum = await issueToken(restaurant.id);
      } catch (tErr) {
        console.warn('[SelfServiceKiosk] Issue token fallback:', tErr);
        tokenNum = Math.floor(100 + Math.random() * 900).toString();
      }

      // 2. Prepare Order Payload
      const orderId = `KIOSK-${Date.now().toString().slice(-6)}`;
      const orderPayload = {
        orderId,
        id: orderId,
        restaurantId: restaurant.id,
        type: orderType, // 'dine-in' | 'takeaway'
        source: 'kiosk',
        status: 'pending',
        token: tokenNum,
        tableName: orderType === 'dine-in' ? stationName : `${stationName} (Takeaway)`,
        customerName: `Kiosk Token #${tokenNum}`,
        customerPhone: '',
        cookingNote: cookingNote.trim(),
        paymentMethod: paymentMethod === 'upi' ? 'upi' : 'cash',
        paymentStatus: paymentMethod === 'upi' ? 'paid' : 'unpaid',
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          price: Number(item.price) || 0,
          qty: item.qty,
          selectedModifiers: item.selectedModifiers || [],
          prepState: 'fired',
          categoryName: item.categoryName || 'General',
          isVeg: Boolean(item.isVeg)
        })),
        subtotal: cartSubtotal,
        taxTotal: taxDetails.taxTotal,
        total: cartGrandTotal,
        currency: currencySymbol,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // 3. Write Order to Firestore
      const orderDocRef = doc(db, 'restaurants', restaurant.id, 'orders', orderId);
      await setDoc(orderDocRef, orderPayload);

      // 4. Auto-Print Token Slip if configured
      if (autoPrintToken) {
        try {
          printTokenTicket({
            token: tokenNum,
            orderType,
            customerName: `Express Kiosk #${tokenNum}`,
            restaurant
          });
        } catch (printErr) {
          console.warn('[SelfServiceKiosk] Print token skipped:', printErr);
        }
      }

      // 5. Success Sound & Confetti
      playNotificationTone('chime');
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      // 6. Transition to Success Screen
      setPlacedOrderInfo({
        orderId,
        token: tokenNum,
        orderType,
        total: cartGrandTotal,
        paymentMethod,
        currency: currencySymbol
      });

      toast.success('Order placed successfully!', { id: toastId });
      setIsCheckoutOpen(false);
      setIsCartOpen(false);
      setCart([]);
      setCookingNote('');
      setStep('success');
    } catch (err) {
      console.error('[SelfServiceKiosk] Place order error:', err);
      toast.error('Failed to place order: ' + err.message, { id: toastId });
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // ─── Render Step 1: Attract Screen (Screensaver) ────────────
  if (step === 'attract') {
    return (
      <div className={`kiosk-container kiosk-theme-${colorTheme} kiosk-attract-screen`} onClick={() => setStep('menu')}>
        {/* Top Header */}
        <div className="kiosk-attract-top" onClick={e => e.stopPropagation()}>
          <div className="kiosk-brand-badge">
            <div className="kiosk-brand-logo">
              {kioskLogo ? (
                <img src={kioskLogo} alt={restaurant?.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : <Utensils size={22} color="#cbd5e1" />}
            </div>
            <div>
              <div className="kiosk-brand-title">{restaurant?.name || 'Self-Service Kiosk'}</div>
              <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>{stationName}</div>
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
                {l.native}
              </button>
            ))}
          </div>
        </div>

        {/* Center Attraction Hero */}
        <div className="kiosk-attract-center">
          <div className="kiosk-attract-hero-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={36} color="var(--kiosk-hero-color, #ffffff)" />
          </div>
          <div className="kiosk-attract-headline">
            {heroHeadline}
          </div>
          <p className="kiosk-attract-subline">
            {heroSubtitle}
          </p>

          {/* Dining Choices (Respects allowedDining configuration) */}
          <div className="kiosk-dine-choice-row" onClick={e => e.stopPropagation()}>
            {allowedDining !== 'takeaway' && (
              <button
                type="button"
                className="kiosk-choice-btn primary"
                onClick={() => {
                  setOrderType('dine-in');
                  setStep('menu');
                  hapticTap('medium');
                }}
              >
                <span className="kiosk-choice-btn-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Utensils size={32} />
                </span>
                <span className="kiosk-choice-btn-title">Dine In</span>
                <span className="kiosk-choice-btn-desc">Eat here at tables</span>
              </button>
            )}

            {allowedDining !== 'dine-in' && (
              <button
                type="button"
                className={`kiosk-choice-btn ${allowedDining === 'takeaway' ? 'primary' : 'secondary'}`}
                onClick={() => {
                  setOrderType('takeaway');
                  setStep('menu');
                  hapticTap('medium');
                }}
              >
                <span className="kiosk-choice-btn-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShoppingBag size={32} />
                </span>
                <span className="kiosk-choice-btn-title">Takeaway</span>
                <span className="kiosk-choice-btn-desc">Pack to go</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="kiosk-attract-footer">
          <span>Tap anywhere to begin</span>
          <span style={{ opacity: 0.35 }}>•</span>
          <span>Instant UPI QR or Pay at Counter</span>
        </div>
      </div>
    );
  }

  // ─── Render Step 3: Success Screen (Token Display) ──────────
  if (step === 'success' && placedOrderInfo) {
    return (
      <div className={`kiosk-container kiosk-theme-${colorTheme} kiosk-success-screen`}>
        <div className="kiosk-token-hero-card">
          <div className="kiosk-token-header-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {placedOrderInfo.orderType === 'dine-in' ? <Utensils size={14} /> : <ShoppingBag size={14} />}
            {placedOrderInfo.orderType === 'dine-in' ? 'Dine-In Order' : 'Takeaway Order'}
          </div>

          <div style={{ fontSize: '16px', color: '#a7f3d0', fontWeight: 700 }}>
            Your Pickup Token Number
          </div>

          <div className="kiosk-token-number-display">{`#${placedOrderInfo.token}`}</div>

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
              Next Customer / Start New Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Step 2: Main Menu Screen (Refactored to match uploaded UI) ─
  return (
    <div className={`kiosk-container kiosk-theme-${colorTheme} kiosk-menu-screen`} onClick={resetInactivityTimer}>
      {/* ── Top Ambient Navigation Bar ── */}
      <header className="kiosk-top-nav">
        <button
          type="button"
          className="kiosk-nav-back-btn"
          onClick={handleResetToAttract}
        >
          <ArrowLeft size={16} /> BACK
        </button>

        <div className="kiosk-nav-center-info">
          <span className="kiosk-nav-clock">{currentTime}</span>
          <span className="kiosk-nav-station-tag">{stationName}</span>
        </div>

        <div className="kiosk-nav-right">
          <button
            type="button"
            className="kiosk-nav-mode-pill"
            onClick={() => setOrderType(ot => ot === 'dine-in' ? 'takeaway' : 'dine-in')}
          >
            {orderType === 'dine-in' ? <Utensils size={13} /> : <ShoppingBag size={13} />}
            <span>{orderType === 'dine-in' ? 'Dine In' : 'Takeaway'}</span>
          </button>

          <div className="kiosk-lang-pills">
            {SUPPORTED_WAITER_LANGUAGES.map(l => (
              <button
                key={l.code}
                type="button"
                className={`kiosk-lang-pill ${lang === l.code ? 'active' : ''}`}
                onClick={() => setLang(l.code)}
              >
                {l.native}
              </button>
            ))}
          </div>

          <div className="kiosk-inactivity-badge" title="Inactivity auto-reset timer">
            <Clock size={12} /> {inactivityTimer}s
          </div>

          <button
            type="button"
            className="kiosk-fullscreen-btn"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      {/* ── Top Hero Banner (Matching Reference Image 1) ── */}
      <div className="kiosk-hero-banner">
        <div className="kiosk-hero-left">
          <h1 className="kiosk-hero-title">
            {heroHeadline}
          </h1>
          <p className="kiosk-hero-subtitle">
            {heroSubtitle}
          </p>
        </div>

        {/* Circular Restaurant Logo Emblem */}
        <div className="kiosk-hero-right">
          <div className="kiosk-hero-logo-emblem">
            {kioskLogo ? (
              <img src={kioskLogo} alt={restaurant?.name || 'Restaurant Logo'} className="kiosk-hero-logo-img" />
            ) : (
              <div className="kiosk-hero-logo-fallback">
                <Utensils size={36} color="#ffffff" />
                <span className="kiosk-hero-fallback-text">{restaurant?.name ? restaurant.name.slice(0, 8).toUpperCase() : 'KIWI'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Body Elevated Sheet (White container with rounded top corners) ── */}
      <div className="kiosk-main-sheet">
        {/* Left Category Rail */}
        <aside className="kiosk-cat-rail">
          {/* "ALL" Pill */}
          <button
            type="button"
            className={`kiosk-rail-all-btn ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('all');
              hapticTap('light');
            }}
          >
            <div className="kiosk-rail-all-icon">
              <LayoutGrid size={18} />
            </div>
            <span>ALL</span>
          </button>

          {/* Specific Categories */}
          {(categories || []).map(cat => {
            const firstDishImg = (cat.items || []).find(i => i.imageUrl || i.image)?.imageUrl || '';
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                className={`kiosk-rail-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(cat.id);
                  hapticTap('light');
                }}
              >
                <div className="kiosk-rail-thumb-wrap">
                  {firstDishImg ? (
                    <img src={firstDishImg} alt={cat.name} className="kiosk-rail-thumb-img" loading="lazy" />
                  ) : (
                    <div className="kiosk-rail-thumb-fallback">
                      <Utensils size={15} />
                    </div>
                  )}
                </div>
                <span className="kiosk-rail-title">{cat.name}</span>
              </button>
            );
          })}
        </aside>

        {/* Right Content Area */}
        <main className="kiosk-right-content">
          {/* Top Filter Bar: Chips & Search (Matching Image 1) */}
          <div className="kiosk-top-filter-bar">
            <div className="kiosk-filter-chips">
              <button
                type="button"
                className={`kiosk-filter-chip ${quickFilter === 'all' ? 'active' : ''}`}
                onClick={() => setQuickFilter('all')}
              >
                ALL
              </button>
              <button
                type="button"
                className={`kiosk-filter-chip ${quickFilter === 'discount' ? 'active' : ''}`}
                onClick={() => setQuickFilter(q => q === 'discount' ? 'all' : 'discount')}
              >
                <Tag size={13} /> DISCOUNT
              </button>
              <button
                type="button"
                className={`kiosk-filter-chip ${quickFilter === 'trending' ? 'active' : ''}`}
                onClick={() => setQuickFilter(q => q === 'trending' ? 'all' : 'trending')}
              >
                <TrendingUp size={13} /> TRENDING
              </button>
              <button
                type="button"
                className={`kiosk-filter-chip ${quickFilter === 'veg' ? 'active' : ''}`}
                onClick={() => setQuickFilter(q => q === 'veg' ? 'all' : 'veg')}
              >
                <span className="kiosk-dot-veg" /> PURE VEG
              </button>
              <button
                type="button"
                className={`kiosk-filter-chip ${quickFilter === 'nonveg' ? 'active' : ''}`}
                onClick={() => setQuickFilter(q => q === 'nonveg' ? 'all' : 'nonveg')}
              >
                <span className="kiosk-dot-nonveg" /> NON-VEG
              </button>
            </div>

            {/* Quick Search Input */}
            <div className="kiosk-search-wrap">
              <Search size={14} className="kiosk-search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search food..."
                className="kiosk-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="kiosk-search-clear"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Dishes Grid (2 columns or 3 on wide screens - Matching Image 1) */}
          <div className="kiosk-dishes-grid">
            {filteredItems.map(item => {
              const localizedTitle = transliterateFood(item.name, lang);
              const hasDiscount = Boolean(item.originalPrice && Number(item.originalPrice) > Number(item.price));
              const dishImg = item.imageUrl || item.image || '';

              return (
                <div
                  key={item.id}
                  className="kiosk-dish-card"
                  onClick={() => handleOpenItemDetail(item)}
                >
                  {/* Left Details */}
                  <div className="kiosk-dish-card-left">
                    <div className="kiosk-dish-badge-row">
                      <span className={`kiosk-dish-diet-dot ${item.isVeg ? 'veg' : 'nonveg'}`} />
                      {(item.isBestseller || item.popular || item.bestseller) && (
                        <span className="kiosk-dish-popular-tag">TRENDING</span>
                      )}
                    </div>

                    <h3 className="kiosk-dish-title">{item.name}</h3>
                    {lang !== 'en' && localizedTitle !== item.name && (
                      <div className="kiosk-dish-localized">{localizedTitle}</div>
                    )}

                    <div className="kiosk-dish-price-wrap">
                      <span className={`kiosk-dish-price ${hasDiscount ? 'discounted' : ''}`}>
                        {formatCurrency(Number(item.price) || 0, currencySymbol)}
                      </span>
                      {hasDiscount && (
                        <span className="kiosk-dish-orig-price">
                          {formatCurrency(Number(item.originalPrice), currencySymbol)}
                        </span>
                      )}
                    </div>

                    {/* Quick Add Button */}
                    <button
                      type="button"
                      className="kiosk-dish-quick-add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
                          handleOpenItemDetail(item);
                        } else {
                          addToCart(item);
                        }
                      }}
                    >
                      <Plus size={13} /> Add
                    </button>
                  </div>

                  {/* Right Bleeding Circular Plate Photo */}
                  <div className="kiosk-dish-card-right">
                    <div className="kiosk-dish-plate-circle">
                      {dishImg ? (
                        <img src={dishImg} alt={item.name} className="kiosk-dish-plate-img" loading="lazy" />
                      ) : (
                        <div className="kiosk-dish-plate-fallback">
                          <Utensils size={34} color="#a1a1aa" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="kiosk-empty-items">
              <Utensils size={42} color="#a1a1aa" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 18, fontWeight: 800, color: '#18181b' }}>No dishes match this selection</div>
              <div style={{ fontSize: 13, marginTop: 4, color: '#71717a' }}>Try clearing filters or search query.</div>
            </div>
          )}
        </main>
      </div>

      {/* ── Bottom Dual-Pill Floating Bar (Matching Image 1) ── */}
      {cart.length > 0 && (
        <div className="kiosk-floating-bar-wrap">
          <div className="kiosk-dual-pill-bar">
            {/* Left Pill: Cart with Bag Icon & Count */}
            <button
              type="button"
              className="kiosk-bar-cart-pill"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag size={18} />
              <span>CART</span>
              <span className="kiosk-bar-cart-badge">{cartTotalQty}</span>
            </button>

            {/* Right Pill: Checkout with Receipt Icon & Price */}
            <button
              type="button"
              className="kiosk-bar-checkout-pill"
              onClick={() => setIsCheckoutOpen(true)}
            >
              <Receipt size={17} />
              <div className="kiosk-bar-checkout-meta">
                <span className="kiosk-bar-checkout-cta">Pay &amp; Place Order</span>
                <span className="kiosk-bar-order-total-micro">Order Total • {formatCurrency(cartGrandTotal, currencySymbol)}</span>
              </div>
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* ── Dish Customization & Detail Modal (Matching Image 3) ── */}
      {selectedModifierItem && (
        <div className="kiosk-modal-backdrop" onClick={() => setSelectedModifierItem(null)}>
          <div className="kiosk-detail-modal-box" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="kiosk-modal-close-x"
              onClick={() => setSelectedModifierItem(null)}
            >
              <X size={20} />
            </button>

            {/* Big Centered Circular Plate Photo */}
            <div className="kiosk-detail-plate-hero">
              <div className="kiosk-detail-plate-circle">
                {(selectedModifierItem.imageUrl || selectedModifierItem.image) ? (
                  <img
                    src={selectedModifierItem.imageUrl || selectedModifierItem.image}
                    alt={selectedModifierItem.name}
                    className="kiosk-detail-plate-img"
                  />
                ) : (
                  <div className="kiosk-detail-plate-fallback">
                    <Utensils size={54} color="#a1a1aa" />
                  </div>
                )}
              </div>
            </div>

            {/* Title & Description */}
            <div className="kiosk-detail-info">
              <h2 className="kiosk-detail-title">{selectedModifierItem.name}</h2>
              <p className="kiosk-detail-sub">
                {selectedModifierItem.description || `${selectedModifierItem.categoryName || 'FRESH'} • FRESHLY PREPARED FOR YOU`}
              </p>

              {/* Price */}
              <div className="kiosk-detail-price">
                {formatCurrency(
                  (Number(selectedModifierItem.price) + selectedModifiers.reduce((acc, m) => acc + (Number(m.price) || 0), 0)) * detailQty,
                  currencySymbol
                )}
              </div>

              {/* Centered Stepper */}
              <div className="kiosk-detail-stepper">
                <button
                  type="button"
                  className="kiosk-detail-step-btn"
                  onClick={() => setDetailQty(q => Math.max(1, q - 1))}
                >
                  <Minus size={15} />
                </button>
                <span className="kiosk-detail-step-qty">{detailQty}</span>
                <button
                  type="button"
                  className="kiosk-detail-step-btn plus"
                  onClick={() => setDetailQty(q => q + 1)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* Modifiers Grid (2 columns - Matching Image 3) */}
            {Array.isArray(selectedModifierItem.modifiers) && selectedModifierItem.modifiers.length > 0 && (
              <div className="kiosk-detail-modifiers-wrap">
                {selectedModifierItem.modifiers.map(mod => (
                  <div key={mod.name} style={{ width: '100%' }}>
                    <div className="kiosk-detail-mod-group-title">{mod.name.toUpperCase()}</div>
                    <div className="kiosk-detail-options-grid">
                      {(mod.options || []).map(opt => {
                        const isSelected = selectedModifiers.some(
                          m => m.modifierName === mod.name && m.optionName === opt.name
                        );

                        return (
                          <button
                            key={opt.name}
                            type="button"
                            className={`kiosk-detail-option-pill ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleToggleOption(mod, opt)}
                          >
                            <span className="kiosk-detail-opt-name">{opt.name.toUpperCase()}</span>
                            <span className="kiosk-detail-opt-price">
                              {opt.price > 0 ? `+${formatCurrency(opt.price, currencySymbol)}` : 'INCLUDED'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Add Button */}
            <div className="kiosk-detail-bottom-cta">
              <button
                type="button"
                className="kiosk-detail-add-btn"
                onClick={handleAddDetailToCart}
              >
                ADD TO ORDER →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cart Drawer Modal (Matching Reference Image 2) ── */}
      {isCartOpen && (
        <div className="kiosk-modal-backdrop" onClick={() => setIsCartOpen(false)}>
          <div className="kiosk-cart-drawer-sheet" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="kiosk-cart-drawer-header">
              <h2 className="kiosk-cart-drawer-title">CART</h2>
              <button
                type="button"
                className="kiosk-modal-close-x"
                onClick={() => setIsCartOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Items List */}
            <div className="kiosk-cart-drawer-items">
              {cart.map(ci => (
                <div key={ci.cartItemId} className="kiosk-cart-item-row">
                  {/* Circular dish thumbnail */}
                  <div className="kiosk-cart-item-thumb">
                    {ci.imageUrl ? (
                      <img src={ci.imageUrl} alt={ci.name} className="kiosk-cart-item-img" />
                    ) : (
                      <div className="kiosk-cart-item-fallback">
                        <Utensils size={20} color="#a1a1aa" />
                      </div>
                    )}
                  </div>

                  {/* Title & Modifiers */}
                  <div className="kiosk-cart-item-info">
                    <h4 className="kiosk-cart-item-name">{ci.name}</h4>
                    {Array.isArray(ci.selectedModifiers) && ci.selectedModifiers.length > 0 && (
                      <p className="kiosk-cart-item-mods">
                        {ci.selectedModifiers.map(m => m.optionName).join(', ').toUpperCase()}
                      </p>
                    )}
                  </div>

                  {/* Stepper */}
                  <div className="kiosk-cart-item-stepper">
                    <button
                      type="button"
                      className="kiosk-cart-step-btn"
                      onClick={() => updateCartItemQty(ci.cartItemId, -1)}
                    >
                      <Minus size={13} />
                    </button>
                    <span className="kiosk-cart-step-num">{ci.qty}</span>
                    <button
                      type="button"
                      className="kiosk-cart-step-btn plus"
                      onClick={() => updateCartItemQty(ci.cartItemId, 1)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  {/* Price */}
                  <div className="kiosk-cart-item-price">
                    {formatCurrency(Number(ci.price) * ci.qty, currencySymbol)}
                  </div>

                  {/* Delete Trash */}
                  <button
                    type="button"
                    className="kiosk-cart-item-delete"
                    onClick={() => clearCartItem(ci.cartItemId)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {/* Cooking Instructions (Optional) */}
              <div className="kiosk-cart-notes-wrap">
                <label className="kiosk-cart-notes-label">
                  Cooking Instructions / Allergies (Optional)
                </label>
                <textarea
                  value={cookingNote}
                  onChange={e => setCookingNote(e.target.value)}
                  placeholder="e.g. Less spicy, extra sauce, allergy note..."
                  rows={2}
                  className="kiosk-cart-notes-input"
                />
              </div>

              {/* Total Order Summary (Matching Image 2) */}
              <div className="kiosk-cart-total-row">
                <span className="kiosk-cart-total-label">TOTAL ORDER</span>
                <span className="kiosk-cart-total-amt">
                  {formatCurrency(cartGrandTotal, currencySymbol)}
                </span>
              </div>
            </div>

            {/* Bottom Button */}
            <div className="kiosk-cart-drawer-cta-wrap">
              <button
                type="button"
                className="kiosk-cart-continue-btn"
                onClick={() => {
                  setIsCartOpen(false);
                  setIsCheckoutOpen(true);
                }}
              >
                CONTINUE TO PAYMENT →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout & Payment Modal (UPI QR & Counter) ── */}
      {isCheckoutOpen && (
        <div className="kiosk-modal-backdrop" onClick={() => !isPlacingOrder && setIsCheckoutOpen(false)}>
          <div className="kiosk-checkout-modal-box" onClick={e => e.stopPropagation()}>
            <div className="kiosk-modal-header">
              <h3 className="kiosk-modal-title">Select Payment Method</h3>
              {!isPlacingOrder && (
                <button
                  type="button"
                  className="kiosk-modal-close-x"
                  onClick={() => setIsCheckoutOpen(false)}
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="kiosk-modal-body">
              {/* Payment Method Switcher Tabs */}
              {allowedPayment === 'both' && (
                <div className="kiosk-payment-tabs">
                  <button
                    type="button"
                    className={`kiosk-pay-tab ${paymentMethod === 'upi' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('upi')}
                  >
                    <QrCode size={18} />
                    <span>Instant UPI QR</span>
                  </button>
                  <button
                    type="button"
                    className={`kiosk-pay-tab ${paymentMethod === 'counter' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('counter')}
                  >
                    <Banknote size={18} />
                    <span>Pay at Counter</span>
                  </button>
                </div>
              )}

              {/* UPI QR Display */}
              {paymentMethod === 'upi' ? (
                <div className="kiosk-upi-card">
                  <div className="kiosk-upi-title">Scan with any UPI App to Pay</div>
                  <div className="kiosk-upi-qr-frame">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="UPI QR Code" className="kiosk-upi-qr-img" />
                    ) : (
                      <div className="kiosk-upi-qr-loading">Generating QR...</div>
                    )}
                  </div>

                  <div className="kiosk-upi-amount-hero">
                    {formatCurrency(cartGrandTotal, currencySymbol)}
                  </div>

                  <div className="kiosk-upi-apps-row">
                    <span>Google Pay</span> • <span>PhonePe</span> • <span>Paytm</span> • <span>BHIM</span>
                  </div>
                </div>
              ) : (
                <div className="kiosk-counter-card">
                  <Receipt size={36} color="#38bdf8" />
                  <div className="kiosk-counter-title">Pay Cash at Ground Floor Counter</div>
                  <p className="kiosk-counter-desc">
                    Your order will be sent to the kitchen immediately. Please show your token number at the cash counter to complete payment.
                  </p>
                </div>
              )}
            </div>

            {/* Place Order CTA */}
            <div className="kiosk-checkout-footer">
              <button
                type="button"
                className="kiosk-checkout-confirm-btn"
                disabled={isPlacingOrder}
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
          <div className="kiosk-warning-box">
            <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto' }} />
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff' }}>Are you still there?</h3>
            <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>
              Your order session will reset to protect your privacy in <strong>{inactivityTimer} seconds</strong>.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                className="kiosk-choice-btn"
                onClick={handleResetToAttract}
                style={{ flex: 1, padding: 12 }}
              >
                Cancel Order
              </button>
              <button
                type="button"
                className="kiosk-choice-btn primary"
                onClick={resetInactivityTimer}
                style={{ flex: 1, padding: 12 }}
              >
                Continue Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
