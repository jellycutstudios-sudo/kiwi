import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { 
  Laptop, 
  Map, 
  ChefHat, 
  Globe, 
  Package, 
  Users, 
  UtensilsCrossed
} from 'lucide-react';
import '../landing-neo.css'; // Import the new styles

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { user, staffDoc } = useAuthStore();
  const isAuth = !!user || !!staffDoc;
  const isRtl = i18n.language === 'ar';

  const [isMobileView, setIsMobileView] = useState(false);
  const [activeMockupTab, setActiveMockupTab] = useState('tables'); // 'tables' or 'cart'

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleLanguage = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(next);
  };

  // Mock POS State
  const [selectedTable, setSelectedTable] = useState('T4');
  const [tables, setTables] = useState({
    T1: { id: 'T1', name: 'Table 1', status: 'occupied', items: [{ name: 'Spicy Ramen', qty: 2, price: 240 }, { name: 'Iced Matcha', qty: 1, price: 120 }] },
    T2: { id: 'T2', name: 'Table 2', status: 'free', items: [] },
    T3: { id: 'T3', name: 'Table 3', status: 'billed', items: [{ name: 'Margherita Pizza', qty: 1, price: 350 }, { name: 'Garlic Bread', qty: 1, price: 150 }] },
    T4: { id: 'T4', name: 'Table 4', status: 'occupied', items: [{ name: 'Classic Cheeseburger', qty: 1, price: 180 }, { name: 'Truffle Fries', qty: 1, price: 110 }] },
  });

  const handleTableClick = (id) => {
    setSelectedTable(id);
  };

  const toggleTableStatus = (id, newStatus) => {
    setTables(prev => {
      const target = prev[id];
      let newItems = target.items;
      if (newStatus === 'free') {
        newItems = [];
      } else if (newStatus === 'occupied' && target.items.length === 0) {
        newItems = [{ name: 'Chef Special Platter', qty: 1, price: 450 }];
      }
      return {
        ...prev,
        [id]: {
          ...target,
          status: newStatus,
          items: newItems
        }
      };
    });
  };

  const getTableBillTotal = (tableItems) => {
    return tableItems.reduce((acc, item) => acc + (item.qty * item.price), 0);
  };

  return (
    <div className="neo-landing" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      
      {/* 1 — STICKY NAV BAR */}
      <nav className="neo-nav">
        <div className="neo-nav-inner">
          <div className="neo-logo">
            <img src="/logorupos.svg" alt="Logo" />
          </div>

          <div className="neo-nav-actions">
            <button onClick={toggleLanguage} className="neo-lang-btn" title="Toggle Language">
              <Globe size={16} />
              <span>{isMobileView ? (i18n.language === 'ar' ? 'EN' : 'AR') : (i18n.language === 'ar' ? 'English' : 'العربية')}</span>
            </button>

            {isAuth ? (
              <Link to="/dashboard" className="neo-btn neo-btn-primary">
                {isMobileView ? 'Dashboard' : t('goToDashboard')}
              </Link>
            ) : (
              <Link to="/login" className="neo-btn neo-btn-secondary">
                {isMobileView ? 'Login' : t('signIn')}
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* 2 — HERO BAND */}
      <header className="neo-hero">
        <div className="neo-hero-inner">
          <div className="neo-hero-content">
            <div className="neo-badge">{t('appName')} POS 2.0</div>
            <h1 className="neo-hero-title">
              {t('landingTitle') ? (
                t('landingTitle').split(' ').map((word, i) => 
                  i === 1 ? <span key={i} className="stroke-text">{word} </span> : word + ' '
                )
              ) : (
                <>Run your <span className="stroke-text">Restaurant</span> like magic</>
              )}
            </h1>
            <p className="neo-hero-subtitle">
              {t('landingSubtitle')}
            </p>
            <div className="neo-hero-actions">
              <Link to="/login?mode=register" className="neo-btn neo-btn-primary neo-shadow-lg">
                {t('getStartedFree')}
              </Link>
              <a href="#how-it-works" className="neo-btn neo-btn-secondary neo-shadow-sm">
                {t('seeHowItWorks')}
              </a>
            </div>
          </div>

          {/* INTERACTIVE POS BROWSER MOCKUP */}
          <div className="neo-browser">
            <div className="neo-browser-header">
              <div className="neo-browser-dots">
                <span className="neo-browser-dot red"></span>
                <span className="neo-browser-dot yellow"></span>
                <span className="neo-browser-dot green"></span>
              </div>
              <span className="neo-browser-status">ACTIVE POS TERMINAL</span>
            </div>
            
            {/* Embedded Interactive POS simulator */}
            <div className="neo-browser-content">
              {/* Tab Selector for Mobile / Tab View */}
              {isMobileView && (
                <div className="neo-mockup-tabs">
                  <button 
                    onClick={() => setActiveMockupTab('tables')}
                    className={`neo-mockup-tab ${activeMockupTab === 'tables' ? 'active' : ''}`}
                  >
                    {t('tables') || 'Tables'}
                  </button>
                  <button 
                    onClick={() => setActiveMockupTab('cart')}
                    className={`neo-mockup-tab ${activeMockupTab === 'cart' ? 'active' : ''}`}
                  >
                    {t('cart') || 'Cart'} ({tables[selectedTable].items.length})
                  </button>
                </div>
              )}

              <div className="neo-browser-grid">
                {/* Tables Map */}
                {(!isMobileView || activeMockupTab === 'tables') && (
                  <div className="neo-mockup-col neo-mockup-col-tables">
                    <h4 className="neo-mockup-col-title">{t('tables')}</h4>
                    <div className="neo-mockup-tables-grid">
                      {Object.values(tables).map((tbl) => (
                        <button
                          key={tbl.id}
                          onClick={() => handleTableClick(tbl.id)}
                          className={`neo-mockup-table-btn ${tbl.id === selectedTable ? 'selected' : ''}`}
                        >
                          <span className="neo-mockup-table-name">{tbl.name}</span>
                          <span className={`neo-mockup-table-status-badge status-${tbl.status}`}>
                            {t(tbl.status)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bill Details */}
                {(!isMobileView || activeMockupTab === 'cart') && (
                  <div className="neo-mockup-col neo-mockup-col-cart">
                    <div className="neo-mockup-cart-upper">
                      <h4 className="neo-mockup-col-title">
                        {tables[selectedTable].name} {t('cart')}
                      </h4>
                      
                      {/* Status update simulated */}
                      <div className="neo-mockup-status-toggle">
                        {['free', 'occupied', 'billed'].map((st) => (
                          <button
                            key={st}
                            onClick={() => toggleTableStatus(selectedTable, st)}
                            className={`neo-mockup-status-btn ${tables[selectedTable].status === st ? 'active' : ''}`}
                          >
                            {t(st)}
                          </button>
                        ))}
                      </div>

                      <div className="neo-mockup-cart-items">
                        {tables[selectedTable].items.length > 0 ? (
                          tables[selectedTable].items.map((item, idx) => (
                            <div key={idx} className="neo-mockup-cart-item">
                              <div>
                                <span className="neo-mockup-item-name">{item.name}</span>
                                <span className="neo-mockup-item-qty">x{item.qty}</span>
                              </div>
                              <span className="neo-mockup-item-total">₹{item.qty * item.price}</span>
                            </div>
                          ))
                        ) : (
                          <div className="neo-mockup-cart-empty">
                            <UtensilsCrossed size={18} className="neo-mockup-empty-icon" />
                            <div>{t('emptyCart')}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="neo-mockup-cart-footer">
                      <span>{t('total')}</span>
                      <span>₹{getTableBillTotal(tables[selectedTable].items)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3 — SOCIAL PROOF MARQUEE */}
      <section className="neo-marquee-container">
        <div className="neo-marquee">
          <span>{t('proof1') || 'Zomato + Swiggy Integration'}</span>
          <span>✦</span>
          <span>{t('proof2') || 'Live Table Map & Floor Plan'}</span>
          <span>✦</span>
          <span>{t('proof3') || 'Offline-First & Fast Sync'}</span>
          <span>✦</span>
          <span>{t('proof1') || 'Zomato + Swiggy Integration'}</span>
          <span>✦</span>
          <span>{t('proof2') || 'Live Table Map & Floor Plan'}</span>
          <span>✦</span>
          <span>{t('proof3') || 'Offline-First & Fast Sync'}</span>
          <span>✦</span>
        </div>
      </section>

      {/* 4 — PROBLEM VS SOLUTION */}
      <section className="neo-problem-solution">
        <div className="neo-section-header">
          <h2 className="neo-section-title">The Restaurant Struggle</h2>
          <p className="neo-section-subtitle">Legacy systems are slow, complex, and tie you to expensive contracts. We do things differently.</p>
        </div>

        <div className="neo-cards-grid">
          <div className="neo-card neo-card-problem">
            <h3>Legacy POS Systems</h3>
            <ul>
              <li><span className="neo-icon-x">✗</span> Slow legacy software that lags during rush hour</li>
              <li><span className="neo-icon-x">✗</span> Complicated setup requiring proprietary hardware</li>
              <li><span className="neo-icon-x">✗</span> Locked statistics, no instant analytics</li>
              <li><span className="neo-icon-x">✗</span> High transaction cuts and hidden monthly fees</li>
            </ul>
          </div>

          <div className="neo-card neo-card-solution">
            <h3>RestaurantOS Solution</h3>
            <ul>
              <li><span className="neo-icon-check">✓</span> Lightning-fast billing on any web browser</li>
              <li><span className="neo-icon-check">✓</span> Works on iPads, tablets, mobiles & laptops</li>
              <li><span className="neo-icon-check">✓</span> Direct client-side Firestore secure writes</li>
              <li><span className="neo-icon-check">✓</span> Clear, fair pay-as-you-grow structures</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 5 — FEATURE GRID */}
      <section className="neo-features-section" id="features">
        <div className="neo-section-header">
          <h2 className="neo-section-title">{t('featuresTitle')}</h2>
          <p className="neo-section-subtitle">{t('featuresSubtitle')}</p>
        </div>

        <div className="neo-features-grid">
          {/* POS & Billing */}
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><Laptop size={20} /></div>
            <h3>{t('featurePosTitle')}</h3>
            <p>{t('featurePosDesc')}</p>
          </div>

          {/* Table Map */}
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><Map size={20} /></div>
            <h3>{t('featureTablesTitle')}</h3>
            <p>{t('featureTablesDesc')}</p>
          </div>

          {/* Kitchen Display */}
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><ChefHat size={20} /></div>
            <h3>{t('featureKdsTitle')}</h3>
            <p>{t('featureKdsDesc')}</p>
          </div>

          {/* Online Orders */}
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><Globe size={20} /></div>
            <h3>{t('featureOnlineTitle')}</h3>
            <p>{t('featureOnlineDesc')}</p>
          </div>

          {/* Inventory */}
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><Package size={20} /></div>
            <h3>{t('featureInventoryTitle')}</h3>
            <p>{t('featureInventoryDesc')}</p>
          </div>

          {/* Staff & Payroll */}
          <div className="neo-feature-card">
            <div className="neo-feature-icon"><Users size={20} /></div>
            <h3>{t('featureStaffTitle')}</h3>
            <p>{t('featureStaffDesc')}</p>
          </div>
        </div>
      </section>

      {/* 6 — HOW IT WORKS */}
      <section className="neo-how-it-works" id="how-it-works">
        <div className="neo-section-header">
          <h2 className="neo-section-title">{t('howItWorksTitle')}</h2>
        </div>

        <div className="neo-steps-container">
          <div className="neo-steps-line"></div>
          
          <div className="neo-step">
            <div className="neo-step-number">01</div>
            <h3 className="neo-step-title">{t('step1Title')}</h3>
            <p className="neo-step-desc">{t('step1Desc')}</p>
          </div>

          <div className="neo-step">
            <div className="neo-step-number">02</div>
            <h3 className="neo-step-title">{t('step2Title')}</h3>
            <p className="neo-step-desc">{t('step2Desc')}</p>
          </div>

          <div className="neo-step">
            <div className="neo-step-number">03</div>
            <h3 className="neo-step-title">{t('step3Title')}</h3>
            <p className="neo-step-desc">{t('step3Desc')}</p>
          </div>
        </div>
      </section>

      {/* 7 — PERSONAS BENTO GRID */}
      <section className="neo-personas">
        <div className="neo-section-header">
          <h2 className="neo-section-title">Built For Everyone</h2>
          <p className="neo-section-subtitle">Different roles, one single sync-ready interface.</p>
        </div>

        <div className="neo-bento-grid">
          <div className="neo-bento-card sage">
            <span className="neo-bento-badge">For Owners</span>
            <h3>Store Admins</h3>
            <p>Monitor total sales, edit menus, manage inventory, export payrolls, and track store shifts in real-time from anywhere in the world.</p>
          </div>

          <div className="neo-bento-card yellow">
            <span className="neo-bento-badge">For Floor Staff</span>
            <h3>Waiters & Till</h3>
            <p>Perform quick checkout, apply gift cards, manage table occupancies, assign dynamic tokens, and accept split payments natively.</p>
          </div>

          <div className="neo-bento-card charcoal">
            <span className="neo-bento-badge">For Cooks</span>
            <h3>Kitchen Display</h3>
            <p>Route incoming orders instantly to respective kitchen stations. Fired, preparing, and ready orders automatically transition in the layout.</p>
          </div>
        </div>
      </section>

      {/* 8 — TESTIMONIALS */}
      <section className="neo-testimonials">
        <div className="neo-section-header">
          <h2 className="neo-section-title">Loved by Restaurateurs</h2>
          <p className="neo-section-subtitle">Real feedback from actual restaurant owners using KiwiPOS.</p>
        </div>

        <div className="neo-testimonials-grid">
          <div className="neo-testimonial-card">
            <div className="neo-stars">★★★★★</div>
            <p className="neo-testimonial-text">"Decoupling the tables and orders onto this system saved us so much friction. Our staff didn't need any training to get started."</p>
            <div className="neo-testimonial-author">— Rohit S., Owner of RamenBar</div>
          </div>

          <div className="neo-testimonial-card">
            <div className="neo-stars">★★★★★</div>
            <p className="neo-testimonial-text">"Offline-first support meant even when our primary broadband went down, our waiters could still take orders and split checks seamlessly."</p>
            <div className="neo-testimonial-author">— Clara M., Manager at Le Bistro</div>
          </div>

          <div className="neo-testimonial-card">
            <div className="neo-stars">★★★★★</div>
            <p className="neo-testimonial-text">"Lazy-loading translation files speeds up our Arabic till layout loading in 100ms. Extremely fast React application!"</p>
            <div className="neo-testimonial-author">— Fadi A., GM at Falafel Express</div>
          </div>
        </div>
      </section>

      {/* 9 — CTA BAND */}
      <section className="neo-cta">
        <h2 className="neo-cta-title">{t('ctaTitle')}</h2>
        <p className="neo-cta-subtitle">{t('ctaSubtitle')}</p>
        <Link to="/login?mode=register" className="neo-btn neo-btn-primary neo-shadow-lg" style={{ fontSize: '18px', padding: '1.2rem 2.5rem' }}>
          {t('ctaButton')}
        </Link>
      </section>

      {/* 10 — FOOTER */}
      <footer className="neo-footer">
        <div className="neo-footer-inner">
          <div className="neo-footer-brand-col">
            <img src="/logorupos.svg" alt="Logo" style={{ filter: 'brightness(0) invert(1)' }} />
            <p className="neo-footer-tagline">
              The modern POS built for efficient restaurant teams.
            </p>
          </div>

          <div className="neo-footer-links-col">
            <h4 className="neo-footer-col-title">{t('admin')}</h4>
            <ul className="neo-footer-links">
              <li><Link to="/login">{t('signIn')}</Link></li>
              <li><Link to="/login?mode=register">{t('getStarted')}</Link></li>
            </ul>
          </div>

          <div className="neo-footer-links-col">
            <h4 className="neo-footer-col-title">Support</h4>
            <ul className="neo-footer-links">
              <li><a href="mailto:support@demo.kiwios.com">{t('emailSupport')}</a></li>
              <li><a href="https://wa.me/1234567890" target="_blank" rel="noopener noreferrer">{t('whatsapp')}</a></li>
            </ul>
          </div>
        </div>
        <div className="neo-footer-bottom">
          <span>&copy; {new Date().getFullYear()} {t('appName')}. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
