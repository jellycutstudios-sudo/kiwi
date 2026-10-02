import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { auth } from '../../firebase';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  Mail,
  Lock,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function AdminSecuritySettings() {
  const { staffDoc, restaurant } = useAuthStore();
  const currentUser = auth?.currentUser;
  const isEmailAdmin = Boolean(currentUser && !currentUser.isAnonymous && currentUser.email);
  const adminEmail = currentUser?.email || staffDoc?.email || '';

  // Form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Status & loading
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Form validations
  const isLengthValid = newPassword.length >= 6;
  const isMatchValid = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = isLengthValid && isMatchValid && currentPassword.trim().length > 0;

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) {
      toast.error('No authenticated admin session found.');
      return;
    }

    if (!isLengthValid) {
      toast.error('New password must be at least 6 characters long.');
      return;
    }

    if (!isMatchValid) {
      toast.error('The new passwords do not match. Please verify.');
      return;
    }

    setIsUpdating(true);
    try {
      // 1. Re-authenticate to ensure session is fresh and prevent unauthorized changes
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword.trim());
      await reauthenticateWithCredential(currentUser, credential);

      // 2. Safely update to the new password in Firebase Auth (Free Spark tier)
      await updatePassword(currentUser, newPassword.trim());

      toast.success('Admin password updated successfully!', { icon: '🔐' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Password change error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect. Please check and try again.');
      } else if (err.code === 'auth/weak-password') {
        toast.error('The new password is too weak. Please use at least 6 characters.');
      } else if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please try again later or use the reset email below.');
      } else {
        toast.error(err.message || 'Failed to update password.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!adminEmail) {
      toast.error('No admin email address found for this account.');
      return;
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, adminEmail);
      setResetSent(true);
      toast.success(`Password reset email sent to ${adminEmail}!`, { icon: '📧' });
    } catch (err) {
      console.error('Failed to send reset email:', err);
      toast.error(err.message || 'Failed to send password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Top Header Card */}
      <div
        className="settings-card"
        style={{
          borderLeft: '4px solid var(--color-accent)',
          background: 'var(--color-bg-elevated)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <ShieldCheck size={22} color="var(--color-accent)" />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                Admin Account & Security
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                100% Free • Firebase Spark
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-label-secondary)' }}>
              Manage your administrator credentials. All credentials use zero-cost Google Firebase bcrypt encryption.
            </p>
          </div>

          <div
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator)',
              fontSize: '12px',
            }}
          >
            <div style={{ color: 'var(--color-label-secondary)', fontSize: '10.5px', textTransform: 'uppercase', fontWeight: 700 }}>
              Logged In As
            </div>
            <div style={{ fontWeight: 700, color: 'var(--color-label)', marginTop: '2px' }}>
              {adminEmail || 'Admin Session'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Direct Password Change & 1-Click Reset */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
        
        {/* Method 1: Change Password Directly In-App */}
        <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyRound size={18} color="var(--color-accent)" />
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
              Change Admin Password
            </h4>
          </div>

          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>
            Enter your current password, then specify a new secure password. This updates your credentials immediately with zero downtime.
          </p>

          {!isEmailAdmin && (
            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                color: '#eab308',
                fontSize: '12px',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Notice:</strong> You are currently logged in via a Quick Staff PIN or Demo session. To change the master admin password, log in using your registered admin email address.
              </div>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Current Password */}
            <div>
              <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                Current Password <span style={{ color: 'var(--color-red)' }}>*</span>
              </label>
              <div className="password-input-wrapper" style={{ position: 'relative' }}>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  className="form-input password-input"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={!isEmailAdmin || isUpdating}
                  required
                  style={{ width: '100%', height: '40px', paddingRight: '42px', fontSize: '13px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="password-toggle-btn"
                  aria-label="Toggle password visibility"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                New Password <span style={{ color: 'var(--color-red)' }}>*</span>
              </label>
              <div className="password-input-wrapper" style={{ position: 'relative' }}>
                <input
                  type={showNew ? 'text' : 'password'}
                  className="form-input password-input"
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={!isEmailAdmin || isUpdating}
                  required
                  style={{ width: '100%', height: '40px', paddingRight: '42px', fontSize: '13px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="password-toggle-btn"
                  aria-label="Toggle password visibility"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                Confirm New Password <span style={{ color: 'var(--color-red)' }}>*</span>
              </label>
              <div className="password-input-wrapper" style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className="form-input password-input"
                  placeholder="Re-type new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={!isEmailAdmin || isUpdating}
                  required
                  style={{ width: '100%', height: '40px', paddingRight: '42px', fontSize: '13px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="password-toggle-btn"
                  aria-label="Toggle password visibility"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Live Requirements Checklist */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '10px',
                borderRadius: '8px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-separator)',
                fontSize: '11.5px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isLengthValid ? '#10b981' : 'var(--color-label-secondary)' }}>
                {isLengthValid ? <CheckCircle size={13} color="#10b981" /> : <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--color-separator)' }} />}
                <span>At least 6 characters</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isMatchValid ? '#10b981' : 'var(--color-label-secondary)' }}>
                {isMatchValid ? <CheckCircle size={13} color="#10b981" /> : <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--color-separator)' }} />}
                <span>Passwords match</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit || isUpdating || !isEmailAdmin}
              style={{
                height: '42px',
                fontSize: '13px',
                fontWeight: 700,
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Lock size={15} />
              {isUpdating ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        </div>

        {/* Method 2: One-Click Reset Email (Easiest & Most Unbreakable) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={18} color="var(--color-blue, #3b82f6)" />
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                1-Click Password Reset Email
              </h4>
            </div>

            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>
              Forgot your current password or prefer a safe link? We will send a secure, single-use password reset link to your admin email address.
            </p>

            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-separator)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                Recipient Email
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-label)', wordBreak: 'break-all' }}>
                {adminEmail || 'No email registered'}
              </div>
            </div>

            {resetSent ? (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Reset link dispatched!</strong> Please check your email inbox and spam folder. The link is valid for 1 hour.
                </div>
              </div>
            ) : null}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSendResetEmail}
              disabled={isSendingReset || !adminEmail}
              style={{
                height: '42px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Mail size={15} />
              {isSendingReset ? 'Sending Reset Link...' : 'Send Password Reset Link'}
            </button>
          </div>

          {/* Quick Staff PIN Distinction Explainer */}
          <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="var(--color-accent)" />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                Admin Password vs. Staff PIN
              </h4>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <strong>🔑 Admin Password:</strong> Used to access this management dashboard, financial reports, and settings. Never share this with cashiers or waitstaff.
              </div>
              <div>
                <strong>🔢 Staff & Cashier PIN:</strong> 4-digit PIN for swift order taking, drawer kicks, and terminal switching at the counter.
              </div>
            </div>

            <Link
              to="/admin/staff"
              className="btn btn-secondary btn-sm"
              style={{
                marginTop: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                width: 'fit-content',
                textDecoration: 'none',
              }}
            >
              <span>Manage Staff 4-Digit PINs</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* Security Best Practices Card */}
      <div
        className="settings-card"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-separator)',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <ShieldAlert size={17} color="var(--color-accent)" />
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
            How to Keep Your Account Truly Unbreakable (Zero Cost)
          </h4>
        </div>

        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: 'var(--color-label-secondary)', lineHeight: 1.6 }}>
          <li>
            <strong>Enable 2-Step Verification (2FA) on your email provider (e.g. Gmail):</strong> Since password reset links are sent to your email, protecting your Gmail account with 2FA prevents any unauthorized reset attempts even if someone gains access to your local computer.
          </li>
          <li>
            <strong>Use Unique Passwords:</strong> Avoid reusing passwords from other restaurant delivery apps or social accounts.
          </li>
          <li>
            <strong>Keep Individual Staff PINs:</strong> Create distinct 4-digit PINs for each cashier or waiter so that managerial actions (voiding, refunds) are logged to the specific staff member.
          </li>
        </ul>
      </div>
    </div>
  );
}
