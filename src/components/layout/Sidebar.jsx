import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  LayoutDashboard, ShoppingCart, LayoutGrid,
  ChefHat, BarChart3, Users, UtensilsCrossed,
  Map, Settings, Building2, ChevronLeft, ChevronRight, LogOut,
  Wallet, Truck, Package, Contact, Calendar, ClipboardList, X, Sliders, Tv
} from 'lucide-react';
import toast from 'react-hot-toast';

const NAV = [
  { key: 'dashboard',      path: '/dashboard',           icon: LayoutDashboard, label: 'dashboard',    roles: ['admin', 'super_admin', 'cashier'] },
  { key: 'pos',            path: '/pos',                  icon: ShoppingCart,    label: 'pos',          roles: ['admin', 'super_admin', 'cashier', 'waiter'] },
  { key: 'tables',         path: '/tables',               icon: LayoutGrid,      label: 'tables',       roles: ['admin', 'super_admin', 'cashier', 'waiter'], requiredMode: 'table' },
  { key: 'active_orders',  path: '/orders',               icon: ClipboardList,   label: 'activeOrders', roles: ['admin', 'super_admin', 'cashier', 'waiter'] },
  { key: 'online_orders',  path: '/online-orders',        icon: Truck,           label: 'deliveryOrders', roles: ['admin', 'super_admin', 'cashier'], badge: true, requiredMode: 'online' },
  { key: 'delivery_hub',   path: '/admin/delivery-hub',  icon: Sliders,         label: 'deliveryHub',  roles: ['admin', 'super_admin', 'cashier'], requiredMode: 'delivery_hub' },
  { key: 'kds',            path: '/kds',                  icon: ChefHat,         label: 'kitchen',      roles: ['admin', 'super_admin', 'kitchen'], requiredMode: 'kds' },
  { key: 'reports',        path: '/reports',              icon: BarChart3,       label: 'reports',      roles: ['admin', 'super_admin'] },
];

const ADMIN_NAV = [
  { key: 'staff',       path: '/admin/staff',       icon: Users,            label: 'staff' },
  { key: 'payroll',     path: '/admin/payroll',     icon: Wallet,           label: 'payroll', requiredMode: 'payroll' },
  { key: 'menu',        path: '/admin/menu',         icon: UtensilsCrossed,  label: 'menu' },
  { key: 'inventory',   path: '/admin/inventory',    icon: Package,          label: 'inventory', requiredMode: 'inventory' },
  { key: 'customers',   path: '/admin/customers',    icon: Contact,          label: 'customers', requiredMode: 'customers' },
  { key: 'reservations', path: '/admin/reservations',  icon: Calendar,         label: 'reservations', requiredMode: 'reservations' },
  { key: 'floor',       path: '/admin/floor',        icon: Map,              label: 'floorPlan', requiredMode: 'table' },
  { key: 'posters',     path: '/admin/posters',     icon: Tv,               label: 'posters' },
  { key: 'settings',   path: '/admin/settings',     icon: Settings,         label: 'settings' },
  { key: 'restaurants',path: '/admin/restaurants',  icon: Building2,        label: 'restaurants', superAdmin: true },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { t } = useTranslation();
  const { staffDoc, signOut, restaurant } = useAuthStore();
  const { unreadOnlineCount } = useOrderStore();
  const role = staffDoc?.role ?? 'cashier';

  const [anyPlatformPaused, setAnyPlatformPaused] = useState(false);

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

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Header */}
      <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isCollapsed ? (
            <img src="/ricon.svg" alt="Icon" style={{ width: '32px', height: '32px' }} />
          ) : (
            <img src="/ricon.svg" alt="Logo" style={{ height: '28px', marginLeft: '4px' }} />
          )}
        </div>
        <button
          className="btn btn-ghost btn-icon sidebar-close-btn"
          onClick={() => setMobileOpen(false)}
          title="Close menu"
          style={{ width: '32px', height: '32px', padding: 0 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Restaurant name */}
      {!isCollapsed && restaurant?.name && (
        <div style={{
          padding: 'var(--space-2) var(--space-4)',
          borderBottom: '1px solid var(--color-separator)',
          fontSize: 'var(--text-caption1)',
          color: 'var(--color-label-secondary)',
          fontWeight: 'var(--weight-medium)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          📍 {restaurant.name}
        </div>
      )}

      {/* Nav */}
      <nav className="sidebar-nav">
        {!isSuperAdmin && (
          <>
            {!isCollapsed && <div className="sidebar-section-label">{t('pos')}</div>}
            {NAV.filter(n => {
              const hasRole = n.roles.includes('all') || n.roles.includes(role);
              if (!hasRole) return false;
              if (n.requiredMode) {
                const modes = restaurant?.modes ?? ['pos'];
                return modes.includes(n.requiredMode);
              }
              return true;
            }).map(n => (
              <NavLink
                key={n.key}
                to={n.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={isCollapsed ? t(n.label) : undefined}
                onClick={handleItemClick}
                style={{ position: 'relative' }}
              >
                <span className="nav-item-icon"><n.icon size={18} strokeWidth={1.8} /></span>
                {!isCollapsed && <span>{t(n.label)}</span>}
                {n.badge && unreadOnlineCount > 0 && !isCollapsed && (
                  <span className="nav-badge">{unreadOnlineCount}</span>
                )}
                {n.badge && unreadOnlineCount > 0 && isCollapsed && (
                  <span style={{
                    position: 'absolute', top: 4, right: 6,
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--color-red)',
                  }} />
                )}
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
            ))}
          </>
        )}

        {isAdmin && (
          <>
            {!isCollapsed && <div className="sidebar-section-label" style={{marginTop: isSuperAdmin ? 0 : 'var(--space-3)'}}>{t('admin')}</div>}
            {ADMIN_NAV.filter(n => {
              const hasRole = isSuperAdmin ? n.superAdmin : !n.superAdmin;
              if (!hasRole) return false;
              if (n.requiredMode) {
                const modes = restaurant?.modes ?? ['pos'];
                return modes.includes(n.requiredMode);
              }
              return true;
            }).map(n => (
              <NavLink
                key={n.key}
                to={n.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={isCollapsed ? t(n.label) : undefined}
                onClick={handleItemClick}
              >
                <span className="nav-item-icon"><n.icon size={18} strokeWidth={1.8} /></span>
                {!isCollapsed && <span>{t(n.label)}</span>}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer" style={{ padding: isCollapsed ? 'var(--space-3) var(--space-2)' : 'var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {!isCollapsed && (
          <div style={{ marginBottom: 'var(--space-3)', overflow: 'hidden', width: '100%' }}>
            <div style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={staffDoc?.email || staffDoc?.name}>
              {staffDoc?.name === 'Super Admin' ? (staffDoc?.email ?? 'Super Admin') : (staffDoc?.name ?? 'User')}
            </div>
            <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)', textTransform: 'capitalize' }}>
              {staffDoc?.role ?? 'Staff'}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: isCollapsed ? 'column' : 'row', gap: 'var(--space-2)', width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <button
            className="btn btn-secondary btn-icon"
            onClick={handleSignOut}
            title="Sign out"
            style={{ width: '36px', height: '36px', flexShrink: 0 }}
          >
            <LogOut size={16} />
          </button>
          <button
            className="btn btn-secondary btn-icon sidebar-collapse-btn"
            style={{ 
              marginLeft: isCollapsed ? '0' : 'auto',
              width: '36px',
              height: '36px',
              flexShrink: 0
            }}
            onClick={() => setCollapsed(!collapsed)}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
