import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { useMenuStore } from '../../stores/menuStore';
import { useStaffStore } from '../../stores/staffStore';
import { useTableStore } from '../../stores/tableStore';
import { Bell, Globe, Menu, Search, X, Download, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import WaiterReadySlidePopup from '../shared/WaiterReadySlidePopup';
import { usePwaInstall } from '../../hooks/usePwaInstall';

const PAGE_TITLES = {
  '/dashboard':         'dashboard',
  '/pos':               'pos',
  '/tables':            'tables',
  '/online-orders':     'onlineOrders',
  '/kds':               'kitchen',
  '/reports':           'reports',
  '/admin/staff':       'staff',
  '/admin/menu':        'menu',
  '/admin/floor':       'floorPlan',
  '/admin/settings':    'settings',
  '/admin/restaurants': 'restaurants',
};

const SUPPORTED_LANGS = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ta', label: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', label: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', label: 'मराठी', flag: '🇮🇳' },
  { code: 'kn', label: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ar', label: 'العربية', flag: '🇦🇪' },
];

export default function AppShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const restaurant = useAuthStore(s => s.restaurant);
  const unreadOnlineCount = useOrderStore(s => s.unreadOnlineCount);
  const subscribeActiveOrders = useOrderStore(s => s.subscribeActiveOrders);
  const markOnlineOrdersRead = useOrderStore(s => s.markOnlineOrdersRead);
  const subscribeMenu = useMenuStore(s => s.subscribeMenu);
  const search = useMenuStore(s => s.search);
  const setSearch = useMenuStore(s => s.setSearch);
  const subscribeStaff = useStaffStore(s => s.subscribeStaff);
  const subscribeTables = useTableStore(s => s.subscribe);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { canInstall, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const [showIosInstallModal, setShowIosInstallModal] = useState(false);

  // Listen for Service Worker update prompt and notify cashier/staff gracefully
  useEffect(() => {
    window.__swUpdateReady = () => {
      toast((t) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-label)' }}>New Update Ready!</div>
            <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>DineOS has an upgrade available.</div>
          </div>
          <button
            onClick={() => {
              toast.dismiss(t.id);
              if (typeof window.__updateSW === 'function') {
                window.__updateSW(true);
              } else {
                window.location.reload();
              }
            }}
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Update Now
          </button>
        </div>
      ), {
        id: 'sw-update-toast',
        duration: Infinity,
        icon: '🚀',
      });
    };
    return () => {
      window.__swUpdateReady = null;
    };
  }, []);

  // Close mobile sidebar whenever the route changes
  useEffect(() => {
    // Using a microtask defers the state update out of the synchronous render cycle,
    // satisfying the react-hooks/set-state-in-effect rule while keeping the same UX.
    const id = setTimeout(() => setMobileSidebarOpen(false), 0);
    return () => clearTimeout(id);
  }, [location.pathname]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connection restored — syncing all offline changes!', {
        id: 'net-status',
        duration: 3500,
        icon: '🟢',
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast('Operating in Offline Unbreakable Mode. Orders & billing saved locally.', {
        id: 'net-status',
        duration: 4500,
        icon: '🛡️',
      });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const pageTitle = t(PAGE_TITLES[location.pathname] ?? 'appName');

  // Subscribe to real-time data globally
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsubOrders = subscribeActiveOrders(restaurant.id);
    const unsubMenu = subscribeMenu(restaurant.id);
    const unsubStaff = subscribeStaff(restaurant.id);
    const unsubTables = subscribeTables(restaurant.id);
    return () => {
      unsubOrders();
      unsubMenu();
      unsubStaff();
      unsubTables();
    };
  }, [restaurant?.id, subscribeActiveOrders, subscribeMenu, subscribeStaff, subscribeTables]);

  const toggleLang = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(next);
  };

  // On POS-sized screens (≤ 1366px) collapse the sidebar everywhere by default —
  // 240px of nav labels wastes ~23% of a 1024px screen on every page.
  // Users on large monitors (> 1366px) get the expanded sidebar.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.innerWidth <= 1366
  );

  // POS page uses its own full-height layout
  const isPOS = location.pathname === '/pos';

  useEffect(() => {
    if (isPOS) {
      // Defer to avoid synchronous setState-in-effect lint rule.
      // Always collapse to icon-only on POS — maximises menu grid space on every screen size.
      const id = setTimeout(() => setSidebarCollapsed(true), 0);
      return () => clearTimeout(id);
    }
    // On other pages we respect whatever state the user has set (or the screen-size default above).
    // No forced restore — if they manually expanded on a small screen, honour that choice.
  }, [isPOS]);

  return (
    <div className="app-shell">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        setCollapsed={setSidebarCollapsed} 
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />
      
      {mobileSidebarOpen && (
        <div 
          className="mobile-sidebar-overlay" 
          onClick={() => setMobileSidebarOpen(false)} 
        />
      )}

      {/* Offline Unbreakable Mode Banner */}
      {!isOnline && (
        <div 
          role="alert"
          style={{ 
            background: 'linear-gradient(90deg, #18181b 0%, #09090b 100%)', 
            color: '#ffffff', 
            padding: '9px 16px', 
            textAlign: 'center', 
            fontSize: '13px', 
            fontWeight: 500, 
            zIndex: 10000, 
            position: 'sticky', 
            top: 0, 
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            borderBottom: '1px solid rgba(255,255,255,0.12)'
          }}
        >
          <span style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '4px',
            background: 'rgba(249, 115, 22, 0.2)', 
            color: '#fb923c', 
            border: '1px solid rgba(249, 115, 22, 0.35)',
            padding: '2px 8px', 
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}>
            🛡️ Offline Unbreakable Mode
          </span>
          <span style={{ color: '#e4e4e7' }}>
            Taking orders, printing receipts &amp; table operations continue seamlessly. All changes will auto-sync when reconnected.
          </span>
        </div>
      )}

      <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Top Bar */}
        <header className={`top-bar no-print ${isPOS ? 'pos-top-bar' : ''}`}>
          {/* Burger menu button visible only on mobile/tablet */}
          <button
            className="btn btn-secondary btn-icon burger-menu-btn"
            onClick={() => setMobileSidebarOpen(true)}
            id="burger-menu-btn"
            title="Open menu"
            aria-label="Open menu"
            aria-expanded={mobileSidebarOpen}
          >
            <Menu size={20} />
          </button>
          
          <h1 className="top-bar-title text-title3" style={isPOS ? { flex: 'none', marginRight: 'var(--space-4)' } : {}}>{pageTitle}</h1>
          
          {isPOS && (
            <>
              <div className="desktop-only" style={{ flex: 1, maxWidth: '400px', display: 'flex', alignItems: 'center' }}>
                <input
                  className="form-input"
                  placeholder={`🔍 ${t('search')} menu...`}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  id="menu-search-input"
                  style={{ height: '36px', fontSize: 'var(--text-subhead)', padding: '6px 12px' }}
                />
              </div>
              <button
                type="button"
                className={`btn btn-icon mobile-only ${search ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setIsSearchOpen(true)}
                title="Search menu"
                aria-label="Search menu"
                style={{ height: '36px', width: '36px', marginRight: 'var(--space-2)' }}
              >
                <Search size={18} />
              </button>
            </>
          )}

          <div className="top-bar-actions" style={isPOS ? { marginLeft: 'auto' } : {}}>
            {/* Install App button if running in browser */}
            {(canInstall || isIOS) && !isStandalone && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (canInstall) {
                    promptInstall();
                  } else if (isIOS) {
                    setShowIosInstallModal(true);
                  }
                }}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  cursor: 'pointer'
                }}
                title="Install DineOS as a native App"
                id="install-pwa-btn"
              >
                <Download size={14} />
                <span>Install</span>
              </button>
            )}

            {/* Network status indicator (glowing dot) */}
            <div 
              title={
                isOnline 
                  ? "System Online & Connected" 
                  : "System Offline / Network Disconnected"
              }
              role="status"
              aria-label={isOnline ? "System is online" : "System is offline"}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isOnline 
                    ? '#34c759' 
                    : '#ff3b30',
                animation: isOnline 
                    ? 'pulseOnline 2s infinite' 
                    : 'pulseOffline 1.5s infinite',
                margin: '0 var(--space-2)',
                transition: 'all 0.3s ease',
              }}
            />

            {/* Language selector */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select
                id="lang-select"
                value={SUPPORTED_LANGS.some(l => l.code === i18n.language) ? i18n.language : 'en'}
                onChange={e => i18n.changeLanguage(e.target.value)}
                aria-label="Select interface language"
                style={{
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '0 8px',
                  cursor: 'pointer'
                }}
              >
                {SUPPORTED_LANGS.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Notification bell */}
            <button
              className="btn btn-secondary btn-icon"
              style={{ position: 'relative' }}
              onClick={() => {
                if (unreadOnlineCount > 0) {
                  const count = unreadOnlineCount;
                  markOnlineOrdersRead();
                  toast.success(`Marked ${count} pending online orders as read.`, { icon: '📭' });
                } else {
                  toast('You don\'t have any new notifications.', { icon: '📭' });
                }
              }}
              title="Notifications"
              aria-label={`Notifications ${unreadOnlineCount > 0 ? `(${unreadOnlineCount} unread)` : ''}`}
              id="notification-bell-btn"
            >
              <Bell size={16} />
              {unreadOnlineCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--color-red)',
                }} />
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className={isPOS ? '' : 'page-content'} style={isPOS ? { flex: 1, overflow: 'hidden' } : {}}>
          <Outlet />
        </main>
      </div>

      {/* Mobile Search Modal Overlay */}
      {isSearchOpen && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1100, paddingTop: '10vh' }} onClick={e => e.target === e.currentTarget && setIsSearchOpen(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: '90%', width: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                🔍 {t('search')} Menu
              </h3>
              <button className="btn btn-secondary btn-icon btn-sm" onClick={() => setIsSearchOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
              <input
                className="form-input"
                placeholder="Type to search menu..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                style={{ height: '44px', fontSize: 'var(--text-body)', padding: '10px 16px', width: '100%' }}
              />
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ flex: 1 }}
                onClick={() => {
                  setSearch('');
                  setIsSearchOpen(false);
                }}
              >
                Clear Search
              </button>
              <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setIsSearchOpen(false)}>
                Apply Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Add to Home Screen Instructions Modal */}
      {showIosInstallModal && (
        <div 
          className="modal-overlay" 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px' }} 
          onClick={e => e.target === e.currentTarget && setShowIosInstallModal(false)}
        >
          <div className="modal animate-slide-up" style={{ maxWidth: '380px', width: '100%', padding: 'var(--space-4)' }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-separator)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={20} color="var(--color-accent)" />
                <h3 className="modal-title" style={{ margin: 0, fontSize: '16px' }}>Install DineOS App</h3>
              </div>
              <button className="btn btn-secondary btn-icon btn-sm" onClick={() => setShowIosInstallModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: 'var(--space-4) 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--color-label)' }}>
              <p style={{ margin: '0 0 12px 0', color: 'var(--color-label-secondary)' }}>
                Install DineOS on your iPad or iPhone home screen for uninterrupted fullscreen and offline access:
              </p>
              <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <li>Tap the <strong>Share</strong> button at the bottom of Safari (square with arrow <strong>↑</strong>).</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> in the top-right corner to finish.</li>
              </ol>
            </div>
            <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
              <button className="btn btn-primary" style={{ width: '100%', height: '38px' }} onClick={() => setShowIosInstallModal(false)}>
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Waiter Ready Slide Popup */}
      <WaiterReadySlidePopup />
    </div>
  );
}
