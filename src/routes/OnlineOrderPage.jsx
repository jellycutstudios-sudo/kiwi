import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, serverTimestamp, getDoc, doc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/formatCurrency';
import { computeTax } from '../utils/taxUtils';
import { 
  Plus, Minus, Check, Clock, ChefHat, CheckSquare, Search, X, AlertCircle, 
  Sparkles, Star, ChevronDown, ChevronUp, Utensils, Share2 
} from 'lucide-react';
import ModifierModal from '../components/pos/ModifierModal';
import toast from 'react-hot-toast';
import LoadingScreen from '../components/shared/LoadingScreen';
import { triggerHaptic, triggerHapticSuccess } from '../utils/haptics';

// Helper to determine dietary category (Veg vs Non-Veg)
const isVegetarianItem = (item) => {
  if (item.isVeg === true || item.veg === true || item.dietary === 'veg') return true;
  if (item.isVeg === false || item.veg === false || item.dietary === 'non-veg') return false;
  const text = `${item.name || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase();
  if (/\b(chicken|mutton|beef|pork|fish|prawn|shrimp|crab|egg|meat|bacon|ham|duck|shawarma|keema|tikka|kabab|kebab)\b/.test(text) && !/\b(paneer|veg|soya|mushroom)\b/.test(text)) {
    return false;
  }
  return true;
};

export default function OnlineOrderPage() {
  const { restaurantId } = useParams();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('tableId');
  const tableName = searchParams.get('tableName');
  const orderIdParam = searchParams.get('orderId');

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState(() => {
    return tableId ? 'dine-in' : 'delivery';
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('menu'); // 'menu' | 'details' | 'done'
  const [activeModifierItem, setActiveModifierItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sevenDayAvg, setSevenDayAvg] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [nonVegOnly, setNonVegOnly] = useState(false);
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState({});
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);

  // Active order tracking states
  const [activeOrderId, setActiveOrderId] = useState(() => {
    return orderIdParam || localStorage.getItem(`dineOS_${restaurantId}_active_order`) || null;
  });
  const [activeOrder, setActiveOrder] = useState(null);
  const [viewMode, setViewMode] = useState('tracker'); // 'tracker' | 'menu'

  useEffect(() => {
    if (orderIdParam && orderIdParam !== activeOrderId) {
      setActiveOrderId(orderIdParam);
      setViewMode('tracker');
    }
  }, [orderIdParam, activeOrderId]);

  const [prevTableId, setPrevTableId] = useState(tableId);
  if (tableId !== prevTableId) {
    setPrevTableId(tableId);
    if (tableId) {
      setOrderType('dine-in');
    }
  }

  const [prevActiveOrderId, setPrevActiveOrderId] = useState(activeOrderId);
  if (activeOrderId !== prevActiveOrderId) {
    setPrevActiveOrderId(activeOrderId);
    if (!activeOrderId) {
      setActiveOrder(null);
    }
  }

  // Fetch restaurant details and menu items
  useEffect(() => {
    if (!restaurantId) return;
    
    let unsubMenu = null;
    let active = true;

    const resolveRestaurant = async () => {
      try {
        // Fast path: try direct doc ID first (handles 99% of QR code & link visits without an extra index query)
        const docSnap = await getDoc(doc(db, 'restaurants', restaurantId));
        if (docSnap.exists() && active) {
          const resolved = { id: docSnap.id, ...docSnap.data() };
          setRestaurant(resolved);
          unsubMenu = onSnapshot(collection(db, 'restaurants', resolved.id, 'menu'), snap => {
            const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setCategories(cats);
          });
          return;
        }

        // Fallback: lookup by custom restaurant slug if ID didn't match
        const q = query(collection(db, 'restaurants'), where('slug', '==', restaurantId));
        const snap = await getDocs(q);
        
        if (!active) return;

        if (!snap.empty) {
          const resolved = { id: snap.docs[0].id, ...snap.docs[0].data() };
          setRestaurant(resolved);
          unsubMenu = onSnapshot(collection(db, 'restaurants', resolved.id, 'menu'), snap => {
            const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setCategories(cats);
          });
        }
      } catch (err) {
        console.error("Error resolving restaurant:", err);
      }
    };

    resolveRestaurant();

    return () => {
      active = false;
      if (unsubMenu) unsubMenu();
    };
  }, [restaurantId]);

  // Use restaurant config or average ticket threshold for upsell nudge (no unauthorized orders query needed)
  useEffect(() => {
    if (restaurant) {
      setSevenDayAvg(restaurant.averageOrderValue || restaurant.upsellThreshold || 0);
    }
  }, [restaurant]);

  // Real-time listener for customer active order details
  useEffect(() => {
    if (!restaurant?.id || !activeOrderId) {
      return;
    }
    const unsub = onSnapshot(doc(db, 'restaurants', restaurant.id, 'orders', activeOrderId), d => {
      if (d.exists()) {
        const data = d.data();
        const type = data.orderType || data.type;
        if (data.status === 'cancelled' || data.status === 'voided') {
          localStorage.removeItem(`dineOS_${restaurantId}_active_order`);
          setActiveOrderId(null);
          setActiveOrder(null);
          toast.error('Your order has been cancelled.');
        } else if (type === 'dine-in' && data.status === 'billed') {
          localStorage.removeItem(`dineOS_${restaurantId}_active_order`);
          setActiveOrderId(null);
          setActiveOrder(null);
          toast.success('Your table bill has been settled. Thank you!');
        } else {
          setActiveOrder({ id: d.id, ...data });
        }
      } else {
        localStorage.removeItem(`dineOS_${restaurantId}_active_order`);
        setActiveOrderId(null);
        setActiveOrder(null);
      }
    }, err => console.log('Tracker fetch err:', err));
    return unsub;
  }, [restaurant?.id, activeOrderId, restaurantId]);

  const currency = restaurant?.currency ?? 'INR';
  const groupedCategories = useMemo(() => {
    const excludedIds = Array.isArray(restaurant?.onlineExcludedItemIds) ? restaurant.onlineExcludedItemIds : [];
    const q = searchQuery.toLowerCase().trim();

    return categories.map(cat => {
      const filteredItems = (cat.items || []).filter(item => {
        if (item.available === false) return false;
        if (excludedIds.includes(item.id)) return false;
        
        if (q) {
          const match = item.name?.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
          if (!match) return false;
        }

        const isVeg = isVegetarianItem(item);
        if (vegOnly && !isVeg) return false;
        if (nonVegOnly && isVeg) return false;

        if (bestsellerOnly) {
          const isBestseller = item.isBestseller || 
            item.bestseller || 
            item.featured || 
            item.recommended || 
            item.isSpecial ||
            (Array.isArray(restaurant?.manualBestsellerItemIds) && restaurant.manualBestsellerItemIds.includes(item.id)) ||
            (restaurant?.autoDetectBestsellers !== false && Array.isArray(restaurant?.autoBestsellerItemIds) && restaurant.autoBestsellerItemIds.includes(item.id));
          if (!isBestseller) return false;
        }

        return true;
      });

      return {
        ...cat,
        items: filteredItems,
      };
    }).filter(cat => cat.items.length > 0);
  }, [categories, searchQuery, vegOnly, nonVegOnly, bestsellerOnly, restaurant?.onlineExcludedItemIds, restaurant?.manualBestsellerItemIds, restaurant?.autoDetectBestsellers, restaurant?.autoBestsellerItemIds]);

  const scrollToCategory = (catId) => {
    setShowMenuDrawer(false);
    const el = document.getElementById(`swiggy-cat-section-${catId}`);
    if (el) {
      const yOffset = -70; // offset for sticky app bar
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleShareStore = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: restaurant?.name || 'Order Food Online',
        text: `Order fresh food from ${restaurant?.name || 'our restaurant'}!`,
        url: url
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      toast.success('Restaurant link copied to clipboard!');
    }
  };

  const trackerHeroStyle = {
    background: restaurant?.onlineCover 
      ? `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.75)), url(${restaurant.onlineCover}) center/cover no-repeat` 
      : 'var(--color-bg-elevated)',
    borderBottom: restaurant?.onlineCover ? 'none' : '1px solid var(--color-separator-opaque)',
    color: restaurant?.onlineCover ? 'var(--color-on-dark)' : 'var(--color-label)',
    padding: 'var(--space-6) var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  };

  const addToCart = (item, selectedModifiers = [], flatPrice = null) => {
    triggerHapticSuccess();
    setCart(c => {
      const isVariant = flatPrice !== null && flatPrice !== undefined;
      const modifierTotal = isVariant ? 0 : selectedModifiers.reduce((sum, m) => sum + m.priceAdd, 0);
      const unitPrice = isVariant ? flatPrice : (item.price + modifierTotal);
      const customId = selectedModifiers.length > 0
        ? item.id + '-' + selectedModifiers.map(m => m.id).sort().join('-')
        : item.id;

      const ex = c.find(i => i.id === customId);
      if (ex) {
        return c.map(i => i.id === customId ? { ...i, qty: i.qty + 1 } : i);
      } else {
        return [...c, {
          ...item,
          id: customId,
          menuItemId: item.id,
          selectedModifiers,
          modifierTotal: isVariant ? flatPrice : modifierTotal,
          price: unitPrice,
          qty: 1
        }];
      }
    });
  };

  const allMenuItems = useMemo(() => {
    return categories.flatMap(c => c.items || []);
  }, [categories]);

  // Evict sold-out items from cart if restaurant marks them unavailable
  useEffect(() => {
    if (!allMenuItems.length || !cart.length) return;
    const soldOutInCart = cart.filter(ci => {
      const orig = allMenuItems.find(m => m.id === (ci.menuItemId || ci.id));
      return orig && orig.available === false;
    });
    if (soldOutInCart.length > 0) {
      toast.error(`Removed unavailable items: ${soldOutInCart.map(i => i.name).join(', ')}`);
      setCart(c => c.filter(ci => {
        const orig = allMenuItems.find(m => m.id === (ci.menuItemId || ci.id));
        return !orig || orig.available !== false;
      }));
    }
  }, [allMenuItems, cart]);

  const updateQty = (id, qty) => {
    triggerHaptic(10);
    if (qty <= 0) setCart(c => c.filter(i => i.id !== id));
    else setCart(c => c.map(i => i.id === id ? { ...i, qty } : i));
  };

  const subtotal = useMemo(() => {
    return cart.reduce((s, i) => s + i.price * i.qty, 0);
  }, [cart]);

  const deliveryFee = useMemo(() => {
    if (orderType !== 'delivery') return 0;
    const baseFee = parseFloat(restaurant?.deliveryFee) || 0;
    const freeThreshold = parseFloat(restaurant?.freeDeliveryAbove) || 0;
    if (freeThreshold > 0 && subtotal >= freeThreshold) return 0;
    return baseFee;
  }, [orderType, restaurant?.deliveryFee, restaurant?.freeDeliveryAbove, subtotal]);

  const taxResult = useMemo(() => {
    return computeTax(subtotal, restaurant?.taxConfig ?? { type: 'none', rate: 0 }, {
      items: cart,
      orderType
    });
  }, [subtotal, restaurant?.taxConfig, cart, orderType]);

  const total = useMemo(() => {
    return taxResult.total + deliveryFee;
  }, [taxResult.total, deliveryFee]);

  const cartCount = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.qty, 0);
  }, [cart]);

  const sanitizeInput = (text, maxLength = 300) => {
    return String(text || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '') // Strip ESC/POS control characters
      .trim()
      .slice(0, maxLength);
  };

  const submitOrder = async () => {
    if (restaurant?.onlineOrderingPaused) {
      toast.error('Online ordering is temporarily paused. Please check back shortly.');
      return;
    }

    const cleanName = sanitizeInput(name, 100);
    const cleanPhone = phone.trim().replace(/[^\d+]/g, '').slice(0, 20);
    const cleanAddress = sanitizeInput(address, 300);
    const cleanNote = sanitizeInput(note, 500);

    if (!cleanName) {
      toast.error('Please enter your name');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 5) {
      toast.error('Please enter a valid mobile number');
      return;
    }
    if (orderType === 'delivery') {
      if (!cleanAddress) {
        toast.error('Please enter your delivery address');
        return;
      }
      const minOrder = parseFloat(restaurant?.minDeliveryOrder) || 0;
      if (minOrder > 0 && subtotal < minOrder) {
        toast.error(`Minimum order amount for delivery is ${formatCurrency(minOrder, currency)}`);
        return;
      }
    }
    if (!cart || cart.length === 0) {
      toast.error('Your cart is empty');
      return;
    }

    // Verify no sold-out items remain in cart
    const soldOutNow = cart.filter(ci => {
      const orig = allMenuItems.find(m => m.id === (ci.menuItemId || ci.id));
      return orig && orig.available === false;
    });
    if (soldOutNow.length > 0) {
      toast.error(`Cannot place order. Items sold out: ${soldOutNow.map(i => i.name).join(', ')}`);
      return;
    }

    setLoading(true);
    try {
      const orderPayload = {
        type: tableId ? 'dine-in' : 'online',
        orderType: tableId ? 'dine-in' : orderType,
        status: 'pending',
        items: cart.map(i => ({
          id: i.id,
          name: sanitizeInput(i.name, 100),
          price: Math.max(0, Number(i.price) || 0),
          qty: Math.max(1, Number(i.qty) || 1),
          selectedModifiers: i.selectedModifiers ?? [],
          modifierTotal: Math.max(0, Number(i.modifierTotal) || 0),
          recipe: i.recipe ?? [],
          station: i.station ?? 'Kitchen',
          status: 'pending'
        })),
        subtotal: Math.max(0, Number(subtotal) || 0),
        deliveryFee: Math.max(0, Number(deliveryFee) || 0),
        taxAmount: Math.max(0, Number(taxResult.taxTotal) || 0),
        taxTotal: Math.max(0, Number(taxResult.taxTotal) || 0),
        taxLines: taxResult.lines,
        taxMode: taxResult.mode || 'exclusive',
        total: Math.max(0, Number(total) || 0),
        inventoryDepleted: false,
        customerName: cleanName,
        customerPhone: cleanPhone,
        note: cleanNote,
        createdAt: serverTimestamp(),
        currency,
        paymentMethod: tableId ? 'unpaid' : 'cash',
      };

      if (tableId) {
        orderPayload.tableId = tableId;
        orderPayload.tableName = tableName || tableId;
      } else if (orderType === 'delivery') {
        orderPayload.deliveryAddress = address.trim();
      }

      // Prepare batch write for atomic operations
      const batch = writeBatch(db);
      
      // Auto-generate order document ID
      const orderDocRef = doc(collection(db, 'restaurants', restaurant.id, 'orders'));
      batch.set(orderDocRef, orderPayload);

      // If dine-in table ordering, update matching table status to occupied and link activeOrderId
      if (tableId) {
        const tableRef = doc(db, 'restaurants', restaurant.id, 'tables', tableId);
        batch.update(tableRef, {
          status: 'occupied',
          currentOrderId: orderDocRef.id,
          activeOrderId: orderDocRef.id
        });
      }

      // Execute batch write atomically (stock is depleted safely when restaurant staff moves order to 'preparing')
      await batch.commit();

      localStorage.setItem(`dineOS_${restaurantId}_active_order`, orderDocRef.id);
      setActiveOrderId(orderDocRef.id);
      setViewMode('tracker');
      toast.success('Order placed successfully!');
      setCart([]);
    } catch (e) {
      toast.error('Order submission failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getProgressDetails = (status, type) => {
    if (type === 'delivery') {
      switch (status) {
        case 'pending':
          return { percent: '15%', activeStep: 0, text: 'Order Received', desc: 'The restaurant has received your order and will start preparing it shortly.' };
        case 'preparing':
          return { percent: '50%', activeStep: 1, text: 'Preparing Food', desc: 'Our chefs are actively cooking and preparing your items.' };
        case 'ready':
          return { percent: '83%', activeStep: 2, text: 'Out for Delivery', desc: 'Your food is ready and our delivery partner is on the way to your address!' };
        case 'served':
        case 'billed':
          return { percent: '100%', activeStep: 3, text: 'Delivered', desc: 'Enjoy your meal! Your order has been delivered.' };
        default:
          return { percent: '15%', activeStep: 0, text: 'Order Sent', desc: 'Your order has been sent.' };
      }
    } else if (type === 'takeaway') {
      switch (status) {
        case 'pending':
          return { percent: '15%', activeStep: 0, text: 'Order Received', desc: 'The restaurant has received your order and will start preparing it shortly.' };
        case 'preparing':
          return { percent: '50%', activeStep: 1, text: 'Preparing Food', desc: 'Our chefs are actively cooking and preparing your items.' };
        case 'ready':
          return { percent: '83%', activeStep: 2, text: 'Ready for Pickup', desc: 'Your food is ready! Please proceed to the counter to collect it.' };
        case 'served':
        case 'billed':
          return { percent: '100%', activeStep: 3, text: 'Completed', desc: 'Your order is picked up. Thank you for dining with us!' };
        default:
          return { percent: '15%', activeStep: 0, text: 'Order Sent', desc: 'Your order has been sent.' };
      }
    } else {
      // Dine-in
      switch (status) {
        case 'pending':
          return { percent: '15%', activeStep: 0, text: 'Sent to Kitchen', desc: 'The kitchen has received your order and will start preparing it shortly.' };
        case 'preparing':
          return { percent: '50%', activeStep: 1, text: 'Preparing Food', desc: 'Our chefs are actively cooking and preparing your items.' };
        case 'ready':
          return { percent: '83%', activeStep: 2, text: 'Ready for Service', desc: 'Your food is ready and a server is bringing it to your table!' };
        case 'served':
        case 'billed':
          return { percent: '100%', activeStep: 3, text: 'Served', desc: 'Enjoy your meal! Let staff know if you need anything else.' };
        default:
          return { percent: '15%', activeStep: 0, text: 'Order Sent', desc: 'Your order has been sent to kitchen.' };
      }
    }
  };

  if (!restaurant) return (
    <LoadingScreen message="Loading menu…" />
  );

  // Check if online mode is enabled for this restaurant
  const isOnlineModeActive = !restaurant.modes || restaurant.modes.includes('online');
  if (!isOnlineModeActive) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-family)', background:'var(--color-bg-secondary)', padding:'var(--space-4)' }}>
        <div className="card card-padded" style={{ textAlign:'center', maxWidth:'400px', width:'100%', border:'1px solid var(--color-separator)' }}>
          <div style={{fontSize:52, marginBottom:'var(--space-3)'}}>📱</div>
          <h2 className="text-title2" style={{marginBottom:'var(--space-2)', color:'var(--color-label-primary)'}}>Online Ordering Disabled</h2>
          <p className="text-secondary text-subhead" style={{marginBottom:0, color:'var(--color-label-secondary)'}}>
            Online ordering is currently turned off for this restaurant. Please contact staff or visit us in person.
          </p>
        </div>
      </div>
    );
  }

  // ── Render Order Tracker ─────────────────────────────────
  if (activeOrderId && activeOrder && viewMode === 'tracker') {
    const orderTypeVal = activeOrder.orderType || activeOrder.type || 'dine-in';
    const { percent, activeStep, text, desc } = getProgressDetails(activeOrder.status, orderTypeVal);
    const steps = orderTypeVal === 'delivery' 
      ? [
          { label: 'Received', icon: Clock },
          { label: 'Preparing', icon: ChefHat },
          { label: 'On The Way', icon: CheckSquare },
          { label: 'Delivered', icon: Check }
        ]
      : orderTypeVal === 'takeaway'
      ? [
          { label: 'Received', icon: Clock },
          { label: 'Preparing', icon: ChefHat },
          { label: 'Ready for Pickup', icon: CheckSquare },
          { label: 'Collected', icon: Check }
        ]
      : [
          { label: 'Received', icon: Clock },
          { label: 'Preparing', icon: ChefHat },
          { label: 'Ready', icon: CheckSquare },
          { label: 'Served', icon: Check }
        ];

    return (
      <div className="online-order-page" style={{ paddingBottom: 'var(--space-8)' }}>
        <style>{`
          .tracker-container {
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
            max-width: 480px;
            margin: 0 auto;
            padding: var(--space-4);
            font-family: var(--font-family);
          }
          .progress-stepper {
            display: flex;
            justify-content: space-between;
            position: relative;
            margin: 30px 0;
            padding: 0 10px;
          }
          .progress-line-bg {
            position: absolute;
            top: 16px;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--color-separator);
            z-index: 1;
          }
          .progress-line-fill {
            position: absolute;
            top: 16px;
            left: 0;
            height: 4px;
            background: var(--color-accent);
            z-index: 2;
            transition: width var(--duration-normal) var(--ease-out);
          }
          .step-node {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            z-index: 3;
            width: 70px;
          }
          .step-circle {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background: var(--color-bg-secondary);
            border: 3px solid var(--color-separator);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--duration-fast);
            color: var(--color-label-tertiary);
          }
          .step-node.active .step-circle {
            border-color: var(--color-accent);
            background: var(--color-accent-light);
            color: var(--color-accent);
            box-shadow: 0 0 0 4px var(--color-accent-opaque);
            animation: pulse-ring 1.5s infinite;
          }
          .step-node.completed .step-circle {
            border-color: var(--color-green);
            background: var(--color-green-light);
            color: var(--color-green);
          }
          .step-label {
            margin-top: 8px;
            font-size: 11px;
            font-weight: var(--weight-semibold);
            color: var(--color-label-secondary);
            text-align: center;
          }
          .step-node.active .step-label {
            color: var(--color-accent);
            font-weight: var(--weight-bold);
          }
          .step-node.completed .step-label {
            color: var(--color-green);
          }
          @keyframes pulse-ring {
            0% { transform: scale(1); }
            50% { transform: scale(1.08); }
            100% { transform: scale(1); }
          }
          @keyframes pulse-glow {
            0% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.4); }
            70% { box-shadow: 0 0 0 10px rgba(0, 122, 255, 0); }
            100% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0); }
          }
        `}</style>
        
        <div className="online-order-hero" style={trackerHeroStyle}>
          {restaurant?.onlineLogo && (
            <img 
              src={restaurant.onlineLogo} 
              alt={`${restaurant.name} Logo`} 
              style={{
                width: 55,
                height: 55,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--color-bg)',
                backgroundColor: 'var(--color-bg-secondary)',
                marginBottom: 'var(--space-2)'
              }}
            />
          )}
          <h1 style={{ fontSize: 'var(--text-title2)', margin: 0, fontWeight: 'var(--weight-bold)', color: restaurant?.onlineCover ? 'var(--color-on-dark)' : 'var(--color-label)' }}>
            {activeOrder.orderType === 'delivery' ? '🚚 Delivery Order' : (activeOrder.orderType === 'takeaway' ? '🛍️ Takeaway Pickup' : `Table ${activeOrder.tableName || 'Service'}`)}
          </h1>
          <p style={{ color: restaurant?.onlineCover ? 'rgba(255,255,255,0.85)' : 'var(--color-label-secondary)', fontSize: 'var(--text-footnote)', margin: '4px 0 0 0' }}>
            {restaurant?.name} · Live Order Tracking · #{activeOrder.id.slice(-6).toUpperCase()}
          </p>
        </div>

        <div className="tracker-container">
          <div className="card card-padded" style={{ textAlign: 'center', padding: 'var(--space-5)' }}>
            <span className={`badge ${
              activeOrder.status === 'ready' ? (activeOrder.orderType === 'delivery' ? 'badge-blue' : 'badge-teal') : 
              activeOrder.status === 'served' || activeOrder.status === 'billed' ? 'badge-green' : 
              activeOrder.status === 'preparing' ? 'badge-orange' : 'badge-gray'
            }`} style={{ textTransform: 'uppercase', padding: '4px 12px', fontSize: 11 }}>
              {text}
            </span>
            <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>
              {desc}
            </div>

            {/* Visual Stepper */}
            <div className="progress-stepper">
              <div className="progress-line-bg" />
              <div className="progress-line-fill" style={{ width: percent }} />
              {steps.map((st, idx) => {
                const isActive = activeStep === idx;
                const isCompleted = activeStep > idx;
                return (
                  <div key={idx} className={`step-node ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                    <div className="step-circle">
                      <st.icon size={16} />
                    </div>
                    <div className="step-label">{st.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Items card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Items Ordered</span>
              <span className="badge badge-gray">{activeOrder.items?.length ?? 0} Items</span>
            </div>
            <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {activeOrder.items?.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-subhead)' }}>
                  <div>
                    <strong>×{it.qty}</strong> {it.name}
                    {it.selectedModifiers?.length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--color-label-secondary)', paddingLeft: 12, marginTop: 1 }}>
                        + {it.selectedModifiers.map(m => m.name).join(', ')}
                      </div>
                    )}
                  </div>
                  <span style={{ fontWeight: 'var(--weight-semibold)' }}>
                    {formatCurrency(it.price * it.qty, currency)}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-2)', display: 'flex', justifyContent: 'space-between', fontWeight: 'var(--weight-bold)' }}>
                <span>Subtotal</span>
                <span>{formatCurrency(activeOrder.subtotal, currency)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            {activeOrder.status === 'billed' ? (
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  localStorage.removeItem(`dineOS_${restaurantId}_active_order`);
                  setActiveOrderId(null);
                  setActiveOrder(null);
                  setCart([]);
                  setStep('menu');
                }}
                style={{ width: '100%', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                🔄 Order Again / Close
              </button>
            ) : (
              <>
                <button 
                  className="btn btn-primary" 
                  onClick={() => setViewMode('menu')}
                  style={{ width: '100%', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  ➕ Order More Items
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-label-tertiary)', marginTop: 4 }}>
                  {activeOrder.orderType === 'dine-in' 
                    ? 'Payment will be collected at checkout. Tell staff your table number when paying.' 
                    : (activeOrder.orderType === 'delivery' 
                      ? 'Payment will be collected at your doorstep upon delivery.' 
                      : 'Payment will be collected at the counter when you pick up.')}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'done') return (
    <div className="online-order-page">
      <div className="online-order-hero" style={trackerHeroStyle}>
        {restaurant?.onlineLogo && (
          <img 
            src={restaurant.onlineLogo} 
            alt={`${restaurant.name} Logo`} 
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid var(--color-bg)',
              backgroundColor: 'var(--color-bg-secondary)',
              marginBottom: 'var(--space-2)'
            }}
          />
        )}
        <div style={{ fontSize: 48, marginBottom: 'var(--space-2)' }}>🎉</div>
        <h1 style={{ fontSize: 'var(--text-title1)', margin: 0, fontWeight: 'var(--weight-bold)', color: restaurant?.onlineCover ? 'var(--color-on-dark)' : 'var(--color-label)' }}>Order Placed!</h1>
        <p style={{ color: restaurant?.onlineCover ? 'rgba(255,255,255,0.85)' : 'var(--color-label-secondary)', fontSize: 'var(--text-subhead)', margin: 'var(--space-2) 0 0 0' }}>
          We'll have it ready for you. Thank you, {name}!
        </p>
      </div>
      <div className="online-order-content" style={{ textAlign:'center', marginTop:'var(--space-8)' }}>
        <div className="card card-padded" style={{ display:'inline-block', padding:'var(--space-8)' }}>
          <div style={{ fontSize:'var(--text-headline)', color:'var(--color-label-secondary)', marginBottom:'var(--space-2)' }}>
            {orderType === 'dine-in' ? '🍽️ Dine In' : (orderType === 'delivery' ? '🚚 Delivery' : '🛍️ Pickup')}
          </div>
          <div style={{ fontSize:'var(--text-title1)', fontWeight:'var(--weight-bold)' }}>
            {formatCurrency(subtotal, currency)}
          </div>
          <div style={{ marginTop:'var(--space-3)', color:'var(--color-label-secondary)', fontSize:'var(--text-subhead)' }}>
            Staff will confirm your order shortly
          </div>
        </div>
        <div style={{ marginTop:'var(--space-6)' }}>
          <button className="btn btn-primary" onClick={() => { setCart([]); setStep('menu'); setName(''); setPhone(''); setAddress(''); }}>
            Place Another Order
          </button>
        </div>
      </div>
    </div>
  );

  if (step === 'checkout') {
    return (
      <div className="online-order-page" style={{ paddingBottom: 'var(--space-8)' }}>
        <div className="online-order-hero" style={trackerHeroStyle}>
          {restaurant?.onlineLogo && (
            <img 
              src={restaurant.onlineLogo} 
              alt={`${restaurant.name} Logo`} 
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--color-bg)',
                backgroundColor: 'var(--color-bg-secondary)',
                marginBottom: 'var(--space-2)'
              }}
            />
          )}
          <h1 style={{ fontSize: 'var(--text-title2)', margin: 0, fontWeight: 'var(--weight-bold)', color: restaurant?.onlineCover ? 'var(--color-on-dark)' : 'var(--color-label)' }}>Checkout</h1>
          <p style={{ color: restaurant?.onlineCover ? 'rgba(255,255,255,0.85)' : 'var(--color-label-secondary)', fontSize: 'var(--text-footnote)', margin: '4px 0 0 0' }}>{restaurant?.name}</p>
        </div>

        <div className="online-order-content" style={{ maxWidth: 600, margin: '0 auto', padding: 'var(--space-4)' }}>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => setStep('menu')}
            style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            ← Back to Menu
          </button>

          {/* Cart Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Your Order ({cartCount} items)</span>
              <span style={{ fontWeight:'var(--weight-bold)', color:'var(--color-accent)' }}>{formatCurrency(subtotal, currency)}</span>
            </div>
            
            <div style={{ padding:'var(--space-4) var(--space-5)' }}>
              {/* Cart Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-3)' }}>
                {cart.map(cartItem => (
                  <div key={cartItem.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 'var(--text-subhead)' }}>
                    <div style={{ flex: 1, paddingRight: 'var(--space-2)' }}>
                      <div style={{ color: 'var(--color-label)', fontWeight: 'var(--weight-semibold)' }}>
                        {cartItem.name}
                      </div>
                      {cartItem.selectedModifiers?.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', paddingLeft: 12, marginTop: 1 }}>
                          + {cartItem.selectedModifiers.map(m => m.name).join(', ')}
                        </div>
                      )}
                      <div style={{ color: 'var(--color-accent)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-footnote)', marginTop: 2 }}>
                        {formatCurrency(cartItem.price, currency)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                        <button className="qty-btn" aria-label="Decrease quantity" onClick={() => updateQty(cartItem.id, cartItem.qty - 1)}><Minus size={14}/></button>
                        <span style={{ fontWeight:'var(--weight-bold)', minWidth:24, textAlign:'center', fontSize: 'var(--text-body)' }}>{cartItem.qty}</span>
                        <button className="qty-btn" aria-label="Increase quantity" onClick={() => updateQty(cartItem.id, cartItem.qty + 1)}><Plus size={14}/></button>
                      </div>
                      <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-label)', minWidth: 64, textAlign: 'right' }}>
                        {formatCurrency(cartItem.price * cartItem.qty, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upsell Nudge */}
              {sevenDayAvg > 0 && subtotal > 0 && subtotal < sevenDayAvg && (
                <div style={{
                  background: 'var(--color-orange-light)',
                  color: 'var(--color-orange)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 'var(--weight-semibold)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginBottom: 'var(--space-4)',
                  border: '1px solid var(--color-orange)'
                }}>
                  <span style={{ fontSize: '16px' }}>💡</span>
                  <div style={{ lineHeight: '1.4' }}>
                    This order is below the {formatCurrency(sevenDayAvg, currency)} average. Consider adding a side, dessert, or drink to complete your meal!
                  </div>
                </div>
              )}

              {/* Order Mode Toggle */}
              {!tableId && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Order Mode</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['delivery', '🚚 Delivery'], ['takeaway', '🛍️ Pickup']].map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setOrderType(k)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: 'var(--radius-lg)',
                          border: orderType === k ? '1px solid var(--color-accent)' : '1px solid var(--color-separator-opaque)',
                          background: orderType === k ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                          color: orderType === k ? '#ffffff' : 'var(--color-label-secondary)',
                          fontWeight: orderType === k ? 700 : 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          boxShadow: orderType === k ? '0 2px 8px rgba(16, 185, 129, 0.25)' : 'none',
                          transition: 'all 0.15s ease',
                          outline: 'none'
                        }}
                      >{l}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom:'var(--space-3)' }}>
                <label className="form-label">Your Name *</label>
                <input 
                  id="online-name-input" 
                  className="form-input" 
                  placeholder="Enter your name" 
                  value={name} 
                  autoComplete="name"
                  enterKeyHint="next"
                  onChange={e => setName(e.target.value)} 
                />
              </div>

              <div className="form-group" style={{ marginBottom:'var(--space-3)' }}>
                <label className="form-label">Mobile Number *</label>
                <input 
                  id="online-phone-input" 
                  className="form-input" 
                  type="tel" 
                  inputMode="tel"
                  autoComplete="tel"
                  enterKeyHint="next"
                  placeholder="Enter mobile number" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)} 
                />
              </div>

              {orderType === 'delivery' && (
                <div className="form-group" style={{ marginBottom:'var(--space-3)' }}>
                  <label className="form-label">Delivery Address *</label>
                  <textarea 
                    id="online-address-input" 
                    className="form-input" 
                    placeholder="Enter complete delivery address" 
                    value={address} 
                    onChange={e => setAddress(e.target.value)} 
                    style={{ minHeight: 70, resize: 'vertical' }}
                  />
                </div>
              )}

              <div className="form-group" style={{ marginBottom:'var(--space-4)' }}>
                <label className="form-label">Special Instructions</label>
                <input 
                  id="online-note-input" 
                  className="form-input" 
                  placeholder="Allergies, preferences..." 
                  value={note} 
                  onChange={e => setNote(e.target.value)} 
                />
              </div>

              {/* Order Bill Summary */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--text-subhead)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)', color: 'var(--color-label-secondary)' }}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal, currency)}</span>
                </div>
                {orderType === 'delivery' && (parseFloat(restaurant?.deliveryFee) > 0 || parseFloat(restaurant?.freeDeliveryAbove) > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)', color: 'var(--color-label-secondary)' }}>
                    <span>Delivery Fee</span>
                    <span>
                      {deliveryFee === 0 ? (
                        <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>FREE</span>
                      ) : (
                        formatCurrency(deliveryFee, currency)
                      )}
                    </span>
                  </div>
                )}
                {taxResult.lines.map((line, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)', color: 'var(--color-label-secondary)' }}>
                    <span>{line.label} {taxResult.mode === 'inclusive' ? '(incl.)' : ''}</span>
                    <span>{formatCurrency(line.amount, currency)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-separator-opaque)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-headline)', color: 'var(--color-label)' }}>
                  <span>Total Payable</span>
                  <span>{formatCurrency(total, currency)}</span>
                </div>
              </div>

              {/* Delivery Incentive Tip or Minimum Warning */}
              {orderType === 'delivery' && parseFloat(restaurant?.freeDeliveryAbove) > 0 && subtotal < parseFloat(restaurant.freeDeliveryAbove) && (
                <div style={{
                  fontSize: '12px',
                  color: 'var(--color-accent)',
                  background: 'var(--color-accent-light)',
                  border: '1px solid var(--color-accent)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  marginBottom: 'var(--space-3)',
                  textAlign: 'center',
                  fontWeight: 600
                }}>
                  🎉 Add {formatCurrency(parseFloat(restaurant.freeDeliveryAbove) - subtotal, currency)} more for FREE Delivery!
                </div>
              )}

              {orderType === 'delivery' && parseFloat(restaurant?.minDeliveryOrder) > 0 && subtotal < parseFloat(restaurant.minDeliveryOrder) && (
                <div style={{
                  fontSize: '12px',
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  marginBottom: 'var(--space-3)',
                  textAlign: 'center',
                  fontWeight: 600
                }}>
                  ⚠️ Minimum order for delivery is {formatCurrency(parseFloat(restaurant.minDeliveryOrder), currency)}. Please add {formatCurrency(parseFloat(restaurant.minDeliveryOrder) - subtotal, currency)} more to proceed.
                </div>
              )}

              <button
                id="online-place-order-btn"
                className="btn btn-primary btn-lg"
                style={{ width:'100%' }}
                onClick={submitOrder}
                disabled={
                  loading || 
                  restaurant?.onlineOrderingPaused ||
                  !name.trim() || 
                  !phone.trim() || 
                  (orderType === 'delivery' && (!address.trim() || (parseFloat(restaurant?.minDeliveryOrder) > 0 && subtotal < parseFloat(restaurant.minDeliveryOrder))))
                }
              >
                {loading ? '...' : (restaurant?.onlineOrderingPaused ? 'Online Ordering Paused' : `Place Order · ${formatCurrency(total, currency)}`)}
              </button>
              
              <div style={{ textAlign:'center', fontSize:'var(--text-caption1)', color:'var(--color-label-tertiary)', marginTop:'var(--space-2)' }}>
                Pay at {orderType === 'dine-in' ? 'table' : (orderType === 'delivery' ? 'delivery' : 'counter')} — no online payment required
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="online-order-page" style={{ paddingBottom: cart.length > 0 ? 100 : 'var(--space-8)' }}>
      {/* Dynamic pulse-glow keyframe registration */}
      <style>{`
        @keyframes pulse-glow {
          0% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(0, 122, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Sticky Top App Bar (Swiggy / Zomato Style) ── */}
      <div className="swiggy-app-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {restaurant?.onlineLogo ? (
            <img 
              src={restaurant.onlineLogo} 
              alt={restaurant.name} 
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                objectFit: 'cover',
                border: '1px solid var(--color-separator-opaque)',
                flexShrink: 0
              }}
            />
          ) : (
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.12))',
              border: '1px solid var(--color-separator-opaque)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0
            }}>
              {restaurant?.emoji || '🍽️'}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '15px',
              fontWeight: 800,
              color: 'var(--color-label)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {restaurant?.name || 'Restaurant Menu'}
            </div>
            <div style={{
              fontSize: '11.5px',
              color: 'var(--color-label-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>⚡ {restaurant?.estimatedDeliveryTime || '30-40 mins'}</span>
              <span>•</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{restaurant?.address || 'Main Outlet'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleShareStore}
            aria-label="Share Store"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1px solid var(--color-separator-opaque)',
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-label)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {/* ── Full-Bleed Restaurant Cover Banner ── */}
      <div style={{
        height: 150,
        width: '100%',
        position: 'relative',
        background: restaurant?.onlineCover
          ? `linear-gradient(rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.65)), url(${restaurant.onlineCover}) center/cover no-repeat`
          : 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        display: 'flex',
        alignItems: 'flex-start',
        padding: '16px'
      }}>
        {/* Subtle decorative culinary watermark when no cover */}
        {!restaurant?.onlineCover && (
          <div style={{
            position: 'absolute',
            right: 20,
            bottom: 12,
            opacity: 0.15,
            fontSize: 72,
            userSelect: 'none',
            pointerEvents: 'none'
          }}>
            🍕
          </div>
        )}
      </div>

      {/* ── Main Container ── */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px' }}>

        {/* ── Overlapping Restaurant Information Card ── */}
        <div className="swiggy-rest-card" style={{ marginTop: -48, marginBottom: 16 }}>
          {/* Top Line: Name & Rating */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{
                  fontSize: '19px',
                  fontWeight: 800,
                  color: 'var(--color-label)',
                  margin: 0,
                  lineHeight: 1.2
                }}>
                  {restaurant?.name || 'Restaurant'}
                </h1>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(22, 163, 74, 0.14)',
                  color: '#16a34a',
                  border: '1px solid rgba(22, 163, 74, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                  Open
                </span>
              </div>

              {/* Cuisines & Cost For Two */}
              <div style={{
                fontSize: '13px',
                color: 'var(--color-label-secondary)',
                marginTop: 4,
                lineHeight: 1.4
              }}>
                {restaurant?.onlineDescription || 'Delicious Meals, Snacks & Refreshments'}
                {restaurant?.costForTwo && ` • ₹${restaurant.costForTwo} for two`}
              </div>
            </div>

            {/* Optional restaurant rating if explicitly configured */}
            {restaurant?.rating && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 10px',
                borderRadius: '12px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-separator-opaque)',
                boxShadow: 'var(--shadow-xs)',
                flexShrink: 0
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#15803d'
                }}>
                  <Star size={13} fill="#15803d" stroke="#15803d" />
                  <span>{restaurant.rating}</span>
                </div>
                {restaurant?.ratingCount && (
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--color-label-tertiary)',
                    fontWeight: 600,
                    marginTop: 2
                  }}>
                    {restaurant.ratingCount}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stepper / Timeline: Outlet & Delivery Timeline */}
          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px dashed var(--color-separator-opaque)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: '12.5px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-accent)',
                flexShrink: 0
              }} />
              <div style={{ color: 'var(--color-label)', fontWeight: 600 }}>
                Outlet <span style={{ fontWeight: 400, color: 'var(--color-label-secondary)' }}>• {restaurant?.address || 'Main Branch'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#f59e0b',
                flexShrink: 0
              }} />
              <div style={{ color: 'var(--color-label)', fontWeight: 600 }}>
                {restaurant?.estimatedDeliveryTime || '30-40 mins'}
                <span style={{ fontWeight: 400, color: 'var(--color-label-secondary)' }}>
                  {' '}• {orderType === 'delivery' 
                    ? (parseFloat(deliveryFee) === 0 ? 'Free Delivery' : `${formatCurrency(deliveryFee, currency)} delivery fee`) 
                    : 'Self Pickup ready in 15-20 mins'}
                </span>
              </div>
            </div>
          </div>

          {/* Table lock badge if scanned via table QR */}
          {tableId ? (
            <div style={{
              marginTop: 14,
              background: 'var(--color-green-light)',
              color: 'var(--color-green)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontWeight: 700,
              fontSize: '13px',
              border: '1px solid var(--color-green-opaque)'
            }}>
              🍽️ Table {tableName || tableId} · Dine-In Service
            </div>
          ) : (
            /* Clear Delivery / Pickup Switcher */
            <div style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              background: 'var(--color-bg-secondary)',
              padding: 4,
              borderRadius: '12px',
              border: '1px solid var(--color-separator-opaque)'
            }}>
              <button
                type="button"
                id="online-type-delivery"
                onClick={() => setOrderType('delivery')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '9px',
                  border: 'none',
                  background: orderType === 'delivery' ? 'var(--color-bg-elevated)' : 'transparent',
                  color: orderType === 'delivery' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                  fontWeight: orderType === 'delivery' ? 800 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: orderType === 'delivery' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                🛵 Delivery
              </button>
              <button
                type="button"
                id="online-type-takeaway"
                onClick={() => setOrderType('takeaway')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '9px',
                  border: 'none',
                  background: orderType === 'takeaway' ? 'var(--color-bg-elevated)' : 'transparent',
                  color: orderType === 'takeaway' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                  fontWeight: orderType === 'takeaway' ? 800 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: orderType === 'takeaway' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                🛍️ Takeaway
              </button>
            </div>
          )}

          {/* Promotional Offer Ribbon */}
          {restaurant?.onlineOfferActive && restaurant?.onlineOfferText && (
            <div style={{
              marginTop: 12,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.12))',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '10px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--color-accent)',
              fontSize: '12px',
              fontWeight: 700
            }}>
              <Sparkles size={14} style={{ flexShrink: 0 }} />
              <span>{restaurant.onlineOfferText}</span>
            </div>
          )}

          {/* Paused Banner if restaurant paused online ordering */}
          {restaurant?.onlineOrderingPaused && (
            <div style={{
              marginTop: 12,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: 700
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>Online ordering is currently paused by the restaurant. You can browse the menu.</span>
            </div>
          )}
        </div>

        {/* ── Search Bar & Dietary Filter Pills ── */}
        <div style={{
          position: 'sticky',
          top: 56,
          zIndex: 35,
          background: 'transparent',
          padding: '8px 0',
          marginBottom: 16
        }}>
          {/* Swiggy Rounded Pill Search Bar */}
          <div className="swiggy-search-pill" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <Search size={16} style={{ color: 'var(--color-label-tertiary)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search for dishes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  color: 'var(--color-label)',
                  padding: 0
                }}
              />
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-label-tertiary)',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Dietary Filter Switches Row: [🟢 Veg] [🔺 Non-Veg] [⭐ Bestseller] */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 4
          }}>
            {/* Veg Switch */}
            <button
              type="button"
              className={`swiggy-filter-btn ${vegOnly ? 'active' : ''}`}
              onClick={() => {
                setVegOnly(v => !v);
                if (!vegOnly) setNonVegOnly(false);
              }}
            >
              <span className="food-badge-veg" style={{ width: 12, height: 12 }} />
              <span>Veg</span>
            </button>

            {/* Non-Veg Switch */}
            <button
              type="button"
              className={`swiggy-filter-btn ${nonVegOnly ? 'active' : ''}`}
              onClick={() => {
                setNonVegOnly(v => !v);
                if (!nonVegOnly) setVegOnly(false);
              }}
            >
              <span className="food-badge-nonveg" style={{ width: 12, height: 12 }} />
              <span>Non-Veg</span>
            </button>

            {/* Bestseller Filter */}
            <button
              type="button"
              className={`swiggy-filter-btn ${bestsellerOnly ? 'active' : ''}`}
              onClick={() => setBestsellerOnly(b => !b)}
            >
              <Star size={12} fill={bestsellerOnly ? 'currentColor' : '#f59e0b'} stroke="#f59e0b" />
              <span>Bestseller</span>
            </button>

            {/* Clear All Filters button when any filter active */}
            {(vegOnly || nonVegOnly || bestsellerOnly || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setVegOnly(false);
                  setNonVegOnly(false);
                  setBestsellerOnly(false);
                  setSearchQuery('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-accent)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  whiteSpace: 'nowrap'
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Quick Category Jump Pills */}
          {!searchQuery && categories.length > 1 && (
            <div style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              paddingTop: 6,
              paddingBottom: 2
            }}>
              {categories.map(c => {
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => scrollToCategory(c.id)}
                    style={{
                      flexShrink: 0,
                      padding: '4px 10px',
                      borderRadius: '16px',
                      border: '1px solid var(--color-separator-opaque)',
                      background: 'var(--color-bg-elevated)',
                      color: 'var(--color-label-secondary)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span>{c.emoji || '🍽️'}</span>
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Grouped Category Sections with Accordion ── */}
        {groupedCategories.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px 16px',
            background: 'var(--color-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--color-separator-opaque)'
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--color-label)' }}>No dishes found</div>
            <p style={{ fontSize: '13px', color: 'var(--color-label-secondary)', margin: '6px 0 16px 0' }}>
              {searchQuery ? `No menu items match "${searchQuery}".` : 'Try relaxing the filters to see more dishes.'}
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchQuery('');
                setVegOnly(false);
                setNonVegOnly(false);
                setBestsellerOnly(false);
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          groupedCategories.map(cat => {
            const isCollapsed = Boolean(collapsedCats[cat.id]);
            return (
              <section 
                key={cat.id} 
                id={`swiggy-cat-section-${cat.id}`}
                style={{
                  background: 'var(--color-bg-elevated)',
                  borderRadius: '18px',
                  border: '1px solid var(--color-separator-opaque)',
                  padding: '16px 18px',
                  marginBottom: 16,
                  boxShadow: 'var(--shadow-xs)',
                  animation: 'fadeIn 0.2s ease-out'
                }}
              >
                {/* Category Header with Item Count & Chevron */}
                <div 
                  onClick={() => setCollapsedCats(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    paddingBottom: isCollapsed ? 0 : 12,
                    borderBottom: isCollapsed ? 'none' : '1px solid var(--color-separator-opaque)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '18px' }}>{cat.emoji || '🍽️'}</span>
                    <h2 style={{
                      fontSize: '17px',
                      fontWeight: 800,
                      color: 'var(--color-label)',
                      margin: 0
                    }}>
                      {cat.name} ({cat.items.length})
                    </h2>
                  </div>

                  <div style={{ color: 'var(--color-label-secondary)', padding: 4 }}>
                    {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                  </div>
                </div>

                {/* Dish Rows */}
                {!isCollapsed && (
                  <div>
                    {cat.items.map(item => {
                      const isVeg = isVegetarianItem(item);
                      const isBestseller = Boolean(
                        item.isBestseller || 
                        item.bestseller || 
                        item.featured || 
                        item.recommended || 
                        item.isSpecial ||
                        (Array.isArray(restaurant?.manualBestsellerItemIds) && restaurant.manualBestsellerItemIds.includes(item.id)) ||
                        (restaurant?.autoDetectBestsellers !== false && Array.isArray(restaurant?.autoBestsellerItemIds) && restaurant.autoBestsellerItemIds.includes(item.id))
                      );
                      const cartItem = cart.find(c => c.menuItemId === item.id || c.id === item.id);
                      const isExpanded = Boolean(expandedDescriptions[item.id]);
                      const hasDesc = Boolean(item.description?.trim());
                      const isLongDesc = hasDesc && item.description.length > 75;

                      const handleItemTap = () => {
                        if (item.modifierGroups && item.modifierGroups.length > 0) {
                          setActiveModifierItem(item);
                        } else {
                          addToCart(item);
                        }
                      };

                      return (
                        <div key={item.id} className="swiggy-dish-row">
                          {/* Left Column: Details */}
                          <div style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                            {/* FSSAI Badge & Bestseller Tag */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span className={isVeg ? 'food-badge-veg' : 'food-badge-nonveg'} />
                              {isBestseller && (
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#d97706',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 2
                                }}>
                                  <Star size={10} fill="#d97706" stroke="#d97706" /> Bestseller
                                </span>
                              )}
                            </div>

                            {/* Dish Title */}
                            <div style={{
                              fontWeight: 800,
                              fontSize: '15px',
                              color: 'var(--color-label)',
                              lineHeight: 1.3
                            }}>
                              {item.name}
                            </div>

                            {/* Price */}
                            <div style={{
                              marginTop: 4,
                              fontWeight: 800,
                              fontSize: '14.5px',
                              color: 'var(--color-label)'
                            }}>
                              {item.modifierGroups?.length > 0 && parseFloat(item.price) === 0 ? (
                                (() => {
                                  const allPrices = item.modifierGroups.flatMap(g => g.options?.map(o => o.priceAdd) || []).filter(p => p > 0);
                                  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
                                  return `From ${formatCurrency(minPrice, currency)}`;
                                })()
                              ) : (
                                formatCurrency(item.price, currency)
                              )}
                            </div>

                            {/* Description with More/Less Toggle */}
                            {hasDesc && (
                              <div style={{
                                fontSize: '12px',
                                color: 'var(--color-label-secondary)',
                                marginTop: 6,
                                lineHeight: 1.4
                              }}>
                                <span>
                                  {isLongDesc && !isExpanded 
                                    ? `${item.description.slice(0, 75)}...` 
                                    : item.description}
                                </span>
                                {isLongDesc && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedDescriptions(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: '0 0 0 4px',
                                      color: 'var(--color-label)',
                                      fontWeight: 700,
                                      fontSize: '11.5px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {isExpanded ? 'less' : 'more'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Column: Photo & Overlapping ADD button */}
                          <div style={{
                            width: 118,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            flexShrink: 0,
                            position: 'relative',
                            paddingBottom: 16
                          }}>
                            {/* Food Photo */}
                            {(item.imageUrl || item.image) ? (
                              <img
                                src={item.imageUrl || item.image}
                                alt={item.name}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.nextElementSibling) {
                                    e.currentTarget.nextElementSibling.style.display = 'flex';
                                  }
                                }}
                                style={{
                                  width: 118,
                                  height: 96,
                                  objectFit: 'cover',
                                  borderRadius: '14px',
                                  border: '1px solid var(--color-separator-opaque)'
                                }}
                              />
                            ) : null}

                            {/* Fallback box if no photo */}
                            <div
                              style={{
                                width: 118,
                                height: 96,
                                borderRadius: '14px',
                                background: 'linear-gradient(135deg, var(--color-bg-secondary), var(--color-bg-tertiary))',
                                border: '1px solid var(--color-separator-opaque)',
                                display: (item.imageUrl || item.image) ? 'none' : 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 36
                              }}
                            >
                              {item.emoji || '🍽️'}
                            </div>

                            {/* Overlapping Floating Button */}
                            <div style={{
                              position: 'absolute',
                              bottom: 0,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              zIndex: 10
                            }}>
                              {cartItem ? (
                                <div className="swiggy-stepper">
                                  <button
                                    type="button"
                                    aria-label="Decrease quantity"
                                    onClick={() => updateQty(cartItem.id, cartItem.qty - 1)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#ffffff',
                                      cursor: 'pointer',
                                      padding: '4px 6px',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <Minus size={13} strokeWidth={3} />
                                  </button>
                                  <span style={{ fontSize: '13px', fontWeight: 800, minWidth: 16, textAlign: 'center' }}>
                                    {cartItem.qty}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label="Increase quantity"
                                    onClick={() => updateQty(cartItem.id, cartItem.qty + 1)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#ffffff',
                                      cursor: 'pointer',
                                      padding: '4px 6px',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <Plus size={13} strokeWidth={3} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  id={`online-add-${item.id}`}
                                  className="swiggy-add-btn"
                                  onClick={handleItemTap}
                                >
                                  ADD <Plus size={13} strokeWidth={3} style={{ marginLeft: 3 }} />
                                </button>
                              )}
                            </div>

                            {/* Customizable note */}
                            {item.modifierGroups?.length > 0 && (
                              <div style={{
                                fontSize: '10px',
                                color: 'var(--color-label-tertiary)',
                                marginTop: 14,
                                fontWeight: 600,
                                textAlign: 'center'
                              }}>
                                Customisable
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}

      </div>

      {/* ── Floating Black [ 🍽️ MENU ] Quick-Jump Button ── */}
      <button
        type="button"
        className="swiggy-floating-menu-btn"
        style={{
          bottom: cart.length > 0 ? 82 : 'max(20px, env(safe-area-inset-bottom, 20px))'
        }}
        onClick={() => setShowMenuDrawer(true)}
      >
        <Utensils size={15} />
        <span>MENU</span>
      </button>

      {/* ── Category Quick-Sheet Drawer ── */}
      {showMenuDrawer && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={() => setShowMenuDrawer(false)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--color-bg-elevated)',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              padding: '20px',
              maxHeight: '75vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-xl)',
              animation: 'slide-up 0.2s ease-out'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-label)' }}>
                Menu Categories
              </div>
              <button
                type="button"
                onClick={() => setShowMenuDrawer(false)}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-label)',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {categories.map(c => {
                const count = (c.items || []).filter(i => i.available !== false).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => scrollToCategory(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid var(--color-separator-opaque)',
                      background: 'var(--color-bg)',
                      color: 'var(--color-label)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{c.emoji || '🍽️'}</span>
                      <span>{c.name}</span>
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--color-label-tertiary)', fontWeight: 700 }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Floating cart bar for menu browsing with Safe Area Inset */}
      {cart.length > 0 && step === 'menu' && (
        <div 
          onClick={() => setStep('checkout')}
          style={{
            position: 'fixed',
            bottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '648px',
            background: 'var(--color-accent)',
            color: 'var(--color-on-dark)',
            padding: '16px 22px',
            minHeight: 52,
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            zIndex: 990,
            fontWeight: 'var(--weight-bold)',
            fontSize: 'var(--text-subhead)',
            animation: 'slide-up 0.2s ease-out',
            touchAction: 'manipulation'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            🛒 View Order ({cartCount} {cartCount === 1 ? 'item' : 'items'})
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {formatCurrency(subtotal, currency)} →
          </span>
        </div>
      )}

      {/* Floating tracker banner when active order exists but in menu browsing mode */}
      {activeOrderId && activeOrder && viewMode === 'menu' && (
        <div 
          onClick={() => setViewMode('tracker')}
          style={{
            position: 'fixed',
            bottom: 'var(--space-4)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-accent)',
            color: 'var(--color-on-dark)',
            padding: '12px 24px',
            borderRadius: 'var(--radius-full)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            zIndex: 9999,
            fontWeight: 'var(--weight-bold)',
            fontSize: 'var(--text-subhead)',
            animation: 'pulse-glow 2s infinite',
            whiteSpace: 'nowrap'
          }}
        >
          <span>🍳 View Live Order Status ({activeOrder.status})</span>
        </div>
      )}

      {activeModifierItem && (
        <ModifierModal
          item={activeModifierItem}
          currency={currency}
          onClose={() => setActiveModifierItem(null)}
          onConfirm={(selectedModifiers, flatPrice) => {
            addToCart(activeModifierItem, selectedModifiers, flatPrice ?? null);
            setActiveModifierItem(null);
          }}
        />
      )}
    </div>
  );
}
