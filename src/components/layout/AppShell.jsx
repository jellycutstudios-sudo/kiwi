import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { useMenuStore } from '../../stores/menuStore';
import { useStaffStore } from '../../stores/staffStore';
import { useTableStore } from '../../stores/tableStore';
import { Bell, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

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

export default function AppShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { restaurant } = useAuthStore();
  const { unreadOnlineCount, subscribeActiveOrders, markOnlineOrdersRead } = useOrderStore();
  const { subscribeMenu, search, setSearch } = useMenuStore();
  const { subscribeStaff } = useStaffStore();
  const { subscribe: subscribeTables } = useTableStore();
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(!!window.__simulateOffline);
  const [isOnline, setIsOnline] = useState(navigator.onLine && !window.__simulateOffline);

  useEffect(() => {
    const handleOnline = () => {
      if (!window.__simulateOffline) setIsOnline(true);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleOfflineSimulation = () => {
    const nextVal = !window.__simulateOffline;
    window.__simulateOffline = nextVal;
    setIsSimulatedOffline(nextVal);
    if (nextVal) {
      setIsOnline(false);
      toast.error('Developer Mode: Simulating Offline Mode', { id: 'network-simulate' });
    } else {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        toast.success('Connected back to cloud', { id: 'network-simulate' });
      } else {
         toast.error('Still offline (no actual internet)', { id: 'network-simulate' });
      }
    }
  };


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

  // POS page uses its own full-height layout
  const isPOS = location.pathname === '/pos';

  return (
    <div className="app-shell">
      <style>{`
        @keyframes blink {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
      <Sidebar />
      <div className="main-content">
        {/* Top Bar */}
        <header className={`top-bar no-print ${isPOS ? 'pos-top-bar' : ''}`}>
          <h1 className="top-bar-title text-title3" style={isPOS ? { flex: 'none', marginRight: 'var(--space-4)' } : {}}>{pageTitle}</h1>
          
          {isPOS && (
            <div style={{ flex: 1, maxWidth: '400px', display: 'flex', alignItems: 'center' }}>
              <input
                className="form-input"
                placeholder={`🔍 ${t('search')} menu...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                id="menu-search-input"
                style={{ height: '36px', fontSize: 'var(--text-subhead)', padding: '6px 12px' }}
              />
            </div>
          )}

          <div className="top-bar-actions" style={isPOS ? { marginLeft: 'auto' } : {}}>
            {/* Network status indicator */}
            <div 
              onClick={toggleOfflineSimulation}
              title="Click to toggle simulated offline mode for testing"
              style={{
                cursor: 'pointer',
                background: isSimulatedOffline 
                  ? 'rgba(255, 149, 0, 0.1)' 
                  : isOnline 
                    ? 'rgba(52, 199, 89, 0.1)' 
                    : 'rgba(255, 59, 48, 0.1)',
                color: isSimulatedOffline 
                  ? 'var(--color-orange)' 
                  : isOnline 
                    ? 'var(--color-green)' 
                    : 'var(--color-red)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                border: `1.5px solid ${
                  isSimulatedOffline 
                    ? 'var(--color-orange)' 
                    : isOnline 
                      ? 'var(--color-green)' 
                      : 'var(--color-red)'
                }`,
                fontSize: '11px',
                fontWeight: 'var(--weight-bold)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                animation: !isOnline ? 'blink 1.5s infinite' : 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ 
                width: 6, 
                height: 6, 
                borderRadius: '50%', 
                background: isSimulatedOffline 
                  ? 'var(--color-orange)' 
                  : isOnline 
                    ? 'var(--color-green)' 
                    : 'var(--color-red)' 
              }} />
              {isSimulatedOffline ? '🟠 Sim Offline' : isOnline ? '🟢 Connected' : '⚠️ Offline'}
            </div>

            {/* Language toggle */}
            <button
              className="btn btn-secondary btn-icon"
              onClick={toggleLang}
              title={i18n.language === 'ar' ? 'Switch to English' : 'تبديل إلى العربية'}
              id="lang-toggle-btn"
            >
              <Globe size={16} />
            </button>

            {/* Notification bell */}
            <button
              className="btn btn-secondary btn-icon"
              style={{ position: 'relative' }}
              onClick={markOnlineOrdersRead}
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

            {/* Restaurant badge */}
            {restaurant?.name && (
              <div className="badge badge-blue" style={{ fontSize: 'var(--text-caption2)' }}>
                {restaurant.name}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className={isPOS ? '' : 'page-content'} style={isPOS ? { flex: 1, overflow: 'hidden' } : {}}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
