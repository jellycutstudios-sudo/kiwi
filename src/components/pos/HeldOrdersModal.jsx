import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Trash2, Clock, User, Armchair, ShoppingBag, PauseCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
}

export default function HeldOrdersModal({
  isOpen,
  onClose,
  heldOrders = [],
  onResume,
  onDiscard,
  onClearAll,
  currency = 'INR'
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-bg-card, #1e293b)',
          border: '1px solid var(--color-separator, #334155)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: 'min(90vh, 760px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-separator, #334155)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: 'var(--color-bg-card, #1e293b)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PauseCircle size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--color-label-primary)' }}>
                  Held Orders (Parked Carts)
                </h3>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 12,
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.4)'
                }}>
                  {heldOrders.length}
                </span>
              </div>
              <p style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', margin: '2px 0 0 0' }}>
                Quick counter park queue · 1-tap recall when guest returns
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={onClose}
            title="Close (Esc)"
            style={{ width: 34, height: 34, borderRadius: 8 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Held Orders List */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {heldOrders.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: 'var(--color-label-secondary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8
            }}>
              <div style={{
                width: 54, height: 54, borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-label-tertiary)'
              }}>
                <PauseCircle size={28} />
              </div>
              <h4 style={{ margin: '4px 0 0 0', fontSize: '15px', color: 'var(--color-label-primary)' }}>
                No held orders right now
              </h4>
              <p style={{ margin: 0, fontSize: '12px', maxWidth: '320px', lineHeight: 1.4 }}>
                When a customer needs time to decide at the counter, tap <strong>Hold</strong> in the cart to park their order and serve the next guest immediately.
              </p>
            </div>
          ) : (
            heldOrders.map((held, idx) => {
              const itemCount = (held.items || []).reduce((sum, i) => sum + (Number(i.qty) || 1), 0);
              const orderTypeLabel = held.orderType === 'dine-in'
                ? (held.tableName ? `Table ${held.tableName}` : 'Dine In')
                : (held.orderType === 'delivery' ? 'Delivery' : 'Takeaway');

              return (
                <div
                  key={held.id}
                  style={{
                    background: 'var(--color-bg-base, #131722)',
                    border: '1px solid var(--color-separator, #334155)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  {/* Top Bar: Hold Tag, Time, Type */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'rgba(245, 158, 11, 0.18)',
                        color: '#f59e0b',
                        border: '1px solid rgba(245, 158, 11, 0.35)'
                      }}>
                        Held #{held.holdNumber || (idx + 1)}
                      </span>

                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {held.orderType === 'dine-in' ? <Armchair size={11} /> : <ShoppingBag size={11} />}
                        {orderTypeLabel}
                      </span>

                      {held.isComplimentary && (
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(236, 72, 153, 0.15)',
                          color: '#ec4899',
                          border: '1px solid rgba(236, 72, 153, 0.3)'
                        }}>
                          🎁 NC / Comp
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} />
                      {formatTimeAgo(held.heldAt)}
                    </span>
                  </div>

                  {/* Customer Information (if present) */}
                  {(held.customerName || held.customerPhone) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11.5px', color: 'var(--color-label-secondary)' }}>
                      <User size={12} color="#10b981" />
                      <strong style={{ color: 'var(--color-label-primary)' }}>{held.customerName || 'Customer'}</strong>
                      {held.customerPhone && (
                        <span style={{ opacity: 0.8 }}>({held.customerPhone})</span>
                      )}
                    </div>
                  )}

                  {/* Items summary */}
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--color-label-primary)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6
                  }}>
                    {(held.items || []).map((item, iIdx) => (
                      <span
                        key={iIdx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: '11px'
                        }}
                      >
                        {item.qty}x {item.name}
                      </span>
                    ))}
                  </div>

                  {/* Note (if present) */}
                  {held.note && (
                    <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--color-label-tertiary)' }}>
                      Note: "{held.note}"
                    </div>
                  )}

                  {/* Bottom: Total & Action Buttons */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    paddingTop: '8px',
                    marginTop: '2px'
                  }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                        {itemCount} {itemCount === 1 ? 'item' : 'items'} · Total:{' '}
                      </span>
                      <strong style={{ fontSize: '14px', color: 'var(--color-label-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(held.total || held.subtotal || 0, currency)}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => {
                          if (window.confirm(`Discard held order #${held.holdNumber || idx + 1}?`)) {
                            onDiscard(held.id);
                          }
                        }}
                        style={{ color: 'var(--color-red, #ef4444)', height: 32, padding: '0 8px' }}
                        title="Discard held order"
                      >
                        <Trash2 size={13} style={{ marginRight: 3 }} /> Discard
                      </button>

                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => onResume(held)}
                        style={{
                          height: 32,
                          padding: '0 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: '#10b981',
                          borderColor: '#10b981',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Play size={12} fill="currentColor" /> Resume
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--color-separator, #334155)',
          background: 'var(--color-bg-elevated, #182030)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          {heldOrders.length > 1 ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => {
                if (window.confirm('Discard all held orders?')) {
                  onClearAll();
                }
              }}
              style={{ color: 'var(--color-red, #ef4444)', fontSize: '11px' }}
            >
              Clear All Held
            </button>
          ) : <div />}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ height: '34px', padding: '0 16px', fontSize: '12px', fontWeight: 600 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
