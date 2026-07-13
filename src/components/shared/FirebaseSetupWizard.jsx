import { useState } from 'react';
import { Database, Copy, Check, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';

export default function FirebaseSetupWizard() {
  const [copied, setCopied] = useState(false);

  const envTemplate = `VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id`;

  const copyEnv = () => {
    navigator.clipboard.writeText(envTemplate);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reloadPage = () => {
    window.location.reload();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen page-content" style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-8) var(--space-4)' }}>
      <div className="card card-padded w-full" style={{ maxWidth: '680px', background: 'var(--color-bg-elevated)', animation: 'slideUp 0.4s var(--ease-spring)' }}>
        
        {/* Header */}
        <div className="flex items-center gap-4" style={{ marginBottom: 'var(--space-6)', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', flexShrink: 0 }}>
            <Database size={24} style={{ margin: 'auto' }} />
          </div>
          <div>
            <h1 className="text-title2" style={{ fontWeight: 'var(--weight-bold)' }}>Firebase Setup Required</h1>
            <p className="text-footnote text-secondary">Let's connect DineOS to your Firebase backend.</p>
          </div>
        </div>

        {/* Info Box */}
        <div className="flex gap-3" style={{ background: 'var(--color-accent-light)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)', border: '1px solid rgba(0,122,255,0.2)' }}>
          <Sparkles size={20} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p className="text-subhead" style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-accent)', marginBottom: '4px' }}>Ready to Roll Out</p>
            <p className="text-footnote" style={{ color: 'var(--color-label)' }}>
              All code files, state stores, i18n translations, and Apple HIG components are built. Simply complete this database connection to spin up the system.
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-6" style={{ marginBottom: 'var(--space-8)' }}>
          <div>
            <h3 className="text-headline" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--color-fill)', fontSize: '12px', fontWeight: 'var(--weight-bold)' }}>1</span>
              Create Firebase Project
            </h3>
            <ol className="text-subhead text-secondary" style={{ paddingLeft: '32px', listStyleType: 'decimal', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li>Go to the <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 'var(--weight-semibold)', textDecoration: 'underline', color: 'var(--color-accent)' }}>Firebase Console</a>.</li>
              <li>Create a new project named <strong>posrest</strong> or similar.</li>
              <li>Enable <strong>Cloud Firestore</strong> (start in Test Mode) and <strong>Authentication</strong> (enable the Email/Password provider).</li>
              <li>Add a Web App to your project to get your web app configurations.</li>
            </ol>
          </div>

          <div>
            <h3 className="text-headline" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--color-fill)', fontSize: '12px', fontWeight: 'var(--weight-bold)' }}>2</span>
              Configure Environment Variables
            </h3>
            <p className="text-subhead text-secondary" style={{ paddingLeft: '32px', marginBottom: 'var(--space-3)' }}>
              Create a file named <code>.env</code> in your project root folder (next to <code>.env.example</code>) and copy your Firebase keys into it:
            </p>
            <div style={{ position: 'relative', marginLeft: '32px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
              <pre style={{ margin: 0, padding: 'var(--space-4)', fontSize: '13px', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
                {envTemplate}
              </pre>
              <button 
                onClick={copyEnv}
                className="btn btn-secondary btn-sm"
                style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copied ? <Check size={14} className="text-green" style={{ color: 'var(--color-green)' }} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy Template'}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-headline" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--color-fill)', fontSize: '12px', fontWeight: 'var(--weight-bold)' }}>3</span>
              Restart Dev Server & Refresh
            </h3>
            <p className="text-subhead text-secondary" style={{ paddingLeft: '32px' }}>
              Since environment variables are loaded at build time, <strong>restart your local terminal process</strong> (<code>npm run dev</code>) and click the refresh button below!
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-6)' }}>
          <div className="flex items-center gap-2 text-footnote text-secondary">
            <ShieldAlert size={16} className="text-orange" style={{ color: 'var(--color-orange)' }} />
            <span>Requires local server restart to pick up new variables.</span>
          </div>
          <button onClick={reloadPage} className="btn btn-primary btn-lg" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={18} />
            <span>Check Config & Refresh</span>
          </button>
        </div>

      </div>
    </div>
  );
}
