import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { 
  Laptop, Map, ChefHat, Globe, Package, Users, 
  UtensilsCrossed, X, Menu, LayoutDashboard, LayoutGrid, 
  Receipt, Users as UsersIcon, Settings, Search, Bell, 
  MousePointer2, CheckCircle2, Loader2
} from 'lucide-react';
import '../landing-neo.css';

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { user, staffDoc } = useAuthStore();
  const isAuth = !!user || !!staffDoc;
  const isRtl = i18n.language === 'ar';

  const [isMobileView, setIsMobileView] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isBurgerOpen, setIsBurgerOpen] = useState(false);
  const burgerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (burgerRef.current && !burgerRef.current.contains(e.target)) setIsBurgerOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    let isActive = true;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const runAnimation = async () => {
      while (isActive) {
        // Reset
        setMockCart([]);
        setActiveCategory('All Items');
        setCheckoutStatus('idle');
        setCursorPos({ x: 50, y: 90, opacity: 0, click: false });
        await sleep(1500);
        if (!isActive) break;

        // Move cursor in
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

        // 2. Click Double Bacon Burger (index 1 in Burgers)
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

        // 4. Click Iced Matcha (index 0 in Beverages)
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

        // Fade out
        setCursorPos(prev => ({ ...prev, opacity: 0 }));
        await sleep(1000);
      }
    };

    if (!isMobileView) {
      runAnimation();
    }
    return () => { isActive = false; };
  }, [isMobileView]);

  return (
    <div className="neo-landing" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <nav className="neo-nav">
        <div className="neo-nav-inner">
          <div className="neo-logo">
            <img src="/ricon.svg" alt="DineOS Logo" />
          </div>
          <div className="neo-nav-actions neo-nav-desktop">
            <button onClick={toggleLanguage} className="neo-lang-btn" title="Toggle Language">
              <Globe size={16} />
              <span>{i18n.language === 'ar' ? 'English' : 'العربية'}</span>
            </button>

            <Link to={isAuth ? "/dashboard" : "/login"} className="neo-btn neo-btn-primary">
              {isAuth ? t('goToDashboard') : (t('signIn') || 'Login')}
            </Link>
          </div>
        </div>
      </nav>

      <header className="neo-hero">
        <div className="neo-hero-inner">
          <div className="neo-hero-content">
            <h1 className="neo-hero-title">
              {t('landingTitle') ? (
                t('landingTitle').split(' ').map((word, i) => 
                  i === 1 ? <span key={i} className="stroke-text">{word} </span> : word + ' '
                )
              ) : (
                <>Run your <span className="stroke-text">Restaurant</span> like magic</>
              )}
            </h1>
            <p className="neo-hero-subtitle">{t('landingSubtitle')}</p>
            <div className="neo-hero-actions">
              <Link to="/login?mode=register" className="neo-btn neo-btn-primary neo-shadow-lg">
                {t('getStartedFree')}
              </Link>
              <button onClick={() => setIsDemoModalOpen(true)} className="neo-btn neo-btn-secondary neo-shadow-sm">
                {t('tryDemoAccounts') || 'Try Demo Accounts'}
              </button>
            </div>
          </div>

          <div className="neo-browser">
            <div className="neo-browser-header">
              <div className="neo-browser-dots">
                <span className="neo-browser-dot red"></span>
                <span className="neo-browser-dot yellow"></span>
                <span className="neo-browser-dot green"></span>
              </div>
              <span className="neo-browser-status">ACTIVE POS TERMINAL</span>
            </div>
            
            <div className="neo-browser-body">
              {/* Fake Cursor */}
              {!isMobileView && (
                <div 
                  className={`neo-fake-cursor ${cursorPos.click ? 'clicking' : ''}`}
                  style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%`, opacity: cursorPos.opacity }}
                >
                  <MousePointer2 size={28} fill="currentColor" />
                </div>
              )}

              {/* Sidebar */}
              <div className="neo-mock-sidebar">
                <LayoutDashboard className="neo-mock-sidebar-icon" />
                <LayoutGrid className="neo-mock-sidebar-icon active" />
                <Receipt className="neo-mock-sidebar-icon" />
                <Map className="neo-mock-sidebar-icon" />
                <UsersIcon className="neo-mock-sidebar-icon" />
                <Settings className="neo-mock-sidebar-icon" style={{ marginTop: 'auto', marginBottom: '20px' }} />
              </div>

              {/* Main Area */}
              <div className="neo-mock-main">
                <div className="neo-mock-topbar">
                  <div className="neo-mock-search">
                    <Search size={16} /> Search menu...
                  </div>
                  <Bell size={20} color="#ccc" />
                </div>

                <div className="neo-mock-categories">
                  {mockCategories.map(cat => (
                    <div key={cat} className={`neo-mock-cat-btn ${activeCategory === cat ? 'active' : ''}`}>
                      {cat}
                    </div>
                  ))}
                </div>

                <div className="neo-mock-grid">
                  {displayItems.map(item => (
                    <div key={item.id} className="neo-mock-item">
                      <div className="neo-mock-item-img">{item.emoji}</div>
                      <div className="neo-mock-item-info">
                        <div className="neo-mock-item-name">{item.name}</div>
                        <div className="neo-mock-item-price">₹{item.price}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cart Panel */}
              <div className="neo-mock-cart">
                <div className="neo-mock-cart-header">
                  <UtensilsCrossed size={18} /> Current Order
                </div>
                
                <div className="neo-mock-cart-toggle">
                  <div className="neo-mock-cart-toggle-btn active">Dine In</div>
                  <div className="neo-mock-cart-toggle-btn">Takeaway</div>
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
                      Cart is empty
                    </div>
                  )}
                </div>

                <div className="neo-mock-cart-footer">
                  <div className="neo-mock-cart-total">
                    <span>Total</span>
                    <span>₹{getCartTotal()}</span>
                  </div>
                  
                  <button className={`neo-mock-checkout-btn ${checkoutStatus}`}>
                    {checkoutStatus === 'idle' && 'Checkout'}
                    {checkoutStatus === 'processing' && <><Loader2 size={18} className="animate-spin" /> Processing...</>}
                    {checkoutStatus === 'success' && <><CheckCircle2 size={18} /> Paid</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Rest of Landing Page Structure */}
      <section className="neo-features-section" id="features">
        <div className="neo-section-header">
          <h2 className="neo-section-title">{t('featuresTitle')}</h2>
          <p className="neo-section-subtitle">{t('featuresSubtitle')}</p>
        </div>
        <div className="neo-features-grid">
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><Laptop size={24} /></div>
            <h3>{t('featurePosTitle')}</h3>
            <p>{t('featurePosDesc')}</p>
          </div>
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><Map size={24} /></div>
            <h3>{t('featureTablesTitle')}</h3>
            <p>{t('featureTablesDesc')}</p>
          </div>
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><Globe size={24} /></div>
            <h3>{t('featureOnlineTitle')}</h3>
            <p>{t('featureOnlineDesc')}</p>
          </div>
        </div>
      </section>

      <footer className="neo-footer">
        <div className="neo-footer-inner">
          <div className="neo-footer-brand-col">
            <div className="neo-footer-brand">
              <img src="/ricon.svg" alt="DineOS Logo" />
              <span>DineOS</span>
            </div>
            <p className="neo-footer-tagline">The modern POS built for efficient restaurant teams.</p>
            <div className="neo-footer-socials">
              <a href="#" aria-label="Twitter">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
              </a>
              <a href="#" aria-label="GitHub">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.8c0-1.2-.4-2.4-1.2-3.3 3.1-.3 6.4-1.5 6.4-7 0-1.5-.5-2.8-1.5-3.8.1-.4.7-1.8-.1-3.8 0 0-1.2-.4-3.9 1.4-1.2-.3-2.4-.5-3.6-.5-1.2 0-2.4.2-3.6.5-2.7-1.8-3.9-1.4-3.9-1.4-.8 2-.2 3.4-.1 3.8-1 1-1.5 2.3-1.5 3.8 0 5.5 3.3 6.7 6.4 7-.8.8-1.1 2-1.2 3.2V22"/></svg>
              </a>
              <a href="#" aria-label="LinkedIn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              </a>
            </div>
          </div>
          
          <div className="neo-footer-links-col" style={{ textAlign: 'right' }}>
            <h4 className="neo-footer-col-title">{t('admin')}</h4>
            <ul className="neo-footer-links">
              <li><Link to="/login">{t('signIn')}</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="neo-footer-bottom">
          <div className="neo-footer-copyright">
            &copy; {new Date().getFullYear()} {t('appName')}. All rights reserved.
          </div>
        </div>
      </footer>

      {/* DEMO MODAL */}
      {isDemoModalOpen && (
        <div className="neo-demo-modal-overlay" onClick={() => setIsDemoModalOpen(false)}>
          <div className="neo-demo-modal" onClick={e => e.stopPropagation()}>
            <button className="neo-demo-close-btn" onClick={() => setIsDemoModalOpen(false)}>
              <X size={24} />
            </button>
            <div className="neo-demo-header">
              <h2>Try Demo Accounts</h2>
              <p>Experience the platform with our pre-configured demo roles.</p>
            </div>
            
            <div className="neo-demo-cards">
              <div className="neo-demo-card">
                <h3>Admin Access</h3>
                <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1rem' }}>Full access to dashboard, reports, and settings.</p>
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
                <Link to="/login?mode=email&demo=admin" className="neo-btn neo-btn-primary" style={{ width: '100%', marginTop: '16px' }}>
                  Login as Admin
                </Link>
              </div>

              <div className="neo-demo-card">
                <h3>Staff Access</h3>
                <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1rem' }}>Access to POS, Tables, and Kitchen Display.</p>
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
                <Link to="/login?mode=pin&demo=staff" className="neo-btn neo-btn-primary" style={{ width: '100%', marginTop: '16px' }}>
                  Login as Staff
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
