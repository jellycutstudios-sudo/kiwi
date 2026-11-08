import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { useMenuStore } from '../../stores/menuStore';
import { useStaffStore } from '../../stores/staffStore';
import { useTableStore } from '../../stores/tableStore';
import { 
  Bell, Menu, Search, X, Download, Minimize2, Maximize2, 
  RefreshCw, LayoutGrid, ArrowLeft, Flame, Zap, Armchair
} from 'lucide-react';
import { usePosTemplate } from '../../utils/posTemplate';
import toast from 'react-hot-toast';
import WaiterReadySlidePopup from '../shared/WaiterReadySlidePopup';
import ErrorBoundary from '../shared/ErrorBoundary';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { useUpdateStore } from '../../stores/updateStore';
import ThemeToggle from '../shared/ThemeToggle';
import { triggerMorningCheer } from '../../utils/morningCheer';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import OfflineSyncModal from '../pos/OfflineSyncModal';
import PwaInstallModal from '../shared/PwaInstallModal';

const PAGE_TITLES = {
  '/dashboard':         'dashboard',
  '/pos':               'pos',
  '/tables':            'tables',
  '/online-orders':     'onlineOrders',
  '/orders':            'onlineOrders',
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
  const navigate = useNavigate();
  const restaurant = useAuthStore(s => s.restaurant);
  const staffDoc = useAuthStore(s => s.staffDoc);
  const isSuperAdmin = staffDoc?.role === 'super_admin';
  const effectiveType = restaurant?.businessType || restaurant?.accountType || 'restaurant';
  const isBillOnly = effectiveType === 'bill_only';

  // Enforce tier route protection: Block Just Billing users from accessing advanced dine-in/KDS routes
  useEffect(() => {
    if (!isBillOnly || isSuperAdmin) return;
    const lockedPrefixes = ['/tables', '/kds', '/admin/reservations', '/admin/delivery-hub', '/admin/posters', '/admin/floor'];
    const path = location.pathname.toLowerCase();
    const isLocked = lockedPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
    if (isLocked) {
      toast.error('Feature unavailable on the Just Billing plan.');
      navigate('/pos', { replace: true });
    }
  }, [location.pathname, isBillOnly, isSuperAdmin, navigate]);

  const unreadOnlineCount = useOrderStore(s => s.unreadOnlineCount);
  const subscribeActiveOrders = useOrderStore(s => s.subscribeActiveOrders);
  const markOnlineOrdersRead = useOrderStore(s => s.markOnlineOrdersRead);
  const subscribeMenu = useMenuStore(s => s.subscribeMenu);
  const search = useMenuStore(s => s.search);
  const setSearch = useMenuStore(s => s.setSearch);
  const menuDensity = useMenuStore(s => s.menuDensity);
  const setMenuDensity = useMenuStore(s => s.setMenuDensity);
  const isFocusMode = useMenuStore(s => s.isFocusMode);
  const setIsFocusMode = useMenuStore(s => s.setIsFocusMode);
  const catFirstOverview = useMenuStore(s => s.catFirstOverview);
  const setCatFirstOverview = useMenuStore(s => s.setCatFirstOverview);
  const dietaryFilter = useMenuStore(s => s.dietaryFilter);
  const setDietaryFilter = useMenuStore(s => s.setDietaryFilter);
  const { isCategoryFirst } = usePosTemplate();
  const subscribeStaff = useStaffStore(s => s.subscribeStaff);
  const subscribeTables = useTableStore(s => s.subscribe);
  const isOnline = useOfflineQueueStore(s => s.isOnline);
  const offlineQueue = useOfflineQueueStore(s => s.queue);
  const isSyncingQueue = useOfflineQueueStore(s => s.isSyncing);
  const [showOfflineModal, setShowOfflineModal] = useState(false);

  // Initialize network monitoring listeners
  useEffect(() => {
    const cleanup = useOfflineQueueStore.getState().initNetworkListeners();
    return () => cleanup && cleanup();
  }, []);

  // Subtle 1-time transition toast when entering or recovering from offline mode
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isOnline) {
      toast('Offline Mode active — POS, tables & receipts work without internet.', {
        id: 'offline-mode-status',
        duration: 4000
      });
    } else {
      toast.success('Connection restored — cloud auto-sync active.', {
        id: 'offline-mode-status',
        duration: 3000
      });
    }
  }, [isOnline]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { canInstall, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Global listener so any component can open the install modal via window.dispatchEvent(new CustomEvent('open-install-modal'))
  useEffect(() => {
    const handleOpenInstall = () => setShowInstallModal(true);
    window.addEventListener('open-install-modal', handleOpenInstall);
    return () => window.removeEventListener('open-install-modal', handleOpenInstall);
  }, []);

  const hasUpdate = useUpdateStore(s => s.hasUpdate);
  const isUpdating = useUpdateStore(s => s.isUpdating);
  const applyUpdate = useUpdateStore(s => s.applyUpdate);
  const setHasUpdate = useUpdateStore(s => s.setHasUpdate);

  // Morning Cheer: confetti shower & encouraging greeting on first open of the day
  useEffect(() => {
    // Expose test helper on window so user or developer can trigger it anytime via window.testMorningCheer()
    if (isSuperAdmin) return;
    if (typeof window !== 'undefined') {
      window.testMorningCheer = (force = true) => {
        triggerMorningCheer({ staffName: staffDoc?.name || restaurant?.name, force });
      };
    }

    const timer = setTimeout(() => {
      triggerMorningCheer({ staffName: staffDoc?.name || restaurant?.name });
    }, 1200);
    return () => clearTimeout(timer);
  }, [isSuperAdmin, staffDoc?.name, restaurant?.name]);

  // Listen for Service Worker update prompt and notify cashier/staff gracefully
  useEffect(() => {
    window.__swUpdateReady = () => {
      setHasUpdate(true);
      toast((t) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-label)' }}>New Update Ready!</div>
            <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>DineOS has an upgrade available.</div>
          </div>
          <button
            onClick={() => {
              toast.dismiss(t.id);
              applyUpdate();
            }}
            style={{
              background: 'linear-gradient(135deg, #f97316, #ef4444)',
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
        style: {
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-label)',
          border: '1px solid var(--color-separator)',
        },
      });
    };
    return () => {
      window.__swUpdateReady = null;
    };
  }, [applyUpdate, setHasUpdate]);

  // Close mobile sidebar whenever the route changes
  useEffect(() => {
    // Using a microtask defers the state update out of the synchronous render cycle,
    // satisfying the react-hooks/set-state-in-effect rule while keeping the same UX.
    const id = setTimeout(() => setMobileSidebarOpen(false), 0);
    return () => clearTimeout(id);
  }, [location.pathname]);

  const pageTitle = (isSuperAdmin && location.pathname === '/admin/restaurants')
    ? 'Businesses & Branches'
    : t(PAGE_TITLES[location.pathname] ?? 'appName');

  // Subscribe to real-time data globally
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsubOrders = subscribeActiveOrders(restaurant.id);
    const unsubMenu = subscribeMenu(restaurant.id);
    const unsubStaff = subscribeStaff(restaurant.id);
    const unsubTables = subscribeTables(restaurant.id);
    const unsubRestaurant = onSnapshot(doc(db, 'restaurants', restaurant.id), snap => {
      if (snap.exists()) {
        const updated = { id: snap.id, ...snap.data() };
        useAuthStore.setState({ restaurant: updated });
        try {
          localStorage.setItem(`dineos_cached_settings_${snap.id}`, JSON.stringify(updated));
        } catch {}
      }
    });

    return () => {
      unsubOrders();
      unsubMenu();
      unsubStaff();
      unsubTables();
      unsubRestaurant();
    };
  }, [restaurant?.id, subscribeActiveOrders, subscribeMenu, subscribeStaff, subscribeTables]);


  // On POS-sized screens (≤ 1366px) collapse the sidebar everywhere by default —
  // 240px of nav labels wastes ~23% of a 1024px screen on every page.
  // Users on large monitors (> 1366px) get the expanded sidebar.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.innerWidth <= 1366
  );

  const isPOS = location.pathname === '/pos';
  const isKDS = location.pathname === '/kds';

  useEffect(() => {
    if (isPOS) {
      // Defer to avoid synchronous setState-in-effect lint rule.
      // Always collapse to icon-only on POS — maximises menu grid space on every screen size.
      const id = setTimeout(() => setSidebarCollapsed(true), 0);
      return () => clearTimeout(id);
    }
    // On other pages we respect whatever state the user has set (or the screen-size default above).
  }, [isPOS]);

  return (
    <div className={`app-shell ${isKDS ? 'kds-app-shell' : ''}`}>
      {!isKDS && (
        <Sidebar 
          collapsed={sidebarCollapsed} 
          setCollapsed={setSidebarCollapsed} 
          mobileOpen={mobileSidebarOpen}
          setMobileOpen={setMobileSidebarOpen}
        />
      )}
      
      {mobileSidebarOpen && (
        <div 
          className="mobile-sidebar-overlay" 
          onClick={() => setMobileSidebarOpen(false)}
          onTouchEnd={(e) => {
            e.preventDefault();
            setMobileSidebarOpen(false);
          }}
          role="button"
          tabIndex={0}
          aria-label="Close navigation menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
              setMobileSidebarOpen(false);
            }
          }}
        />
      )}

      <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${isKDS ? 'kds-main-content' : ''}`}>
        {/* Top Bar - hidden on KDS to eliminate duplicate headers */}
        {!isKDS && (
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
          
          {!isPOS && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {location.pathname === '/tables' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/pos')}
                  id="topbar-back-to-pos-btn"
                  title="Return to POS Terminal"
                  style={{
                    height: '34px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    background: 'rgba(56, 189, 248, 0.12)',
                    borderColor: 'rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={14} strokeWidth={2.5} />
                  <span>Back to POS</span>
                </button>
              )}
              <h1 className="top-bar-title text-title3">{pageTitle}</h1>
            </div>
          )}
          
          {isPOS && (
            <div className="pos-topbar-center">
              {/* Back to All Categories button for Template 3 (Category Cards) */}
              {isCategoryFirst && !catFirstOverview && (
                <button
                  type="button"
                  id="topbar-back-to-categories-btn"
                  className="pos-topbar-all-categories-btn"
                  onClick={() => {
                    setCatFirstOverview(true);
                    setSearch('');
                    setDietaryFilter('all');
                  }}
                  title="Back to all Category Cards"
                >
                  <ArrowLeft size={15} strokeWidth={2.5} />
                  <span>All Categories</span>
                </button>
              )}

              {/* Search Bar */}
              <div className="pos-search-wrapper">
                <Search size={14} className="pos-search-icon" />
                <input
                  className="form-input pos-search-input"
                  placeholder="Search menu..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  id="menu-search-input"
                  aria-label="Search menu"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="pos-search-clear-btn"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Top Bar Dietary Filter Pills (Always visible on Desktop & Tablet) */}
              <div className="pos-dietary-topbar-pills" role="toolbar" aria-label="Dietary filters">
                <button
                  type="button"
                  id="topbar-dietary-veg"
                  onClick={() => setDietaryFilter(f => f === 'veg' ? 'all' : 'veg')}
                  className={`pos-dietary-pill veg ${dietaryFilter === 'veg' ? 'active' : ''}`}
                  title="Filter Vegetarian items (tap again to clear)"
                >
                  <span className="food-badge-veg" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                  <span>Veg</span>
                </button>

                <button
                  type="button"
                  id="topbar-dietary-nonveg"
                  onClick={() => setDietaryFilter(f => f === 'non-veg' ? 'all' : 'non-veg')}
                  className={`pos-dietary-pill nonveg ${dietaryFilter === 'non-veg' ? 'active' : ''}`}
                  title="Filter Non-Vegetarian items (tap again to clear)"
                >
                  <span className="food-badge-nonveg" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                  <span>Non-Veg</span>
                </button>

                <button
                  type="button"
                  id="topbar-dietary-bestseller"
                  onClick={() => setDietaryFilter(f => f === 'bestseller' ? 'all' : 'bestseller')}
                  className={`pos-dietary-pill popular ${dietaryFilter === 'bestseller' ? 'active' : ''}`}
                  title="Filter Bestseller & Popular items (tap again to clear)"
                >
                  <Flame size={12} />
                  <span>Popular</span>
                </button>
              </div>

              {/* View Controls: Cards vs Fast Keys + Fullscreen Focus */}
              <div className="pos-topbar-controls">
                <div className="density-toggle" role="group" aria-label="Terminal view switcher">
                  <button
                    type="button"
                    onClick={() => setMenuDensity('visual', true)}
                    title="Visual Cards with photos"
                    aria-label="Visual Cards view"
                    className={`density-btn ${menuDensity === 'visual' ? 'active' : ''}`}
                    id="pos-switch-cards-btn"
                  >
                    <LayoutGrid size={13} className="density-icon" />
                    <span className="density-label">Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuDensity('dense', true)}
                    title="Fast QSR Touch Keys"
                    aria-label="Fast QSR Touch Keys view"
                    className={`density-btn ${menuDensity === 'dense' ? 'active' : ''}`}
                    id="pos-switch-keys-btn"
                  >
                    <Zap size={12} className="density-bolt-icon" />
                    <span className="density-label density-label--full">Fast Keys</span>
                    <span className="density-label density-label--short">Keys</span>
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/tables')}
                  title="View Table Map & Floor Plan"
                  id="topbar-tables-nav-btn"
                  style={{
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    fontSize: '12px',
                    background: 'rgba(139, 92, 246, 0.12)',
                    borderColor: 'rgba(139, 92, 246, 0.35)',
                    color: '#c084fc'
                  }}
                >
                  <Armchair size={14} />
                  <span>Tables</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-icon density-expand-btn"
                  onClick={() => setIsFocusMode(!isFocusMode)}
                  title={isFocusMode ? "Exit Fullscreen Focus Mode" : "Fullscreen POS Focus Mode"}
                  aria-label={isFocusMode ? "Exit Fullscreen" : "Enter Fullscreen"}
                  style={{ height: '34px', width: '34px', borderRadius: '8px' }}
                >
                  {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="top-bar-actions">
            {/* Direct 1-Click Update Button for Devices */}
            {hasUpdate && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={applyUpdate}
                id="topbar-update-app-btn"
                title="A new version of DineOS is ready. Tap to update now."
                style={{
                  height: '32px',
                  padding: '0 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, #f97316, #ef4444)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <RefreshCw size={13} className={isUpdating ? 'animate-spin' : ''} />
                <span>{isUpdating ? 'Updating...' : 'Update Ready'}</span>
              </button>
            )}
            {/* Install App button if running in browser (hidden on POS to keep cashier header clean) */}
            {!isPOS && (canInstall || isIOS) && !isStandalone && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowInstallModal(true)}
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
                <span className="desktop-only">Install</span>
              </button>
            )}

            {/* Language selector — hidden on POS to keep cashier terminal clean and focused */}
            {!isPOS && (
              <div className="desktop-only" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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
            )}

            {/* Zero-Downtime Offline Outbox & Network Status Pill */}
            {(() => {
              const isLocalOnly = Boolean(restaurant?.localStorageOnly);
              return (
                <button
                  type="button"
                  id="network-outbox-status-btn"
                  className={`network-outbox-status-btn ${!isLocalOnly && isOnline && offlineQueue.length === 0 ? 'is-clean-online' : ''}`}
                  onClick={() => setShowOfflineModal(true)}
                  title={isLocalOnly
                    ? `Local-Only Mode Active — ${offlineQueue.length} order(s) stored on device. Click to backup or inspect.`
                    : (!isOnline 
                      ? `Offline Mode Active — ${offlineQueue.length} order(s) buffered locally. Tap to inspect.` 
                      : (offlineQueue.length > 0 ? `${offlineQueue.length} orders buffered — click to inspect` : 'Connected to cloud server'))}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: isLocalOnly 
                      ? '1px solid rgba(56, 189, 248, 0.45)'
                      : (isOnline && offlineQueue.length === 0
                        ? '1px solid var(--color-border)'
                        : '1px solid rgba(245, 158, 11, 0.45)'),
                    background: isLocalOnly
                      ? 'rgba(56, 189, 248, 0.12)'
                      : (isOnline && offlineQueue.length === 0
                        ? 'var(--color-surface)'
                        : 'rgba(245, 158, 11, 0.14)'),
                    color: isLocalOnly
                      ? '#38bdf8'
                      : (isOnline && offlineQueue.length === 0
                        ? 'var(--color-text-secondary)'
                        : '#d97706'),
                    transition: 'all 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <span className="network-status-dot" style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isLocalOnly ? '#38bdf8' : (!isOnline ? '#f59e0b' : (offlineQueue.length > 0 ? '#f59e0b' : '#22c55e')),
                    boxShadow: isLocalOnly ? '0 0 8px rgba(56, 189, 248, 0.6)' : (!isOnline ? '0 0 8px rgba(245, 158, 11, 0.6)' : (offlineQueue.length > 0 ? '0 0 6px #f59e0b' : '0 0 6px #22c55e')),
                    flexShrink: 0
                  }} />
                  <span className="network-status-text">
                    {isLocalOnly
                      ? `Local Mode${offlineQueue.length > 0 ? ` (${offlineQueue.length})` : ''}`
                      : (!isOnline 
                        ? `Offline${offlineQueue.length > 0 ? ` (${offlineQueue.length})` : ''}` 
                        : (offlineQueue.length > 0 ? (isSyncingQueue ? `Syncing (${offlineQueue.length})` : `Outbox (${offlineQueue.length})`) : 'Live Online'))}
                  </span>
                </button>
              );
            })()}

            {/* Theme Toggle (Obsidian Dark / Light) */}
            <div className="pos-topbar-theme-toggle">
              <ThemeToggle />
            </div>

            {/* Notification bell (Alerts only on mobile POS if unread orders exist) */}
            <button
              className={`btn btn-secondary btn-icon pos-topbar-bell ${unreadOnlineCount > 0 ? 'has-unread' : ''}`}
              style={{ position: 'relative' }}
              onClick={() => {
                if (unreadOnlineCount > 0) {
                  const count = unreadOnlineCount;
                  markOnlineOrdersRead();
                  toast.success(`Marked ${count} pending online orders as read.`);
                } else {
                  toast('You don\'t have any new notifications.');
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
        )}

        {/* Page content */}
        <main className={isPOS || isKDS ? '' : 'page-content'} style={isPOS ? { flex: 1, overflow: 'hidden' } : (isKDS ? { flex: 1, overflow: 'auto', padding: '12px 16px' } : {})}>
          <ErrorBoundary isPageLevel resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Search Modal Overlay */}
      {isSearchOpen && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1100, paddingTop: '10vh' }} onClick={e => e.target === e.currentTarget && setIsSearchOpen(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: '90%', width: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <Search size={16} /> {t('search')} Menu
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

      {/* Unified PWA Install Modal */}
      <PwaInstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        canInstall={canInstall}
        promptInstall={promptInstall}
        isIOS={isIOS}
        isStandalone={isStandalone}
      />

      {/* Interactive Food Ready Alert Banner - shown on /tables and /pos for fast pass pickup */}
      {(location.pathname === '/tables' || location.pathname === '/pos') && !location.search.includes('edit=true') && <WaiterReadySlidePopup />}

      {/* Zero-Downtime Offline Buffer & Cloud Sync Modal */}
      <OfflineSyncModal isOpen={showOfflineModal} onClose={() => setShowOfflineModal(false)} />
    </div>
  );
}
