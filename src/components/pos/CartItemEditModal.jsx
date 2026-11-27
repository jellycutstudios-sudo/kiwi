import { useState, useEffect, useRef } from 'react';
import { X, Minus, Plus, Hash, Trash2, Flame, Clock, MessageSquare, Check, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { getItemVisuals } from '../../utils/itemVisuals';
import { hapticTap } from '../../utils/soundNotifications';
import TouchQuantityPadModal from './TouchQuantityPadModal';

const QUICK_QTY_PRESETS = [1, 2, 3, 5, 10, 20, 50];
const QUICK_NOTE_PRESETS = [
  'Less Spicy',
  'Extra Spicy',
  'No Onion',
  'No Garlic',
  'No Ice',
  'Pack Separately',
];
const COURSE_OPTIONS = ['Starters', 'Mains', 'Desserts', 'Drinks'];

export default function CartItemEditModal({
  item,
  currency,
  orderType = 'dine-in',
  onSave,
  onRemove,
  onClose,
}) {
  const [prevItem, setPrevItem] = useState(item);
  const [qty, setQty] = useState(item?.qty ?? 1);
  const [itemNote, setItemNote] = useState(item?.itemNote || item?.notes || '');
  const [prepState, setPrepState] = useState(item?.prepState || 'fired');
  const [course, setCourse] = useState(item?.course || 'Mains');
  const [seatNumber, setSeatNumber] = useState(item?.seatNumber ?? null);
  const [isTakeaway, setIsTakeaway] = useState(Boolean(item?.isTakeaway));
  const [isKeypadOpen, setIsKeypadOpen] = useState(false);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, !!item && !isKeypadOpen);

  if (item !== prevItem) {
    setPrevItem(item);
    if (item) {
      setQty(item.qty ?? 1);
      setItemNote(item.itemNote || item.notes || '');
      setPrepState(item.prepState || 'fired');
      setCourse(item.course || 'Mains');
      setSeatNumber(item.seatNumber ?? null);
      setIsTakeaway(Boolean(item.isTakeaway));
      setIsKeypadOpen(false);
    }
  }

  useEffect(() => {
    if (!item || isKeypadOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, isKeypadOpen, onClose]);

  if (!item) return null;

  const effectiveQty = Math.max(1, parseInt(qty, 10) || 1);
  const unitPrice = Number(item.price) || 0;
  const lineTotal = unitPrice * effectiveQty;
  const visuals = getItemVisuals(item);

  const handleDec = () => {
    hapticTap('light');
    setQty(prev => Math.max(1, (parseInt(prev, 10) || 1) - 1));
  };

  const handleInc = () => {
    hapticTap('light');
    setQty(prev => Math.min(999, (parseInt(prev, 10) || 1) + 1));
  };

  const handleQtyChange = (e) => {
    const val = e.target.value;
    if (val === '') {
      setQty('');
      return;
    }
    const clean = val.replace(/[^0-9]/g, '');
    if (clean === '') {
      setQty('');
      return;
    }
    const parsed = parseInt(clean, 10);
    if (!isNaN(parsed)) {
      setQty(Math.min(999, parsed));
    }
  };

  const handleQtyBlur = () => {
    const parsed = parseInt(qty, 10);
    if (isNaN(parsed) || parsed < 1) {
      setQty(1);
    }
  };

  const toggleNotePreset = (preset) => {
    hapticTap('light');
    setItemNote(prev => {
      const parts = (prev || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const existsIdx = parts.findIndex(p => p.toLowerCase() === preset.toLowerCase());
      if (existsIdx >= 0) {
        parts.splice(existsIdx, 1);
      } else {
        parts.push(preset);
      }
      return parts.join(', ');
    });
  };

  const hasPreset = (preset) => {
    const parts = (itemNote || '')
      .split(',')
      .map(s => s.trim().toLowerCase());
    return parts.includes(preset.toLowerCase());
  };

  const handleSave = () => {
    hapticTap('medium');
    onSave({
      qty: effectiveQty,
      itemNote: (itemNote || '').trim(),
      prepState,
      course,
      seatNumber: orderType === 'dine-in' ? seatNumber : null,
      isTakeaway: orderType === 'dine-in' ? isTakeaway : false,
    });
  };

  const handleRemove = () => {
    hapticTap('medium');
    onRemove();
  };

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ zIndex: 9998 }}
    >
      <div
        className="modal animate-slide-up"
        ref={modalRef}
        style={{ maxWidth: 520, width: 'min(520px, 94vw)' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${item.name}`}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div
              className="dish-monogram-badge"
              data-palette={visuals.palette}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: visuals.bg,
                border: `1.5px solid ${visuals.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `0 4px 12px ${visuals.glow}`,
              }}
            >
              <span className="dish-monogram-text" style={{ color: visuals.color, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {visuals.monogram}
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <h2
                  className="modal-title"
                  style={{ fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}
                >
                  {item.name}
                </h2>
                {item.selectedModifiers?.length > 0 && (
                  <div className="cart-item-modifiers-inline">
                    {item.selectedModifiers.map((m, idx) => (
                      <span key={idx} className="cart-modifier-chip">
                        +{m.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                {formatCurrency(unitPrice, currency)} each
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={onClose}
            style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }}
            aria-label="Close item editor"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          className="modal-body"
          style={{
            maxHeight: '68vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            padding: '18px 20px',
          }}
        >
          {/* 1. Large Quantity Controls */}
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator)',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-label)' }}>
                Quantity
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(lineTotal, currency)}
              </span>
            </div>

            {/* Big Touch Stepper + Direct Input + Keypad Trigger */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={handleDec}
                disabled={effectiveQty <= 1}
                style={{
                  width: 52,
                  height: 50,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  flexShrink: 0,
                }}
                aria-label="Decrease item quantity"
              >
                <Minus size={20} strokeWidth={2.8} />
              </button>

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={qty}
                onChange={handleQtyChange}
                onBlur={handleQtyBlur}
                onFocus={e => e.target.select()}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 72,
                  height: 50,
                  textAlign: 'center',
                  fontSize: 22,
                  fontWeight: 900,
                  borderRadius: 12,
                  border: '2px solid var(--color-separator-opaque)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-label)',
                  outline: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
                aria-label="Edit item quantity"
              />

              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={handleInc}
                style={{
                  width: 52,
                  height: 50,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  flexShrink: 0,
                }}
                aria-label="Increase item quantity"
              >
                <Plus size={20} strokeWidth={2.8} />
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => {
                  hapticTap('light');
                  setIsKeypadOpen(true);
                }}
                style={{
                  width: 52,
                  height: 50,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  flexShrink: 0,
                  color: 'var(--color-accent)',
                  borderColor: 'var(--color-accent)',
                }}
                title="Open Touch Number Pad"
                aria-label="Open Touch Number Pad"
              >
                <Hash size={19} strokeWidth={2.5} />
              </button>
            </div>

            {/* Quick Quantity Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {QUICK_QTY_PRESETS.map(n => {
                const isSelected = effectiveQty === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      hapticTap('light');
                      setQty(n);
                    }}
                    style={{
                      height: 38,
                      borderRadius: 9,
                      fontSize: 13.5,
                      fontWeight: isSelected ? 800 : 700,
                      border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                      background: isSelected ? 'var(--color-accent-light, rgba(56, 189, 248, 0.16))' : 'var(--color-bg)',
                      color: isSelected ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Kitchen Note / Special Instructions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--color-label)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={14} /> Kitchen Note
              </span>
              {itemNote && (
                <button
                  type="button"
                  onClick={() => {
                    hapticTap('light');
                    setItemNote('');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Clear note
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_NOTE_PRESETS.map(preset => {
                const active = hasPreset(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => toggleNotePreset(preset)}
                    style={{
                      height: 34,
                      padding: '0 11px',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 600,
                      border: active ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                      background: active ? 'var(--color-accent-light, rgba(56, 189, 248, 0.16))' : 'var(--color-bg-secondary)',
                      color: active ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      touchAction: 'manipulation',
                    }}
                  >
                    {active && <Check size={12} strokeWidth={3} />}
                    {preset}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              className="input"
              placeholder="Add custom kitchen note (e.g. No sauce, extra hot)..."
              value={itemNote}
              onChange={e => setItemNote(e.target.value)}
              style={{
                height: 44,
                fontSize: 14,
                borderRadius: 10,
                padding: '0 12px',
              }}
              aria-label="Kitchen note"
            />
          </div>

          {/* 3. Kitchen Timing + Pack/Takeaway + Course + Seat */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orderType === 'dine-in' && (() => {
              const isAlreadyCooked = item.status === 'ready' || item.status === 'served';
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block' }}>
                      Serving Type
                    </span>
                    {isAlreadyCooked && (
                      <span style={{ fontSize: 10.5, color: '#f59e0b', fontWeight: 600 }}>
                        Locked · Already cooked/ready
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      disabled={isAlreadyCooked}
                      onClick={() => {
                        hapticTap('light');
                        setIsTakeaway(false);
                      }}
                      style={{
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 9,
                        fontSize: 12.5,
                        fontWeight: 700,
                        border: !isTakeaway ? '1.5px solid #3b82f6' : '1px solid var(--color-separator)',
                        background: !isTakeaway ? 'rgba(59, 130, 246, 0.14)' : 'var(--color-bg-secondary)',
                        color: !isTakeaway ? '#60a5fa' : 'var(--color-label-secondary)',
                        cursor: isAlreadyCooked ? 'not-allowed' : 'pointer',
                        opacity: isAlreadyCooked ? 0.55 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <UtensilsCrossed size={13} /> Dine-In
                    </button>
                    <button
                      type="button"
                      disabled={isAlreadyCooked}
                      onClick={() => {
                        hapticTap('light');
                        setIsTakeaway(true);
                      }}
                      style={{
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 9,
                        fontSize: 12.5,
                        fontWeight: 700,
                        border: isTakeaway ? '1.5px solid #f59e0b' : '1px solid var(--color-separator)',
                        background: isTakeaway ? 'rgba(245, 158, 11, 0.16)' : 'var(--color-bg-secondary)',
                        color: isTakeaway ? '#fbbf24' : 'var(--color-label-secondary)',
                        cursor: isAlreadyCooked ? 'not-allowed' : 'pointer',
                        opacity: isAlreadyCooked ? 0.55 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <ShoppingBag size={13} /> Pack / Takeaway
                    </button>
                  </div>
                </div>
              );
            })()}
            {/* Fire Now vs Hold */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                Kitchen Prep
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap('light');
                    setPrepState('fired');
                  }}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 9,
                    fontSize: 13,
                    fontWeight: 700,
                    border: prepState === 'fired' ? '1.5px solid #10b981' : '1px solid var(--color-separator)',
                    background: prepState === 'fired' ? 'rgba(16, 185, 129, 0.14)' : 'var(--color-bg-secondary)',
                    color: prepState === 'fired' ? '#10b981' : 'var(--color-label-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Flame size={14} /> Fire Now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap('light');
                    setPrepState('hold');
                  }}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 9,
                    fontSize: 13,
                    fontWeight: 700,
                    border: prepState === 'hold' ? '1.5px solid #f59e0b' : '1px solid var(--color-separator)',
                    background: prepState === 'hold' ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-bg-secondary)',
                    color: prepState === 'hold' ? '#f59e0b' : 'var(--color-label-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Clock size={14} /> Hold
                </button>
              </div>
            </div>

            {/* Course Selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                Course
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {COURSE_OPTIONS.map(c => {
                  const active = course === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        hapticTap('light');
                        setCourse(c);
                      }}
                      style={{
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: active ? 700 : 600,
                        border: active ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                        background: active ? 'var(--color-accent-light, rgba(56, 189, 248, 0.15))' : 'var(--color-bg-secondary)',
                        color: active ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seat Selector (Dine-in only) */}
            {orderType === 'dine-in' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                  Seat
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[null, 1, 2, 3, 4].map(s => {
                    const active = (seatNumber ?? null) === s;
                    return (
                      <button
                        key={String(s)}
                        type="button"
                        onClick={() => {
                          hapticTap('light');
                          setSeatNumber(s);
                        }}
                        style={{
                          height: 34,
                          padding: '0 12px',
                          borderRadius: 8,
                          fontSize: 12.5,
                          fontWeight: active ? 700 : 600,
                          border: active ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                          background: active ? 'var(--color-accent-light, rgba(56, 189, 248, 0.15))' : 'var(--color-bg-secondary)',
                          color: active ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {s === null ? 'None' : `Seat ${s}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: '14px 20px', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRemove}
            style={{
              height: 50,
              padding: '0 18px',
              fontSize: 14.5,
              fontWeight: 700,
              borderRadius: 12,
              color: '#ef4444',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.08)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Trash2 size={16} /> Remove
          </button>

          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={handleSave}
            style={{
              height: 50,
              padding: '0 24px',
              fontSize: 16,
              fontWeight: 800,
              borderRadius: 12,
              flex: 1,
            }}
          >
            Save · {formatCurrency(lineTotal, currency)}
          </button>
        </div>
      </div>

      {/* Nested Touch Number Pad for high bulk counts */}
      <TouchQuantityPadModal
        isOpen={isKeypadOpen}
        itemName={item.name}
        initialQty={effectiveQty}
        unitPrice={unitPrice}
        currency={currency}
        onConfirm={(newQ) => setQty(newQ)}
        onClose={() => setIsKeypadOpen(false)}
      />
    </div>
  );
}
