import { Suspense, lazy, useEffect } from 'react';
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

// Lazy-loaded routes for maximum perf
const Login          = lazy(() => import('./routes/Login'));
const Dashboard      = lazy(() => import('./routes/Dashboard'));
const POS            = lazy(() => import('./routes/POS'));
const TableMap       = lazy(() => import('./routes/TableMap'));
const OnlineOrders   = lazy(() => import('./routes/OnlineOrders'));
const KDS            = lazy(() => import('./routes/KDS'));
const TokenDisplay   = lazy(() => import('./routes/TokenDisplay'));
const OnlineOrderPage= lazy(() => import('./routes/OnlineOrderPage'));
const Reports        = lazy(() => import('./routes/Reports'));
const StaffManager   = lazy(() => import('./routes/admin/StaffManager'));
const Payroll        = lazy(() => import('./routes/admin/Payroll'));
const MenuEditor     = lazy(() => import('./routes/admin/MenuEditor'));
const Inventory      = lazy(() => import('./routes/admin/Inventory'));
const Customers      = lazy(() => import('./routes/admin/Customers'));
const Reservations   = lazy(() => import('./routes/admin/Reservations'));
const FloorPlanEditor= lazy(() => import('./routes/admin/FloorPlanEditor'));
const Settings       = lazy(() => import('./routes/admin/Settings'));
const Restaurants    = lazy(() => import('./routes/admin/Restaurants'));
const DeliveryHub    = lazy(() => import('./routes/admin/DeliveryHub'));
const PendingApproval= lazy(() => import('./routes/PendingApproval'));

export default function App() {
  const { i18n } = useTranslation();
  const { initAuthListener, loading, user, staffDoc, restaurant } = useAuthStore();
  const isSuperAdmin = staffDoc?.role === 'super_admin';
  const isApproved = isSuperAdmin || restaurant?.status === 'approved';

  // Init Firebase auth listener
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = initAuthListener();
    return unsub;
  }, [initAuthListener]);

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
          },
          success: { iconTheme: { primary: 'var(--color-green)', secondary: '#fff' } },
          error:   { iconTheme: { primary: 'var(--color-red)',   secondary: '#fff' } },
        }}
      />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Public routes — no auth needed */}
          <Route path="/display/tokens/:restaurantId" element={<TokenDisplay />} />
          <Route path="/order/:restaurantId"          element={<OnlineOrderPage />} />
          <Route path="/login"                        element={isAuth ? (isApproved ? <Navigate to="/" replace /> : <Navigate to="/pending-approval" replace />) : <Login />} />
          <Route path="/pending-approval"             element={isAuth ? (!isApproved ? <PendingApproval /> : <Navigate to="/" replace />) : <Navigate to="/login" replace />} />

          {/* Protected POS routes */}
          <Route element={<ProtectedRoute isAuth={isAuth} isApproved={isApproved} />}>
            <Route element={<AppShell />}>
              <Route path="/"                element={<Navigate to={isSuperAdmin ? "/admin/restaurants" : "/dashboard"} replace />} />
              <Route path="/dashboard"       element={<Dashboard />} />
              <Route path="/pos"             element={<POS />} />
              <Route path="/tables"          element={<TableMap />} />
              <Route path="/online-orders"   element={<OnlineOrders />} />
              <Route path="/kds"             element={<KDS />} />
              <Route path="/reports"         element={<Reports />} />
              {/* Admin-only routes */}
              <Route path="/admin/staff"     element={<StaffManager />} />
              <Route path="/admin/payroll"   element={<Payroll />} />
              <Route path="/admin/menu"      element={<MenuEditor />} />
              <Route path="/admin/inventory" element={<Inventory />} />
              <Route path="/admin/customers" element={<Customers />} />
              <Route path="/admin/reservations" element={<Reservations />} />
              <Route path="/admin/floor"     element={<FloorPlanEditor />} />
              <Route path="/admin/settings"  element={<Settings />} />
              <Route path="/admin/restaurants" element={<Restaurants />} />
              <Route path="/admin/delivery-hub" element={<DeliveryHub />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to={isAuth ? (isApproved ? (isSuperAdmin ? '/admin/restaurants' : '/dashboard') : '/pending-approval') : '/login'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
