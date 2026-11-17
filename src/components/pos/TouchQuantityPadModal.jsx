import { useState, useEffect } from 'react';
import { X, Delete } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { hapticTap } from '../../utils/soundNotifications';

/**
 * TouchQuantityPadModal
 * Fast, thumb-friendly on-screen POS number pad designed for touchscreens & handhelds.
 * Solves the high-quantity pain point (e.g., ordering 20, 50, 100 Rotis/Buns)
 * without triggering OS software keyboards or repetitive 50x tapping.
 */
export default function TouchQuantityPadModal({
  isOpen,
  itemName = 'Item',
  initialQty = 1,
  unitPrice = null,
  currency = 'INR',
  onConfirm,
  onClose
}) {
  const [valStr, setValStr] = useState(String(initialQty || 1));
  const [isFresh, setIsFresh] = useState(true); // First digit replace behavior

  useEffect(() => {
    if (isOpen) {
      setValStr(String(initialQty || 1));
      setIsFresh(true);
    }
  }, [isOpen, initialQty]);

  if (!isOpen) return null;

  const currentNum = parseInt(valStr, 10) || 0;
  const presets = [1, 2, 5, 10, 20, 50, 100];
  const increments = [1, 5, 10, 20];

  const handleDigit = (digit) => {
    hapticTap('light');
    if (isFresh) {
      setValStr(String(digit));
      setIsFresh(false);
      return;
    }
    if (valStr.length >= 3) return; // Cap at 999
    const next = valStr === '0' ? String(digit) : valStr + String(digit);
    const parsed = parseInt(next, 10);
    if (!isNaN(parsed) && parsed <= 999) {
      setValStr(String(parsed));
    }
  };

  const handleBackspace = () => {
    hapticTap('light');
    setIsFresh(false);
    if (valStr.length <= 1) {
      setValStr('');
    } else {
      setValStr(valStr.slice(0, -1));
    }
  };

  const handleClear = () => {
    hapticTap('medium');
    setIsFresh(false);
    setValStr('');
  };

  const handlePreset = (num) => {
    hapticTap('medium');
    setIsFresh(false);
    setValStr(String(num));
  };

  const handleIncrement = (inc) => {
    hapticTap('light');
    setIsFresh(false);
    const curr = parseInt(valStr, 10) || 0;
    const next = Math.min(999, Math.max(1, curr + inc));
    setValStr(String(next));
  };

  const handleConfirm = () => {
    hapticTap('success');
    const finalQty = Math.max(1, parseInt(valStr, 10) || 1);
    onConfirm(finalQty);
    onClose();
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div 
        className="modal animate-slide-up"
        style={{
          width: 'min(420px, 94vw)',
          maxWidth: 420,
          background: 'var(--color-bg-elevated, #1c1c1e)',
          borderRadius: 20,
          border: '1.5px solid var(--color-separator, #2c2c2e)',
          boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-separator, #2c2c2e)'
        }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Set Quantity
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '2px 0 0', color: 'var(--color-label)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {itemName}
            </h3>
          </div>
          <button 
            type="button"
            className="btn btn-secondary btn-icon" 
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Display Area */}
        <div style={{
          padding: '16px 20px',
          background: 'var(--color-bg, #121214)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--color-separator, #2c2c2e)'
        }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label-tertiary)' }}>
              Quantity
            </span>
            <div style={{ fontSize: 38, fontWeight: 900, color: 'var(--color-accent, #38bdf8)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {valStr || '0'}
            </div>
          </div>
          {unitPrice !== null && currentNum > 0 && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-label-tertiary)' }}>
                {currentNum} × {formatCurrency(unitPrice, currency)}
              </span>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-label)' }}>
                {formatCurrency(currentNum * unitPrice, currency)}
              </div>
            </div>
          )}
        </div>

        {/* Quick Presets & Adders */}
        <div style={{ padding: '12px 16px 8px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-bg-secondary, #18181b)' }}>
          {/* Exact Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-tertiary)', flexShrink: 0 }}>
              Set:
            </span>
            {presets.map(p => {
              const active = currentNum === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePreset(p)}
                  style={{
                    flex: 1,
                    minWidth: 38,
                    height: 34,
                    borderRadius: 8,
                    border: active ? '1.5px solid var(--color-accent, #38bdf8)' : '1px solid var(--color-separator, #333)',
                    background: active ? 'rgba(56, 189, 248, 0.2)' : 'var(--color-bg-elevated, #242428)',
                    color: active ? 'var(--color-accent, #38bdf8)' : 'var(--color-label)',
                    fontSize: 13,
                    fontWeight: active ? 800 : 700,
                    cursor: 'pointer',
                    touchAction: 'manipulation'
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Quick Delta Increments */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-label-tertiary)', flexShrink: 0 }}>
              Add:
            </span>
            {increments.map(inc => (
              <button
                key={inc}
                type="button"
                onClick={() => handleIncrement(inc)}
                style={{
                  flex: 1,
                  height: 30,
                  borderRadius: 8,
                  border: '1px dashed var(--color-separator, #444)',
                  background: 'var(--color-bg, #121214)',
                  color: 'var(--color-label-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  touchAction: 'manipulation'
                }}
              >
                +{inc}
              </button>
            ))}
          </div>
        </div>

        {/* 3x4 Touch Keypad Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          padding: '14px 16px',
          background: 'var(--color-bg-secondary, #18181b)'
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              style={{
                height: 52,
                borderRadius: 12,
                border: '1px solid var(--color-separator, #2c2c2e)',
                background: 'var(--color-bg-elevated, #242428)',
                color: 'var(--color-label, #fff)',
                fontSize: 22,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'manipulation',
                transition: 'transform 0.08s, background 0.15s'
              }}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            style={{
              height: 52,
              borderRadius: 12,
              border: '1px solid var(--color-separator, #2c2c2e)',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#f87171',
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation'
            }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit(0)}
            style={{
              height: 52,
              borderRadius: 12,
              border: '1px solid var(--color-separator, #2c2c2e)',
              background: 'var(--color-bg-elevated, #242428)',
              color: 'var(--color-label, #fff)',
              fontSize: 22,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation'
            }}
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            style={{
              height: 52,
              borderRadius: 12,
              border: '1px solid var(--color-separator, #2c2c2e)',
              background: 'var(--color-bg-elevated, #242428)',
              color: 'var(--color-label-secondary)',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation'
            }}
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '14px 16px',
          display: 'flex',
          gap: 10,
          borderTop: '1px solid var(--color-separator, #2c2c2e)',
          background: 'var(--color-bg-elevated, #1c1c1e)'
        }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ height: 48, flex: 1, borderRadius: 12, fontSize: 15, fontWeight: 700 }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={currentNum <= 0}
            style={{
              height: 48,
              flex: 2,
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 800,
              background: currentNum > 0 ? '#10b981' : undefined,
              borderColor: currentNum > 0 ? '#10b981' : undefined
            }}
          >
            Confirm: {currentNum || 1}
          </button>
        </div>
      </div>
    </div>
  );
}
