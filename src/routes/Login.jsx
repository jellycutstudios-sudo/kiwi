import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Download } from 'lucide-react';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { notifyAdminOfNewTrial } from '../utils/sendTrialNotification';
import { usePwaInstall } from '../hooks/usePwaInstall';

export default function Login() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { loginWithEmail, loginWithPin, loading, error, clearError } = useAuthStore();
  const { canInstall, isStandalone, promptInstall } = usePwaInstall();
  // Derive initial mode from URL query param at mount — no useEffect needed
  const [mode, setMode] = useState(() => {
    const queryMode = searchParams.get('mode');
    if (queryMode === 'register' || queryMode === 'pin' || queryMode === 'email') {
      return queryMode;
    }
    return 'email';
  });

  // Demo credentials are only pre-filled in dev/demo builds.
  // Set VITE_ENABLE_DEMO=true in your .env to enable them.
  const isDemoMode = import.meta.env.VITE_ENABLE_DEMO === 'true';
  const [email, setEmail] = useState(() => isDemoMode && searchParams.get('demo') === 'admin' ? 'demo@kiwi.com' : '');
  const [password, setPassword] = useState(() => isDemoMode && searchParams.get('demo') === 'admin' ? 'password123' : '');
  const [showPw, setShowPw] = useState(false);
  const [pin, setPin] = useState('');
  const [restaurantId, setRestaurantId] = useState(() => isDemoMode && searchParams.get('demo') === 'staff' ? 'kiwi' : '');

  // Registration states (Minimal 3 fields)
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRestName, setRegRestName] = useState('');
  const [registering, setRegistering] = useState(false);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    const res = await loginWithEmail(email, password);
    if (!res.ok) toast.error(res.error);
    else toast.success('Welcome back!');
  };

  const handlePinKey = (key) => {
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) submitPin(next);
  };

  const submitPin = async (p) => {
    if (!restaurantId.trim()) {
      toast.error('Enter Restaurant ID first');
      setPin('');
      return;
    }
    const res = await loginWithPin(restaurantId.trim(), p);
    if (!res.ok) {
      toast.error(res.error);
      setPin('');
    } else {
      toast.success('Welcome!');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regRestName.trim() || !regEmail.trim() || !regPassword.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setRegistering(true);
    try {
      // 1. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword);
      const uid = cred.user.uid;

      // 2. Prepare restaurant document reference & generate unique URL slug
      const restDocRef = doc(collection(db, 'restaurants'));
      const newRestId = restDocRef.id;

      const baseSlug = regRestName.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || 'store';
      let slug = baseSlug;
      try {
        const slugQ = query(collection(db, 'restaurants'), where('slug', '==', slug));
        const slugSnap = await getDocs(slugQ);
        if (!slugSnap.empty) {
          slug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;
        }
      } catch (err) {
        console.warn('Could not check slug uniqueness:', err);
      }

      // 3. Write restaurant document with 'pending' status
      await setDoc(restDocRef, {
        name: regRestName.trim(),
        slug: slug,
        currency: 'INR',
        modes: ['pos'],
        taxConfig: { type: 'none' },
        createdAt: serverTimestamp(),
        ownerUid: uid,
        status: 'pending',
      });

      // 4. Write user profile document (owner name derived from restaurant name)
      const ownerName = regRestName.trim();
      await setDoc(doc(db, 'users', uid), {
        uid: uid,
        name: ownerName,
        email: regEmail.trim(),
        role: 'admin',
        restaurantId: newRestId,
        createdAt: serverTimestamp(),
      });

      // 5. Send automated email notification to admin
      notifyAdminOfNewTrial({
        restaurantName: regRestName.trim(),
        ownerName: ownerName,
        email: regEmail.trim(),
        phone: '',
        address: '',
        currency: 'INR',
        restaurantId: newRestId,
      });

      toast.success('Registration successful! Awaiting Super Admin approval.');
    } catch (err) {
      console.error(err);
      toast.error('Registration failed: ' + err.message);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="login-page">

      {/* ── Left brand panel (desktop only) ── */}
      <div className="login-brand-panel">
        <div className="login-brand-content">
          <div className="login-brand-logo-wrap">
            <img src="/logorupos-light.svg" alt="RUPOS" />
          </div>
          <div className="login-brand-hero">
            <h1 className="login-brand-title">Welcome<br />back.</h1>
            <p className="login-brand-tagline">The modern OS for restaurants.</p>
          </div>
        </div>
        <div className="login-brand-footer">
          <Link to="/" className="login-footer-link">← Home</Link>
          <span>© {new Date().getFullYear()} RUPOS</span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="login-form-panel">
        <div className="login-form-card">
          <div className="login-card-header">
            <div className="login-logo-wrap mobile-only">
              <img src="/logorupos.svg" alt="Logo" />
            </div>
            <h2 className="login-card-title">
              {mode === 'email' ? 'Sign in' : mode === 'pin' ? 'Staff PIN' : 'Create Restaurant'}
            </h2>
          </div>

          {/* Mode toggle */}
          <div className="login-mode-toggle">
            {[
              { m: 'email', label: 'Admin' },
              { m: 'pin',   label: 'Staff' },
              { m: 'register', label: 'Register' },
            ].map(item => (
              <button
                key={item.m}
                id={`login-mode-${item.m}`}
                onClick={() => { setMode(item.m); clearError(); setPin(''); }}
                className={`login-mode-btn ${mode === item.m ? 'active' : ''}`}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {error && <div className="login-error-msg">{error}</div>}

          {/* ── Admin email login ── */}
          {mode === 'email' ? (
            <form onSubmit={handleEmailLogin} className="login-form">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input id="login-email" className="form-input" type="email"
                  placeholder={t('emailPlaceholder')} value={email}
                  onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="password-input-wrapper">
                  <input id="login-password" className="form-input password-input"
                    type={showPw ? 'text' : 'password'} placeholder={t('passwordPlaceholder')}
                    value={password} onChange={e => setPassword(e.target.value)} required />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="password-toggle-btn" aria-label="Toggle password visibility">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button id="login-submit-btn" className="login-submit-btn"
                type="submit" disabled={loading}>
                {loading ? 'Signing in…' : t('signIn')}
              </button>
              <div className="login-forgot-wrapper">
                <button
                  type="button"
                  onClick={async () => {
                    if (!email.trim()) {
                      toast.error('Please enter your email above to reset password.');
                      return;
                    }
                    try {
                      await sendPasswordResetEmail(auth, email.trim());
                      toast.success('Password reset email sent! Check your inbox.');
                    } catch (err) {
                      toast.error('Failed to send reset email: ' + err.message);
                    }
                  }}
                  className="login-forgot-btn"
                >
                  Forgot password?
                </button>
              </div>
            </form>

          /* ── Staff PIN login ── */
          ) : mode === 'pin' ? (
            <div className="login-form">
              <div className="form-group login-rest-id-group">
                <label className="form-label">Restaurant ID</label>
                <input id="login-restaurant-id" className="form-input"
                  placeholder="e.g. my-restaurant or rest_abc123"
                  value={restaurantId} onChange={e => setRestaurantId(e.target.value)} />
              </div>
              <div className="pin-dots">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
                ))}
              </div>
              <div className="pin-pad">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                  <button key={i} id={k ? `pin-key-${k}` : undefined}
                    className={`pin-key ${k === '' ? 'empty' : ''}`}
                    onClick={() => { if (k === '⌫') setPin(p => p.slice(0,-1)); else if (k) handlePinKey(k); }}
                    disabled={loading}
                    type="button">
                    {k}
                  </button>
                ))}
              </div>
              {loading && <div className="login-verifying">Verifying…</div>}
            </div>

          /* ── Minimal 3-Field Registration ── */
          ) : (
            <div className="login-form register-form">
              <p className="register-notice-text">
                Create your restaurant workspace in seconds.
              </p>
              <form onSubmit={handleRegister} className="register-form-inner">
                <div className="form-group">
                  <label className="form-label">Restaurant Name *</label>
                  <input
                    id="reg-rest-name"
                    className="form-input"
                    placeholder="e.g. Delicious Cafe"
                    value={regRestName}
                    onChange={e => setRegRestName(e.target.value)}
                    required
                    autoFocus
                  />
                  {regRestName.trim() && (
                    <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: '4px', display: 'block' }}>
                      Online Store: <strong>/order/{regRestName.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-') || '...'}</strong>
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input
                    id="reg-email"
                    className="form-input"
                    type="email"
                    placeholder="email@example.com"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <div className="password-input-wrapper">
                    <input
                      id="reg-password"
                      className="form-input"
                      type={showPw ? 'text' : 'password'}
                      placeholder="Min 6 characters"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPw(!showPw)}
                      title={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  id="reg-submit-btn"
                  className="login-submit-btn"
                  type="submit"
                  disabled={registering}
                  style={{ marginTop: '8px' }}
                >
                  {registering ? 'Creating Workspace…' : 'Register Restaurant'}
                </button>
              </form>
            </div>
          )}

          {canInstall && !isStandalone && (
            <div className="login-install-wrapper">
              <button
                type="button"
                className="login-install-btn"
                onClick={promptInstall}
              >
                <Download size={14} /> Install DineOS App
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
