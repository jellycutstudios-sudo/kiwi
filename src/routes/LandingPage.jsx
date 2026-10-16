import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { 
  Tablet, Smartphone, Tv, Check, X,
  ArrowRight, Play, Globe, Menu, ChevronDown, ChevronUp,
  Utensils, Pizza, Coffee, CreditCard,
  Clock, Flame, ShieldCheck, Users,
  BarChart3, ChefHat, Printer, Layers,
  Receipt, DollarSign, Calculator, Zap
} from 'lucide-react';
import '../landing-neo.css';

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { user, staffDoc } = useAuthStore();
  const isAuth = !!user || !!staffDoc;
  const isRtl = i18n.language === 'ar';

  const [activeTab, setActiveTab] = useState('pos'); // 'pos', 'kds', 'tables', 'insights'
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  // Interactive Live POS Register State
  const [posCart, setPosCart] = useState([
    { id: '1', name: 'Double Bacon Burger', price: 240, qty: 1 },
    { id: '2', name: 'Truffle Fries', price: 180, qty: 1 }
  ]);
  const [posCat, setPosCat] = useState('Burgers');
  const [isPaid, setIsPaid] = useState(false);

  // Interactive Commission Savings Calculator State
  const [monthlySales, setMonthlySales] = useState(150000);
  const commissionSaved = Math.round(monthlySales * 0.25);

  // Interactive KDS Ticket State
  const [kdsOrders, setKdsOrders] = useState([
    { id: 'T2', table: 'Table 02', items: ['2x Double Bacon Burger', '1x Truffle Fries'], time: '12:40 Priority', urgent: true, done: false },
    { id: 'T5', table: 'Table 05', items: ['1x Margherita Pizza 12"', '1x Veggie Supreme'], time: '04:15 Cooking', urgent: false, done: false }
  ]);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');
  };

  const sampleDishes = [
    { id: '1', name: 'Classic Cheeseburger', price: 180, cat: 'Burgers', icon: Utensils },
    { id: '2', name: 'Double Bacon Burger', price: 240, cat: 'Burgers', icon: Utensils },
    { id: '3', name: 'Margherita Pizza 12"', price: 350, cat: 'Pizzas', icon: Pizza },
    { id: '4', name: 'Pepperoni Feast', price: 450, cat: 'Pizzas', icon: Pizza },
    { id: '5', name: 'Iced Matcha Latte', price: 140, cat: 'Beverages', icon: Coffee },
    { id: '6', name: 'Cold Brew Coffee', price: 160, cat: 'Beverages', icon: Coffee },
  ];

  const posTotal = posCart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const addPosItem = (item) => {
    setIsPaid(false);
    setPosCart(prev => {
      const exists = prev.find(p => p.id === item.id);
      if (exists) return prev.map(p => p.id === item.id ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const markKdsDone = (id) => {
    setKdsOrders(prev => prev.map(o => o.id === id ? { ...o, done: true } : o));
  };

  const faqs = [
    {
      q: "Can we use our existing iPads, tablets, or phones?",
      a: "Yes. DineOS runs on modern web standards. Any iPad, Android tablet, Windows PC, Mac, or smartphone can be used immediately without buying locked hardware."
    },
    {
      q: "Does it support kitchen thermal receipt printers?",
      a: "Yes. Native support for 80mm and 58mm ESC/POS thermal printers over USB, LAN/Ethernet, and Bluetooth is built right in alongside digital KDS screens."
    },
    {
      q: "What happens if our restaurant loses internet?",
      a: "Orders continue without interruption. DineOS saves data securely in browser IndexedDB offline cache and syncs seamlessly once connectivity returns."
    },
    {
      q: "Are there commissions on online orders or QR menus?",
      a: "None. You get a direct web ordering link and QR menus with 0% commission fees, protecting 100% of your earnings."
    }
  ];

  return (
    <div className="neo-landing" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Top Navigation */}
      <nav className="neo-nav">
        <div className="neo-nav-inner">
          <Link to="/" className="neo-logo">
            <img src="/ricon.svg" alt="DineOS Logo" />
            <span className="neo-logo-text">DineOS</span>
          </Link>

          <div className="neo-nav-links">
            <a href="#workstation" className="neo-nav-link">Workstation</a>
            <a href="#features" className="neo-nav-link">Features</a>
            <a href="#compare" className="neo-nav-link">Why DineOS</a>
            <a href="#faq" className="neo-nav-link">FAQ</a>
          </div>

          <div className="neo-nav-actions">
            <button onClick={toggleLanguage} className="neo-btn neo-btn-secondary neo-nav-desktop-only" style={{ padding: '6px 10px', fontSize: '12px' }} title="Toggle Language">
              <Globe size={13} />
              <span>{i18n.language === 'ar' ? 'English' : 'العربية'}</span>
            </button>

            <button onClick={() => setIsDemoModalOpen(true)} className="neo-btn neo-btn-secondary neo-nav-desktop-only">
              <Play size={12} /> Live Demo
            </button>

            <Link to={isAuth ? "/dashboard" : "/login"} className="neo-btn neo-btn-primary">
              {isAuth ? t('goToDashboard') : (t('signIn') || 'Sign In')}
            </Link>

            <button 
              className="neo-burger-btn" 
              onClick={() => setIsMobileMenuOpen(prev => !prev)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="neo-mobile-menu">
            <a href="#workstation" className="neo-mobile-menu-item" onClick={() => setIsMobileMenuOpen(false)}>Workstation</a>
            <a href="#features" className="neo-mobile-menu-item" onClick={() => setIsMobileMenuOpen(false)}>Features</a>
            <a href="#compare" className="neo-mobile-menu-item" onClick={() => setIsMobileMenuOpen(false)}>Comparison</a>
            <a href="#faq" className="neo-mobile-menu-item" onClick={() => setIsMobileMenuOpen(false)}>FAQ</a>
            <button className="neo-mobile-menu-item" onClick={() => { setIsMobileMenuOpen(false); setIsDemoModalOpen(true); }}>
              <Play size={14} /> Open Live Demo
            </button>
            <button className="neo-mobile-menu-item" onClick={() => { toggleLanguage(); setIsMobileMenuOpen(false); }}>
              <Globe size={14} /> {i18n.language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            </button>
          </div>
        )}
      </nav>

      {/* Hero Band */}
      <header className="clay-hero-band">
        <div className="clay-hero-inner">
          <h1 className="clay-hero-title">
            Build systems to grow restaurant revenue.
          </h1>

          <p className="clay-hero-subtitle">
            Fast counter billing, zero-commission direct ordering, kitchen KDS, and recipe-level inventory control.
          </p>

          <div className="clay-hero-actions">
            <Link to="/login?mode=register" className="clay-hero-btn-primary">
              <span>Start Free Trial</span>
              <ArrowRight size={14} />
            </Link>
            <button onClick={() => setIsDemoModalOpen(true)} className="clay-hero-btn-secondary">
              <Play size={12} />
              <span>Live Demo</span>
            </button>
          </div>

          <div className="clay-trust-strip">
            <span className="clay-trust-item"><Check size={12} color="#a7f3d0" strokeWidth={2.5} /> Zero hardware lock-in</span>
            <span className="clay-trust-item"><Check size={12} color="#a7f3d0" strokeWidth={2.5} /> 0% Online commission</span>
            <span className="clay-trust-item"><Check size={12} color="#a7f3d0" strokeWidth={2.5} /> 100% Offline resilient</span>
          </div>
        </div>
      </header>

      {/* Structured Hardware & Ecosystem Container Dock */}
      <section className="clay-ecosystem-section">
        <div className="clay-ecosystem-inner">
          <div className="clay-ecosystem-header">
            <span className="clay-ecosystem-eyebrow">Hardware Agnostic</span>
            <span className="clay-ecosystem-title">Runs on your existing counter & kitchen hardware</span>
          </div>
          <div className="clay-ecosystem-grid">
            <div className="clay-ecosystem-cell">
              <div className="clay-ecosystem-cell-icon"><Printer size={15} /></div>
              <div className="clay-ecosystem-cell-content">
                <span className="clay-ecosystem-cell-name">Thermal Printers</span>
                <span className="clay-ecosystem-cell-desc">ESC/POS 80 & 58mm</span>
              </div>
            </div>
            <div className="clay-ecosystem-cell">
              <div className="clay-ecosystem-cell-icon"><Tablet size={15} /></div>
              <div className="clay-ecosystem-cell-content">
                <span className="clay-ecosystem-cell-name">Counter Tablets</span>
                <span className="clay-ecosystem-cell-desc">iPads & Android</span>
              </div>
            </div>
            <div className="clay-ecosystem-cell">
              <div className="clay-ecosystem-cell-icon"><Smartphone size={15} /></div>
              <div className="clay-ecosystem-cell-content">
                <span className="clay-ecosystem-cell-name">Server Handhelds</span>
                <span className="clay-ecosystem-cell-desc">iPhones & Android</span>
              </div>
            </div>
            <div className="clay-ecosystem-cell">
              <div className="clay-ecosystem-cell-icon"><CreditCard size={15} /></div>
              <div className="clay-ecosystem-cell-content">
                <span className="clay-ecosystem-cell-name">Payment Terminals</span>
                <span className="clay-ecosystem-cell-desc">UPI & Card POS</span>
              </div>
            </div>
            <div className="clay-ecosystem-cell">
              <div className="clay-ecosystem-cell-icon"><Tv size={15} /></div>
              <div className="clay-ecosystem-cell-content">
                <span className="clay-ecosystem-cell-name">Kitchen Displays</span>
                <span className="clay-ecosystem-cell-desc">Smart TVs & KDS</span>
              </div>
            </div>
            <div className="clay-ecosystem-cell">
              <div className="clay-ecosystem-cell-icon"><Layers size={15} /></div>
              <div className="clay-ecosystem-cell-content">
                <span className="clay-ecosystem-cell-name">Online Channels</span>
                <span className="clay-ecosystem-cell-desc">Zomato & Swiggy</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Workstation Spotlight */}
      <section className="clay-workstation-section" id="workstation">
        <div className="clay-section-head">
          <h2>Restaurant owners run on DineOS</h2>
          <p>Tap through the active modules to see how orders route instantly across stations.</p>
        </div>

        <div className="clay-tabs">
          <button 
            className={`clay-tab-btn ${activeTab === 'pos' ? 'active' : ''}`}
            onClick={() => setActiveTab('pos')}
          >
            <Tablet size={13} />
            <span className="clay-tab-label-desktop">POS Terminal</span>
            <span className="clay-tab-label-mobile">POS</span>
          </button>
          <button 
            className={`clay-tab-btn ${activeTab === 'kds' ? 'active' : ''}`}
            onClick={() => setActiveTab('kds')}
          >
            <ChefHat size={13} />
            <span className="clay-tab-label-desktop">Kitchen KDS</span>
            <span className="clay-tab-label-mobile">KDS</span>
          </button>
          <button 
            className={`clay-tab-btn ${activeTab === 'tables' ? 'active' : ''}`}
            onClick={() => setActiveTab('tables')}
          >
            <Users size={13} />
            <span className="clay-tab-label-desktop">Floor Map</span>
            <span className="clay-tab-label-mobile">Floor</span>
          </button>
          <button 
            className={`clay-tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            <BarChart3 size={13} />
            <span className="clay-tab-label-desktop">Margin Analytics</span>
            <span className="clay-tab-label-mobile">Margins</span>
          </button>
        </div>

        {/* Workstation Frame */}
        <div className="clay-terminal-frame">
          <div className="clay-terminal-header">
            <div className="clay-terminal-header-title">
              <span className="clay-terminal-module-name">
                {activeTab === 'pos' && 'Register #01 · Dine In'}
                {activeTab === 'kds' && 'KDS Grill & Fryer'}
                {activeTab === 'tables' && 'Floor Map · Main Room'}
                {activeTab === 'insights' && 'Margin Analytics'}
              </span>
              <span className="clay-terminal-sub-badge">
                {activeTab === 'pos' ? 'Offline Ready' : 'Live'}
              </span>
            </div>
            <div className="clay-terminal-status-pill">
              <span className="clay-pulse-dot" />
              <span>Live Sync</span>
            </div>
          </div>

          <div style={{ padding: '14px', background: '#ffffff' }}>
            
            {/* POS TAB */}
            {activeTab === 'pos' && (
              <div className="clay-pos-workstation-grid">
                <div className="clay-pos-catalog-panel">
                  <div className="clay-pos-cat-bar">
                    {['Burgers', 'Pizzas', 'Beverages'].map(cat => (
                      <button 
                        key={cat} 
                        onClick={() => setPosCat(cat)}
                        className={`clay-pos-cat-btn ${posCat === cat ? 'active' : ''}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="clay-pos-dishes-grid">
                    {sampleDishes.filter(d => d.cat === posCat).map(item => {
                      const inCart = posCart.find(p => p.id === item.id);
                      return (
                        <div 
                          key={item.id}
                          onClick={() => addPosItem(item)}
                          className="clay-pos-dish-card"
                        >
                          <span className="clay-pos-dish-name">{item.name}</span>
                          <div className="clay-pos-dish-bottom">
                            <span className="clay-pos-dish-price">₹{item.price}</span>
                            <span className="clay-pos-dish-add-btn">
                              {inCart ? `+${inCart.qty}` : '+ Add'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Desktop Cart View */}
                <div className="clay-pos-cart-panel">
                  <div className="clay-pos-cart-header">
                    <span>Table 04 · Dine In</span>
                    <span className="clay-pos-cart-badge">{posCart.reduce((s, i) => s + i.qty, 0)} items</span>
                  </div>

                  <div className="clay-pos-cart-items">
                    {posCart.map((item, idx) => (
                      <div key={idx} className="clay-pos-cart-row">
                        <div>
                          <div className="clay-pos-cart-item-name">{item.name}</div>
                          <div className="clay-pos-cart-item-qty">x{item.qty}</div>
                        </div>
                        <span className="clay-pos-cart-item-price">₹{item.price * item.qty}</span>
                      </div>
                    ))}
                  </div>

                  <div className="clay-pos-cart-footer">
                    <div className="clay-pos-cart-total-row">
                      <span>Total:</span>
                      <span>₹{posTotal}</span>
                    </div>
                    <button 
                      onClick={() => setIsPaid(true)}
                      className={`clay-pos-pay-btn ${isPaid ? 'paid' : ''}`}
                    >
                      {isPaid ? '✓ Paid · Receipt Printed' : 'Instant Checkout (Cash/UPI)'}
                    </button>
                  </div>
                </div>

                {/* Mobile-Only Docked Checkout Bar */}
                <div className="clay-pos-mobile-dock">
                  <div className="clay-pos-mobile-dock-info">
                    <span className="clay-pos-mobile-dock-label">Table 04 · {posCart.reduce((s, i) => s + i.qty, 0)} items</span>
                    <span className="clay-pos-mobile-dock-total">₹{posTotal}</span>
                  </div>
                  <button 
                    onClick={() => setIsPaid(true)}
                    className={`clay-pos-mobile-dock-btn ${isPaid ? 'paid' : ''}`}
                  >
                    {isPaid ? '✓ Paid · Printed' : `Pay ₹${posTotal} →`}
                  </button>
                </div>
              </div>
            )}

            {/* KDS TAB */}
            {activeTab === 'kds' && (
              <div className="clay-kds-grid">
                {kdsOrders.map(order => (
                  <div 
                    key={order.id} 
                    className={`clay-kds-ticket ${order.done ? 'ticket-done' : order.urgent ? 'ticket-urgent' : 'ticket-cooking'}`}
                  >
                    <div className="clay-kds-ticket-header">
                      <span className="clay-kds-ticket-table">{order.table}</span>
                      <span className={`clay-kds-badge ${order.done ? 'badge-done' : order.urgent ? 'badge-urgent' : 'badge-cooking'}`}>
                        {order.done ? '✓ Ready to Serve' : order.time}
                      </span>
                    </div>
                    <div className="clay-kds-items-list">
                      {order.items.map((it, i) => (
                        <div key={i} className="clay-kds-item-row">
                          <span className="clay-kds-item-bullet" />
                          <span>{it}</span>
                        </div>
                      ))}
                    </div>
                    {!order.done ? (
                      <button 
                        onClick={() => markKdsDone(order.id)}
                        className="clay-kds-action-btn"
                      >
                        Mark Done & Dispatch
                      </button>
                    ) : (
                      <div className="clay-kds-dispatched-label">
                        <span>✓ Dispatched to Expediter</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* TABLES TAB */}
            {activeTab === 'tables' && (
              <div className="clay-tables-grid">
                {[
                  { name: 'Table 1', guests: '4 Guests', status: 'Occupied', bill: '₹1,450', color: '#ecfdf5', text: '#059669' },
                  { name: 'Table 2', guests: '2 Guests', status: 'Billed', bill: '₹890', color: '#fffbeb', text: '#b45309' },
                  { name: 'Table 3', guests: '6 Guests', status: 'Available', bill: '—', color: '#fafafa', text: '#71717a' },
                  { name: 'Table 4', guests: '2 Guests', status: 'Occupied', bill: '₹620', color: '#ecfdf5', text: '#059669' },
                ].map((t, idx) => (
                  <div key={idx} style={{ background: t.color, border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px' }}>
                      <span>{t.name}</span>
                      <span style={{ fontSize: '11px', color: '#71717a' }}>{t.guests}</span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, margin: '6px 0' }}>{t.bill}</div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: t.text }}>{t.status}</span>
                  </div>
                ))}
              </div>
            )}

            {/* INSIGHTS TAB */}
            {activeTab === 'insights' && (
              <div className="clay-insights-grid">
                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 600 }}>GROSS SALES TODAY</div>
                  <div style={{ fontSize: '26px', fontWeight: 800, margin: '4px 0' }}>₹48,920</div>
                  <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>↑ +24% vs. previous Tuesday</div>
                </div>
                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 600 }}>TABLE TURNOVER TIME</div>
                  <div style={{ fontSize: '26px', fontWeight: 800, margin: '4px 0' }}>32 mins</div>
                  <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>14% faster cook throughput</div>
                </div>
                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 600 }}>TOP PROFIT MARGIN DISH</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, margin: '4px 0' }}>Truffle Fries</div>
                  <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>78% contribution margin</div>
                </div>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* Most-Selling Features First */}
      <section className="clay-story-container" id="features">
        <div className="clay-section-head">
          <h2>Everything restaurant owners need to thrive</h2>
          <p>The core capabilities designed to maximize operational speed and protect your profit margins.</p>
        </div>

        {/* Feature 1: Rapid 2-Tap POS Billing */}
        <div className="clay-story-card">
          <div className="clay-story-content">
            <span className="clay-story-pill">POS Speed</span>
            <h3 className="clay-story-title">Clear checkout lines twice as fast</h3>
            <p className="clay-story-desc">
              Accelerate rush-hour billing with rapid 2-tap ordering, instant modifier search, and offline fallback.
            </p>
            <div className="clay-story-chips">
              <span className="clay-story-chip"><Zap size={13} color="#059669" /> 1.2s Kitchen Sync</span>
              <span className="clay-story-chip"><Receipt size={13} color="#059669" /> 2-Tap Checkout</span>
              <span className="clay-story-chip"><ShieldCheck size={13} color="#059669" /> 100% Offline Cache</span>
            </div>
          </div>

          <div className="clay-story-widget">
            <div className="clay-story-widget-head">
              <span className="clay-story-widget-title">Rush Throughput Benchmark</span>
              <span className="clay-story-widget-status">● 2.4x Speed Advantage</span>
            </div>
            <div className="clay-story-widget-list">
              <div className="clay-story-widget-row">
                <span>Classic Cheeseburger + Coke</span>
                <span className="clay-story-widget-val">2 Taps</span>
              </div>
              <div className="clay-story-widget-row">
                <span>Split 50/50 Card & UPI</span>
                <span className="clay-story-widget-val">1 Tap</span>
              </div>
              <div className="clay-story-widget-row">
                <span>ESC/POS Receipt Auto-Fire</span>
                <span className="clay-story-widget-val">Instant</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 2: 0% Commission Direct Ordering */}
        <div className="clay-story-card">
          <div className="clay-story-content">
            <span className="clay-story-pill">Direct Ordering</span>
            <h3 className="clay-story-title">Zero-commission direct takeout & QR menus</h3>
            <p className="clay-story-desc">
              Turn QR table scans and web links into direct sales with instant UPI/card payments and no aggregator cuts.
            </p>
            <div className="clay-story-chips">
              <span className="clay-story-chip"><DollarSign size={13} color="#059669" /> 0% Commission Cut</span>
              <span className="clay-story-chip"><Globe size={13} color="#059669" /> App-Free Web Menu</span>
              <span className="clay-story-chip"><CreditCard size={13} color="#059669" /> Direct UPI & Cards</span>
            </div>
          </div>

          <div className="clay-story-widget">
            <div className="clay-story-widget-head">
              <span className="clay-story-widget-title"><Calculator size={14} /> Commission Savings Calculator</span>
              <span className="clay-story-widget-status">● Keep 100% Revenue</span>
            </div>
            <div style={{ fontSize: '11px', color: '#71717a', margin: '4px 0 2px' }}>
              Monthly direct online / takeaway volume:
            </div>
            <input 
              type="range" 
              min="50000" 
              max="1000000" 
              step="25000" 
              value={monthlySales} 
              onChange={e => setMonthlySales(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#059669', margin: '6px 0' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700 }}>
              <span>Monthly Volume: ₹{monthlySales.toLocaleString()}</span>
            </div>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px', borderRadius: '6px', textAlign: 'center', marginTop: '6px' }}>
              <div style={{ fontSize: '11px', color: '#065f46', fontWeight: 600 }}>Estimated Commission Saved:</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#059669', margin: '2px 0' }}>₹{commissionSaved.toLocaleString()} / mo</div>
              <div style={{ fontSize: '10px', color: '#047857' }}>Saved vs. 25% aggregator platform commissions</div>
            </div>
          </div>
        </div>

        {/* Feature 3: Kitchen Display System (KDS) */}
        <div className="clay-story-card">
          <div className="clay-story-content">
            <span className="clay-story-pill">Kitchen KDS</span>
            <h3 className="clay-story-title">Paperless kitchen dispatch with live timers</h3>
            <p className="clay-story-desc">
              Route orders to designated grill, bar, and oven screens with color-coded countdown alerts before delays occur.
            </p>
            <div className="clay-story-chips">
              <span className="clay-story-chip"><ChefHat size={13} color="#059669" /> Station Routing</span>
              <span className="clay-story-chip"><Clock size={13} color="#059669" /> Countdown Alerts</span>
              <span className="clay-story-chip"><Tv size={13} color="#059669" /> Live Token TV Sync</span>
            </div>
          </div>

          <div className="clay-story-widget">
            <div className="clay-story-widget-head">
              <span className="clay-story-widget-title">Live Cook Station Routing</span>
              <span className="clay-story-widget-status">● 3 Active Lines</span>
            </div>
            <div className="clay-story-widget-list">
              <div className="clay-story-widget-row">
                <div>
                  <div style={{ fontWeight: 600, color: '#09090b' }}>Grill & Fryer Line</div>
                  <div style={{ fontSize: '11px', color: '#71717a' }}>Burgers, Steaks, Fries</div>
                </div>
                <span className="clay-story-widget-val">Avg 6m prep</span>
              </div>
              <div className="clay-story-widget-row">
                <div>
                  <div style={{ fontWeight: 600, color: '#09090b' }}>Pizza & Oven Line</div>
                  <div style={{ fontSize: '11px', color: '#71717a' }}>Margherita, Flatbreads</div>
                </div>
                <span className="clay-story-widget-val">Avg 9m prep</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 4: Recipe Stock & Cash Audits */}
        <div className="clay-story-card">
          <div className="clay-story-content">
            <span className="clay-story-pill">Inventory & Audits</span>
            <h3 className="clay-story-title">Recipe-level stock deduction on every sale</h3>
            <p className="clay-story-desc">
              Auto-deplete portions in grams as orders fire with automated low-stock warnings and shift cash audits.
            </p>
            <div className="clay-story-chips">
              <span className="clay-story-chip"><Layers size={13} color="#059669" /> Gram Precision</span>
              <span className="clay-story-chip"><Flame size={13} color="#059669" /> Real-Time Depletion</span>
              <span className="clay-story-chip"><ShieldCheck size={13} color="#059669" /> Shift PIN Audits</span>
            </div>
          </div>

          <div className="clay-story-widget">
            <div className="clay-story-widget-head">
              <span className="clay-story-widget-title">Live Ingredient Ledger</span>
              <span className="clay-story-widget-status">● Real-Time Sync</span>
            </div>
            <div className="clay-story-widget-list">
              <div className="clay-story-widget-row">
                <span>Brioche Burger Buns</span>
                <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '11px' }}>14 Left (Low)</span>
              </div>
              <div className="clay-story-widget-row">
                <span>Mozzarella Cheese</span>
                <span style={{ color: '#059669', fontWeight: 700, fontSize: '11px' }}>2.4kg (Healthy)</span>
              </div>
              <div className="clay-story-widget-row">
                <span>Matcha Green Tea</span>
                <span style={{ color: '#059669', fontWeight: 700, fontSize: '11px' }}>450g (Healthy)</span>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Factual Direct Comparison Table */}
      <section className="clay-compare-section" id="compare">
        <div className="clay-section-head">
          <h2>How DineOS compares to traditional POS</h2>
          <p>See why independent restaurants are replacing expensive, locked terminals with DineOS.</p>
        </div>

        <div className="clay-compare-table">
          <div className="clay-compare-head">
            <div>Feature</div>
            <div className="dineos-col">✨ DineOS Modern Platform</div>
            <div>Traditional POS Terminals</div>
          </div>

          {[
            {
              title: "Hardware Choice",
              dineos: "Runs on any iPad, tablet, PC, Mac, or phone",
              legacy: "Locked to costly $1,500+ proprietary hardware terminals"
            },
            {
              title: "Online Order Commissions",
              dineos: "0% commission — you keep 100% of direct customer spend",
              legacy: "15% to 30% cut taken on every takeaway & delivery order"
            },
            {
              title: "Kitchen Display (KDS)",
              dineos: "Included digital kitchen screens on any browser or tablet",
              legacy: "Expensive $800+ hardware add-on or paper ticket rolls"
            },
            {
              title: "Offline Reliability",
              dineos: "Keeps taking orders & printing receipts when Wi-Fi drops",
              legacy: "System freezes and halts checkout during internet outages"
            },
            {
              title: "Setup & Onboarding",
              dineos: "Ready in 5 minutes with self-serve instant setup",
              legacy: "Weeks of waiting for paid technician on-site visits"
            },
            {
              title: "Contracts & Pricing",
              dineos: "Flexible month-to-month plan — cancel anytime",
              legacy: "Multi-year locked contracts with steep termination fees"
            }
          ].map((row, idx) => (
            <div key={idx} className="clay-compare-row">
              <div className="clay-compare-feature-title">{row.title}</div>
              
              <div className="clay-compare-dineos-cell">
                <div className="clay-compare-mobile-label dineos-label">
                  <span className="clay-compare-brand-dot" /> DineOS
                </div>
                <div className="clay-check-badge">
                  <Check size={14} color="#059669" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{row.dineos}</span>
                </div>
              </div>

              <div className="clay-compare-legacy-cell">
                <div className="clay-compare-mobile-label legacy-label">
                  Traditional POS
                </div>
                <div className="clay-cross-badge">
                  <X size={14} color="#ef4444" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{row.legacy}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="clay-faq-section" id="faq">
        <div className="clay-section-head">
          <h2>Frequently asked questions</h2>
          <p>Key information regarding setup, printers, and subscriptions.</p>
        </div>

        <div className="clay-faq-list">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="clay-faq-item">
                <button 
                  className="clay-faq-btn" 
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={16} color="#71717a" /> : <ChevronDown size={16} color="#71717a" />}
                </button>
                {isOpen && (
                  <div className="clay-faq-body">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Final Conversion CTA Band */}
      <section className="clay-cta-band">
        <h2>Ready to run your restaurant with precision?</h2>
        <p>Join independent restaurants eliminating kitchen chaos and protecting 100% of their earnings.</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/login?mode=register" className="neo-btn-cta">
            Start 14-Day Free Trial <ArrowRight size={14} />
          </Link>
          <button onClick={() => setIsDemoModalOpen(true)} className="neo-btn" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}>
            <Play size={12} /> Launch Live Demo
          </button>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="neo-footer">
        <div className="neo-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/ricon.svg" alt="DineOS Logo" style={{ width: '22px', height: '22px' }} />
            <span style={{ fontWeight: 700, fontSize: '15px' }}>DineOS</span>
            <span style={{ color: '#a1a1aa' }}>&copy; {new Date().getFullYear()}</span>
          </div>

          <ul className="neo-footer-links">
            <li><a href="#workstation">Workstation</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#compare">Comparison</a></li>
            <li><a href="#faq">FAQ</a></li>
            <li><Link to="/login">{t('signIn') || 'Sign In'}</Link></li>
          </ul>
        </div>
      </footer>

      {/* DEMO MODAL */}
      {isDemoModalOpen && (
        <div className="neo-demo-modal-overlay" onClick={() => setIsDemoModalOpen(false)}>
          <div className="neo-demo-modal" onClick={e => e.stopPropagation()}>
            <button className="neo-demo-close-btn" onClick={() => setIsDemoModalOpen(false)}>
              <X size={16} />
            </button>
            <div className="neo-demo-header">
              <h2>Select Demo Account</h2>
              <p>Explore DineOS with pre-configured menus and live orders.</p>
            </div>
            
            <div className="neo-demo-cards">
              <div className="neo-demo-card">
                <h3><ShieldCheck size={15} /> Admin / Owner Access</h3>
                <p style={{ color: '#52525b', fontSize: '12px', margin: '0 0 12px 0' }}>Analytics, payroll, menu editing, and floor settings.</p>
                <div className="neo-demo-credentials">
                  <div className="neo-demo-cred-row">
                    <span className="neo-demo-cred-label">Email</span>
                    <span className="neo-demo-cred-val">demo@kiwi.com</span>
                  </div>
                  <div className="neo-demo-cred-row">
                    <span className="neo-demo-cred-label">Password</span>
                    <span className="neo-demo-cred-val">password123</span>
                  </div>
                </div>
                <Link to="/login?mode=email&demo=admin" className="neo-btn neo-btn-primary" style={{ width: '100%', marginTop: '14px', fontSize: '12px' }}>
                  Login as Admin →
                </Link>
              </div>

              <div className="neo-demo-card">
                <h3><Users size={15} /> Staff / Waiter Access</h3>
                <p style={{ color: '#52525b', fontSize: '12px', margin: '0 0 12px 0' }}>Fast POS register checkout and table ordering.</p>
                <div className="neo-demo-credentials">
                  <div className="neo-demo-cred-row">
                    <span className="neo-demo-cred-label">Restaurant</span>
                    <span className="neo-demo-cred-val">kiwi</span>
                  </div>
                  <div className="neo-demo-cred-row">
                    <span className="neo-demo-cred-label">PIN</span>
                    <span className="neo-demo-cred-val">1234</span>
                  </div>
                </div>
                <Link to="/login?mode=pin&demo=staff" className="neo-btn neo-btn-primary" style={{ width: '100%', marginTop: '14px', fontSize: '12px' }}>
                  Login with PIN →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
