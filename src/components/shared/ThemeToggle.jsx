import { useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import toast from 'react-hot-toast';

export default function ThemeToggle({ showLabel = false, className = '' }) {
  const { theme, effectiveTheme, toggleTheme, setTheme } = useThemeStore();
  const [showMenu, setShowMenu] = useState(false);

  const isDark = effectiveTheme === 'dark';

  const handleToggle = (e) => {
    e.stopPropagation();
    toggleTheme();
    const nextTheme = isDark ? 'Light' : 'Dark';
    toast(`${nextTheme} mode enabled`, {
      icon: isDark ? '☀️' : '🌙',
      id: 'theme-toast',
      duration: 2000,
    });
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        className={`btn btn-secondary btn-icon theme-toggle-btn ${className}`}
        onClick={handleToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowMenu(!showMenu);
        }}
        id="theme-toggle-btn"
        title={`Current theme: ${theme} (${isDark ? 'Obsidian Dark' : 'Light'}). Tap to switch, right-click for options.`}
        aria-label="Toggle dark and light theme"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isDark ? '#fbbf24' : 'var(--color-label)',
          cursor: 'pointer',
        }}
      >
        {isDark ? (
          <Moon size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.4))' }} />
        ) : (
          <Sun size={16} style={{ color: '#f59e0b' }} />
        )}
        {showLabel && (
          <span style={{ marginLeft: 6, fontSize: '12px', fontWeight: 600 }}>
            {isDark ? 'Dark' : 'Light'}
          </span>
        )}
      </button>

      {/* Right-click or long-press extended options dropdown */}
      {showMenu && (
        <div
          className="theme-options-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '6px',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-separator)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '4px',
            zIndex: 1000,
            minWidth: '130px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <button
            type="button"
            className="theme-option-item"
            onClick={() => { setTheme('dark'); setShowMenu(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 600,
              background: theme === 'dark' ? 'var(--color-fill-secondary)' : 'transparent',
              color: 'var(--color-label)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <Moon size={13} />
            <span>Obsidian Dark</span>
          </button>
          <button
            type="button"
            className="theme-option-item"
            onClick={() => { setTheme('light'); setShowMenu(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 600,
              background: theme === 'light' ? 'var(--color-fill-secondary)' : 'transparent',
              color: 'var(--color-label)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <Sun size={13} />
            <span>Classic Light</span>
          </button>
          <button
            type="button"
            className="theme-option-item"
            onClick={() => { setTheme('system'); setShowMenu(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 600,
              background: theme === 'system' ? 'var(--color-fill-secondary)' : 'transparent',
              color: 'var(--color-label)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <Monitor size={13} />
            <span>System Default</span>
          </button>
        </div>
      )}
    </div>
  );
}
