import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { 
  Laptop, Map, ChefHat, Globe, Package, Users, 
  UtensilsCrossed, X, LayoutDashboard, LayoutGrid, 
  Receipt, Settings, Search, 
  MousePointer2, CheckCircle2, Loader2,
  Check, X as XIcon, ChevronDown, ChevronUp,
  Sparkles, ArrowRight,
  BarChart3, Award, QrCode
} from 'lucide-react';
import '../landing-neo.css';

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { user, staffDoc } = useAuthStore();
  const isAuth = !!user || !!staffDoc;
  const isRtl = i18n.language === 'ar';

  const [isMobileView, setIsMobileView] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [showcaseTab, setShowcaseTab] = useState('pos'); // 'pos', 'kds', 'tables', 'insights', 'online'

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');
  };

  // --- ANIMATED POS STATE ---
  const [activeCategory, setActiveCategory] = useState('All Items');
  const [mockCart, setMockCart] = useState([]);
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 90, opacity: 0, click: false });
  const [checkoutStatus, setCheckoutStatus] = useState('idle');

  const mockCategories = ['All Items', 'Burgers', 'Pizzas', 'Beverages'];
  const allMockItems = [
    { id: 'm1', name: 'Classic Cheeseburger', category: 'Burgers', price: 180, emoji: '🍔' },
    { id: 'm2', name: 'Double Bacon Burger', category: 'Burgers', price: 240, emoji: '🥓' },
    { id: 'm3', name: 'Margherita Pizza', category: 'Pizzas', price: 350, emoji: '🍕' },
    { id: 'm4', name: 'Pepperoni Feast', category: 'Pizzas', price: 450, emoji: '🍕' },
    { id: 'm5', name: 'Iced Matcha', category: 'Beverages', price: 140, emoji: '🍵' },
    { id: 'm6', name: 'Cold Brew', category: 'Beverages', price: 160, emoji: '☕' },
    { id: 'm7', name: 'Truffle Fries', category: 'Burgers', price: 180, emoji: '🍟' },
    { id: 'm8', name: 'Veggie Supreme', category: 'Pizzas', price: 400, emoji: '🥗' },
  ];

  const displayItems = activeCategory === 'All Items' 
    ? allMockItems 
    : allMockItems.filter(i => i.category === activeCategory);

  const getCartTotal = () => mockCart.reduce((acc, item) => acc + (item.qty * item.price), 0);

  useEffect(() => {
    if (showcaseTab !== 'pos') return;
    let isActive = true;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const runAnimation = async () => {
      while (isActive && showcaseTab === 'pos') {
        setMockCart([]);
        setActiveCategory('All Items');
        setCheckoutStatus('idle');
        setCursorPos({ x: 50, y: 90, opacity: 0, click: false });
        await sleep(1500);
        if (!isActive) break;

        setCursorPos({ x: 50, y: 90, opacity: 1, click: false });
        await sleep(500);

        // 1. Move to Burgers Category
        setCursorPos({ x: 22, y: 15, opacity: 1, click: false });
        await sleep(800);
        if (!isActive) break;
        setCursorPos({ x: 22, y: 15, opacity: 1, click: true });
        setActiveCategory('Burgers');
        await sleep(200);
        setCursorPos({ x: 22, y: 15, opacity: 1, click: false });
        await sleep(600);

        // 2. Click Double Bacon Burger
        setCursorPos({ x: 38, y: 45, opacity: 1, click: false });
        await sleep(800);
        if (!isActive) break;
        setCursorPos({ x: 38, y: 45, opacity: 1, click: true });
        setMockCart([{ id: 'm2', name: 'Double Bacon Burger', qty: 1, price: 240 }]);
        await sleep(200);
        setCursorPos({ x: 38, y: 45, opacity: 1, click: false });
        await sleep(600);

        // 3. Move to Beverages
        setCursorPos({ x: 45, y: 15, opacity: 1, click: false });
        await sleep(800);
        if (!isActive) break;
        setCursorPos({ x: 45, y: 15, opacity: 1, click: true });
        setActiveCategory('Beverages');
        await sleep(200);
        setCursorPos({ x: 45, y: 15, opacity: 1, click: false });
        await sleep(600);

        // 4. Click Iced Matcha
        setCursorPos({ x: 20, y: 45, opacity: 1, click: false });
        await sleep(800);
        if (!isActive) break;
        setCursorPos({ x: 20, y: 45, opacity: 1, click: true });
        setMockCart(prev => [...prev, { id: 'm5', name: 'Iced Matcha', qty: 1, price: 140 }]);
        await sleep(200);
        setCursorPos({ x: 20, y: 45, opacity: 1, click: false });
        await sleep(800);

        // 5. Checkout
        setCursorPos({ x: 88, y: 88, opacity: 1, click: false });
        await sleep(800);
        if (!isActive) break;
        setCursorPos({ x: 88, y: 88, opacity: 1, click: true });
        setCheckoutStatus('processing');
        await sleep(300);
        setCursorPos({ x: 88, y: 88, opacity: 1, click: false });
        await sleep(1000);
        if (!isActive) break;
        setCheckoutStatus('success');
        await sleep(2500);

        setCursorPos(prev => ({ ...prev, opacity: 0 }));
        await sleep(1000);
      }
    };

    if (!isMobileView) {
      runAnimation();
    }
    return () => { isActive = false; };
  }, [isMobileView, showcaseTab]);

  const faqs = [
    {
      q: "Do I need to buy expensive proprietary POS hardware?",
      a: "No! DineOS runs seamlessly on any device with a modern browser — including iPads, Android tablets, Windows PCs, Macs, and smartphones. Use the hardware you already own."
    },
    {
      q: "Does DineOS work with receipt and kitchen ticket printers?",
      a: "Yes! DineOS supports standard ESC/POS 80mm and 58mm thermal printers across USB, Network (Ethernet/LAN), and Bluetooth, as well as digital KDS screens."
    },
    {
      q: "Are there any hidden transaction fees or commissions on online orders?",
      a: "Zero. You get a direct, branded ordering link for your restaurant. You keep 100% of your earnings without giving away 30% to third-party aggregator apps."
    },
    {
      q: "What happens if our restaurant internet disconnects during a rush?",
      a: "DineOS features intelligent local caching. Your team can continue taking orders and printing receipts offline, and all records automatically sync back to the cloud as soon as connection restores."
    },
    {
      q: "Can I manage staff roles and track cash shift drawers?",
      a: "Yes! You can assign granular permissions for Admins, Cashiers, Waiters, and Cooks. Every cash drawer open, close, and discrepancy is logged with one-click end-of-shift reports."
    },
    {
      q: "How fast can we get our restaurant set up?",
      a: "Most owners get their entire menu, categories, and table layout configured in less than 10 minutes. Our built-in Owner's Guide guides you through every step in plain English."
    }
  ];

  return (
    <div className="neo-landing" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      {/* Top Navigation */}
      <nav className="neo-nav">
        <div className="neo-nav-inner">
          <div className="neo-logo">
            <img src="/ricon.svg" alt="DineOS Logo" />
            <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.03em' }}>DineOS</span>
          </div>

          <div className="neo-nav-actions neo-nav-desktop">
            <a href="#showcase" style={{ color: '#666', textDecoration: 'none', fontSize: '14px', fontWeight: 600, margin: '0 8px' }}>
              Features
            </a>
            <a href="#compare" style={{ color: '#666', textDecoration: 'none', fontSize: '14px', fontWeight: 600, margin: '0 8px' }}>
              Why DineOS
            </a>
            <a href="#faq" style={{ color: '#666', textDecoration: 'none', fontSize: '14px', fontWeight: 600, margin: '0 8px' }}>
              FAQ
            </a>

            <button onClick={toggleLanguage} className="neo-lang-btn" title="Toggle Language">
              <Globe size={16} />
              <span>{i18n.language === 'ar' ? 'English' : 'العربية'}</span>
            </button>

            <button onClick={() => setIsDemoModalOpen(true)} className="neo-btn neo-btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
              ⚡ Live Demo
            </button>

            <Link to={isAuth ? "/dashboard" : "/login"} className="neo-btn neo-btn-primary" style={{ padding: '8px 20px', fontSize: '13px' }}>
              {isAuth ? t('goToDashboard') : (t('signIn') || 'Login')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="neo-hero">
        <div className="neo-hero-inner">
          <div className="neo-hero-content">
            <div className="neo-hero-badge-live">
              <span className="neo-live-dot" />
              <span>DineOS 2.0 · Intelligent Restaurant Operating System</span>
            </div>

            <h1 className="neo-hero-title">
              Run your restaurant.<br />
              <span className="stroke-text">Not spreadsheets.</span>
            </h1>

            <p className="neo-hero-subtitle">
              The modern POS, visual table manager, kitchen display (KDS), and commission-free online ordering platform engineered to maximize speed and protect your profit margins.
            </p>

            <div className="neo-hero-actions">
              <Link to="/login?mode=register" className="neo-btn neo-btn-primary neo-shadow-lg" style={{ gap: '8px', padding: '14px 28px', fontSize: '16px' }}>
                Start Free Trial <ArrowRight size={18} />
              </Link>
              <button onClick={() => setIsDemoModalOpen(true)} className="neo-btn neo-btn-secondary neo-shadow-sm" style={{ padding: '14px 24px', fontSize: '16px' }}>
                ⚡ Explore Live Demo
              </button>
            </div>

            <div className="neo-trust-pills">
              <span className="neo-trust-pill"><Check size={16} color="#16a34a" /> 0% Commission on Orders</span>
              <span className="neo-trust-pill"><Check size={16} color="#16a34a" /> Runs on any Tablet or PC</span>
              <span className="neo-trust-pill"><Check size={16} color="#16a34a" /> Zero Hardware Lock-in</span>
              <span className="neo-trust-pill"><Check size={16} color="#16a34a" /> Thermal & KOT Ready</span>
            </div>
          </div>

          {/* Interactive Feature Showcase Browser */}
          <div className="neo-showcase-container" id="showcase">
            <div className="neo-showcase-tabs">
              <button 
                className={`neo-showcase-tab-btn ${showcaseTab === 'pos' ? 'active' : ''}`}
                onClick={() => setShowcaseTab('pos')}
                type="button"
              >
                <Laptop size={15} /> <span>POS Billing</span>
              </button>
              <button 
                className={`neo-showcase-tab-btn ${showcaseTab === 'kds' ? 'active' : ''}`}
                onClick={() => setShowcaseTab('kds')}
                type="button"
              >
                <ChefHat size={15} /> <span>Kitchen KDS</span>
              </button>
              <button 
                className={`neo-showcase-tab-btn ${showcaseTab === 'tables' ? 'active' : ''}`}
                onClick={() => setShowcaseTab('tables')}
                type="button"
              >
                <Map size={15} /> <span>Table Map</span>
              </button>
              <button 
                className={`neo-showcase-tab-btn ${showcaseTab === 'insights' ? 'active' : ''}`}
                onClick={() => setShowcaseTab('insights')}
                type="button"
              >
                <BarChart3 size={15} /> <span>Insights</span>
              </button>
              <button 
                className={`neo-showcase-tab-btn ${showcaseTab === 'online' ? 'active' : ''}`}
                onClick={() => setShowcaseTab('online')}
                type="button"
              >
                <QrCode size={15} /> <span>QR & Web</span>
              </button>
            </div>

            {/* Browser Window Wrapper */}
            <div className="neo-browser">
              <div className="neo-browser-header">
                <div className="neo-browser-dots">
                  <span className="neo-browser-dot red"></span>
                  <span className="neo-browser-dot yellow"></span>
                  <span className="neo-browser-dot green"></span>
                </div>
                <span className="neo-browser-status">
                  {showcaseTab === 'pos' && 'LIVE POS TERMINAL — INSTANT BILLING'}
                  {showcaseTab === 'kds' && 'KITCHEN DISPLAY SCREEN (KDS) — REALTIME TICKETS'}
                  {showcaseTab === 'tables' && 'FLOOR MAP & TABLE TURNOVER MONITOR'}
                  {showcaseTab === 'insights' && 'PROFIT & BEST-SELLER MARGIN INTELLIGENCE'}
                  {showcaseTab === 'online' && 'COMMISSION-FREE DIRECT ORDERING LINK'}
                </span>
              </div>
              
              <div className="neo-browser-body">
                {/* TAB 1: POS TERMINAL */}
                {showcaseTab === 'pos' && (
                  <>
                    {!isMobileView && (
                      <div 
                        className={`neo-fake-cursor ${cursorPos.click ? 'clicking' : ''}`}
                        style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%`, opacity: cursorPos.opacity }}
                      >
                        <MousePointer2 size={28} fill="currentColor" />
                      </div>
                    )}

                    <div className="neo-mock-sidebar">
                      <LayoutDashboard className="neo-mock-sidebar-icon" />
                      <LayoutGrid className="neo-mock-sidebar-icon active" />
                      <Receipt className="neo-mock-sidebar-icon" />
                      <Map className="neo-mock-sidebar-icon" />
                      <Settings className="neo-mock-sidebar-icon" style={{ marginTop: 'auto', marginBottom: '20px' }} />
                    </div>

                    <div className="neo-mock-main">
                      <div className="neo-mock-topbar">
                        <div className="neo-mock-search">
                          <Search size={16} /> Search dishes, tags, barcodes...
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#22c55e', background: '#dcfce7', padding: '4px 10px', borderRadius: '50px' }}>
                          ● Shift Active (Drawer: ₹4,500)
                        </div>
                      </div>

                      <div className="neo-mock-categories">
                        {mockCategories.map(cat => (
                          <div 
                            key={cat} 
                            onClick={() => setActiveCategory(cat)}
                            className={`neo-mock-cat-btn ${activeCategory === cat ? 'active' : ''}`}
                            style={{ cursor: 'pointer' }}
                          >
                            {cat}
                          </div>
                        ))}
                      </div>

                      <div className="neo-mock-grid">
                        {displayItems.map(item => (
                          <div 
                            key={item.id} 
                            className="neo-mock-item"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setMockCart(prev => {
                              const exists = prev.find(p => p.id === item.id);
                              if (exists) return prev.map(p => p.id === item.id ? { ...p, qty: p.qty + 1 } : p);
                              return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
                            })}
                          >
                            <div className="neo-mock-item-img">{item.emoji}</div>
                            <div className="neo-mock-item-info">
                              <div className="neo-mock-item-name">{item.name}</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="neo-mock-item-price">₹{item.price}</div>
                                {item.price > 200 && (
                                  <span style={{ fontSize: '10px', color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>⭐ High Margin</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="neo-mock-cart">
                      <div className="neo-mock-cart-header">
                        <UtensilsCrossed size={18} /> Table 04 · Dine In
                      </div>
                      
                      <div className="neo-mock-cart-toggle">
                        <div className="neo-mock-cart-toggle-btn active">Dine In</div>
                        <div className="neo-mock-cart-toggle-btn">Takeaway</div>
                        <div className="neo-mock-cart-toggle-btn">Online</div>
                      </div>

                      <div className="neo-mock-cart-items">
                        {mockCart.length > 0 ? mockCart.map((item, idx) => (
                          <div key={idx} className="neo-mock-cart-item">
                            <div className="neo-mock-item-row">
                              <span className="neo-mock-cart-name">{item.name}</span>
                              <span style={{ fontSize: '12px', color: '#888' }}>x{item.qty}</span>
                            </div>
                            <span className="neo-mock-cart-price">₹{item.price * item.qty}</span>
                          </div>
                        )) : (
                          <div className="neo-mockup-cart-empty">
                            Tap any item to add to order
                          </div>
                        )}
                      </div>

                      <div className="neo-mock-cart-footer">
                        <div className="neo-mock-cart-total">
                          <span>Total (Incl. Tax)</span>
                          <span>₹{getCartTotal()}</span>
                        </div>
                        
                        <button 
                          className={`neo-mock-checkout-btn ${checkoutStatus}`}
                          onClick={() => {
                            setCheckoutStatus('processing');
                            setTimeout(() => setCheckoutStatus('success'), 1000);
                            setTimeout(() => { setCheckoutStatus('idle'); setMockCart([]); }, 3000);
                          }}
                        >
                          {checkoutStatus === 'idle' && '💳 Instant Checkout'}
                          {checkoutStatus === 'processing' && <><Loader2 size={18} className="animate-spin" /> Processing...</>}
                          {checkoutStatus === 'success' && <><CheckCircle2 size={18} /> Paid · KOT Sent 🍳</>}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* TAB 2: KITCHEN DISPLAY (KDS) */}
                {showcaseTab === 'kds' && (
                  <div style={{ width: '100%', height: '100%', padding: '24px', background: '#0f172a', color: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '16px' }}>🍳 Kitchen Display System (KDS)</span>
                        <span style={{ background: '#334155', padding: '2px 8px', borderRadius: '50px', fontSize: '11px' }}>Station: All Hot & Cold</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8' }}>3 Active Orders · Avg Cook Time: 8.5m</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '16px', border: '1px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: '15px' }}>Table 02</span>
                          <span style={{ background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>⏳ 12:40 (Urgent)</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div>• 2x Double Bacon Burger (No Onion)</div>
                          <div>• 1x Truffle Fries (Extra Mayo)</div>
                        </div>
                        <button style={{ marginTop: 'auto', background: '#22c55e', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                          ✅ Mark Ready to Serve
                        </button>
                      </div>

                      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '16px', border: '1px solid #eab308', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: '15px' }}>Table 05</span>
                          <span style={{ background: '#eab308', color: '#000', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>🍳 04:15 Cooking</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div>• 1x Margherita Pizza 12"</div>
                          <div>• 1x Veggie Supreme 12"</div>
                        </div>
                        <button style={{ marginTop: 'auto', background: '#3b82f6', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                          🍳 Finish Cooking
                        </button>
                      </div>

                      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '16px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: '15px' }}>Online #108</span>
                          <span style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>🛵 01:20 New</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div>• 2x Iced Matcha Latte</div>
                          <div>• 1x Cold Brew Coffee</div>
                        </div>
                        <button style={{ marginTop: 'auto', background: '#334155', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                          ▶ Start Prep
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: TABLE MAP */}
                {showcaseTab === 'tables' && (
                  <div style={{ width: '100%', height: '100%', padding: '24px', background: '#fafaf9', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '15px' }}>🗺️ Main Dining Room (12 Tables · 75% Occupancy)</div>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} /> Occupied (6)</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} /> Billed (2)</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e2e8f0' }} /> Free (4)</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', flex: 1 }}>
                      {[
                        { name: 'Table 1', guests: '4 Guests', status: 'Occupied', bill: '₹1,450', time: '38m', color: '#dcfce7', border: '#86efac' },
                        { name: 'Table 2', guests: '2 Guests', status: 'Billed', bill: '₹890', time: '52m', color: '#fef9c3', border: '#fde047' },
                        { name: 'Table 3', guests: '6 Guests', status: 'Free', bill: '—', time: 'Ready', color: '#ffffff', border: '#e2e8f0' },
                        { name: 'Table 4', guests: '2 Guests', status: 'Occupied', bill: '₹620', time: '14m', color: '#dcfce7', border: '#86efac' },
                        { name: 'Table 5', guests: '4 Guests', status: 'Occupied', bill: '₹2,100', time: '45m', color: '#dcfce7', border: '#86efac' },
                        { name: 'Table 6', guests: '8 Guests', status: 'Free', bill: '—', time: 'Ready', color: '#ffffff', border: '#e2e8f0' },
                        { name: 'Table 7', guests: '2 Guests', status: 'Billed', bill: '₹1,280', time: '1h 05m', color: '#fef9c3', border: '#fde047' },
                        { name: 'Table 8', guests: '4 Guests', status: 'Free', bill: '—', time: 'Ready', color: '#ffffff', border: '#e2e8f0' },
                      ].map((t, idx) => (
                        <div key={idx} style={{ background: t.color, border: `1px solid ${t.border}`, borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, fontSize: '14px' }}>{t.name}</span>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>{t.guests}</span>
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 800, margin: '8px 0' }}>{t.bill}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{t.status}</span>
                            <span>⏱️ {t.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 4: INSIGHTS & MARGINS */}
                {showcaseTab === 'insights' && (
                  <div style={{ width: '100%', height: '100%', padding: '24px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>TODAY'S GROSS REVENUE</div>
                        <div style={{ fontSize: '28px', fontWeight: 800, margin: '4px 0' }}>₹48,920</div>
                        <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>↑ +24% vs last Tuesday</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>AVG TABLE TURN TIME</div>
                        <div style={{ fontSize: '28px', fontWeight: 800, margin: '4px 0' }}>32 mins</div>
                        <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>↓ 14% faster cook speed</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>TOP MARGIN DISH</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, margin: '4px 0' }}>Truffle Fries ⭐</div>
                        <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 600 }}>78% Profit Margin</div>
                      </div>
                    </div>

                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '16px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <Sparkles size={24} color="#d97706" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#92400e' }}>Smart Action Item Generated</div>
                        <div style={{ fontSize: '13px', color: '#b45309' }}>"UPI is 72% of payments today. Ensure QR stands are placed on Tables 1-8 to speed up turnover."</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 5: QR & ONLINE */}
                {showcaseTab === 'online' && (
                  <div style={{ width: '100%', height: '100%', padding: '24px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
                    <div style={{ maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ background: '#22c55e', color: '#fff', display: 'inline-flex', padding: '4px 10px', borderRadius: '50px', fontSize: '12px', fontWeight: 700, width: 'fit-content' }}>
                        0% Commission Always
                      </div>
                      <h3 style={{ fontSize: '22px', fontWeight: 800 }}>Direct Customer Ordering Link & QR Standees</h3>
                      <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
                        Generate your own shareable URL (<code>dineos.app/order/my-cafe</code>) and place QR codes on tables. Orders print straight to the kitchen instantly.
                      </p>
                    </div>

                    <div style={{ width: '260px', background: '#fff', borderRadius: '24px', padding: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                      <div style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px' }}>DineOS Cafe & Bistro</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Scan or Order Online</div>
                      </div>
                      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span>🍔 Classic Cheeseburger</span>
                          <span style={{ fontWeight: 700 }}>₹180</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span>🍟 Truffle Fries</span>
                          <span style={{ fontWeight: 700 }}>₹180</span>
                        </div>
                      </div>
                      <button style={{ width: '100%', background: '#000', color: '#fff', padding: '8px', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '12px' }}>
                        Place Order (₹360)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Metrics Impact Bar */}
      <section className="neo-metrics-bar">
        <div className="neo-metric-card">
          <div className="neo-metric-val">35%</div>
          <div className="neo-metric-label">Faster table turnover during peak lunch & dinner rush</div>
        </div>
        <div className="neo-metric-card">
          <div className="neo-metric-val">0%</div>
          <div className="neo-metric-label">Commission fees on direct QR dine-in & web delivery</div>
        </div>
        <div className="neo-metric-card">
          <div className="neo-metric-val">&lt; 1.2s</div>
          <div className="neo-metric-label">Order-to-kitchen ticket transmission speed</div>
        </div>
        <div className="neo-metric-card">
          <div className="neo-metric-val">15+ hrs</div>
          <div className="neo-metric-label">Saved per week on cashier reconciliation & inventory math</div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="neo-how-it-works" id="how-it-works">
        <div className="neo-section-header">
          <h2 className="neo-section-title">Up and running in 3 steps</h2>
          <p className="neo-section-subtitle">No IT consultants. No tedious training courses. Your staff will master DineOS in 5 minutes.</p>
        </div>
        <div className="neo-steps-container">
          <div className="neo-steps-line" />
          <div className="neo-step">
            <div className="neo-step-number">1</div>
            <h3 className="neo-step-title">Add your menu</h3>
            <p className="neo-step-desc">Input categories, dish photos, modifier add-ons, and mark high-margin dishes with gold stars.</p>
          </div>
          <div className="neo-step">
            <div className="neo-step-number">2</div>
            <h3 className="neo-step-title">Take live orders</h3>
            <p className="neo-step-desc">Staff tap to bill on any tablet or phone. Orders route instantly to kitchen displays or thermal printers.</p>
          </div>
          <div className="neo-step">
            <div className="neo-step-number">3</div>
            <h3 className="neo-step-title">Track stock & profits</h3>
            <p className="neo-step-desc">Ingredients auto-deduct, cash drawers balance, and smart insights show your top money-makers.</p>
          </div>
        </div>
      </section>

      {/* Comprehensive Bento Grid */}
      <section className="neo-personas">
        <div className="neo-section-header">
          <h2 className="neo-section-title">Engineered for real restaurant operations</h2>
          <p className="neo-section-subtitle">Everything you need to serve guests faster, manage your kitchen, and keep margins healthy.</p>
        </div>
        <div className="neo-bento-grid">
          {/* Card 1 */}
          <div className="neo-bento-card">
            <div className="neo-bento-card-top">
              <div className="neo-feature-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}><Laptop size={24} /></div>
              <span className="neo-bento-badge-tag">Front of House</span>
            </div>
            <h3>Lightning Fast POS</h3>
            <p>2-tap rapid checkout designed for high throughput. Split bills, apply discounts, and accept Cash, Card, and UPI instantly.</p>
            <ul className="neo-bento-bullets">
              <li><Check size={14} color="#16a34a" /> Offline-safe local cache billing</li>
              <li><Check size={14} color="#16a34a" /> Starred high-margin upsell nudges</li>
              <li><Check size={14} color="#16a34a" /> Thermal ESC/POS receipt auto-print</li>
            </ul>
          </div>

          {/* Card 2 */}
          <div className="neo-bento-card">
            <div className="neo-bento-card-top">
              <div className="neo-feature-icon" style={{ background: '#fce7f3', color: '#be185d' }}><ChefHat size={24} /></div>
              <span className="neo-bento-badge-tag">Kitchen Floor</span>
            </div>
            <h3>Paperless Kitchen KDS</h3>
            <p>Ditch lost paper tickets. Large, legible digital cards with color-coded wait timers keep cooks synchronized during intense rushes.</p>
            <ul className="neo-bento-bullets">
              <li><Check size={14} color="#16a34a" /> Grill / Bar / Pastry station routing</li>
              <li><Check size={14} color="#16a34a" /> Audio chimes & TV token callouts</li>
              <li><Check size={14} color="#16a34a" /> Real-time prep time tracking</li>
            </ul>
          </div>

          {/* Card 3 */}
          <div className="neo-bento-card">
            <div className="neo-bento-card-top">
              <div className="neo-feature-icon" style={{ background: '#dcfce7', color: '#15803d' }}><Globe size={24} /></div>
              <span className="neo-bento-badge-tag">Zero Commission</span>
            </div>
            <h3>Direct QR & Web Ordering</h3>
            <p>Give customers their own direct link and table QR standees. Keep 100% of your margins without giving 30% cuts to food aggregators.</p>
            <ul className="neo-bento-bullets">
              <li><Check size={14} color="#16a34a" /> Branded web link with real-time menu</li>
              <li><Check size={14} color="#16a34a" /> Table QR dine-in contact-free order</li>
              <li><Check size={14} color="#16a34a" /> Automated pickup & delivery dispatch</li>
            </ul>
          </div>

          {/* Card 4 */}
          <div className="neo-bento-card">
            <div className="neo-bento-card-top">
              <div className="neo-feature-icon" style={{ background: '#fef3c7', color: '#b45309' }}><Package size={24} /></div>
              <span className="neo-bento-badge-tag">Cost Control</span>
            </div>
            <h3>Recipe-Linked Inventory</h3>
            <p>Ingredients deduct automatically as dishes sell. Get warned before you run out of crucial items on a busy Friday night.</p>
            <ul className="neo-bento-bullets">
              <li><Check size={14} color="#16a34a" /> Gram & millilitre recipe mapping</li>
              <li><Check size={14} color="#16a34a" /> Low-stock automatic alert badges</li>
              <li><Check size={14} color="#16a34a" /> Purchase order & supplier ledger</li>
            </ul>
          </div>

          {/* Card 5 */}
          <div className="neo-bento-card">
            <div className="neo-bento-card-top">
              <div className="neo-feature-icon" style={{ background: '#e0e7ff', color: '#4338ca' }}><Users size={24} /></div>
              <span className="neo-bento-badge-tag">Team & Security</span>
            </div>
            <h3>Staff Shifts & Cash Control</h3>
            <p>Prevent theft and balance drawers effortlessly. Role-based PIN quick-switch lets waiters take orders without accessing sensitive financials.</p>
            <ul className="neo-bento-bullets">
              <li><Check size={14} color="#16a34a" /> 4-digit fast PIN staff switching</li>
              <li><Check size={14} color="#16a34a" /> Shift open/close drawer audit logs</li>
              <li><Check size={14} color="#16a34a" /> Hourly wage & payroll calculation</li>
            </ul>
          </div>

          {/* Card 6 */}
          <div className="neo-bento-card">
            <div className="neo-feature-icon" style={{ background: '#ffedd5', color: '#c2410c' }}><Award size={24} /></div>
            <span className="neo-bento-badge-tag">Guest Retention</span>
          </div>
          <h3>Loyalty, CRM & Gift Cards</h3>
          <p>Turn first-time diners into lifelong regulars. Track customer preferences, issue branded prepaid gift cards, and award spend points.</p>
          <ul className="neo-bento-bullets">
            <li><Check size={14} color="#16a34a" /> Customer taste & birthday profiles</li>
            <li><Check size={14} color="#16a34a" /> Digital gift card issuance & balance</li>
            <li><Check size={14} color="#16a34a" /> Automated point redemptions at POS</li>
          </ul>
        </div>
      </section>

      {/* Comparison Section (Grid-based, Zero HTML Table Quirks) */}
      <section className="neo-comparison-section" id="compare">
        <div className="neo-section-header">
          <h2 className="neo-section-title">Why restaurants switch to DineOS</h2>
          <p className="neo-section-subtitle">See how DineOS compares directly to legacy POS hardware and third-party apps.</p>
        </div>

        <div className="neo-compare-grid-wrapper">
          {/* Header Row */}
          <div className="neo-compare-header-row">
            <div className="neo-compare-col-header feature-col">Feature & Capability</div>
            <div className="neo-compare-col-header dineos-col">
              <span className="neo-live-dot" /> ⚡ DineOS (Modern OS)
            </div>
            <div className="neo-compare-col-header legacy-col">
              ❌ Old POS & Delivery Apps
            </div>
          </div>

          {/* Comparison Rows */}
          {[
            {
              title: "Hardware Flexibility",
              desc: "What devices you can run it on",
              dineos: "Runs on any iPad, Mac, PC, Android tablet, or smartphone you already own",
              legacy: "Locked into expensive proprietary $1,500+ POS hardware terminals"
            },
            {
              title: "Online Order Commissions",
              desc: "Fees per takeaway & delivery order",
              dineos: "0% commission (You keep 100% of revenue on your branded web store)",
              legacy: "15% to 30% commission cut on every single delivery order"
            },
            {
              title: "Staff Training Speed",
              desc: "How long staff take to learn billing",
              dineos: "~5 minutes. Intuitive tap-and-pay UI designed with zero jargon",
              legacy: "Days of painful training with complex menus and thick manuals"
            },
            {
              title: "Kitchen Display (KDS)",
              desc: "Order routing to chefs and baristas",
              dineos: "Built-in paperless KDS screen with cook timers and audio alerts",
              legacy: "Expensive add-on module or paper tickets that get lost in the kitchen"
            },
            {
              title: "Recipe Stock Auto-Deduction",
              desc: "Ingredient tracking as dishes sell",
              dineos: "Automatic gram/ml deduction with instant low-stock warning badges",
              legacy: "Requires costly third-party software integration and manual math"
            },
            {
              title: "Built-in Owner's Guide",
              desc: "Help and feature instructions",
              dineos: "1-Click instant interactive guide drawer directly inside the app",
              legacy: "Slow email ticketing or expensive per-hour support contracts"
            }
          ].map((row, idx) => (
            <div key={idx} className="neo-compare-row">
              <div className="neo-compare-cell feature-cell">
                <div className="neo-compare-cell-title">{row.title}</div>
                <div className="neo-compare-cell-subtitle">{row.desc}</div>
              </div>
              <div className="neo-compare-cell dineos-cell">
                <div className="neo-badge-check">
                  <Check size={14} color="#16a34a" strokeWidth={3} />
                </div>
                <span>{row.dineos}</span>
              </div>
              <div className="neo-compare-cell legacy-cell">
                <div className="neo-badge-cross">
                  <XIcon size={14} color="#ef4444" strokeWidth={3} />
                </div>
                <span>{row.legacy}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Audience Persona Section */}
      <section className="neo-persona-section">
        <div className="neo-section-header">
          <h2 className="neo-section-title">Built for every food & beverage concept</h2>
          <p className="neo-section-subtitle">Whether you run a single espresso bar or a busy multi-station pizzeria.</p>
        </div>
        <div className="neo-persona-grid">
          <div className="neo-persona-card">
            <div className="neo-persona-emoji">☕</div>
            <h3 className="neo-persona-title">Cafes & Bakeries</h3>
            <p className="neo-persona-desc">Rapid counter queueing, milk/syrup modifier add-ons, prepaid loyalty cards, and morning rush optimization.</p>
          </div>
          <div className="neo-persona-card">
            <div className="neo-persona-emoji">🍕</div>
            <h3 className="neo-persona-title">Full Service & Pizzerias</h3>
            <p className="neo-persona-desc">Visual drag-and-drop table layouts, course firing, guest tab transfers, and split payment calculations.</p>
          </div>
          <div className="neo-persona-card">
            <div className="neo-persona-emoji">🍔</div>
            <h3 className="neo-persona-title">QSR & Food Trucks</h3>
            <p className="neo-persona-desc">2-tap billing, sound alerts, TV token queue display, and compact setup on mobile phones or tablets.</p>
          </div>
          <div className="neo-persona-card">
            <div className="neo-persona-emoji">🍱</div>
            <h3 className="neo-persona-title">Cloud Kitchens</h3>
            <p className="neo-persona-desc">Multi-brand order routing, custom delivery zones, rider assignment, and central inventory cost tracking.</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="neo-testimonials">
        <div className="neo-section-header">
          <h2 className="neo-section-title">Trusted by independent restaurants</h2>
          <p className="neo-section-subtitle">Hear why owners made the switch to DineOS.</p>
        </div>
        <div className="neo-testimonials-grid">
          <div className="neo-testimonial-card">
            <div className="neo-stars">★★★★★</div>
            <p className="neo-testimonial-text">"My staff learned how to bill and manage tables in 10 minutes flat. Our Friday night kitchen wait times dropped by almost 15 minutes."</p>
            <div className="neo-testimonial-author">Sarah M. · The Corner Bistro (Mumbai)</div>
          </div>
          <div className="neo-testimonial-card">
            <div className="neo-stars">★★★★★</div>
            <p className="neo-testimonial-text">"The direct QR ordering link saved us over ₹35,000 in aggregator commissions in our first month alone. Absolutely essential software."</p>
            <div className="neo-testimonial-author">David K. · Smokey's Burger Joint (Dubai)</div>
          </div>
          <div className="neo-testimonial-card">
            <div className="neo-stars">★★★★★</div>
            <p className="neo-testimonial-text">"Finally a POS that looks like it was built in 2026. The high-margin star recommendations helped our team increase average check size by 18%."</p>
            <div className="neo-testimonial-author">Elena R. · Bella Italia Pizzeria (London)</div>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="neo-faq-section" id="faq">
        <div className="neo-section-header">
          <h2 className="neo-section-title">Frequently asked questions</h2>
          <p className="neo-section-subtitle">Everything you need to know about setting up and running DineOS.</p>
        </div>
        <div className="neo-faq-container">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="neo-faq-item">
                <button 
                  className="neo-faq-question" 
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={18} color="#666" /> : <ChevronDown size={18} color="#666" />}
                </button>
                {isOpen && (
                  <div className="neo-faq-answer">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* High-Converting CTA Box */}
      <section className="neo-cta-box">
        <h2>Ready to run your restaurant like magic?</h2>
        <p>Join hundreds of restaurants using DineOS to eliminate kitchen chaos, speed up tables, and keep 100% of their earnings.</p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/login?mode=register" className="neo-btn-white">
            Get Started Free <ArrowRight size={18} />
          </Link>
          <button onClick={() => setIsDemoModalOpen(true)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '14px 28px', borderRadius: '100px', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>
            ⚡ Launch Live Demo
          </button>
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '20px' }}>
          ✓ No credit card required · Instant 5-minute setup · Free forever tier
        </div>
      </section>

      {/* Footer */}
      <footer className="neo-footer">
        <div className="neo-footer-inner">
          <div className="neo-footer-brand-col">
            <div className="neo-footer-brand">
              <img src="/ricon.svg" alt="DineOS Logo" />
              <span style={{ fontWeight: 800, fontSize: '18px' }}>DineOS</span>
            </div>
            <p className="neo-footer-tagline">The modern, intuitive operating system for independent restaurants and bars.</p>
          </div>
          
          <div className="neo-footer-links-col" style={{ textAlign: 'right' }}>
            <h4 className="neo-footer-col-title">Navigation</h4>
            <ul className="neo-footer-links">
              <li><a href="#showcase">Interactive Preview</a></li>
              <li><a href="#compare">Why DineOS</a></li>
              <li><a href="#faq">FAQ</a></li>
              <li><Link to="/login">{t('signIn')}</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="neo-footer-bottom">
          <div className="neo-footer-copyright">
            &copy; {new Date().getFullYear()} DineOS. All rights reserved. Built with precision for restaurant owners.
          </div>
        </div>
      </footer>

      {/* DEMO MODAL */}
      {isDemoModalOpen && (
        <div className="neo-demo-modal-overlay" onClick={() => setIsDemoModalOpen(false)}>
          <div className="neo-demo-modal" onClick={e => e.stopPropagation()}>
            <button className="neo-demo-close-btn" onClick={() => setIsDemoModalOpen(false)}>
              <X size={20} />
            </button>
            <div className="neo-demo-header">
              <h2>⚡ Explore Live Demo Accounts</h2>
              <p>Experience the full software with pre-loaded menus, active orders, and table maps.</p>
            </div>
            
            <div className="neo-demo-cards">
              <div className="neo-demo-card">
                <h3>👑 Admin / Owner Access</h3>
                <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>Full access to financial analytics, payroll, menu customization, and restaurant settings.</p>
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
                <Link to="/login?mode=email&demo=admin" className="neo-btn neo-btn-primary" style={{ width: '100%', marginTop: '16px', fontSize: '13px' }}>
                  Login as Admin →
                </Link>
              </div>

              <div className="neo-demo-card">
                <h3>🧑‍🍳 Staff / Waiter Access</h3>
                <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>Fast POS checkout, table map dining orders, and real-time kitchen display (KDS).</p>
                <div className="neo-demo-credentials">
                  <div className="neo-demo-cred-row">
                    <span className="neo-demo-cred-label">Restaurant ID</span>
                    <span className="neo-demo-cred-val">kiwi</span>
                  </div>
                  <div className="neo-demo-cred-row">
                    <span className="neo-demo-cred-label">PIN</span>
                    <span className="neo-demo-cred-val">1234</span>
                  </div>
                </div>
                <Link to="/login?mode=pin&demo=staff" className="neo-btn neo-btn-primary" style={{ width: '100%', marginTop: '16px', fontSize: '13px' }}>
                  Login as Staff PIN →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
