import React, { useEffect } from 'react';
import { 
  Download, 
  X, 
  Share, 
  PlusSquare, 
  WifiOff, 
  Printer, 
  Monitor, 
  Zap, 
  CheckCircle2 
} from 'lucide-react';

/**
 * PwaInstallModal
 * High-end, touch-friendly installation modal for DineOS POS.
 * Supports Chrome/Edge beforeinstallprompt, iOS Safari instructions,
 * and desktop browser address-bar guidance.
 */
export default function PwaInstallModal({
  isOpen,
  onClose,
  canInstall = false,
  promptInstall,
  isIOS = false,
  isStandalone = false
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (canInstall && promptInstall) {
      const outcome = await promptInstall();
      if (outcome) {
        onClose();
      }
    }
  };

  return (
    <div 
      className="modal-overlay" 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 7, 10, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        padding: '16px'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
    >
      <div 
        className="modal animate-slide-up" 
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'linear-gradient(180deg, #131620 0%, #0d0f17 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), 0 0 40px rgba(16, 185, 129, 0.15)',
          padding: '24px',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Subtle Ambient Radial Highlight */}
        <div 
          style={{
            position: 'absolute',
            top: '-80px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '260px',
            height: '180px',
            background: 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.22) 0%, rgba(16, 185, 129, 0) 70%)',
            pointerEvents: 'none',
            zIndex: 0
          }} 
        />

        {/* Header with Close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', position: 'relative', zIndex: 1 }}>
          <button 
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Hero Branding Card */}
        <div style={{ textAlign: 'center', marginTop: '-6px', marginBottom: '20px', position: 'relative', zIndex: 1 }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '14px' }}>
            <img 
              src="/icons/icon-192.png" 
              alt="DineOS Icon"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                display: 'block',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(16, 185, 129, 0.35)',
                border: '1.5px solid rgba(255, 255, 255, 0.16)'
              }}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/ricon.svg';
              }}
            />
          </div>

          <h2 
            id="pwa-install-title"
            style={{ 
              fontSize: '22px', 
              fontWeight: 800, 
              letterSpacing: '-0.02em', 
              margin: '0 0 6px 0',
              color: '#ffffff'
            }}
          >
            Install DineOS POS
          </h2>

          <p 
            style={{ 
              fontSize: '13px', 
              lineHeight: 1.5, 
              color: 'rgba(255, 255, 255, 0.65)', 
              margin: '0 auto',
              maxWidth: '360px'
            }}
          >
            Run DineOS as a dedicated, high-performance workstation on your counter tablet, PC, or kiosk.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '10px', 
            marginBottom: '22px',
            position: 'relative',
            zIndex: 1
          }}
        >
          <div 
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '14px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
              <WifiOff size={16} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>Works Offline</span>
            </div>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.4 }}>
              Take orders and bill without internet drops.
            </span>
          </div>

          <div 
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '14px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8' }}>
              <Monitor size={16} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>Fullscreen View</span>
            </div>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.4 }}>
              Zero tabs, no URL bar, distraction-free.
            </span>
          </div>

          <div 
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '14px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a78bfa' }}>
              <Printer size={16} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>Hardware Printing</span>
            </div>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.4 }}>
              Direct thermal KOTs & auto-cut receipts.
            </span>
          </div>

          <div 
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '14px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
              <Zap size={16} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>1-Tap Launch</span>
            </div>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', lineHeight: 1.4 }}>
              Dock, Taskbar & Home Screen access.
            </span>
          </div>
        </div>

        {/* Operating System Specific Instructions or Primary Button */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {isStandalone ? (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '14px',
                borderRadius: '14px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '12px'
              }}
            >
              <CheckCircle2 size={18} />
              <span>DineOS is already installed and running standalone!</span>
            </div>
          ) : isIOS ? (
            <div 
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '14px'
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '10px' }}>
                How to install on iOS / iPadOS Safari:
              </div>
              <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)' }}>
                <li>
                  Tap the <strong style={{ color: '#ffffff' }}>Share</strong> button in Safari's bottom toolbar (<Share size={13} style={{ display: 'inline', verticalAlign: '-1px' }} />).
                </li>
                <li>
                  Scroll down and choose <strong style={{ color: '#ffffff' }}>Add to Home Screen</strong> (<PlusSquare size={13} style={{ display: 'inline', verticalAlign: '-1px' }} />).
                </li>
                <li>
                  Tap <strong style={{ color: '#ffffff' }}>Add</strong> in the top-right corner.
                </li>
              </ol>
            </div>
          ) : canInstall ? (
            <button
              type="button"
              id="confirm-pwa-install-btn"
              onClick={handleInstallClick}
              style={{
                width: '100%',
                height: '48px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                borderRadius: '14px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                marginBottom: '10px',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              <Download size={18} />
              <span>Install DineOS App</span>
            </button>
          ) : (
            <div 
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '14px',
                fontSize: '12px',
                lineHeight: 1.5,
                color: 'rgba(255, 255, 255, 0.7)',
                marginBottom: '12px',
                textAlign: 'center'
              }}
            >
              To install on desktop, click the <strong style={{ color: '#ffffff' }}>Install icon (⊕)</strong> in your browser address bar, or open browser menu → <strong style={{ color: '#ffffff' }}>Save and share</strong> → <strong style={{ color: '#ffffff' }}>Install page as app</strong>.
            </div>
          )}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              height: '40px',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isStandalone ? 'Close' : 'Continue in Browser'}
          </button>
        </div>
      </div>
    </div>
  );
}

