import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import {
  LayoutDashboard, ShoppingCart, LayoutGrid,
  ChefHat, BarChart3, Users, UtensilsCrossed,
  Map, Settings, Building2, ChevronLeft, ChevronRight, LogOut,
  Wallet, Truck, Package, Contact, Calendar, ClipboardList
} from 'lucide-react';
import toast from 'react-hot-toast';

const NAV = [
  { key: 'dashboard',      path: '/dashboard',           icon: LayoutDashboard, label: 'dashboard',    roles: ['admin', 'super_admin', 'cashier'] },
  { key: 'pos',            path: '/pos',                  icon: ShoppingCart,    label: 'pos',          roles: ['admin', 'super_admin', 'cashier', 'waiter'] },
  { key: 'tables',         path: '/tables',               icon: LayoutGrid,      label: 'tables',       roles: ['admin', 'super_admin', 'cashier', 'waiter'] },
  { key: 'active_orders',  path: '/orders',               icon: ClipboardList,   label: 'activeOrders', roles: ['admin', 'super_admin', 'cashier', 'waiter'] },
  { key: 'online_orders',  path: '/online-orders',        icon: Truck,           label: 'deliveryOrders', roles: ['admin', 'super_admin', 'cashier'], badge: true },
  { key: 'kds',            path: '/kds',                  icon: ChefHat,         label: 'kitchen',      roles: ['admin', 'super_admin', 'kitchen'] },
  { key: 'reports',        path: '/reports',              icon: BarChart3,       label: 'reports',      roles: ['admin', 'super_admin'] },
];

const ADMIN_NAV = [
  { key: 'staff',       path: '/admin/staff',       icon: Users,            label: 'staff' },
  { key: 'payroll',     path: '/admin/payroll',     icon: Wallet,           label: 'payroll' },
  { key: 'delivery_hub', path: '/admin/delivery-hub', icon: Truck,          label: 'deliveryHub' },
  { key: 'menu',        path: '/admin/menu',         icon: UtensilsCrossed,  label: 'menu' },
  { key: 'inventory',   path: '/admin/inventory',    icon: Package,          label: 'inventory' },
  { key: 'customers',   path: '/admin/customers',    icon: Contact,          label: 'customers' },
  { key: 'reservations', path: '/admin/reservations',  icon: Calendar,         label: 'reservations' },
  { key: 'floor',       path: '/admin/floor',        icon: Map,              label: 'floorPlan' },
  { key: 'settings',   path: '/admin/settings',     icon: Settings,         label: 'settings' },
  { key: 'restaurants',path: '/admin/restaurants',  icon: Building2,        label: 'restaurants', superAdmin: true },
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const { t } = useTranslation();
  const { staffDoc, signOut, restaurant } = useAuthStore();
  const { unreadOnlineCount } = useOrderStore();
  const role = staffDoc?.role ?? 'cashier';
  const isAdmin = ['admin', 'super_admin'].includes(role);
  const isSuperAdmin = role === 'super_admin';

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">🍽️</div>
        {!collapsed && <span className="sidebar-brand">RestaurantOS</span>}
      </div>

      {/* Restaurant name */}
      {!collapsed && restaurant?.name && (
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
            {!collapsed && <div className="sidebar-section-label">{t('pos')}</div>}
            {NAV.filter(n => n.roles.includes('all') || n.roles.includes(role)).map(n => (
              <NavLink
                key={n.key}
                to={n.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? t(n.label) : undefined}
              >
                <span className="nav-item-icon"><n.icon size={18} strokeWidth={1.8} /></span>
                {!collapsed && <span>{t(n.label)}</span>}
                {n.badge && unreadOnlineCount > 0 && !collapsed && (
                  <span className="nav-badge">{unreadOnlineCount}</span>
                )}
                {n.badge && unreadOnlineCount > 0 && collapsed && (
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
            {!collapsed && <div className="sidebar-section-label" style={{marginTop: isSuperAdmin ? 0 : 'var(--space-3)'}}>{t('admin')}</div>}
            {ADMIN_NAV.filter(n => isSuperAdmin ? n.superAdmin : !n.superAdmin).map(n => (
              <NavLink
                key={n.key}
                to={n.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? t(n.label) : undefined}
              >
                <span className="nav-item-icon"><n.icon size={18} strokeWidth={1.8} /></span>
                {!collapsed && <span>{t(n.label)}</span>}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer" style={{ padding: collapsed ? 'var(--space-3) var(--space-2)' : 'var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {!collapsed && (
          <div style={{ marginBottom: 'var(--space-3)', overflow: 'hidden', width: '100%' }}>
            <div style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={staffDoc?.email || staffDoc?.name}>
              {staffDoc?.name === 'Super Admin' ? (staffDoc?.email ?? 'Super Admin') : (staffDoc?.name ?? 'User')}
            </div>
            <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)', textTransform: 'capitalize' }}>
              {staffDoc?.role ?? 'Staff'}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: collapsed ? 'column' : 'row', gap: 'var(--space-2)', width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <button
            className="btn btn-secondary btn-icon"
            onClick={handleSignOut}
            title="Sign out"
            style={{ width: '36px', height: '36px', flexShrink: 0 }}
          >
            <LogOut size={16} />
          </button>
          <button
            className="btn btn-secondary btn-icon"
            style={{ 
              marginLeft: collapsed ? '0' : 'auto',
              width: '36px',
              height: '36px',
              flexShrink: 0
            }}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
