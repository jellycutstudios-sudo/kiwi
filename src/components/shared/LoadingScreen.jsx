import './LoadingScreen.css';

/**
 * LoadingScreen — Minimal, clean & premium preloader
 * Distraction-free Apple & Linear caliber elegance.
 */
export default function LoadingScreen({
  message = 'DineOS',
  fullScreen = true,
  compact = false,
  showProgress = true,
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={`dine-loading-wrapper ${compact || !fullScreen ? 'is-compact' : ''}`}
    >
      <div className="dine-loading-content">
        {/* Unboxed Brand Mark */}
        <img
          src="/ricon.svg"
          alt="DineOS"
          className="dine-loading-logo"
        />

        <div className="dine-loading-title">DineOS</div>

        {/* Minimal Hairline Progress Bar */}
        {showProgress && (
          <div className="dine-loading-bar">
            <div className="dine-loading-bar-beam" />
          </div>
        )}

        {/* Single Quiet Label */}
        {message && message !== 'DineOS' && (
          <span className="dine-loading-label">{message}</span>
        )}
      </div>
    </div>
  );
}

/**
 * InlineSpinner — High-precision minimal hairline spinner for buttons & inline elements
 */
export function InlineSpinner({ size = 16, color = 'currentColor', strokeWidth = 1.8, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{
        animation: 'dineGlide 1s linear infinite',
        transformOrigin: 'center center',
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity="0.15"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray="18 45"
        strokeLinecap="round"
      />
    </svg>
  );
}
