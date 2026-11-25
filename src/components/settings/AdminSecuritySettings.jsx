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
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function AdminSecuritySettings() {
  const { staffDoc } = useAuthStore();
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

      toast.success('Admin password updated successfully!');
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
      toast.success(`Password reset email sent to ${adminEmail}!`);
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
          background: 'var(--color-bg-elevated)',
          padding: '14px 18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
              <ShieldCheck size={18} color="var(--color-accent)" />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                Owner Account
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-label-secondary)' }}>
              Manage your owner password and email recovery.
            </p>
          </div>

          <div
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator)',
              fontSize: '12px',
            }}
          >
            <div style={{ color: 'var(--color-label-secondary)', fontSize: '11px', fontWeight: 600 }}>
              Signed in as
            </div>
            <div style={{ fontWeight: 700, color: 'var(--color-label)', marginTop: '1px' }}>
              {adminEmail || 'Admin Session'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Direct Password Change & 1-Click Reset */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 'var(--space-4)', width: '100%', minWidth: 0 }}>
        
        {/* Method 1: Change Password Directly In-App */}
        <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyRound size={18} color="var(--color-accent)" />
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
              Change Password
            </h4>
          </div>

          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>
            Update the owner login password for this account.
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
                background: (!canSubmit || isUpdating || !isEmailAdmin) ? 'rgba(148, 163, 184, 0.14)' : 'var(--color-accent)',
                color: (!canSubmit || isUpdating || !isEmailAdmin) ? 'var(--color-label-secondary)' : '#ffffff',
                border: (!canSubmit || isUpdating || !isEmailAdmin) ? '1px solid var(--color-separator)' : '1px solid var(--color-accent)',
                cursor: (!canSubmit || isUpdating || !isEmailAdmin) ? 'not-allowed' : 'pointer',
                opacity: 1,
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
                Reset via Email
              </h4>
            </div>

            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>
              Send a single-use password reset link to your owner email.
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

          {/* Quick Staff PIN Link */}
          <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="var(--color-accent)" />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                Staff Access &amp; PINs
              </h4>
            </div>

            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-label-secondary)', lineHeight: 1.45 }}>
              Each cashier and waiter signs in with their own 4-digit PIN at the register—keep your owner password private.
            </p>

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
              <span>Manage Staff PINs</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
