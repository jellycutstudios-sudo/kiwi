import { useState, useRef } from 'react';
import { X, Check, ChevronRight, Plus, Minus, Hash, Search } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { getItemVisuals } from '../../utils/itemVisuals';
import { hapticTap } from '../../utils/soundNotifications';
import TouchQuantityPadModal from './TouchQuantityPadModal';

/* ─────────────────────────────────────────────────────────────
   QUANTITY SELECTOR BAR (Stepper + Direct Input + Bulk Chips + Touch Keypad)
────────────────────────────────────────────────────────────── */
function QuantityBar({ qty, setQty, onOpenKeypad }) {
  const quickPresets = [1, 2, 3, 5, 10, 20, 50];

  const handleDec = () => {
    hapticTap('light');
    setQty(prev => Math.max(1, (parseInt(prev, 10) || 1) - 1));
  };

  const handleInc = () => {
    hapticTap('light');
    setQty(prev => Math.min(999, (parseInt(prev, 10) || 1) + 1));
  };

  const handleChange = (e) => {
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
    if (!isNaN(parsed) && parsed >= 0) {
      setQty(Math.min(999, parsed));
    }
  };

  const handleBlur = () => {
    const parsed = parseInt(qty, 10);
    if (isNaN(parsed) || parsed < 1) {
      setQty(1);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-separator)',
      borderRadius: '12px',
      gap: 12,
      flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-label-secondary)' }}>
          Quantity
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={handleDec}
            disabled={Number(qty) <= 1}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0
            }}
            title="Decrease quantity"
            aria-label="Decrease quantity"
          >
            <Minus size={15} strokeWidth={2.5} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={qty}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={e => e.target.select()}
            style={{
              width: 52,
              height: 36,
              textAlign: 'center',
              fontSize: 16,
              fontWeight: 800,
              borderRadius: 8,
              border: '1.5px solid var(--color-separator)',
              background: 'var(--color-bg)',
              color: 'var(--color-label)',
              outline: 'none',
              padding: 0
            }}
            aria-label="Quantity"
          />
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={handleInc}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0
            }}
            title="Increase quantity"
            aria-label="Increase quantity"
          >
            <Plus size={15} strokeWidth={2.5} />
          </button>
          {onOpenKeypad && (
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={onOpenKeypad}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                color: 'var(--color-accent)'
              }}
              title="Open Touch Keypad"
              aria-label="Open Touch Keypad"
            >
              <Hash size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Quick Quantity Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflowX: 'auto' }}>
        {quickPresets.map(n => {
          const isSelected = Number(qty) === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => {
                hapticTap('light');
                setQty(n);
              }}
              style={{
                minWidth: 32,
                height: 32,
                padding: '0 6px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: isSelected ? 800 : 600,
                border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                background: isSelected ? 'var(--color-accent-light, rgba(56, 189, 248, 0.15))' : 'var(--color-bg)',
                color: isSelected ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   VARIANT MATRIX MODE
   Triggered when an item has item.variantMatrix defined.

   Data shape:
   {
     styleAxis:   ['Gravy', 'Paste', 'Dry'],
     portionAxis: ['Quarter', 'Half', 'Full'],
     prices: {
       'Gravy|Quarter': 150,
       'Gravy|Half': 300,
       'Gravy|Full': 600,
       'Paste|Quarter': 125,
       ...
     }
   }
────────────────────────────────────────────────────────────── */

function getEffectiveVariantMatrix(item) {
  if (!item) return null;
  if (item.variantMatrix) return item.variantMatrix;

  const groups = item.modifierGroups ?? [];
  // Find all mandatory pick-1 groups (e.g. "Gravy" Pick 1, "Paste" Pick 1)
  const mandatoryPickOneGroups = groups.filter(g => g.required && g.maxSelect === 1 && g.options?.length > 0);

  // If there are 2 or more mandatory pick-1 groups, synthesize a 2-D Variant Matrix (Style x Portion)
  if (mandatoryPickOneGroups.length >= 2) {
    const styleAxis = mandatoryPickOneGroups.map(g => g.name);
    const portionSet = new Set();
    mandatoryPickOneGroups.forEach(g => {
      g.options.forEach(opt => portionSet.add(opt.name));
    });
    const portionAxis = Array.from(portionSet);

    const prices = {};
    mandatoryPickOneGroups.forEach(g => {
      g.options.forEach(opt => {
        prices[`${g.name}|${opt.name}`] = opt.priceAdd ?? 0;
      });
    });

    return {
      styleLabel: 'Preparation / Style',
      portionLabel: 'Portion / Size',
      styleAxis,
      portionAxis,
      prices
    };
  }

  return null;
}

function VariantMatrixPicker({ item, matrix: passedMatrix, currency, onConfirm, onClose }) {
  const matrix = passedMatrix || getEffectiveVariantMatrix(item);
  const styles  = matrix?.styleAxis  ?? [];
  const portions = matrix?.portionAxis ?? [];
  const prices  = matrix?.prices ?? {};

  const [selectedStyle, setSelectedStyle] = useState(styles[0] ?? null);
  // Map of "style|portion" -> quantity, e.g. { 'Gravy|Quarter': 2, 'Paste|Full': 1 }
  const [comboQuantities, setComboQuantities] = useState({});
  const [keypadTarget, setKeypadTarget] = useState(null);

  // Ordered active entries across ALL styles (so switching style tabs preserves previous style selections)
  const activeComboEntries = [];
  styles.forEach(s => {
    portions.forEach(p => {
      const key = `${s}|${p}`;
      if (Object.prototype.hasOwnProperty.call(comboQuantities, key) && prices[key] !== undefined) {
        const raw = comboQuantities[key];
        const q = Math.max(1, parseInt(raw, 10) || 1);
        activeComboEntries.push({ style: s, portion: p, key, rawQty: raw, qty: q, price: prices[key] });
      }
    });
  });

  const getStyleCount = (s) =>
    activeComboEntries.reduce((sum, e) => (e.style === s ? sum + e.qty : sum), 0);

  const selectedStyleSet = new Set(activeComboEntries.map(e => e.style));
  const hasMultipleStyles = selectedStyleSet.size > 1;

  const totalItemCount = activeComboEntries.reduce((sum, e) => sum + e.qty, 0);
  const totalPrice = activeComboEntries.reduce((sum, e) => sum + (e.price * e.qty), 0);

  const canConfirm = totalItemCount > 0;
  const styleColors = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#06b6d4'];

  // Single combo helper (only show QuantityBar when exactly 1 combo is active AND matches current tab)
  const singleCombo = activeComboEntries.length === 1 ? activeComboEntries[0] : null;
  const showSingleQuantityBar = singleCombo && singleCombo.style === selectedStyle;

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (activeComboEntries.length === 1) {
      const entry = activeComboEntries[0];
      const mods = [
        {
          modifierGroupId: '__style__',
          modifierGroupName: matrix.styleLabel ?? 'Style',
          id: `style-${entry.style}`,
          name: entry.style,
          priceAdd: 0,
          isVariantAxis: true,
        },
        {
          modifierGroupId: '__portion__',
          modifierGroupName: matrix.portionLabel ?? 'Portion',
          id: `portion-${entry.portion}`,
          name: entry.portion,
          priceAdd: entry.price,
          isVariantAxis: true,
        }
      ];
      onConfirm(mods, entry.price, entry.qty);
    } else {
      // Bulk multi-portion / multi-style (e.g. 2 Gravy Quarter + 1 Paste Full in one order)
      const bulkItems = activeComboEntries.map(entry => ({
        selectedModifiers: [
          {
            modifierGroupId: '__style__',
            modifierGroupName: matrix.styleLabel ?? 'Style',
            id: `style-${entry.style}`,
            name: entry.style,
            priceAdd: 0,
            isVariantAxis: true,
          },
          {
            modifierGroupId: '__portion__',
            modifierGroupName: matrix.portionLabel ?? 'Portion',
            id: `portion-${entry.portion}`,
            name: entry.portion,
            priceAdd: entry.price,
            isVariantAxis: true,
          }
        ],
        flatPrice: entry.price,
        qty: entry.qty
      }));
      onConfirm(bulkItems);
    }
  };

  // Group summary text cleanly by style
  const summaryText = hasMultipleStyles
    ? styles
        .map(s => {
          const entries = activeComboEntries.filter(e => e.style === s);
          if (!entries.length) return null;
          const part = entries.map(e => `${e.qty > 1 ? `${e.qty} ` : ''}${e.portion}`).join(' + ');
          return `${s} (${part})`;
        })
        .filter(Boolean)
        .join(' + ')
    : activeComboEntries.length > 0
      ? `${activeComboEntries[0].style} · ${activeComboEntries.map(e => `${e.qty > 1 ? `${e.qty} ` : ''}${e.portion}`).join(' + ')}`
      : '';

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 580, width: 'min(580px, 94vw)' }}>

        {/* Header */}
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {(() => {
              const visuals = getItemVisuals(item);
              return (
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
                    boxShadow: `0 4px 12px ${visuals.glow}`
                  }}
                >
                  <span style={{ color: visuals.color, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                    {visuals.monogram}
                  </span>
                </div>
              );
            })()}
            <div>
              <h2 className="modal-title" style={{ fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
                {item.name}
              </h2>
              <div style={{ fontSize: 13, color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                {totalItemCount > 1 ? `Pick style then portion — ${totalItemCount} items` : 'Pick style then portion — 1 item'}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} style={{ width: 38, height: 38, borderRadius: 10 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          {/* Step 1 — Style selector tabs (each style remembers its own portion counts) */}
          <div>
            <div className="vm-step-header">
              <span className="vm-step-title">{matrix.styleLabel ?? 'Style'}</span>
              {hasMultipleStyles
                ? <span className="vm-step-selected">✓ {selectedStyleSet.size} styles</span>
                : selectedStyle && <span className="vm-step-selected">✓ {selectedStyle}</span>}
            </div>
            <div className="vm-style-grid">
              {styles.map((s, idx) => {
                const isActive = selectedStyle === s;
                const styleCount = getStyleCount(s);
                const col = styleColors[idx % styleColors.length];
                return (
                  <button
                    key={s}
                    type="button"
                    className={`vm-style-btn ${isActive ? 'vm-style-btn--active' : ''}`}
                    style={
                      isActive
                        ? { borderColor: col, background: col + '18', color: col }
                        : styleCount > 0
                          ? { borderColor: col + '88', background: col + '0f', color: 'var(--color-label)' }
                          : {}
                    }
                    onClick={() => {
                      hapticTap('light');
                      setSelectedStyle(s);
                    }}
                  >
                    {isActive && <Check size={13} strokeWidth={3} />}
                    <span>{s}</span>
                    {styleCount > 0 && (
                      <span
                        style={{
                          minWidth: 20,
                          height: 20,
                          padding: '0 6px',
                          borderRadius: 999,
                          background: col,
                          color: '#ffffff',
                          fontSize: 11,
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1,
                        }}
                      >
                        {styleCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — Portion selector for currently active style tab */}
          <div style={{ opacity: selectedStyle ? 1 : 0.4, pointerEvents: selectedStyle ? 'all' : 'none', transition: 'opacity 0.2s' }}>
            <div className="vm-step-header">
              <span className="vm-step-title">{matrix.portionLabel ?? 'Portion'}</span>
              {totalItemCount > 0 && <span className="vm-step-selected">✓ {totalItemCount} selected</span>}
              {!selectedStyle && <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)', marginLeft: 6 }}>Select style first</span>}
            </div>
            <div className="vm-portion-grid">
              {portions.map(p => {
                const comboKey = selectedStyle ? `${selectedStyle}|${p}` : '';
                const price = selectedStyle ? (prices[comboKey] ?? null) : null;
                const unavailable = price === null || price === undefined;
                const hasCombo = comboKey && Object.prototype.hasOwnProperty.call(comboQuantities, comboKey);
                const currentQty = hasCombo ? Math.max(1, parseInt(comboQuantities[comboKey], 10) || 1) : 0;

                if (hasCombo) {
                  return (
                    <div
                      key={p}
                      className="vm-portion-btn vm-portion-btn--active"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        minHeight: 82,
                        cursor: 'default'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span className="vm-portion-name" style={{ fontWeight: 800 }}>{p}</span>
                        <span className="vm-portion-price" style={{ fontWeight: 800, color: 'var(--color-accent)' }}>
                          {formatCurrency(price, currency)}
                        </span>
                      </div>

                      <div 
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 8 }}
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          onClick={() => {
                            hapticTap('light');
                            setComboQuantities(prev => {
                              const next = { ...prev };
                              const cur = Math.max(1, parseInt(next[comboKey], 10) || 1);
                              if (cur <= 1) {
                                delete next[comboKey];
                              } else {
                                next[comboKey] = cur - 1;
                              }
                              return next;
                            });
                          }}
                          style={{ width: 32, height: 32, borderRadius: 8, padding: 0 }}
                          title={`Decrease ${p} quantity`}
                          aria-label={`Decrease ${p} quantity`}
                        >
                          <Minus size={14} strokeWidth={2.5} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setKeypadTarget({
                              name: `${item.name} (${selectedStyle} · ${p})`,
                              qty: currentQty,
                              unitPrice: price,
                              onConfirm: (newQ) => {
                                setComboQuantities(prev => ({ ...prev, [comboKey]: newQ }));
                              }
                            });
                          }}
                          style={{
                            minWidth: 40,
                            height: 32,
                            borderRadius: 8,
                            border: '1.5px solid var(--color-accent)',
                            background: 'var(--color-bg)',
                            color: 'var(--color-label)',
                            fontWeight: 900,
                            fontSize: 15,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Tap to type custom quantity"
                        >
                          {currentQty}
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          onClick={() => {
                            hapticTap('light');
                            setComboQuantities(prev => ({
                              ...prev,
                              [comboKey]: Math.min(999, (parseInt(prev[comboKey], 10) || 0) + 1)
                            }));
                          }}
                          style={{ width: 32, height: 32, borderRadius: 8, padding: 0 }}
                          title={`Increase ${p} quantity`}
                          aria-label={`Increase ${p} quantity`}
                        >
                          <Plus size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={p}
                    type="button"
                    className={`vm-portion-btn ${unavailable ? 'vm-portion-btn--disabled' : ''}`}
                    disabled={unavailable}
                    onClick={() => {
                      hapticTap('light');
                      setComboQuantities(prev => ({ ...prev, [comboKey]: 1 }));
                    }}
                    style={{ minHeight: 82 }}
                  >
                    <span className="vm-portion-name">{p}</span>
                    <span className="vm-portion-price">
                      {price !== null && price !== undefined ? formatCurrency(price, currency) : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* If single combo is selected on the active tab: show QuantityBar with bulk presets and keypad */}
          {showSingleQuantityBar && (
            <QuantityBar
              qty={singleCombo.rawQty}
              setQty={(newQ) => {
                setComboQuantities(prev => {
                  const current = prev[singleCombo.key] ?? 1;
                  const resolved = typeof newQ === 'function' ? newQ(current) : newQ;
                  if (resolved === '') {
                    return { ...prev, [singleCombo.key]: '' };
                  }
                  const safeNum = Math.max(1, parseInt(resolved, 10) || 1);
                  return { ...prev, [singleCombo.key]: safeNum };
                });
              }}
              onOpenKeypad={() => {
                setKeypadTarget({
                  name: `${item.name} (${singleCombo.style} · ${singleCombo.portion})`,
                  qty: singleCombo.qty,
                  unitPrice: singleCombo.price,
                  onConfirm: (newQ) => {
                    setComboQuantities(prev => ({ ...prev, [singleCombo.key]: newQ }));
                  }
                });
              }}
            />
          )}

          {/* If multiple portions or styles are selected: show interactive breakdown bar */}
          {activeComboEntries.length > 1 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '12px 14px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--color-separator)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                  Selected ({totalItemCount} items total)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap('light');
                    setComboQuantities({});
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Clear all
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {activeComboEntries.map(entry => {
                  const styleIdx = Math.max(0, styles.indexOf(entry.style));
                  const styleCol = styleColors[styleIdx % styleColors.length];
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => {
                        hapticTap('light');
                        setSelectedStyle(entry.style);
                        setKeypadTarget({
                          name: `${item.name} (${entry.style} · ${entry.portion})`,
                          qty: entry.qty,
                          unitPrice: entry.price,
                          onConfirm: (newQ) => {
                            setComboQuantities(prev => ({ ...prev, [entry.key]: newQ }));
                          }
                        });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 10px',
                        borderRadius: 8,
                        background: 'var(--color-bg-elevated)',
                        border: `1px solid ${hasMultipleStyles ? styleCol + '55' : 'var(--color-separator)'}`,
                        fontSize: 13,
                        fontWeight: 800,
                        color: 'var(--color-label)',
                        cursor: 'pointer'
                      }}
                      title={`Tap to edit ${entry.style} ${entry.portion} quantity`}
                    >
                      {hasMultipleStyles && (
                        <span style={{ color: styleCol, fontWeight: 800 }}>{entry.style} ·</span>
                      )}
                      <span>{entry.portion} × {entry.qty}</span>
                      <span style={{ color: 'var(--color-accent)' }}>{formatCurrency(entry.price * entry.qty, currency)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary pill */}
          {canConfirm && (
            <div className="vm-summary">
              <span className="vm-summary-combo">
                {summaryText}
              </span>
              <ChevronRight size={14} style={{ color: 'var(--color-label-tertiary)' }} />
              <span className="vm-summary-price">{formatCurrency(totalPrice, currency)}</span>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderTop: '1px solid var(--color-separator)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-label-tertiary)' }}>
              Total
            </span>
            <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-label)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {formatCurrency(totalPrice, currency)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ height: 46, padding: '0 20px', fontSize: 14.5, fontWeight: 700, borderRadius: 10 }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleConfirm}
              disabled={!canConfirm}
              style={{
                height: 46,
                padding: '0 26px',
                fontSize: 15,
                fontWeight: 800,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {canConfirm
                ? `Save · Add ${totalItemCount > 1 ? `${totalItemCount} ` : ''}to Cart · ${formatCurrency(totalPrice, currency)}`
                : 'Select style & portion'}
            </button>
          </div>
        </div>
      </div>

      {/* On-screen Touch Quantity Keypad Modal */}
      <TouchQuantityPadModal
        isOpen={!!keypadTarget}
        itemName={keypadTarget?.name}
        initialQty={keypadTarget?.qty || 1}
        unitPrice={keypadTarget?.unitPrice}
        currency={currency}
        onConfirm={(newQ) => keypadTarget?.onConfirm?.(newQ)}
        onClose={() => setKeypadTarget(null)}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CLASSIC MODIFIER MODE (with multi-option quantity selection
   for single-select size/portion groups like Small + Large)
────────────────────────────────────────────────────────────── */

function getMultiQtyGroup(modifierGroups) {
  if (!modifierGroups?.length) return null;
  const requiredSingle = modifierGroups.find(
    g => g.required && (g.maxSelect ?? 1) === 1 && (g.options?.length ?? 0) > 1
  );
  if (requiredSingle) return requiredSingle;
  if (
    modifierGroups.length === 1 &&
    (modifierGroups[0].maxSelect ?? 1) === 1 &&
    (modifierGroups[0].options?.length ?? 0) > 1
  ) {
    return modifierGroups[0];
  }
  return null;
}

function getInitialSelections(item, multiQtyGroupId = null) {
  if (!item?.modifierGroups) return {};
  const initial = {};
  item.modifierGroups.forEach(group => {
    if (group.id === multiQtyGroupId) {
      initial[group.id] = [];
    } else if (group.required && group.maxSelect === 1 && group.options?.length > 0) {
      initial[group.id] = [group.options[0]];
    } else {
      initial[group.id] = [];
    }
  });
  return initial;
}

function ClassicModifierPicker({ item, currency, onConfirm, onClose }) {
  const modifierGroups = item?.modifierGroups ?? [];
  const multiQtyGroup = getMultiQtyGroup(modifierGroups);

  const [prevItem, setPrevItem] = useState(item);
  const [selections, setSelections] = useState(() => getInitialSelections(item, multiQtyGroup?.id));
  // Map of optionId -> qty for multiQtyGroup (e.g. { small: 1, large: 2 })
  const [optionQuantities, setOptionQuantities] = useState({});
  const [qty, setQty] = useState(1);
  const [keypadTarget, setKeypadTarget] = useState(null);
  const [addonSearch, setAddonSearch] = useState('');
  const modalRef = useRef(null);
  useFocusTrap(modalRef, !!item);

  if (item !== prevItem) {
    const nextMulti = getMultiQtyGroup(item?.modifierGroups);
    setPrevItem(item);
    setSelections(getInitialSelections(item, nextMulti?.id));
    setOptionQuantities({});
    setQty(1);
    setKeypadTarget(null);
    setAddonSearch('');
  }

  if (!item) return null;

  const effectiveQty = Math.max(1, parseInt(qty, 10) || 1);
  const basePrice = item.price ?? 0;
  const hasAddonGroups = modifierGroups.some(g => g.id !== multiQtyGroup?.id);

  const handleSelect = (group, option) => {
    const groupId = group.id;
    const current = selections[groupId] ?? [];
    const maxSelect = group.maxSelect ?? 1;
    let updated = [];

    if (maxSelect === 1) {
      const isAlreadySelected = current.some(o => o.id === option.id);
      updated = (isAlreadySelected && !group.required) ? [] : [option];
    } else {
      const exists = current.some(o => o.id === option.id);
      if (exists) {
        updated = current.filter(o => o.id !== option.id);
      } else {
        updated = current.length < maxSelect
          ? [...current, option]
          : [...current.slice(1), option];
      }
    }
    setSelections(prev => ({ ...prev, [groupId]: updated }));
  };

  // Extra modifiers from groups other than multiQtyGroup
  const extraModifierTotal = Object.entries(selections).reduce((sum, [groupId, opts]) => {
    if (multiQtyGroup && groupId === multiQtyGroup.id) return sum;
    return sum + opts.reduce((s, o) => s + (o.priceAdd ?? 0), 0);
  }, 0);

  // Active option entries in menu order for multiQtyGroup
  const activeOptionEntries = multiQtyGroup
    ? (multiQtyGroup.options ?? [])
        .filter(opt => Object.prototype.hasOwnProperty.call(optionQuantities, opt.id))
        .map(opt => {
          const raw = optionQuantities[opt.id];
          const numQty = Math.max(1, parseInt(raw, 10) || 1);
          return { opt, rawQty: raw, qty: numQty };
        })
    : [];

  const hasMultiQtySelections = multiQtyGroup && activeOptionEntries.length > 0;
  const singleActiveOption = activeOptionEntries.length === 1 ? activeOptionEntries[0] : null;

  const totalItemCount = hasMultiQtySelections
    ? activeOptionEntries.reduce((sum, e) => sum + e.qty, 0)
    : effectiveQty;

  const totalPrice = hasMultiQtySelections
    ? activeOptionEntries.reduce(
        (sum, e) => sum + (basePrice + (e.opt.priceAdd ?? 0) + extraModifierTotal) * e.qty,
        0
      )
    : (basePrice + extraModifierTotal) * effectiveQty;

  const isGroupSatisfied = (group) => {
    if (!group.required) return true;
    if (multiQtyGroup && group.id === multiQtyGroup.id) {
      return activeOptionEntries.length > 0;
    }
    return (selections[group.id]?.length ?? 0) > 0;
  };
  const isValid = modifierGroups.every(isGroupSatisfied);

  const handleSubmit = () => {
    if (!isValid) return;

    const extraModifiers = [];
    Object.entries(selections).forEach(([groupId, opts]) => {
      if (multiQtyGroup && groupId === multiQtyGroup.id) return;
      const group = modifierGroups.find(g => g.id === groupId);
      opts.forEach(opt => {
        extraModifiers.push({
          modifierGroupId: groupId,
          modifierGroupName: group?.name ?? '',
          id: opt.id,
          name: opt.name,
          priceAdd: opt.priceAdd ?? 0,
        });
      });
    });

    if (multiQtyGroup && activeOptionEntries.length === 1) {
      const { opt, qty: optQty } = activeOptionEntries[0];
      const mods = [
        {
          modifierGroupId: multiQtyGroup.id,
          modifierGroupName: multiQtyGroup.name ?? '',
          id: opt.id,
          name: opt.name,
          priceAdd: opt.priceAdd ?? 0,
        },
        ...extraModifiers,
      ];
      onConfirm(mods, null, optQty);
      return;
    }

    if (multiQtyGroup && activeOptionEntries.length > 1) {
      const bulkItems = activeOptionEntries.map(({ opt, qty: optQty }) => ({
        selectedModifiers: [
          {
            modifierGroupId: multiQtyGroup.id,
            modifierGroupName: multiQtyGroup.name ?? '',
            id: opt.id,
            name: opt.name,
            priceAdd: opt.priceAdd ?? 0,
          },
          ...extraModifiers,
        ],
        flatPrice: basePrice + (opt.priceAdd ?? 0) + extraModifierTotal,
        qty: optQty,
      }));
      onConfirm(bulkItems);
      return;
    }

    onConfirm(extraModifiers, null, effectiveQty);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" ref={modalRef} style={{ maxWidth: 640, width: 'min(640px, 95vw)' }}>
        <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-separator)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {(() => {
              const visuals = getItemVisuals(item);
              return (
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
                    boxShadow: `0 4px 12px ${visuals.glow}`
                  }}
                >
                  <span style={{ color: visuals.color, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                    {visuals.monogram}
                  </span>
                </div>
              );
            })()}
            <div>
              <h2 className="modal-title" style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.01em', color: 'var(--color-label)' }}>
                {item.name}
              </h2>
              <div style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                {hasMultiQtySelections && totalItemCount > 1
                  ? `${activeOptionEntries.map(e => `${e.qty} ${e.opt.name}`).join(' + ')} — ${totalItemCount} items`
                  : basePrice > 0
                    ? `Base Price: ${formatCurrency(basePrice, currency)}`
                    : 'Select your variation & sides'}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} style={{ width: 38, height: 38, borderRadius: 10 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '62vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 20px' }}>
          {modifierGroups.map((group, groupIdx) => {
            const isMultiGroup = multiQtyGroup && group.id === multiQtyGroup.id;
            const groupSelections = selections[group.id] ?? [];
            const satisfied = isGroupSatisfied(group);
            const maxSelect = group.maxSelect ?? 1;

            if (isMultiGroup) {
              return (
                <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-label-secondary)' }}>
                        {group.name || 'Variation'}
                      </span>
                      {group.required && (
                        <span className={`badge ${satisfied ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                          {satisfied ? `✓ ${totalItemCount} selected` : 'Required'}
                        </span>
                      )}
                      {!group.required && activeOptionEntries.length > 0 && (
                        <span className="badge badge-green" style={{ fontSize: 10, padding: '1px 6px' }}>
                          ✓ {totalItemCount} selected
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--color-label-tertiary)' }}>
                      {maxSelect === 1 ? 'Choose 1' : 'Select one or more'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    {group.options?.map(opt => {
                      const hasOpt = Object.prototype.hasOwnProperty.call(optionQuantities, opt.id);
                      const currentQty = hasOpt ? Math.max(1, parseInt(optionQuantities[opt.id], 10) || 1) : 0;
                      const unitOptPrice = basePrice + (opt.priceAdd ?? 0) + extraModifierTotal;
                      const priceLabel = opt.priceAdd > 0
                        ? (basePrice === 0 ? formatCurrency(opt.priceAdd, currency) : `+${formatCurrency(opt.priceAdd, currency)}`)
                        : (basePrice === 0 ? formatCurrency(0, currency) : 'Included');

                      if (hasOpt) {
                        return (
                          <div
                            key={opt.id}
                            style={{
                              background: 'rgba(16, 185, 129, 0.12)',
                              border: '2px solid #10b981',
                              borderRadius: 12,
                              padding: '12px 14px',
                              minHeight: 84,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: 8,
                              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.22)',
                              boxSizing: 'border-box'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <div style={{
                                  width: 20, height: 20,
                                  borderRadius: '50%',
                                  background: '#10b981',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  <Check size={12} color="#ffffff" strokeWidth={3} />
                                </div>
                                <span style={{
                                  fontSize: '15px',
                                  fontWeight: 800,
                                  color: 'var(--color-label)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {opt.name}
                                </span>
                              </div>
                              <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#10b981', flexShrink: 0 }}>
                                {priceLabel}
                              </span>
                            </div>

                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="btn btn-icon"
                                onClick={() => {
                                  hapticTap('light');
                                  setOptionQuantities(prev => {
                                    const next = { ...prev };
                                    const cur = Math.max(1, parseInt(next[opt.id], 10) || 1);
                                    if (cur <= 1) {
                                      delete next[opt.id];
                                    } else {
                                      next[opt.id] = cur - 1;
                                    }
                                    return next;
                                  });
                                }}
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 8,
                                  padding: 0,
                                  flexShrink: 0,
                                  background: 'rgba(16, 185, 129, 0.16)',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  color: '#10b981',
                                  cursor: 'pointer'
                                }}
                                title={`Decrease ${opt.name} quantity`}
                                aria-label={`Decrease ${opt.name} quantity`}
                              >
                                <Minus size={14} strokeWidth={2.5} />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  hapticTap('light');
                                  setKeypadTarget({
                                    name: `${item.name} (${opt.name})`,
                                    qty: currentQty,
                                    unitPrice: unitOptPrice,
                                    onConfirm: (newQ) => {
                                      setOptionQuantities(prev => ({ ...prev, [opt.id]: newQ }));
                                    }
                                  });
                                }}
                                style={{
                                  flex: 1,
                                  minWidth: 44,
                                  height: 34,
                                  borderRadius: 8,
                                  border: '1.5px solid #10b981',
                                  background: 'var(--color-bg)',
                                  color: 'var(--color-label)',
                                  fontWeight: 900,
                                  fontSize: 15,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 4,
                                  cursor: 'pointer'
                                }}
                                title={`Tap to type custom ${opt.name} quantity`}
                                aria-label={`${opt.name} quantity ${currentQty}`}
                              >
                                {currentQty}
                              </button>

                              <button
                                type="button"
                                className="btn btn-icon"
                                onClick={() => {
                                  hapticTap('light');
                                  setOptionQuantities(prev => ({
                                    ...prev,
                                    [opt.id]: Math.min(999, (parseInt(prev[opt.id], 10) || 0) + 1)
                                  }));
                                }}
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 8,
                                  padding: 0,
                                  flexShrink: 0,
                                  background: 'rgba(16, 185, 129, 0.16)',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  color: '#10b981',
                                  cursor: 'pointer'
                                }}
                                title={`Increase ${opt.name} quantity`}
                                aria-label={`Increase ${opt.name} quantity`}
                              >
                                <Plus size={14} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            hapticTap('light');
                            setOptionQuantities(prev => ({ ...prev, [opt.id]: 1 }));
                          }}
                          style={{
                            background: 'var(--color-bg-secondary)',
                            border: '1.5px solid var(--color-separator)',
                            borderRadius: 12,
                            padding: '14px 16px',
                            minHeight: 84,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            transition: 'all var(--duration-fast) var(--ease-out)',
                            textAlign: 'left',
                            fontFamily: 'var(--font-family)',
                            touchAction: 'manipulation',
                            boxShadow: 'var(--shadow-sm)',
                            boxSizing: 'border-box'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 22, height: 22,
                              borderRadius: '50%',
                              border: '1.5px solid var(--color-separator)',
                              background: 'var(--color-bg-elevated)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--color-label-secondary)',
                              flexShrink: 0
                            }}>
                              <Plus size={12} strokeWidth={2.5} />
                            </div>
                            <span style={{
                              fontSize: '15px',
                              fontWeight: 800,
                              color: 'var(--color-label)'
                            }}>
                              {opt.name}
                            </span>
                          </div>
                          <span style={{
                            fontSize: opt.priceAdd > 0 ? '14px' : '13px',
                            fontWeight: opt.priceAdd > 0 ? 800 : 600,
                            color: opt.priceAdd > 0 ? 'var(--color-label-secondary)' : 'var(--color-label-tertiary)'
                          }}>
                            {priceLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Optional sides / add-ons / extras
            const filteredOptions = (group.options ?? []).filter(opt =>
              !addonSearch.trim() || opt.name.toLowerCase().includes(addonSearch.toLowerCase().trim())
            );

            return (
              <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Search addon item bar rendered right before the first addon group */}
                {hasAddonGroups && (groupIdx === 0 || (multiQtyGroup && groupIdx === 1)) && (
                  <div style={{ position: 'relative', marginTop: 2, marginBottom: 2 }}>
                    <Search
                      size={16}
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-label-tertiary)',
                        pointerEvents: 'none'
                      }}
                    />
                    <input
                      type="text"
                      value={addonSearch}
                      onChange={e => setAddonSearch(e.target.value)}
                      placeholder="Search addon item..."
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 36px 0 38px',
                        borderRadius: 10,
                        border: '1.5px solid var(--color-separator)',
                        background: 'var(--color-bg-secondary)',
                        color: 'var(--color-label)',
                        fontSize: 14,
                        fontWeight: 600,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {addonSearch && (
                      <button
                        type="button"
                        onClick={() => setAddonSearch('')}
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-label-tertiary)',
                          cursor: 'pointer',
                          padding: 4
                        }}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-label-secondary)' }}>
                      {group.name}
                    </span>
                    {group.required && (
                      <span className={`badge ${satisfied ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                        {satisfied ? '✓ Selected' : 'Required'}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-label-tertiary)' }}>
                    {maxSelect === 1 ? 'Choose 1' : maxSelect ? `Choose up to ${maxSelect}` : 'Optional'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                  {filteredOptions.map(opt => {
                    const isSelected = groupSelections.some(o => o.id === opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelect(group, opt)}
                        style={{
                          background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'var(--color-bg-elevated)',
                          borderTop: `1.5px solid ${isSelected ? '#10b981' : 'var(--color-separator)'}`,
                          borderRight: `1.5px solid ${isSelected ? '#10b981' : 'var(--color-separator)'}`,
                          borderBottom: `1.5px solid ${isSelected ? '#10b981' : 'var(--color-separator)'}`,
                          borderLeft: '4.5px solid #10b981',
                          borderRadius: 10,
                          padding: '12px 14px',
                          minHeight: 66,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          cursor: 'pointer',
                          transition: 'all var(--duration-fast) var(--ease-out)',
                          textAlign: 'center',
                          fontFamily: 'var(--font-family)',
                          touchAction: 'manipulation',
                          position: 'relative',
                          boxShadow: isSelected ? '0 4px 12px rgba(16, 185, 129, 0.22)' : 'var(--shadow-sm)',
                          boxSizing: 'border-box'
                        }}
                      >
                        {isSelected && (
                          <div style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 17,
                            height: 17,
                            borderRadius: '50%',
                            background: '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Check size={11} color="#ffffff" strokeWidth={3} />
                          </div>
                        )}
                        <span style={{
                          fontSize: '14.5px',
                          fontWeight: isSelected ? 800 : 700,
                          color: isSelected ? '#10b981' : 'var(--color-label)',
                          marginBottom: 3
                        }}>
                          {opt.name}
                        </span>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 800,
                          color: isSelected ? '#10b981' : 'var(--color-label-secondary)'
                        }}>
                          {opt.priceAdd > 0
                            ? (basePrice === 0 ? formatCurrency(opt.priceAdd, currency) : `+${formatCurrency(opt.priceAdd, currency)}`)
                            : (basePrice === 0 ? formatCurrency(0, currency) : 'Included')}
                        </span>
                      </button>
                    );
                  })}

                  {filteredOptions.length === 0 && (
                    <div style={{
                      gridColumn: '1 / -1',
                      padding: '14px',
                      textAlign: 'center',
                      fontSize: 13,
                      color: 'var(--color-label-tertiary)',
                      fontStyle: 'italic',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 8
                    }}>
                      No sides matching &quot;{addonSearch}&quot;
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Quantity Selector Bar — synced to single active option, or base item when not multi-option */}
          {singleActiveOption && (
            <QuantityBar
              qty={singleActiveOption.rawQty}
              setQty={(newQ) => {
                setOptionQuantities(prev => {
                  const current = prev[singleActiveOption.opt.id] ?? 1;
                  const resolved = typeof newQ === 'function' ? newQ(current) : newQ;
                  if (resolved === '') {
                    return { ...prev, [singleActiveOption.opt.id]: '' };
                  }
                  const safeNum = Math.max(1, parseInt(resolved, 10) || 1);
                  return { ...prev, [singleActiveOption.opt.id]: safeNum };
                });
              }}
              onOpenKeypad={() => {
                const unitOptPrice = basePrice + (singleActiveOption.opt.priceAdd ?? 0) + extraModifierTotal;
                setKeypadTarget({
                  name: `${item.name} (${singleActiveOption.opt.name})`,
                  qty: singleActiveOption.qty,
                  unitPrice: unitOptPrice,
                  onConfirm: (newQ) => {
                    setOptionQuantities(prev => ({ ...prev, [singleActiveOption.opt.id]: newQ }));
                  }
                });
              }}
            />
          )}

          {/* Multi-option breakdown bar when 2+ options are selected simultaneously */}
          {activeOptionEntries.length > 1 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '12px 14px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--color-separator)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                  Selected ({totalItemCount} items total)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    hapticTap('light');
                    setOptionQuantities({});
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Clear all
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {activeOptionEntries.map(({ opt, qty: optQty }) => {
                  const unitOptPrice = basePrice + (opt.priceAdd ?? 0) + extraModifierTotal;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        hapticTap('light');
                        setKeypadTarget({
                          name: `${item.name} (${opt.name})`,
                          qty: optQty,
                          unitPrice: unitOptPrice,
                          onConfirm: (newQ) => {
                            setOptionQuantities(prev => ({ ...prev, [opt.id]: newQ }));
                          }
                        });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 10px',
                        borderRadius: 8,
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-separator)',
                        fontSize: 13,
                        fontWeight: 800,
                        color: 'var(--color-label)',
                        cursor: 'pointer'
                      }}
                      title={`Tap to edit ${opt.name} quantity`}
                    >
                      <span>{opt.name} × {optQty}</span>
                      <span style={{ color: 'var(--color-accent)' }}>{formatCurrency(unitOptPrice * optQty, currency)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Classic QuantityBar when no multiQtyGroup (or optional multiQtyGroup with 0 chosen) */}
          {(!multiQtyGroup || (!multiQtyGroup.required && activeOptionEntries.length === 0)) && (
            <QuantityBar
              qty={qty}
              setQty={setQty}
              onOpenKeypad={() => {
                setKeypadTarget({
                  name: item.name,
                  qty: effectiveQty,
                  unitPrice: basePrice + extraModifierTotal,
                  onConfirm: (newQ) => setQty(newQ)
                });
              }}
            />
          )}
        </div>

        <div className="modal-footer" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderTop: '1px solid var(--color-separator)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-label-tertiary)' }}>
              Total
            </span>
            <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-label)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {formatCurrency(totalPrice, currency)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ height: 46, padding: '0 20px', fontSize: 14.5, fontWeight: 700, borderRadius: 10 }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleSubmit}
              disabled={!isValid}
              style={{
                height: 46,
                padding: '0 26px',
                fontSize: 15,
                fontWeight: 800,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {isValid
                ? `Save · Add ${totalItemCount > 1 ? `${totalItemCount} ` : ''}to Cart · ${formatCurrency(totalPrice, currency)}`
                : `Select ${multiQtyGroup?.name ?? 'options'}`}
            </button>
          </div>
        </div>
      </div>

      <TouchQuantityPadModal
        isOpen={!!keypadTarget}
        itemName={keypadTarget?.name}
        initialQty={keypadTarget?.qty || 1}
        unitPrice={keypadTarget?.unitPrice}
        currency={currency}
        onConfirm={(newQ) => keypadTarget?.onConfirm?.(newQ)}
        onClose={() => setKeypadTarget(null)}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN EXPORT — router between matrix & classic mode
────────────────────────────────────────────────────────────── */
export default function ModifierModal({ item, currency, onConfirm, onClose }) {
  if (!item) return null;

  const effectiveMatrix = getEffectiveVariantMatrix(item);

  if (effectiveMatrix) {
    return (
      <VariantMatrixPicker
        item={item}
        matrix={effectiveMatrix}
        currency={currency}
        onClose={onClose}
        onConfirm={(mods, flatPrice, qty = 1) => {
          // Supports both single modifier array and bulk items array
          onConfirm(mods, flatPrice, qty);
        }}
      />
    );
  }

  return (
    <ClassicModifierPicker
      item={item}
      currency={currency}
      onConfirm={(mods, flatPrice, qty = 1) => {
        onConfirm(mods, flatPrice, qty);
      }}
      onClose={onClose}
    />
  );
}
