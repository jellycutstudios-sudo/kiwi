import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import './i18n';
import './index.css';
import { useAuthStore } from './stores/authStore';
import AppShell from './components/layout/AppShell';
import LoadingScreen from './components/shared/LoadingScreen';
import ProtectedRoute from './components/layout/ProtectedRoute';

import { isFirebaseConfigured } from './firebase';
import FirebaseSetupWizard from './components/shared/FirebaseSetupWizard';
import DesktopContextMenu from './components/shared/DesktopContextMenu';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Lazy-loaded routes with deployment-resilient auto-recovery
const Login          = lazyWithRetry(() => import('./routes/Login'));
const Dashboard      = lazyWithRetry(() => import('./routes/Dashboard'));
const POS            = lazyWithRetry(() => import('./routes/POS'));
const TableMap       = lazyWithRetry(() => import('./routes/TableMap'));
const OnlineOrders   = lazyWithRetry(() => import('./routes/OnlineOrders'));
const KDS            = lazyWithRetry(() => import('./routes/KDS'));
const TokenDisplay   = lazyWithRetry(() => import('./routes/TokenDisplay'));
const OnlineOrderPage= lazyWithRetry(() => import('./routes/OnlineOrderPage'));
const Reports        = lazyWithRetry(() => import('./routes/Reports'));
const StaffManager   = lazyWithRetry(() => import('./routes/admin/StaffManager'));
const Payroll        = lazyWithRetry(() => import('./routes/admin/Payroll'));
const MenuEditor     = lazyWithRetry(() => import('./routes/admin/MenuEditor'));
const Inventory      = lazyWithRetry(() => import('./routes/admin/Inventory'));
const Customers      = lazyWithRetry(() => import('./routes/admin/Customers'));
const Reservations   = lazyWithRetry(() => import('./routes/admin/Reservations'));
const Settings       = lazyWithRetry(() => import('./routes/admin/Settings'));
const Restaurants    = lazyWithRetry(() => import('./routes/admin/Restaurants'));
const DeliveryHub    = lazyWithRetry(() => import('./routes/admin/DeliveryHub'));
const Transactions   = lazyWithRetry(() => import('./routes/admin/Transactions'));
const PendingApproval= lazyWithRetry(() => import('./routes/PendingApproval'));
const ActiveOrders   = lazyWithRetry(() => import('./routes/ActiveOrders'));
const LandingPage    = lazyWithRetry(() => import('./routes/LandingPage'));
const PosterManager  = lazyWithRetry(() => import('./routes/admin/PosterManager'));
const PosterDisplay  = lazyWithRetry(() => import('./routes/PosterDisplay'));

export default function App() {
  const { i18n } = useTranslation();
  const { initAuthListener, loading, user, staffDoc, restaurant } = useAuthStore();
  const userRole = staffDoc?.role ?? null;
  const isSuperAdmin = userRole === 'super_admin';
  const isApproved = isSuperAdmin || restaurant?.status === 'approved';

  // Init Firebase auth listener once on mount
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = initAuthListener();
    return unsub;
  }, [initAuthListener]);

  // Safety watchdog: ensure loading screen is never stuck indefinitely
  useEffect(() => {
    const timer = setTimeout(() => {
      if (useAuthStore.getState().loading) {
        useAuthStore.setState({ loading: false });
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Apply RTL direction for Arabic
  useEffect(() => {
    const dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', i18n.language);
  }, [i18n.language]);

  if (!isFirebaseConfigured) {
    return <FirebaseSetupWizard />;
  }

  if (loading) return <LoadingScreen />;

  const isAuth = !!user || !!staffDoc;

  const defaultRouteForRole = (role) => {
    if (role === 'super_admin') return '/admin/restaurants';
    if (role === 'kitchen') return '/kds';
    if (role === 'waiter' || role === 'server') return '/tables';
    if (role === 'cashier') return '/pos';
    return '/dashboard';
  };

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'var(--font-family)',
            fontSize: '14px',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-label)',
            border: '1px solid var(--color-separator)',
          },
          success: { iconTheme: { primary: 'var(--color-green)', secondary: '#fff' } },
          error:   { iconTheme: { primary: 'var(--color-red)',   secondary: '#fff' } },
        }}
      />
      <DesktopContextMenu />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Public routes — no auth needed */}
          <Route path="/"                             element={isAuth ? (isApproved ? <Navigate to={defaultRouteForRole(userRole)} replace /> : <Navigate to="/pending-approval" replace />) : <LandingPage />} />
          <Route path="/landing"                      element={<LandingPage />} />
          <Route path="/display/tokens/:restaurantId" element={<TokenDisplay />} />
          <Route path="/display/slides/:restaurantId" element={<PosterDisplay />} />
          <Route path="/display/slides/:restaurantId/:slideshowId" element={<PosterDisplay />} />
          <Route path="/order/:restaurantId"          element={<OnlineOrderPage />} />
          <Route path="/menu/:restaurantId"           element={<OnlineOrderPage />} />
          <Route path="/login"                        element={isAuth ? (isApproved ? <Navigate to={defaultRouteForRole(userRole)} replace /> : <Navigate to="/pending-approval" replace />) : <Login />} />
          <Route path="/pending-approval"             element={isAuth ? (!isApproved ? <PendingApproval /> : <Navigate to="/" replace />) : <Navigate to="/login" replace />} />

          {/* Protected POS routes — all authenticated + approved users */}
          <Route element={<ProtectedRoute isAuth={isAuth} isApproved={isApproved} userRole={userRole} />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard"       element={<Dashboard />} />
              <Route path="/pos"             element={<POS />} />
              <Route path="/tables"          element={<TableMap />} />
              <Route path="/kds"             element={<KDS />} />

              {/* Online orders & counter active orders — cashiers, managers, and admins only */}
              <Route element={<ProtectedRoute isAuth={isAuth} isApproved={isApproved} requiredRole={['admin', 'super_admin', 'cashier', 'manager']} userRole={userRole} />}>
                <Route path="/orders"          element={<ActiveOrders />} />
                <Route path="/online-orders"   element={<OnlineOrders />} />
              </Route>

              {/* Admin-only routes — require 'admin' or 'super_admin' role */}
              <Route element={<ProtectedRoute isAuth={isAuth} isApproved={isApproved} requiredRole={['admin', 'super_admin']} userRole={userRole} />}>
                <Route path="/reports"            element={<Reports />} />
                <Route path="/admin/staff"        element={<StaffManager />} />
                <Route path="/admin/payroll"      element={<Payroll />} />
                <Route path="/admin/menu"         element={<MenuEditor />} />
                <Route path="/admin/inventory"    element={<Inventory />} />
                <Route path="/admin/customers"    element={<Customers />} />
                <Route path="/admin/reservations" element={<Reservations />} />
                <Route path="/admin/floor"        element={<Navigate to="/tables?edit=true" replace />} />
                <Route path="/admin/transactions" element={<Transactions />} />
                <Route path="/admin/settings"     element={<Settings />} />
                <Route path="/admin/delivery-hub" element={<DeliveryHub />} />
                <Route path="/admin/posters"      element={<PosterManager />} />
              </Route>

              {/* Super-admin only platform management */}
              <Route element={<ProtectedRoute isAuth={isAuth} isApproved={isApproved} requiredRole={['super_admin']} userRole={userRole} />}>
                <Route path="/admin/restaurants" element={<Restaurants />} />
              </Route>
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to={isAuth ? (isApproved ? (isSuperAdmin ? '/admin/restaurants' : '/dashboard') : '/pending-approval') : '/'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
