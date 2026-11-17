import { useState, useRef } from 'react';
import { X, Check, ChevronRight, Plus, Minus, Hash } from 'lucide-react';
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
  // Map of portionName -> quantity, e.g. { 'Full': 2, 'Half': 1 }
  const [portionQuantities, setPortionQuantities] = useState({});
  const [keypadTarget, setKeypadTarget] = useState(null);

  // Active portion entries for current style
  const activePortionEntries = Object.entries(portionQuantities).filter(
    ([p, q]) => q > 0 && selectedStyle && prices[`${selectedStyle}|${p}`] !== undefined
  );

  const totalItemCount = activePortionEntries.reduce((sum, [_, q]) => sum + q, 0);
  const totalPrice = activePortionEntries.reduce((sum, [p, q]) => {
    const pPrice = prices[`${selectedStyle}|${p}`] ?? 0;
    return sum + (pPrice * q);
  }, 0);

  const canConfirm = selectedStyle && totalItemCount > 0;
  const styleColors = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#06b6d4'];

  // Single portion helper (if exactly 1 portion selected)
  const singlePortion = activePortionEntries.length === 1 ? activePortionEntries[0][0] : null;
  const singleQty = activePortionEntries.length === 1 ? activePortionEntries[0][1] : 1;

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (activePortionEntries.length === 1) {
      const [pName, q] = activePortionEntries[0];
      const pPrice = prices[`${selectedStyle}|${pName}`] ?? 0;
      const mods = [
        {
          modifierGroupId: '__style__',
          modifierGroupName: matrix.styleLabel ?? 'Style',
          id: `style-${selectedStyle}`,
          name: selectedStyle,
          priceAdd: 0,
          isVariantAxis: true,
        },
        {
          modifierGroupId: '__portion__',
          modifierGroupName: matrix.portionLabel ?? 'Portion',
          id: `portion-${pName}`,
          name: pName,
          priceAdd: pPrice,
          isVariantAxis: true,
        }
      ];
      onConfirm(mods, pPrice, q);
    } else {
      // Bulk multi-portion (e.g. 2 Full and 1 Half in one order)
      const bulkItems = activePortionEntries.map(([pName, q]) => {
        const pPrice = prices[`${selectedStyle}|${pName}`] ?? 0;
        return {
          selectedModifiers: [
            {
              modifierGroupId: '__style__',
              modifierGroupName: matrix.styleLabel ?? 'Style',
              id: `style-${selectedStyle}`,
              name: selectedStyle,
              priceAdd: 0,
              isVariantAxis: true,
            },
            {
              modifierGroupId: '__portion__',
              modifierGroupName: matrix.portionLabel ?? 'Portion',
              id: `portion-${pName}`,
              name: pName,
              priceAdd: pPrice,
              isVariantAxis: true,
            }
          ],
          flatPrice: pPrice,
          qty: q
        };
      });
      onConfirm(bulkItems);
    }
  };

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

          {/* Step 1 — Style selector */}
          <div>
            <div className="vm-step-header">
              <span className="vm-step-num">1</span>
              <span className="vm-step-title">{matrix.styleLabel ?? 'Style'}</span>
              {selectedStyle && <span className="vm-step-selected">✓ {selectedStyle}</span>}
            </div>
            <div className="vm-style-grid">
              {styles.map((s, idx) => {
                const isActive = selectedStyle === s;
                const col = styleColors[idx % styleColors.length];
                return (
                  <button
                    key={s}
                    type="button"
                    className={`vm-style-btn ${isActive ? 'vm-style-btn--active' : ''}`}
                    style={isActive ? { borderColor: col, background: col + '18', color: col } : {}}
                    onClick={() => {
                      setSelectedStyle(s);
                      // Clear portions that don't exist in new style
                      setPortionQuantities(prev => {
                        const updated = {};
                        Object.entries(prev).forEach(([p, q]) => {
                          if (prices[`${s}|${p}`] !== undefined) {
                            updated[p] = q;
                          }
                        });
                        return updated;
                      });
                    }}
                  >
                    {isActive && <Check size={13} strokeWidth={3} />}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — Portion selector (enabled only after style chosen) */}
          <div style={{ opacity: selectedStyle ? 1 : 0.4, pointerEvents: selectedStyle ? 'all' : 'none', transition: 'opacity 0.2s' }}>
            <div className="vm-step-header">
              <span className="vm-step-num" style={selectedStyle ? {} : { background: 'var(--color-separator)', color: 'var(--color-label-tertiary)' }}>2</span>
              <span className="vm-step-title">{matrix.portionLabel ?? 'Portion'}</span>
              {totalItemCount > 0 && <span className="vm-step-selected">✓ {totalItemCount} selected</span>}
              {!selectedStyle && <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>Select style first</span>}
            </div>
            <div className="vm-portion-grid">
              {portions.map(p => {
                const price = selectedStyle ? (prices[`${selectedStyle}|${p}`] ?? null) : null;
                const unavailable = price === null || price === undefined;
                const currentQty = portionQuantities[p] || 0;
                const isActive = currentQty > 0;

                if (isActive) {
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
                            setPortionQuantities(prev => {
                              const next = { ...prev };
                              if ((next[p] || 0) <= 1) {
                                delete next[p];
                              } else {
                                next[p] = next[p] - 1;
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
                              name: `${item.name} (${p})`,
                              qty: currentQty,
                              unitPrice: price,
                              onConfirm: (newQ) => {
                                setPortionQuantities(prev => ({ ...prev, [p]: newQ }));
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
                            setPortionQuantities(prev => ({
                              ...prev,
                              [p]: Math.min(999, (prev[p] || 0) + 1)
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
                      setPortionQuantities(prev => ({ ...prev, [p]: 1 }));
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

          {/* If single portion is selected: show QuantityBar with bulk presets and keypad */}
          {singlePortion && (
            <QuantityBar
              qty={singleQty}
              setQty={(newQ) => {
                const parsed = typeof newQ === 'function' ? newQ(singleQty) : newQ;
                const safeNum = Math.max(1, parseInt(parsed, 10) || 1);
                setPortionQuantities(prev => ({ ...prev, [singlePortion]: safeNum }));
              }}
              onOpenKeypad={() => {
                const price = prices[`${selectedStyle}|${singlePortion}`] ?? 0;
                setKeypadTarget({
                  name: `${item.name} (${singlePortion})`,
                  qty: singleQty,
                  unitPrice: price,
                  onConfirm: (newQ) => {
                    setPortionQuantities(prev => ({ ...prev, [singlePortion]: newQ }));
                  }
                });
              }}
            />
          )}

          {/* If multi-portion selected: show breakdown badge! */}
          {activePortionEntries.length > 1 && (
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
                  Selected Portions ({totalItemCount} items total)
                </span>
                <button
                  type="button"
                  onClick={() => setPortionQuantities({})}
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
                {activePortionEntries.map(([pName, pQty]) => {
                  const pPrice = prices[`${selectedStyle}|${pName}`] ?? 0;
                  return (
                    <span 
                      key={pName}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 10px',
                        borderRadius: 8,
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-separator)',
                        fontSize: 13,
                        fontWeight: 800
                      }}
                    >
                      <span>{pName} × {pQty}</span>
                      <span style={{ color: 'var(--color-accent)' }}>{formatCurrency(pPrice * pQty, currency)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary pill */}
          {canConfirm && (
            <div className="vm-summary">
              <span className="vm-summary-combo">
                {selectedStyle} · {activePortionEntries.map(([p, q]) => `${q > 1 ? `${q} ` : ''}${p}`).join(' + ')}
              </span>
              <ChevronRight size={14} style={{ color: 'var(--color-label-tertiary)' }} />
              <span className="vm-summary-price">{formatCurrency(totalPrice, currency)}</span>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '16px 20px', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ height: 50, padding: '0 24px', fontSize: 15, fontWeight: 700, borderRadius: 12 }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{ height: 50, padding: '0 28px', fontSize: 16, fontWeight: 800, borderRadius: 12, flex: 1 }}
          >
            {canConfirm
              ? `Add ${totalItemCount > 1 ? `${totalItemCount} ` : ''}to Cart · ${formatCurrency(totalPrice, currency)}`
              : 'Select style & portion'}
          </button>
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
   CLASSIC MODIFIER MODE (unchanged behaviour)
────────────────────────────────────────────────────────────── */

function getInitialSelections(item) {
  if (!item?.modifierGroups) return {};
  const initial = {};
  item.modifierGroups.forEach(group => {
    if (group.required && group.maxSelect === 1 && group.options?.length > 0) {
      initial[group.id] = [group.options[0]];
    } else {
      initial[group.id] = [];
    }
  });
  return initial;
}

function ClassicModifierPicker({ item, currency, onConfirm, onClose }) {
  const [prevItem, setPrevItem] = useState(item);
  const [selections, setSelections] = useState(() => getInitialSelections(item));
  const [qty, setQty] = useState(1);
  const [isKeypadOpen, setIsKeypadOpen] = useState(false);
  const modalRef = useRef(null);
  useFocusTrap(modalRef, !!item);

  if (item !== prevItem) {
    setPrevItem(item);
    setSelections(getInitialSelections(item));
    setQty(1);
  }

  if (!item) return null;

  const effectiveQty = Math.max(1, parseInt(qty, 10) || 1);
  const modifierGroups = item.modifierGroups ?? [];

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

  const basePrice = item.price ?? 0;
  const modifierTotal = Object.values(selections).reduce((sum, opts) =>
    sum + opts.reduce((s, o) => s + (o.priceAdd ?? 0), 0), 0);
  const totalUnitPrice = basePrice + modifierTotal;
  const totalPrice = totalUnitPrice * effectiveQty;

  const isGroupSatisfied = (group) => {
    if (!group.required) return true;
    return (selections[group.id]?.length ?? 0) > 0;
  };
  const isValid = modifierGroups.every(isGroupSatisfied);

  const handleSubmit = () => {
    if (!isValid) return;
    const flatModifiers = [];
    Object.entries(selections).forEach(([groupId, opts]) => {
      const group = modifierGroups.find(g => g.id === groupId);
      opts.forEach(opt => {
        flatModifiers.push({
          modifierGroupId: groupId,
          modifierGroupName: group?.name ?? '',
          id: opt.id,
          name: opt.name,
          priceAdd: opt.priceAdd ?? 0,
        });
      });
    });
    onConfirm(flatModifiers, null, effectiveQty);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" ref={modalRef} style={{ maxWidth: 620, width: 'min(620px, 94vw)' }}>
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {(() => {
              const visuals = getItemVisuals(item);
              return (
                <div
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
              <div style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                {basePrice > 0
                  ? `Base Price: ${formatCurrency(basePrice, currency)}`
                  : 'Select your portion / options'}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} style={{ width: 38, height: 38, borderRadius: 10 }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {modifierGroups.map(group => {
            const groupSelections = selections[group.id] ?? [];
            const satisfied = isGroupSatisfied(group);
            const maxSelect = group.maxSelect ?? 1;
            return (
              <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)' }}>{group.name}</span>
                    {group.required && (
                      <span className={`badge ${satisfied ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                        {satisfied ? '✓ Selected' : 'Required'}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-tertiary)' }}>
                    {maxSelect === 1 ? 'Choose 1' : `Choose up to ${maxSelect}`}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
                  {group.options?.map(opt => {
                    const isSelected = groupSelections.some(o => o.id === opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelect(group, opt)}
                        style={{
                          background: isSelected ? 'var(--color-accent-light)' : 'var(--color-bg-elevated)',
                          border: `2px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-separator-opaque)'}`,
                          borderRadius: 'var(--radius-lg)',
                          padding: '14px 18px',
                          minHeight: 56,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'all var(--duration-fast) var(--ease-out)',
                          textAlign: 'left',
                          fontFamily: 'var(--font-family)',
                          touchAction: 'manipulation',
                          boxShadow: isSelected ? '0 4px 12px rgba(0,122,255,0.15)' : 'var(--shadow-sm)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <div style={{
                            width: 22, height: 22,
                            borderRadius: maxSelect === 1 ? '50%' : 'var(--radius-xs)',
                            border: `2px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-label-tertiary)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isSelected ? 'var(--color-accent)' : 'transparent',
                            transition: 'all var(--duration-fast)',
                            flexShrink: 0
                          }}>
                            {isSelected && <Check size={13} color="#ffffff" strokeWidth={3} />}
                          </div>
                          <span style={{
                            fontSize: '15px',
                            fontWeight: isSelected ? 800 : 600,
                            color: isSelected ? 'var(--color-accent)' : 'var(--color-label)'
                          }}>
                            {opt.name}
                          </span>
                        </div>
                        {opt.priceAdd > 0 ? (
                          <span style={{ fontSize: '14.5px', fontWeight: 800, color: isSelected ? 'var(--color-accent)' : 'var(--color-label-secondary)' }}>
                            {basePrice === 0 ? formatCurrency(opt.priceAdd, currency) : `+${formatCurrency(opt.priceAdd, currency)}`}
                          </span>
                        ) : (
                          <span style={{ fontSize: '13px', color: 'var(--color-label-tertiary)' }}>
                            {basePrice === 0 ? formatCurrency(0, currency) : 'Included'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Quantity Selector */}
          <QuantityBar
            qty={qty}
            setQty={setQty}
            onOpenKeypad={() => setIsKeypadOpen(true)}
          />
        </div>

        <div className="modal-footer" style={{ padding: '16px 20px', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ height: 50, padding: '0 24px', fontSize: 15, fontWeight: 700, borderRadius: 12 }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSubmit}
            disabled={!isValid}
            style={{ height: 50, padding: '0 28px', fontSize: 16, fontWeight: 800, borderRadius: 12, flex: 1 }}
          >
            Add {effectiveQty > 1 ? `${effectiveQty} ` : ''}to Cart · {formatCurrency(totalPrice, currency)}
          </button>
        </div>
      </div>

      <TouchQuantityPadModal
        isOpen={isKeypadOpen}
        itemName={item.name}
        initialQty={effectiveQty}
        unitPrice={totalUnitPrice}
        currency={currency}
        onConfirm={(newQ) => setQty(newQ)}
        onClose={() => setIsKeypadOpen(false)}
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
