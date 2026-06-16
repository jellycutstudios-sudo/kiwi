import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute({ isAuth, isApproved }) {
  if (!isAuth) return <Navigate to="/login" replace />;
  if (!isApproved) return <Navigate to="/pending-approval" replace />;
  return <Outlet />;
}
