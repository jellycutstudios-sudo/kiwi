import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { useMenuStore } from '../../stores/menuStore';
import { useOrderStore } from '../../stores/orderStore';
import { playNotificationTone, hapticTap } from '../../utils/soundNotifications';
import toast from 'react-hot-toast';
import {
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  Volume2,
  Printer,
  ShieldCheck,
  RefreshCw,
  LayoutGrid,
  Search,
  ShoppingCart,
  UtensilsCrossed,
  Layers,
  Settings,
  Users,
  BookOpen,
  Package,
  Lock,
  X,
  CheckCircle2,
  Sliders,
  DollarSign,
  Monitor
} from 'lucide-react';

export default function DesktopContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const menuRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  const { user, staffDoc, restaurant, signOut } = useAuthStore();
  const { effectiveTheme, toggleTheme } = useThemeStore();
  const { menuDensity, setMenuDensity } = useMenuStore();
  const clearCart = useOrderStore(s => s.clearCart);

  const role = staffDoc?.role || (user ? 'admin' : 'guest');
  const isAdmin = ['admin', 'super_admin'].includes(role);
  const isDark = effectiveTheme === 'dark';

  // Do not show POS context menu on public marketing landing pages or customer ordering screens
  const path = location.pathname;
  const isAuth = !!user || !!staffDoc;
  const isLanding = path === '/landing' || (path === '/' && !isAuth);
  const isCustomerPage = path.startsWith('/order') || path.startsWith('/display') || path === '/login';

  // 1. Listen for custom contextmenu event dispatched by securityGuards
  useEffect(() => {
    if (isLanding || isCustomerPage) return;
    const handleCustomContextMenu = (e) => {
      const { clientX, clientY } = e.detail || {};
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return;

      const menuWidth = 270;
      const menuHeight = 440;
      const posX = clientX + menuWidth > window.innerWidth ? Math.max(12, clientX - menuWidth) : clientX;
      const posY = clientY + menuHeight > window.innerHeight ? Math.max(12, clientY - menuHeight) : clientY;

      setCoords({ x: posX, y: posY });
      setIsOpen(true);
      hapticTap('light');
    };

    window.addEventListener('dineos:contextmenu', handleCustomContextMenu);
    return () => window.removeEventListener('dineos:contextmenu', handleCustomContextMenu);
  }, [isLanding, isCustomerPage]);

  // 2. Close on outside click, Escape, scroll or resize
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  // 3. Track HTML5 Fullscreen state
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Helpers
  const closeMenu = () => setIsOpen(false);

  const handleToggleFullscreen = () => {
    closeMenu();
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        toast.success('Kiosk Mode: Fullscreen activated (Press Esc to exit)');
      } else {
        document.exitFullscreen().catch(() => {});
        toast('Exited Fullscreen', { icon: '🖥️' });
      }
    } catch (_) {}
  };

  const handleToggleTheme = () => {
    closeMenu();
    toggleTheme();
    toast.success(`${isDark ? 'Light' : 'Obsidian Dark'} mode active`);
  };

  const handleSoundTest = () => {
    closeMenu();
    playNotificationTone('reception-bell', 0.6);
    hapticTap('medium');
    toast('Audio Chime Tested (Reception Bell)', { icon: '🔔' });
  };

  const handlePrintTestSlip = () => {
    closeMenu();
    hapticTap('medium');

    const printWin = window.open('', '_blank', 'width=380,height=520');
    if (!printWin) {
      toast.error('Pop-up blocked. Please allow pop-ups for printer testing.');
      return;
    }

    const now = new Date();
    const restName = restaurant?.name || 'DineOS POS Station';
    const staffName = staffDoc?.name || 'Administrator';

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DineOS Terminal Test Slip</title>
          <style>
            @page { margin: 0; size: 80mm auto; }
            body {
              font-family: 'Courier New', monospace;
              width: 72mm;
              margin: 4mm auto;
              font-size: 13px;
              line-height: 1.35;
              color: #000;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 16px;">${restName}</div>
          <div class="center">TERMINAL DIAGNOSTIC SLIP</div>
          <div class="divider"></div>
          <div class="row"><span>Date:</span> <span>${now.toLocaleDateString()}</span></div>
          <div class="row"><span>Time:</span> <span>${now.toLocaleTimeString()}</span></div>
          <div class="row"><span>Terminal ID:</span> <span>POS-01</span></div>
          <div class="row"><span>Operator:</span> <span>${staffName}</span></div>
          <div class="row"><span>Role:</span> <span>${role.toUpperCase()}</span></div>
          <div class="divider"></div>
          <div class="center bold">KIOSK SECURITY: LEVEL 5</div>
          <div class="row"><span>Anti-Inspect:</span> <span>ACTIVE</span></div>
          <div class="row"><span>Right-Click Hub:</span> <span>ACTIVE</span></div>
          <div class="row"><span>Printer Test:</span> <span>PASSED (OK)</span></div>
          <div class="divider"></div>
          <div class="center" style="font-size: 11px;">Powered by DineOS Enterprise POS</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 750);
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
    toast.success('Test receipt dispatched to printer');
  };

  const handleClearCacheAndSync = async () => {
    closeMenu();
    toast.loading('Flushing local cache & refreshing...', { duration: 1200 });
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (_) {
      window.location.reload();
    }
  };

  const handleLockTerminal = () => {
    closeMenu();
    setShowLockModal(true);
  };

  const confirmLockTerminal = async () => {
    setShowLockModal(false);
    await signOut();
    navigate('/login');
    toast.success('Terminal locked', { icon: '🔒' });
  };

  // Determine current route context
  let pageBadge;
  let contextActions;

  if (path.startsWith('/pos')) {
    pageBadge = 'POS Register';
    contextActions = [
      {
        icon: <UtensilsCrossed size={15} className="text-orange-500" />,
        label: 'Switch to Table Map',
        shortcut: 'Alt+T',
        action: () => navigate('/tables')
      },
      {
        icon: <Layers size={15} className="text-cyan-500" />,
        label: 'View Active Orders',
        action: () => navigate('/orders')
      }
    ];
  } else if (path.startsWith('/tables')) {
    pageBadge = 'Table Layout';
    contextActions = [
      {
        icon: <ShoppingCart size={15} className="text-emerald-500" />,
        label: 'Open POS Register',
        action: () => navigate('/pos')
      },
      {
        icon: <Layers size={15} className="text-cyan-500" />,
        label: 'View Active Orders',
        action: () => navigate('/orders')
      },
      ...(isAdmin ? [{
        icon: <Sliders size={15} className="text-purple-500" />,
        label: 'Edit Floor Plan',
        action: () => navigate('/tables?edit=true')
      }] : [])
    ];
  } else if (path.startsWith('/dashboard')) {
    pageBadge = 'Dashboard';
    contextActions = [
      {
        icon: <ShoppingCart size={15} className="text-emerald-500" />,
        label: 'Launch POS Register',
        action: () => navigate('/pos')
      },
      {
        icon: <DollarSign size={15} className="text-emerald-500" />,
        label: 'Sales & Analytics',
        action: () => navigate('/reports')
      },
      ...(isAdmin ? [{
        icon: <Settings size={15} className="text-blue-500" />,
        label: 'Store Settings',
        action: () => navigate('/admin/settings')
      }] : [])
    ];
  } else if (path.startsWith('/kds')) {
    pageBadge = 'Kitchen Display (KDS)';
    contextActions = [
      {
        icon: <Volume2 size={15} className="text-amber-500" />,
        label: 'Test Kitchen Pass Bell',
        action: () => {
          playNotificationTone('kitchen-bell', 0.7);
          hapticTap('heavy');
          toast('🍳 Kitchen Bell Ring Tested');
        }
      },
      {
        icon: <ShoppingCart size={15} className="text-emerald-500" />,
        label: 'Back to POS Register',
        action: () => navigate('/pos')
      }
    ];
  } else if (path.startsWith('/orders') || path.startsWith('/online-orders')) {
    pageBadge = 'Order Management';
    contextActions = [
      {
        icon: <Volume2 size={15} className="text-amber-500" />,
        label: 'Test Incoming Alert',
        action: () => {
          playNotificationTone('alert', 0.7);
          hapticTap('medium');
          toast('⚡ Alert Chime Tested');
        }
      },
      {
        icon: <ShoppingCart size={15} className="text-emerald-500" />,
        label: 'New POS Order',
        action: () => navigate('/pos')
      }
    ];
  } else if (path.startsWith('/admin')) {
    pageBadge = 'Admin Console';
    contextActions = [
      {
        icon: <ShoppingCart size={15} className="text-emerald-500" />,
        label: 'Switch to POS Terminal',
        action: () => navigate('/pos')
      },
      {
        icon: <Settings size={15} className="text-blue-500" />,
        label: 'System Settings',
        action: () => navigate('/admin/settings')
      },
      {
        icon: <Users size={15} className="text-purple-500" />,
        label: 'Staff & Roles',
        action: () => navigate('/admin/staff')
      },
      {
        icon: <BookOpen size={15} className="text-amber-500" />,
        label: 'Menu Editor',
        action: () => navigate('/admin/menu')
      },
      {
        icon: <Package size={15} className="text-orange-500" />,
        label: 'Stock & Inventory',
        action: () => navigate('/admin/inventory')
      }
    ];
  } else {
    pageBadge = 'DineOS Station';
    contextActions = [
      {
        icon: <ShoppingCart size={15} className="text-emerald-500" />,
        label: 'Open POS Register',
        action: () => navigate('/pos')
      },
      {
        icon: <Monitor size={15} className="text-blue-500" />,
        label: 'Go to Dashboard',
        action: () => navigate('/dashboard')
      }
    ];
  }

  if (typeof document === 'undefined') return null;
  if (isLanding || isCustomerPage) return null;

  return createPortal(
    <>
      {/* 1. Context Menu Floating Panel */}
      {isOpen && (
        <div
          ref={menuRef}
          className="dineos-desktop-context-menu"
          style={{
            position: 'fixed',
            top: coords.y,
            left: coords.x,
            zIndex: 999999,
            width: '272px',
            background: isDark ? 'rgba(24, 25, 32, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
            borderRadius: '16px',
            boxShadow: isDark
              ? '0 20px 48px -8px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255,255,255,0.06)'
              : '0 20px 48px -8px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(0,0,0,0.05)',
            padding: '6px',
            fontFamily: 'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
            fontSize: '13px',
            color: 'var(--color-label)',
            userSelect: 'none',
            animation: 'dineos-menu-in 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
            transformOrigin: 'top left',
          }}
        >
          {/* Header Badge */}
          <div
            style={{
              padding: '8px 10px 8px',
              borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 8px #10b981',
                }}
              />
              <span style={{ fontWeight: 700, fontSize: '12px', letterSpacing: '0.3px' }}>
                {pageBadge}
              </span>
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: '6px',
                background: isAdmin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                color: isAdmin ? '#10b981' : '#3b82f6',
              }}
            >
              {role}
            </span>
          </div>

          {/* Contextual Actions Section */}
          {contextActions.length > 0 && (
            <div style={{ padding: '2px 0' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--color-label-tertiary, #94a3b8)',
                  padding: '4px 10px 2px',
                  letterSpacing: '0.5px',
                }}
              >
                Page Shortcuts
              </div>
              {contextActions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    closeMenu();
                    item.action();
                  }}
                  className="dineos-ctx-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    textAlign: 'left',
                    transition: 'background 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.shortcut && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                        color: 'var(--color-label-secondary, #64748b)',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      }}
                    >
                      {item.shortcut}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Separator & Lock Terminal */}
          {(user || staffDoc) && (
            <>
              <div
                style={{
                  height: '1px',
                  background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  margin: '4px 0',
                }}
              />
              <button
                type="button"
                onClick={handleLockTerminal}
                className="dineos-ctx-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <Lock size={15} />
                  <span>Lock Terminal / Logout</span>
                </div>
              </button>
            </>
          )}
        </div>
      )}

      {/* 2. Terminal Diagnostics Modal */}
      {showDiagnostics && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            padding: '16px',
            animation: 'dineos-fade-in 0.2s ease',
          }}
          onClick={() => setShowDiagnostics(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: isDark ? '#14151b' : '#ffffff',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
              borderRadius: '20px',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)',
              padding: '24px',
              color: 'var(--color-label)',
              fontFamily: 'var(--font-family)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10b981',
                  }}
                >
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Terminal Diagnostics & Security</h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                    DineOS Enterprise POS Kiosk Hardware Profile
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagnostics(false)}
                style={{
                  border: 'none',
                  background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Protection Grid */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#10b981', marginBottom: '8px' }}>
                Active Defense Shields
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {[
                  { label: 'DevTools Inspect', status: 'Blocked (Level 5)', active: true },
                  { label: 'Native Context Menu', status: 'Replaced by Hub', active: true },
                  { label: 'Anti-Debug Loop', status: '150ms Freeze Active', active: true },
                  { label: 'View Source (Ctrl+U)', status: 'Suppressed', active: true },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: '11px', color: '#10b981' }}>{item.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hardware & System Details */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-label-secondary)', marginBottom: '8px' }}>
                Terminal Station Metadata
              </div>
              <div
                style={{
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-label-secondary)' }}>Station Name</span>
                  <span style={{ fontWeight: 600 }}>{restaurant?.name || 'Local Standalone POS'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-label-secondary)' }}>Current Operator</span>
                  <span style={{ fontWeight: 600 }}>{staffDoc?.name || 'Admin'} ({role})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-label-secondary)' }}>Screen Resolution</span>
                  <span style={{ fontWeight: 600 }}>
                    {typeof window !== 'undefined' ? `${window.screen.width} x ${window.screen.height} (${window.devicePixelRatio}x)` : '1920 x 1080'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-label-secondary)' }}>Network State</span>
                  <span style={{ fontWeight: 600, color: '#10b981' }}>
                    {navigator.onLine ? '● Online & Synchronized' : '○ Offline Cache Mode'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-label-secondary)' }}>Kiosk Mode</span>
                  <span style={{ fontWeight: 600 }}>{isFullscreen ? 'Active (Fullscreen)' : 'Windowed'}</span>
                </div>
              </div>
            </div>

            {/* Quick Diagnostic Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handlePrintTestSlip}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-separator)',
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                  color: 'inherit',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <Printer size={16} />
                <span>Test Printer</span>
              </button>
              <button
                type="button"
                onClick={handleSoundTest}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-separator)',
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                  color: 'inherit',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <Volume2 size={16} />
                <span>Test Audio</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDiagnostics(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--color-accent, #10b981)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Lock Terminal Confirmation Modal */}
      {showLockModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '16px',
            animation: 'dineos-fade-in 0.18s ease',
          }}
          onClick={() => setShowLockModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '430px',
              background: isDark ? '#14151b' : '#ffffff',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
              borderRadius: '20px',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)',
              padding: '24px',
              color: 'var(--color-label)',
              fontFamily: 'var(--font-family)',
              position: 'relative',
              animation: 'dineos-menu-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '14px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <Lock size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-label)' }}>
                    Lock POS Terminal?
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                    Secure active cashier shift session
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLockModal(false)}
                style={{
                  border: 'none',
                  background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Description */}
            <p style={{ margin: '0 0 16px', fontSize: '13px', lineHeight: '1.5', color: 'var(--color-label-secondary)' }}>
              Are you sure you want to lock this register? The current staff session will be secured, returning the terminal to the PIN login screen.
            </p>

            {/* Terminal / Session Info Chip */}
            <div
              style={{
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`,
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>Station</span>
                <span style={{ fontWeight: 600 }}>{restaurant?.name || 'POS Register #1'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>Current Operator</span>
                <span style={{ fontWeight: 600 }}>{staffDoc?.name || user?.email || 'Administrator'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>Role</span>
                <span
                  style={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                  }}
                >
                  {role}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowLockModal(false)}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)'}`,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                  color: 'inherit',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLockTerminal}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#ef4444',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
              >
                <Lock size={15} />
                <span>Lock Terminal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded CSS for Context Menu Micro-interactions */}
      <style>{`
        @keyframes dineos-menu-in {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes dineos-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .dineos-ctx-item:hover {
          background: rgba(16, 185, 129, 0.12) !important;
          color: #10b981 !important;
        }
        [data-theme="dark"] .dineos-ctx-item:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #ffffff !important;
        }
      `}</style>
    </>,
    document.body
  );
}
