import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  LayoutDashboard, Utensils, Armchair,
  ChefHat, BarChart3, Users, UtensilsCrossed,
  Layers, Settings, Building2, ChevronLeft, ChevronRight, LogOut,
  Wallet, Smartphone, Bike, Package, HeartHandshake, Calendar, ClipboardList, X, MonitorPlay, ReceiptText, BookOpen, RefreshCw,
  ChevronDown, ChevronUp, Copy, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import HelpGuide from '../shared/HelpGuide';
import { useBusinessConfig } from '../../hooks/useBusinessConfig';
import { useUpdateStore } from '../../stores/updateStore';

const NAV = [
  { key: 'dashboard',      path: '/dashboard',           icon: LayoutDashboard, label: 'dashboard',    roles: ['admin', 'super_admin', 'cashier'] },
  { key: 'pos',            path: '/pos',                  icon: Utensils,        label: 'pos',          roles: ['admin', 'super_admin', 'cashier', 'waiter'] },
  { key: 'tables',         path: '/tables',               icon: Armchair,        label: 'tables',       roles: ['admin', 'super_admin', 'cashier', 'waiter'], requiredMode: 'table' },
  { key: 'online_orders',  path: '/online-orders',        icon: Smartphone,      label: 'onlineOrders', roles: ['admin', 'super_admin', 'cashier', 'waiter'], badgeType: 'onlineOrders', requiredMode: 'online' },
  { key: 'delivery_hub',   path: '/admin/delivery-hub',  icon: Bike,            label: 'deliveryHub',  roles: ['admin', 'super_admin', 'cashier'], requiredMode: 'delivery_hub' },
  { key: 'kds',            path: '/kds',                  icon: ChefHat,         label: 'kitchen',      roles: ['admin', 'super_admin', 'kitchen'], requiredMode: 'kds' },
  { key: 'reports',        path: '/reports',              icon: BarChart3,       label: 'reports',      roles: ['admin', 'super_admin'] },
];

const ADMIN_NAV = [
  { key: 'staff',       path: '/admin/staff',       icon: Users,            label: 'staff' },
  { key: 'payroll',     path: '/admin/payroll',     icon: Wallet,           label: 'payroll', requiredMode: 'payroll' },
  { key: 'menu',        path: '/admin/menu',         icon: UtensilsCrossed,  label: 'menu' },
  { key: 'inventory',   path: '/admin/inventory',    icon: Package,          label: 'inventory', requiredMode: 'inventory' },
  { key: 'customers',   path: '/admin/customers',    icon: HeartHandshake,   label: 'customers', requiredMode: 'customers' },
  { key: 'reservations', path: '/admin/reservations',  icon: Calendar,         label: 'reservations', requiredMode: 'reservations' },
  { key: 'transactions', path: '/admin/transactions', icon: ReceiptText,     label: 'transactions' },
  { key: 'posters',     path: '/admin/posters',     icon: MonitorPlay,      label: 'posters', requiredMode: 'posters' },
  { key: 'settings',   path: '/admin/settings',     icon: Settings,         label: 'settings' },
  { key: 'restaurants',path: '/admin/restaurants',  icon: Building2,        label: 'restaurants', superAdmin: true },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { t } = useTranslation();
  const location = useLocation();
  const staffDoc = useAuthStore(s => s.staffDoc);
  const signOut = useAuthStore(s => s.signOut);
  const restaurant = useAuthStore(s => s.restaurant);
  const unreadOnlineCount = useOrderStore(s => s.unreadOnlineCount ?? 0);
  const onlineOrders = useOrderStore(s => s.onlineOrders ?? []);
  const activeOrdersCount = useOrderStore(s => s.activeOrders?.length ?? 0);
  const role = staffDoc?.role ?? 'cashier';
  const { terms } = useBusinessConfig();
  const hasUpdate = useUpdateStore(s => s.hasUpdate);
  const isUpdating = useUpdateStore(s => s.isUpdating);
  const applyUpdate = useUpdateStore(s => s.applyUpdate);

  const [anyPlatformPaused, setAnyPlatformPaused] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Check if current route is in Admin section so it auto-expands
  const isCurrentRouteAdmin = location.pathname.startsWith('/admin');
  const [adminExpanded, setAdminExpanded] = useState(() => isCurrentRouteAdmin || !mobileOpen);

  useEffect(() => {
    if (isCurrentRouteAdmin) {
      setAdminExpanded(true);
    }
  }, [isCurrentRouteAdmin]);

  const sidebarRef = useRef(null);

  // Close on Escape key or clicking outside when mobile sidebar is open
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    const handleClickOutside = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        const burgerBtn = document.getElementById('burger-menu-btn');
        if (burgerBtn && burgerBtn.contains(e.target)) return;
        setMobileOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [mobileOpen, setMobileOpen]);

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [mobileOpen]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const q = collection(db, 'restaurants', restaurant.id, 'deliverySettings');
    const unsub = onSnapshot(q, (snap) => {
      let paused = false;
      const now = new Date();
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.paused) {
          if (data.pauseUntil) {
            const resumeTime = data.pauseUntil.toDate ? data.pauseUntil.toDate() : new Date(data.pauseUntil);
            if (resumeTime > now) {
              paused = true;
            }
          } else {
            paused = true;
          }
        }
      });
      setAnyPlatformPaused(paused);
    }, (err) => {
      console.warn('Sidebar deliverySettings listener:', err);
    });
    return unsub;
  }, [restaurant?.id]);

  const handleItemClick = () => {
    if (setMobileOpen) {
      setMobileOpen(false);
    }
  };

  const isAdmin = ['admin', 'super_admin'].includes(role);
  const isSuperAdmin = role === 'super_admin';

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
  };

  const isCollapsed = collapsed && !mobileOpen;

  const displayName = staffDoc?.name === 'Super Admin'
    ? (staffDoc?.email ?? 'Super Admin')
    : (staffDoc?.name ?? 'User');

  const staffInitials = (displayName || 'U')
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const filteredAdminNav = ADMIN_NAV.filter(n => {
    const hasRole = isSuperAdmin ? n.superAdmin : !n.superAdmin;
    if (!hasRole) return false;
    if (n.requiredMode) {
      const modes = restaurant?.modes ?? ['pos'];
      return modes.includes(n.requiredMode);
    }
    return true;
  });

  return (
    <aside ref={sidebarRef} className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Header */}
      <div 
        className="sidebar-header" 
        style={{ 
          display: 'flex', 
          justifyContent: isCollapsed ? 'center' : 'space-between', 
          alignItems: 'center', 
          width: '100%',
          padding: isCollapsed ? 0 : '0 var(--space-4)',
          height: '58px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: isCollapsed ? 'center' : 'flex-start', width: isCollapsed ? '100%' : 'auto' }}>
          <img src="/ricon.svg" alt="DineOS" style={{ width: '32px', height: '32px', display: 'block' }} />
          {!isCollapsed && (
            <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--color-label)' }}>
              DineOS
            </span>
          )}
        </div>
        {!isCollapsed && (
          <button
            className="btn btn-ghost btn-icon sidebar-close-btn"
            onClick={() => setMobileOpen(false)}
            title="Close menu"
            aria-label="Close navigation menu"
            style={{ width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Restaurant Info Pill */}
      {!isCollapsed && restaurant?.name && (
        <div style={{
          margin: '10px 12px 4px',
          padding: '10px 12px',
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-separator)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.14)',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            flexShrink: 0
          }}>
            📍
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--color-label)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {restaurant.name}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const restIdToShow = restaurant.customId || restaurant.slug || restaurant.id;
                if (!restIdToShow) return;
                navigator.clipboard.writeText(restIdToShow);
                setCopiedId(true);
                toast.success(`Copied Restaurant ID: ${restIdToShow}`, { id: 'copy-rest-id', icon: '📋' });
                setTimeout(() => setCopiedId(false), 2000);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--color-label-secondary)',
                background: 'var(--color-fill)',
                border: '1px solid var(--color-separator)',
                borderRadius: '4px',
                padding: '1px 5px',
                marginTop: '2px',
                cursor: 'pointer',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'all 0.12s ease'
              }}
              title="Click to copy Restaurant ID for staff login"
            >
              <span style={{ opacity: 0.6, fontSize: '9px' }}>ID:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-label)' }}>
                {restaurant.customId || restaurant.slug || restaurant.id}
              </span>
              {copiedId ? <Check size={10} color="#10b981" /> : <Copy size={10} style={{ opacity: 0.6 }} />}
            </button>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        {!isSuperAdmin && (
          <div className="sidebar-nav-group">
            {!isCollapsed && (
              <div className="sidebar-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{t('pos')}</span>
                <span style={{ fontSize: '9px', fontWeight: 600, opacity: 0.6 }}>CORE</span>
              </div>
            )}

            {NAV.filter(n => {
              const hasRole = n.roles.includes('all') || n.roles.includes(role);
              if (!hasRole) return false;
              if (n.requiredMode) {
                if (n.key === 'kds') {
                  const km = restaurant?.kitchenConfig?.mode;
                  if (km === 'disabled' || km === 'printer_only') return false;
                  if (km === 'display_only' || km === 'both') return true;
                }
                const modes = restaurant?.modes ?? ['pos'];
                if (n.key === 'online_orders') {
                  return modes.includes('online') || unreadOnlineCount > 0;
                }
                return modes.includes(n.requiredMode);
              }
              return true;
            }).map(n => {
              const badgeCount = n.badgeType === 'onlineOrders'
                ? (unreadOnlineCount > 0 ? unreadOnlineCount : onlineOrders.filter(o => o.status === 'pending').length)
                : n.badgeType === 'activeOrders'
                ? activeOrdersCount
                : 0;

              return (
                <NavLink
                  key={n.key}
                  to={n.path}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  title={isCollapsed ? t(n.label) : undefined}
                  onClick={handleItemClick}
                  style={{ position: 'relative' }}
                >
                  <span className="nav-item-icon"><n.icon size={20} strokeWidth={1.9} /></span>
                  {!isCollapsed && <span style={{ flex: 1 }}>{t(n.label)}</span>}
                  
                  {/* Badges for counts */}
                  {!isCollapsed && badgeCount > 0 && (
                    <span 
                      className="nav-badge" 
                      style={{
                        background: n.badgeType === 'activeOrders' ? '#3b82f6' : 'var(--color-red)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '11px',
                        padding: '2px 7px',
                        borderRadius: '999px',
                        minWidth: '20px'
                      }}
                    >
                      {badgeCount}
                    </span>
                  )}
                  {isCollapsed && badgeCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 4, right: 6,
                      width: 8, height: 8, borderRadius: '50%',
                      background: n.badgeType === 'activeOrders' ? '#3b82f6' : 'var(--color-red)',
                    }} />
                  )}

                  {/* Delivery Hub pause indicator */}
                  {n.key === 'delivery_hub' && anyPlatformPaused && !isCollapsed && (
                    <span className="nav-badge" style={{ background: 'var(--color-red)' }}>⏸️</span>
                  )}
                  {n.key === 'delivery_hub' && anyPlatformPaused && isCollapsed && (
                    <span style={{
                      position: 'absolute', top: 4, right: 6,
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--color-red)',
                    }} />
                  )}
                </NavLink>
              );
            })}
          </div>
        )}

        {/* Admin / Management Section */}
        {isAdmin && (
          <div className="sidebar-admin-section">
            {!isCollapsed ? (
              <button
                type="button"
                className="sidebar-admin-toggle"
                onClick={() => setAdminExpanded(v => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 12px 6px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  color: 'var(--color-label-tertiary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {t('admin')}
                  <span style={{
                    background: 'var(--color-fill-secondary)',
                    color: 'var(--color-label-secondary)',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'none'
                  }}>
                    {filteredAdminNav.length}
                  </span>
                </span>
                {adminExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            ) : (
              <div className="sidebar-section-divider" />
            )}

            {/* If collapsed on desktop, always show icons. If expanded, toggle via adminExpanded */}
            {(isCollapsed || adminExpanded) && (
              <div className="sidebar-admin-items">
                {filteredAdminNav.map(n => (
                  <NavLink
                    key={n.key}
                    to={n.path}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    title={isCollapsed ? t(n.label) : undefined}
                    onClick={handleItemClick}
                  >
                    <span className="nav-item-icon"><n.icon size={20} strokeWidth={1.9} /></span>
                    {!isCollapsed && <span>{n.key === 'menu' && terms?.catalog ? terms.catalog : t(n.label)}</span>}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer / Profile & Action Strip */}
      <div className="sidebar-footer" style={{ padding: isCollapsed ? 'var(--space-3) var(--space-2)' : '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '1px solid var(--color-separator)' }}>
        {hasUpdate && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={applyUpdate}
            style={{
              width: '100%',
              marginBottom: 'var(--space-2)',
              height: '38px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              color: '#fff',
              background: 'linear-gradient(135deg, #f97316, #ef4444)',
              border: 'none',
              borderRadius: '10px',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
              cursor: 'pointer'
            }}
            title="A new version of DineOS is ready to install"
          >
            <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
            {!isCollapsed && (isUpdating ? 'Updating...' : 'Update App')}
          </button>
        )}

        {/* User Card when expanded */}
        {!isCollapsed && (
          <div style={{
            width: '100%',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-separator)',
            borderRadius: '12px',
            padding: '10px 12px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            {/* Initials Avatar */}
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '13px',
              flexShrink: 0
            }}>
              {staffInitials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--color-label)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }} title={displayName}>
                {displayName}
              </div>
              <div style={{
                fontSize: '11px',
                color: 'var(--color-label-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                <span style={{ textTransform: 'capitalize' }}>{staffDoc?.role ?? 'Staff'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Actions: Guide, Logout, Collapse */}
        <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
          {!isCollapsed ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowGuide(true)}
                title="Help & Guide"
                style={{
                  flex: 1,
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '10px'
                }}
              >
                <BookOpen size={16} />
                Guide
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSignOut}
                title="Sign out"
                style={{
                  flex: 1,
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '10px',
                  color: '#ef4444'
                }}
              >
                <LogOut size={16} />
                Logout
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-icon"
                onClick={() => setShowGuide(true)}
                title="Help & Guide"
                style={{ width: '38px', height: '38px' }}
              >
                <BookOpen size={16} />
              </button>
              <button
                className="btn btn-secondary btn-icon"
                onClick={handleSignOut}
                title="Sign out"
                style={{ width: '38px', height: '38px', color: '#ef4444' }}
              >
                <LogOut size={16} />
              </button>
            </div>
          )}

          {/* Desktop Collapse Button */}
          {!mobileOpen && (
            <button
              className="btn btn-secondary btn-icon sidebar-collapse-btn"
              style={{ 
                width: '38px',
                height: '40px',
                flexShrink: 0,
                borderRadius: '10px'
              }}
              onClick={() => setCollapsed(!collapsed)}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>
      </div>

      {showGuide && <HelpGuide onClose={() => setShowGuide(false)} />}
    </aside>
  );
}
