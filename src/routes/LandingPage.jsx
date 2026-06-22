import { useState } from 'react';
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

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { user, staffDoc } = useAuthStore();
  const isAuth = !!user || !!staffDoc;
  const isRtl = i18n.language === 'ar';

  // Toggle Language
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
    <div className="landing-container" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      
      {/* 1 — STICKY NAV BAR */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo-group">
            <span className="landing-logo-icon">🍽️</span>
            <span className="landing-logo-text">{t('appName')}</span>
          </div>

          <div className="landing-nav-actions">
            {/* Language toggle — icon-only on mobile, label on desktop */}
            <button
              onClick={toggleLanguage}
              className="landing-lang-btn"
              title="Toggle Language"
            >
              <Globe size={16} />
              <span className="landing-lang-label">
                {i18n.language === 'ar' ? 'English' : 'العربية'}
              </span>
            </button>

            {isAuth ? (
              <Link to="/dashboard" className="landing-btn-primary">
                {t('goToDashboard')}
              </Link>
            ) : (
              /* Single Login button in nav — "Get Started" lives on the hero */
              <Link to="/login" className="landing-btn-nav-login">
                {t('signIn')}
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* 2 — HERO BAND */}
      <header className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-content">
            <div className="landing-badge-pill">{t('appName')} POS</div>
            <h1 className="landing-hero-title">
              {t('landingTitle')}
            </h1>
            <p className="landing-hero-subtitle">
              {t('landingSubtitle')}
            </p>
            <div className="landing-hero-actions">
              <Link to="/login?mode=register" className="landing-btn-primary landing-btn-lg">
                {t('getStartedFree')}
              </Link>
              <a href="#how-it-works" className="landing-btn-secondary landing-btn-lg">
                {t('seeHowItWorks')}
              </a>
            </div>
          </div>

          {/* 2b — INTERACTIVE POS MOCK (Right panel on desktop) */}
          <div className="landing-hero-mockup">
            <div className="landing-mock-terminal">
              {/* Header */}
              <div className="landing-mock-header">
                <div className="landing-mock-header-title">
                  <span className="landing-dot"></span>
                  <span>{t('pos')}</span>
                </div>
                <div className="landing-mock-status-pill">ONLINE</div>
              </div>

              {/* Grid content */}
              <div className="landing-mock-body">
                {/* Left side - Table Map */}
                <div className="landing-mock-tables-container">
                  <div className="landing-mock-body-subtitle">{t('tables')}</div>
                  <div className="landing-mock-tables-grid">
                    {Object.values(tables).map((tbl) => (
                      <button
                        key={tbl.id}
                        onClick={() => handleTableClick(tbl.id)}
                        className={`landing-mock-table-card ${tbl.id === selectedTable ? 'active' : ''} status-${tbl.status}`}
                      >
                        <span className="landing-mock-table-name">{tbl.name}</span>
                        <span className={`landing-mock-table-status-label ${tbl.status}`}>
                          {t(tbl.status)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right side - Active Cart details */}
                <div className="landing-mock-cart-container">
                  <div className="landing-mock-body-subtitle">
                    {tables[selectedTable].name} {t('cart')}
                  </div>
                  
                  <div className="landing-mock-cart-status-toggle">
                    <span className="landing-mock-toggle-label">{t('status')}:</span>
                    <div className="landing-mock-toggle-buttons">
                      {['free', 'occupied', 'billed'].map((st) => (
                        <button
                          key={st}
                          onClick={() => toggleTableStatus(selectedTable, st)}
                          className={`landing-mock-toggle-btn ${tables[selectedTable].status === st ? 'active' : ''}`}
                        >
                          {t(st)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="landing-mock-cart-items">
                    {tables[selectedTable].items.length > 0 ? (
                      tables[selectedTable].items.map((item, idx) => (
                        <div key={idx} className="landing-mock-cart-item">
                          <div>
                            <div className="landing-mock-item-name">{item.name}</div>
                            <div className="landing-mock-item-meta">qty: {item.qty}</div>
                          </div>
                          <div className="landing-mock-item-price">
                            ₹{item.qty * item.price}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="landing-mock-cart-empty">
                        <UtensilsCrossed size={20} className="landing-mock-empty-icon" />
                        <div>{t('emptyCart')}</div>
                        <span className="landing-mock-empty-hint">{t('emptyCartHint')}</span>
                      </div>
                    )}
                  </div>

                  <div className="landing-mock-cart-summary">
                    <div className="landing-mock-summary-row font-semibold">
                      <span>{t('total')}</span>
                      <span>₹{getTableBillTotal(tables[selectedTable].items)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3 — SOCIAL PROOF STRIP */}
      <section className="landing-proof">
        <div className="landing-proof-inner">
          <div className="landing-proof-item">
            <span className="landing-proof-check">✓</span>
            <span>{t('proof1')}</span>
          </div>
          <div className="landing-proof-item">
            <span className="landing-proof-check">✓</span>
            <span>{t('proof2')}</span>
          </div>
          <div className="landing-proof-item">
            <span className="landing-proof-check">✓</span>
            <span>{t('proof3')}</span>
          </div>
        </div>
      </section>

      {/* 4 — FEATURE GRID */}
      <section className="landing-features" id="features">
        <div className="landing-section-header">
          <h2 className="landing-section-title">{t('featuresTitle')}</h2>
          <p className="landing-section-subtitle">{t('featuresSubtitle')}</p>
        </div>

        <div className="landing-features-grid">
          {/* POS & Billing */}
          <div className="landing-feature-card">
            <div className="landing-feature-icon-wrapper">
              <Laptop size={20} />
            </div>
            <h3 className="landing-feature-name">{t('featurePosTitle')}</h3>
            <p className="landing-feature-desc">{t('featurePosDesc')}</p>
          </div>

          {/* Table Map */}
          <div className="landing-feature-card">
            <div className="landing-feature-icon-wrapper">
              <Map size={20} />
            </div>
            <h3 className="landing-feature-name">{t('featureTablesTitle')}</h3>
            <p className="landing-feature-desc">{t('featureTablesDesc')}</p>
          </div>

          {/* Kitchen Display */}
          <div className="landing-feature-card">
            <div className="landing-feature-icon-wrapper">
              <ChefHat size={20} />
            </div>
            <h3 className="landing-feature-name">{t('featureKdsTitle')}</h3>
            <p className="landing-feature-desc">{t('featureKdsDesc')}</p>
          </div>

          {/* Online Orders */}
          <div className="landing-feature-card">
            <div className="landing-feature-icon-wrapper">
              <Globe size={20} />
            </div>
            <h3 className="landing-feature-name">{t('featureOnlineTitle')}</h3>
            <p className="landing-feature-desc">{t('featureOnlineDesc')}</p>
          </div>

          {/* Inventory */}
          <div className="landing-feature-card">
            <div className="landing-feature-icon-wrapper">
              <Package size={20} />
            </div>
            <h3 className="landing-feature-name">{t('featureInventoryTitle')}</h3>
            <p className="landing-feature-desc">{t('featureInventoryDesc')}</p>
          </div>

          {/* Staff & Payroll */}
          <div className="landing-feature-card">
            <div className="landing-feature-icon-wrapper">
              <Users size={20} />
            </div>
            <h3 className="landing-feature-name">{t('featureStaffTitle')}</h3>
            <p className="landing-feature-desc">{t('featureStaffDesc')}</p>
          </div>
        </div>
      </section>

      {/* 5 — HOW IT WORKS */}
      <section className="landing-how-it-works" id="how-it-works">
        <div className="landing-section-header">
          <h2 className="landing-section-title">{t('howItWorksTitle')}</h2>
        </div>

        <div className="landing-steps-container">
          <div className="landing-step-row">
            <div className="landing-step-number">01</div>
            <div className="landing-step-content">
              <h3 className="landing-step-title">{t('step1Title')}</h3>
              <p className="landing-step-desc">{t('step1Desc')}</p>
            </div>
          </div>

          <div className="landing-step-row">
            <div className="landing-step-number">02</div>
            <div className="landing-step-content">
              <h3 className="landing-step-title">{t('step2Title')}</h3>
              <p className="landing-step-desc">{t('step2Desc')}</p>
            </div>
          </div>

          <div className="landing-step-row">
            <div className="landing-step-number">03</div>
            <div className="landing-step-content">
              <h3 className="landing-step-title">{t('step3Title')}</h3>
              <p className="landing-step-desc">{t('step3Desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 7 — CTA BAND */}
      <section className="landing-cta">
        <div className="landing-cta-inner">
          <h2 className="landing-cta-title">{t('ctaTitle')}</h2>
          <p className="landing-cta-subtitle">{t('ctaSubtitle')}</p>
          <Link to="/login?mode=register" className="landing-cta-btn">
            {t('ctaButton')}
          </Link>
        </div>
      </section>

      {/* 8 — FOOTER */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand-col">
            <div className="landing-logo-group">
              <span className="landing-logo-icon">🍽️</span>
              <span className="landing-logo-text">{t('appName')}</span>
            </div>
            <p className="landing-footer-tagline">
              The modern POS built for efficient restaurant teams.
            </p>
          </div>

          <div className="landing-footer-links-col">
            <h4 className="landing-footer-col-title">{t('admin')}</h4>
            <ul className="landing-footer-links">
              <li>
                <Link to="/login">{t('signIn')}</Link>
              </li>
              <li>
                <Link to="/login?mode=register">{t('getStarted')}</Link>
              </li>
            </ul>
          </div>

          <div className="landing-footer-links-col">
            <h4 className="landing-footer-col-title">Support</h4>
            <ul className="landing-footer-links">
              <li>
                <a href="mailto:support@demo.kiwios.com">{t('emailSupport')}</a>
              </li>
              <li>
                <a href="https://wa.me/1234567890" target="_blank" rel="noopener noreferrer">
                  {t('whatsapp')}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>&copy; {new Date().getFullYear()} {t('appName')}. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
