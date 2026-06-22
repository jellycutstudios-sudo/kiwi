import { Navigate, Outlet } from 'react-router-dom';

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
  if (!isAuth) return <Navigate to="/login" replace />;
  if (!isApproved) return <Navigate to="/pending-approval" replace />;

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowed.includes(userRole)) {
      // Authenticated but insufficient role — redirect to dashboard
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <Outlet />;
}
