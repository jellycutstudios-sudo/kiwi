import { useEffect } from 'react';
import toast, { Toaster, ToastBar, useToasterStore } from 'react-hot-toast';

export const MAX_VISIBLE_TOASTS = 2;

export const TOAST_DURATIONS = {
  default: 2000,
  success: 1800,
  error: 3500,
  loading: 3000,
};

/**
 * Restaurant POS Toast Governor (Toast POS / Square standard):
 * - Enforces a hard cap of MAX_VISIBLE_TOASTS (2) concurrent visible toasts
 *   so notifications never stack down the screen or block cart/checkout buttons.
 * - Tight default durations (1.8s success, 2s info, 3.5s error).
 * - Top-center placement (never covers top-right cart actions or bottom Pay bar).
 * - Tap anywhere on a non-interactive part of a toast to dismiss immediately.
 */
export default function PosToaster({ maxVisible = MAX_VISIBLE_TOASTS }) {
  const { toasts } = useToasterStore();

  useEffect(() => {
    const visibleToasts = toasts.filter(t => t.visible);
    if (visibleToasts.length <= maxVisible) return;

    // react-hot-toast stores newest toasts first; dismiss oldest excess toasts
    visibleToasts
      .slice(maxVisible)
      .forEach(t => toast.dismiss(t.id));
  }, [toasts, maxVisible]);

  return (
    <Toaster
      position="top-center"
      gutter={8}
      containerStyle={{
        top: 12,
        zIndex: 99999,
      }}
      toastOptions={{
        duration: TOAST_DURATIONS.default,
        style: {
          fontFamily: 'var(--font-family)',
          fontSize: '13.5px',
          fontWeight: 600,
          padding: '9px 14px',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-label)',
          border: '1px solid var(--color-separator)',
          maxWidth: 420,
        },
        success: {
          duration: TOAST_DURATIONS.success,
          iconTheme: { primary: 'var(--color-green)', secondary: '#fff' },
        },
        error: {
          duration: TOAST_DURATIONS.error,
          iconTheme: { primary: 'var(--color-red)', secondary: '#fff' },
        },
        loading: {
          duration: TOAST_DURATIONS.loading,
        },
      }}
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => (
            <div
              onClick={(e) => {
                if (e.target.closest('button, a, input, select, textarea')) return;
                toast.dismiss(t.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
              title="Tap to dismiss"
            >
              {icon}
              {message}
            </div>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
