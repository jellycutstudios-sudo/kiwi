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
  RefreshCw, LayoutGrid, ArrowLeft, Flame, Zap, Banknote
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
import { useShiftStore } from '../../stores/shiftStore';
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
  const activeShift = useShiftStore(s => s.activeShift);
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
            type="button"
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
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            aria-label="Dismiss update notification"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-label-tertiary)',
              cursor: 'pointer',
              padding: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>
      ), {
        id: 'sw-update-toast',
        duration: 10000,
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
  const isTableMap = location.pathname === '/tables';

  useEffect(() => {
    if (isPOS || isTableMap) {
      // Defer to avoid synchronous setState-in-effect lint rule.
      // Always collapse to icon-only on POS & Tables — maximises screen space on every screen size.
      const id = setTimeout(() => setSidebarCollapsed(true), 0);
      return () => clearTimeout(id);
    }
    // On other pages we respect whatever state the user has set (or the screen-size default above).
  }, [isPOS, isTableMap]);

  // Scope POS focus mode strictly to /pos so navigating to Dashboard or other pages never hides the sidebar.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const shouldHideSidebar = Boolean(isPOS && isFocusMode);
    document.body.classList.toggle('pos-focus-mode', shouldHideSidebar);
    return () => {
      document.body.classList.remove('pos-focus-mode');
    };
  }, [isPOS, isFocusMode]);

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
        {/* Top Bar - hidden on KDS & Tables to eliminate duplicate headers */}
        {!isKDS && !isTableMap && (
        <header className={`top-bar no-print ${isPOS ? 'pos-top-bar' : ''}`}>
          {/* Burger menu button visible only on non-POS mobile/tablet */}
          {!isPOS && (
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
          )}

          {/* Branded Logo + Menu Drawer Button on POS — 1-tap opens navigation drawer */}
          {isPOS && (
            <button
              type="button"
              className="pos-topbar-brand-btn"
              onClick={() => setMobileSidebarOpen(prev => !prev)}
              id="pos-topbar-brand-btn"
              title={`${restaurant?.name || 'Rupos'} — Tap to open navigation`}
              aria-label="Open navigation menu"
            >
              <Menu size={16} strokeWidth={2.2} className="pos-topbar-brand-menu-icon" />
              <img
                src={restaurant?.receiptConfig?.logoUrl || restaurant?.logo || restaurant?.onlineLogo || '/ricon.svg'}
                alt={restaurant?.name || 'Rupos'}
                className="pos-topbar-brand-logo"
                onError={(e) => {
                  if (!e.target.src.endsWith('/ricon.svg')) {
                    e.target.src = '/ricon.svg';
                  }
                }}
              />
              <span className="pos-topbar-brand-name">
                {restaurant?.name || 'Rupos'}
              </span>
            </button>
          )}
          
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
              {isCategoryFirst && (!catFirstOverview || Boolean(search?.trim())) && (
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
                  <span className="pos-topbar-all-cats-text">All Categories</span>
                  <span className="pos-topbar-short-cats-text">Categories</span>
                </button>
              )}

              {/* Search Bar - Compact & Touch-Optimized */}
              <div className="pos-search-wrapper">
                <Search size={14} className="pos-search-icon" />
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="form-input pos-search-input"
                  placeholder="Search menu..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setSearch('');
                      e.currentTarget.blur();
                    } else if (e.key === 'Enter' && search.trim()) {
                      e.preventDefault();
                      window.dispatchEvent(new CustomEvent('kiwi:pos-search-enter'));
                    }
                  }}
                  id="menu-search-input"
                  aria-label="Search menu"
                />
                {search && (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      if (e.pointerType !== 'touch' && e.button === 0) {
                        e.preventDefault();
                        setSearch('');
                      }
                    }}
                    onClick={() => setSearch('')}
                    className="pos-search-clear-btn"
                    title="Clear search (Esc)"
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Top Bar Dietary Filter Pills */}
              <div className="pos-dietary-topbar-pills" role="toolbar" aria-label="Dietary filters">
                <button
                  type="button"
                  id="topbar-dietary-veg"
                  onClick={() => setDietaryFilter(f => f === 'veg' ? 'all' : 'veg')}
                  className={`pos-dietary-pill veg ${dietaryFilter === 'veg' ? 'active' : ''}`}
                  title="Filter Vegetarian items (tap again to clear)"
                >
                  <span className="food-badge-veg" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                  <span className="pos-dietary-pill-label">Veg</span>
                </button>

                <button
                  type="button"
                  id="topbar-dietary-nonveg"
                  onClick={() => setDietaryFilter(f => f === 'non-veg' ? 'all' : 'non-veg')}
                  className={`pos-dietary-pill nonveg ${dietaryFilter === 'non-veg' ? 'active' : ''}`}
                  title="Filter Non-Vegetarian items (tap again to clear)"
                >
                  <span className="food-badge-nonveg" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                  <span className="pos-dietary-pill-label">Non-Veg</span>
                </button>

                <button
                  type="button"
                  id="topbar-dietary-bestseller"
                  onClick={() => setDietaryFilter(f => f === 'bestseller' ? 'all' : 'bestseller')}
                  className={`pos-dietary-pill popular ${dietaryFilter === 'bestseller' ? 'active' : ''}`}
                  title="Filter Bestseller & Popular items (tap again to clear)"
                >
                  <Flame size={13} />
                  <span className="pos-dietary-pill-label">Popular</span>
                </button>
              </div>

              {/* Priority 2: Cashier Terminal Controls (View Switcher) */}
              <div className="pos-topbar-controls">
                <div className="density-toggle" role="group" aria-label="Terminal view switcher">
                  <button
                    type="button"
                    onClick={() => setMenuDensity('visual', true)}
                    title="Visual Cards view"
                    aria-label="Visual Cards view"
                    className={`density-btn ${menuDensity === 'visual' ? 'active' : ''}`}
                    id="pos-switch-cards-btn"
                  >
                    <LayoutGrid size={15} className="density-icon" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuDensity('dense', true)}
                    title="Fast Keys view"
                    aria-label="Fast Keys view"
                    className={`density-btn ${menuDensity === 'dense' ? 'active' : ''}`}
                    id="pos-switch-keys-btn"
                  >
                    <Zap size={14} className="density-bolt-icon" />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="top-bar-actions">
            {/* Priority 2: Till Drawer Button on POS (Cashier Shift Operation) */}
            {isPOS && (
              <button
                type="button"
                className="btn btn-secondary btn-sm pos-topbar-till-btn"
                id="till-drawer-btn"
                onClick={() => useShiftStore.getState().setShowTillModal(true)}
                disabled={!activeShift}
                title={!activeShift ? 'Open a shift first' : 'Till Drawer (Cash & Shift Management)'}
                style={{
                  height: '34px',
                  padding: '0 11px',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: activeShift ? 'pointer' : 'not-allowed',
                  opacity: activeShift ? 1 : 0.6,
                  border: '1px solid var(--color-separator)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-label)',
                  flexShrink: 0
                }}
              >
                <Banknote size={15} strokeWidth={2.2} />
                <span>Till</span>
                {activeShift && (
                  <span
                    className="pos-cart-till-dot"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#10b981',
                      boxShadow: '0 0 6px #10b981',
                      display: 'inline-block'
                    }}
                    title="Shift active"
                  />
                )}
              </button>
            )}

            {/* Subtle visual divider between cashier operations and system utilities */}
            {isPOS && <div className="pos-topbar-utility-divider" aria-hidden="true" />}

            {/* Priority 3: Low-frequency System Utilities (Fullscreen Focus) */}
            {isPOS && (
              <button
                type="button"
                className="btn btn-secondary btn-icon density-expand-btn"
                onClick={() => setIsFocusMode(!isFocusMode)}
                title={isFocusMode ? "Exit Fullscreen Focus Mode" : "Fullscreen POS Focus Mode"}
                aria-label={isFocusMode ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                {isFocusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}

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

            {/* Zero-Downtime Offline Outbox, Private Sales & Network Status Pill */}
            {(() => {
              const isLocalOnly = Boolean(restaurant?.localStorageOnly);
              const isPrivateSales = Boolean(restaurant?.privateSalesMode);

              let borderColor = 'var(--color-border)';
              let bgColor = 'var(--color-surface)';
              let textColor = 'var(--color-text-secondary)';
              let dotColor = '#22c55e';
              let dotGlow = '0 0 6px #22c55e';
              let statusText = 'Live Online';

              if (!isOnline) {
                borderColor = 'rgba(245, 158, 11, 0.45)';
                bgColor = 'rgba(245, 158, 11, 0.14)';
                textColor = '#d97706';
                dotColor = '#f59e0b';
                dotGlow = '0 0 8px rgba(245, 158, 11, 0.6)';
                statusText = `Offline${offlineQueue.length > 0 ? ` (${offlineQueue.length})` : ''}`;
              } else if (offlineQueue.length > 0) {
                borderColor = 'rgba(245, 158, 11, 0.45)';
                bgColor = 'rgba(245, 158, 11, 0.14)';
                textColor = '#d97706';
                dotColor = '#f59e0b';
                dotGlow = '0 0 6px #f59e0b';
                statusText = isSyncingQueue ? `Syncing (${offlineQueue.length})` : `Outbox (${offlineQueue.length})`;
              } else if (isLocalOnly) {
                borderColor = 'rgba(56, 189, 248, 0.45)';
                bgColor = 'rgba(56, 189, 248, 0.12)';
                textColor = '#38bdf8';
                dotColor = '#38bdf8';
                dotGlow = '0 0 8px rgba(56, 189, 248, 0.6)';
                statusText = 'Local Mode';
              } else if (isPrivateSales) {
                borderColor = 'rgba(16, 185, 129, 0.45)';
                bgColor = 'rgba(16, 185, 129, 0.12)';
                textColor = '#10b981';
                dotColor = '#10b981';
                dotGlow = '0 0 8px rgba(16, 185, 129, 0.6)';
                statusText = 'Private Sales';
              }

              // Clean state: online and 0 pending offline queue orders
              const isClean = isOnline && offlineQueue.length === 0;
              const useQuietPosPill = isPOS && isClean;

              return (
                <button
                  type="button"
                  id="network-outbox-status-btn"
                  className={`network-outbox-status-btn ${isClean ? 'is-clean-online' : ''}`}
                  onClick={() => setShowOfflineModal(true)}
                  title={isLocalOnly
                    ? `Local-Only Mode Active — ${offlineQueue.length} order(s) stored on device. Tap to inspect.`
                    : (isPrivateSales
                      ? `Private Sales Mode Active — Financial records & transactions stay strictly on this device. Tap to inspect.`
                      : (!isOnline 
                        ? `Offline Mode Active — ${offlineQueue.length} order(s) buffered locally. Tap to inspect.` 
                        : (offlineQueue.length > 0 ? `${offlineQueue.length} orders buffered — tap to inspect` : 'Connected to cloud server')))}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: useQuietPosPill ? '34px' : '38px',
                    borderRadius: useQuietPosPill ? 'var(--radius-sm)' : '10px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${useQuietPosPill ? 'var(--color-separator)' : borderColor}`,
                    background: useQuietPosPill ? 'var(--color-bg-secondary)' : bgColor,
                    color: textColor,
                    transition: 'none',
                    flexShrink: 0
                  }}
                >
                  <span className="network-status-dot" style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: dotGlow,
                    flexShrink: 0
                  }} />
                  {(!isPOS || !isClean) && (
                    <span className="network-status-text">
                      {statusText}
                    </span>
                  )}
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
        <main className={isPOS || isKDS || isTableMap ? '' : 'page-content'} style={isPOS ? { flex: 1, overflow: 'hidden' } : (isKDS ? { flex: 1, overflow: 'auto', padding: '12px 16px' } : (isTableMap ? { flex: 1, overflow: 'hidden', padding: '10px 14px' } : {}))}>
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
