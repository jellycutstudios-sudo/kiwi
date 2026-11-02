import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

/**
 * ProtectedRoute — guards routes based on authentication, approval, and optional role.
 *
 * Props:
 *  isAuth      {boolean} — user is authenticated
 *  isApproved  {boolean} — restaurant is approved
 *  requiredRole {string|string[]|undefined} — e.g. 'admin' or ['admin','super_admin']
 *  userRole    {string|undefined} — current user's role from authStore
 */
export default function ProtectedRoute({ isAuth, isApproved, requiredRole, userRole }) {
  const location = useLocation();
  const restaurant = useAuthStore(s => s.restaurant);

  if (!isAuth) return <Navigate to="/login" replace />;
  if (!isApproved) return <Navigate to="/pending-approval" replace />;

  // When Super Admin is in global platform scope (no specific store chosen),
  // they belong strictly in the Platform Console (/admin/restaurants).
  if (userRole === 'super_admin' && !restaurant?.id && location.pathname !== '/admin/restaurants') {
    return <Navigate to="/admin/restaurants" replace />;
  }

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowed.includes(userRole)) {
      // Authenticated but insufficient role — redirect to role's home view
      const fallback = userRole === 'super_admin'
        ? '/admin/restaurants'
        : (['waiter', 'server', 'runner'].includes(userRole) ? '/tables' : '/dashboard');
      return <Navigate to={fallback} replace />;
    }
  }

  return <Outlet />;
}
