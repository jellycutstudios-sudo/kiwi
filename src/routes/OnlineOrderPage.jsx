import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, serverTimestamp, getDoc, doc, writeBatch, increment, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/formatCurrency';
import { Plus, Minus, X, Check, Clock, ChefHat, CheckSquare } from 'lucide-react';
import ModifierModal from '../components/pos/ModifierModal';
import toast from 'react-hot-toast';

export default function OnlineOrderPage() {
  const { restaurantId } = useParams();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('tableId');
  const tableName = searchParams.get('tableName');

  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState(() => {
    return tableId ? 'dine-in' : 'takeaway';
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('menu'); // 'menu' | 'details' | 'done'
  const [activeModifierItem, setActiveModifierItem] = useState(null);
  const [loading, setLoading] = useState(false);

  // Active order tracking states
  const [activeOrderId, setActiveOrderId] = useState(() => {
    return localStorage.getItem(`restaurantOS_${restaurantId}_active_order`) || null;
  });
  const [activeOrder, setActiveOrder] = useState(null);
  const [viewMode, setViewMode] = useState('tracker'); // 'tracker' | 'menu'

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
        const q = query(collection(db, 'restaurants'), where('slug', '==', restaurantId));
        const snap = await getDocs(q);
        
        if (!active) return;

        let resolved = null;
        if (!snap.empty) {
          resolved = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } else {
          const docSnap = await getDoc(doc(db, 'restaurants', restaurantId));
          if (docSnap.exists()) {
            resolved = { id: docSnap.id, ...docSnap.data() };
          }
        }
        
        if (resolved && active) {
          setRestaurant(resolved);
          unsubMenu = onSnapshot(collection(db, 'restaurants', resolved.id, 'menu'), snap => {
            const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setCategories(cats);
            if (cats.length) setActiveCat(cats[0].id);
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
          localStorage.removeItem(`restaurantOS_${restaurantId}_active_order`);
          setActiveOrderId(null);
          setActiveOrder(null);
          toast.error('Your order has been cancelled.');
        } else if (type === 'dine-in' && data.status === 'billed') {
          localStorage.removeItem(`restaurantOS_${restaurantId}_active_order`);
          setActiveOrderId(null);
          setActiveOrder(null);
          toast.success('Your table bill has been settled. Thank you!');
        } else {
          setActiveOrder({ id: d.id, ...data });
        }
      } else {
        localStorage.removeItem(`restaurantOS_${restaurantId}_active_order`);
        setActiveOrderId(null);
        setActiveOrder(null);
      }
    }, err => console.log('Tracker fetch err:', err));
    return unsub;
  }, [restaurant?.id, activeOrderId, restaurantId]);

  const currency = restaurant?.currency ?? 'INR';
  const items = categories.find(c => c.id === activeCat)?.items ?? [];

  const heroStyle = {
    background: restaurant?.onlineCover 
      ? `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.7)), url(${restaurant.onlineCover}) center/cover no-repeat` 
      : 'var(--color-label)',
    color: 'var(--color-on-dark)',
    padding: 'var(--space-8) var(--space-6)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  };

  const trackerHeroStyle = {
    background: restaurant?.onlineCover 
      ? `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.7)), url(${restaurant.onlineCover}) center/cover no-repeat` 
      : 'var(--color-label)',
    color: 'var(--color-on-dark)',
    padding: 'var(--space-6) var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  };

  const addToCart = (item, selectedModifiers = []) => {
    setCart(c => {
      const modifierTotal = selectedModifiers.reduce((sum, m) => sum + m.priceAdd, 0);
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
          modifierTotal,
          price: item.price + modifierTotal,
          qty: 1
        }];
      }
    });
  };

  const updateQty = (id, qty) => {
    if (qty <= 0) setCart(c => c.filter(i => i.id !== id));
    else setCart(c => c.map(i => i.id === id ? { ...i, qty } : i));
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const submitOrder = async () => {
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!phone.trim()) {
      toast.error('Please enter your mobile number');
      return;
    }
    if (orderType === 'delivery' && !address.trim()) {
      toast.error('Please enter your delivery address');
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
          name: i.name,
          price: i.price,
          qty: i.qty,
          selectedModifiers: i.selectedModifiers ?? [],
          modifierTotal: i.modifierTotal ?? 0,
          station: i.station ?? 'Kitchen',
          status: 'pending'
        })),
        subtotal,
        total: subtotal,
        customerName: name.trim(),
        customerPhone: phone.trim().replace(/\D/g, '') || '',
        note: note.trim() || '',
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
          activeOrderId: orderDocRef.id
        });
      }

      // Deplete safety stock levels for each ingredient in the recipe
      for (const item of cart) {
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

      // Execute batch write atomically
      await batch.commit();

      localStorage.setItem(`restaurantOS_${restaurantId}_active_order`, orderDocRef.id);
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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-family)' }}>
      <div style={{ textAlign:'center', color:'var(--color-label-tertiary)' }}>
        <div style={{fontSize:40}}>🍽️</div>
        <div>Loading menu...</div>
      </div>
    </div>
  );

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
          <h1 style={{ fontSize: 'var(--text-title2)', margin: 0, fontWeight: 'var(--weight-bold)' }}>
            {activeOrder.orderType === 'delivery' ? '🚚 Delivery Order' : (activeOrder.orderType === 'takeaway' ? '🛍️ Takeaway Pickup' : `Table ${activeOrder.tableName || 'Service'}`)}
          </h1>
          <p style={{ opacity: 0.9, fontSize: 'var(--text-footnote)', margin: '4px 0 0 0' }}>
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
                  localStorage.removeItem(`restaurantOS_${restaurantId}_active_order`);
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
        <h1 style={{ fontSize: 'var(--text-title1)', margin: 0, fontWeight: 'var(--weight-bold)' }}>Order Placed!</h1>
        <p style={{ opacity: 0.9, fontSize: 'var(--text-subhead)', margin: 'var(--space-2) 0 0 0' }}>
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
          <h1 style={{ fontSize: 'var(--text-title2)', margin: 0, fontWeight: 'var(--weight-bold)' }}>Checkout</h1>
          <p style={{ opacity: 0.9, fontSize: 'var(--text-footnote)', margin: '4px 0 0 0' }}>{restaurant?.name}</p>
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
              <span className="card-title">Your Order ({cart.reduce((sum, i) => sum + i.qty, 0)} items)</span>
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
                        <button className="qty-btn" onClick={() => updateQty(cartItem.id, cartItem.qty - 1)}><Minus size={10}/></button>
                        <span style={{ fontWeight:'var(--weight-bold)', minWidth:18, textAlign:'center', fontSize: 'var(--text-footnote)' }}>{cartItem.qty}</span>
                        <button className="qty-btn" onClick={() => updateQty(cartItem.id, cartItem.qty + 1)}><Plus size={10}/></button>
                      </div>
                      <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-label)', minWidth: 60, textAlign: 'right' }}>
                        {formatCurrency(cartItem.price * cartItem.qty, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Mode Toggle */}
              {!tableId && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Order Mode</label>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    {[['takeaway','🛍️ Pickup'],['delivery','🚚 Delivery']].map(([k,l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setOrderType(k)}
                        style={{
                          padding:'var(--space-3)',
                          borderRadius:'var(--radius-lg)',
                          border: `2px solid ${orderType === k ? 'var(--color-accent)' : 'var(--color-separator-opaque)'}`,
                          background: orderType === k ? 'var(--color-accent-light)' : 'var(--color-bg)',
                          color: orderType === k ? 'var(--color-accent)' : 'var(--color-label)',
                          fontWeight:'var(--weight-semibold)',
                          fontSize:'var(--text-footnote)',
                          cursor:'pointer',
                          transition:'all var(--duration-fast)',
                          fontFamily:'var(--font-family)',
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
                  onChange={e => setName(e.target.value)} 
                />
              </div>

              <div className="form-group" style={{ marginBottom:'var(--space-3)' }}>
                <label className="form-label">Mobile Number *</label>
                <input 
                  id="online-phone-input" 
                  className="form-input" 
                  type="tel" 
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

              <button
                id="online-place-order-btn"
                className="btn btn-primary btn-lg"
                style={{ width:'100%' }}
                onClick={submitOrder}
                disabled={loading || !name.trim() || !phone.trim() || (orderType === 'delivery' && !address.trim())}
              >
                {loading ? '...' : `Place Order · ${formatCurrency(subtotal, currency)}`}
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
    <div className="online-order-page" style={{ paddingBottom: 'var(--space-8)' }}>
      {/* Dynamic pulse-glow keyframe registration */}
      <style>{`
        @keyframes pulse-glow {
          0% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(0, 122, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0); }
        }
      `}</style>

      <div className="online-order-hero" style={heroStyle}>
        {restaurant?.onlineLogo ? (
          <img 
            src={restaurant.onlineLogo} 
            alt={`${restaurant.name} Logo`} 
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid var(--color-bg)',
              boxShadow: 'var(--shadow-lg)',
              backgroundColor: 'var(--color-bg-secondary)',
              marginBottom: 'var(--space-2)'
            }}
          />
        ) : (
          <div style={{ fontSize: 40, marginBottom: 'var(--space-2)' }}>{restaurant?.emoji ?? '🍽️'}</div>
        )}
        <h1 style={{ fontSize:'var(--text-title1)', margin: 0, fontWeight: 'var(--weight-bold)' }}>{restaurant.name}</h1>
        {restaurant?.onlineDescription && (
          <p style={{ 
            opacity: 0.9, 
            fontSize: 'var(--text-subhead)', 
            maxWidth: 500, 
            margin: 'var(--space-2) auto 0 auto', 
            lineHeight: 1.4,
            fontWeight: 'var(--weight-regular)'
          }}>
            {restaurant.onlineDescription}
          </p>
        )}
        <p style={{ opacity: 0.8, fontSize: 'var(--text-footnote)', marginTop: 'var(--space-3)', marginBottom: 0 }}>
          Order online — pay at {orderType === 'dine-in' ? 'table' : 'counter'}
        </p>
      </div>

      <div className="online-order-content">
        {/* Table lock banner */}
        {tableId && (
          <div style={{
            background: 'var(--color-green-light)',
            color: 'var(--color-green)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontWeight: 'var(--weight-bold)',
            fontSize: 'var(--text-subhead)',
            border: '1px solid var(--color-green-opaque)',
            textAlign: 'center'
          }}>
            🍽️ Dine-In Table Service · Table {tableName || tableId}
          </div>
        )}

        {/* Order type — hide if tableId is present */}
        {!tableId && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)', marginBottom:'var(--space-5)' }}>
            {[['takeaway','🛍️ Pickup'],['delivery','🚚 Delivery']].map(([k,l]) => (
              <button
                key={k}
                id={`online-type-${k}`}
                onClick={() => setOrderType(k)}
                style={{
                  padding:'var(--space-4)',
                  borderRadius:'var(--radius-lg)',
                  border: `2px solid ${orderType === k ? 'var(--color-accent)' : 'var(--color-separator-opaque)'}`,
                  background: orderType === k ? 'var(--color-accent-light)' : 'var(--color-bg)',
                  color: orderType === k ? 'var(--color-accent)' : 'var(--color-label)',
                  fontWeight:'var(--weight-semibold)',
                  fontSize:'var(--text-subhead)',
                  cursor:'pointer',
                  transition:'all var(--duration-fast)',
                  fontFamily:'var(--font-family)',
                }}
              >{l}</button>
            ))}
          </div>
        )}

        {/* Categories */}
        <div style={{ display:'flex', gap:'var(--space-2)', overflowX:'auto', marginBottom:'var(--space-4)', scrollbarWidth:'none' }}>
          {categories.map(c => (
            <button
              key={c.id}
              id={`online-cat-${c.id}`}
              className={`category-chip ${activeCat === c.id ? 'active' : ''}`}
              onClick={() => setActiveCat(c.id)}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>

        {/* Menu */}
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)', marginBottom:'var(--space-6)' }}>
          {items.filter(i => i.available !== false).map(item => {
            const cartItem = cart.find(c => c.menuItemId === item.id || c.id === item.id);
            return (
              <div key={item.id} className="card" style={{ display:'flex', alignItems:'center', padding:'var(--space-4)', gap:'var(--space-4)' }}>
                {item.imageUrl || item.image ? (
                  <img src={item.imageUrl || item.image} alt={item.name} style={{ width:64, height:64, objectFit:'cover', borderRadius:'var(--radius-md)', flexShrink:0 }} />
                ) : (
                  <div style={{ width:64, height:64, background:'var(--color-bg-secondary)', borderRadius:'var(--radius-md)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>
                    {item.emoji ?? '🍽️'}
                  </div>
                )}
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:'var(--weight-semibold)' }}>{item.name}</div>
                  {item.description && <div style={{ fontSize:'var(--text-footnote)', color:'var(--color-label-secondary)', marginTop:2 }}>{item.description}</div>}
                  <div style={{ fontWeight:'var(--weight-bold)', color:'var(--color-accent)', marginTop:4 }}>{formatCurrency(item.price, currency)}</div>
                </div>
                {cartItem ? (
                  <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                    <button className="qty-btn" onClick={() => updateQty(cartItem.id, cartItem.qty - 1)}><Minus size={12}/></button>
                    <span style={{ fontWeight:'var(--weight-bold)', minWidth:20, textAlign:'center' }}>{cartItem.qty}</span>
                    <button className="qty-btn" onClick={() => updateQty(cartItem.id, cartItem.qty + 1)}><Plus size={12}/></button>
                  </div>
                ) : (
                  <button
                    id={`online-add-${item.id}`}
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (item.modifierGroups && item.modifierGroups.length > 0) {
                        setActiveModifierItem(item);
                      } else {
                        addToCart(item);
                      }
                    }}
                  >
                    <Plus size={14}/> Add
                  </button>
                )}
              </div>
            );
          })}
        </div>

      {/* Floating cart bar for menu browsing */}
      {cart.length > 0 && step === 'menu' && (
        <div 
          onClick={() => setStep('checkout')}
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '648px',
            background: 'var(--color-accent)',
            color: 'var(--color-on-dark)',
            padding: '14px 20px',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            zIndex: 1000,
            fontWeight: 'var(--weight-bold)',
            fontSize: 'var(--text-subhead)',
            animation: 'slide-up 0.2s ease-out'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            🛒 View Order ({cart.reduce((sum, i) => sum + i.qty, 0)} items)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {formatCurrency(subtotal, currency)} →
          </span>
        </div>
      )}
      </div>

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
          onConfirm={(selectedModifiers) => {
            addToCart(activeModifierItem, selectedModifiers);
            setActiveModifierItem(null);
          }}
        />
      )}
    </div>
  );
}
