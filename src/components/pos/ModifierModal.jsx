import { useState, useRef, useMemo } from 'react';
import { X, Check, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { useFocusTrap } from '../../hooks/useFocusTrap';

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

export function getEffectiveVariantMatrix(item) {
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

  const [selectedStyle,   setSelectedStyle]   = useState(styles[0]   ?? null);
  const [selectedPortion, setSelectedPortion] = useState(null);

  const currentPrice = (selectedStyle && selectedPortion)
    ? (prices[`${selectedStyle}|${selectedPortion}`] ?? 0)
    : null;

  const canConfirm = selectedStyle && selectedPortion && currentPrice !== null;

  const styleColors = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#06b6d4'];

  const handleConfirm = () => {
    if (!canConfirm) return;
    // Emit as two flat modifiers so the rest of the system (cart, KDS, print) stays unchanged
    const mods = [
      {
        modifierGroupId: '__style__',
        modifierGroupName: matrix.styleLabel  ?? 'Style',
        id: `style-${selectedStyle}`,
        name: selectedStyle,
        priceAdd: 0,
        isVariantAxis: true,
      },
      {
        modifierGroupId: '__portion__',
        modifierGroupName: matrix.portionLabel ?? 'Portion',
        id: `portion-${selectedPortion}`,
        name: selectedPortion,
        priceAdd: currentPrice,
        isVariantAxis: true,
      }
    ];
    onConfirm(mods, currentPrice);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 420 }}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 24 }}>{item.emoji ?? '🍽️'}</span>
            <div>
              <h2 className="modal-title" style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)' }}>
                {item.name}
              </h2>
              <div style={{ fontSize: 12, color: 'var(--color-label-tertiary)' }}>
                Pick style then portion — 1 item
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
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
                      // Reset portion if current combo doesn't exist
                      if (selectedPortion && prices[`${s}|${selectedPortion}`] === undefined) {
                        setSelectedPortion(null);
                      }
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
              {selectedPortion && <span className="vm-step-selected">✓ {selectedPortion}</span>}
              {!selectedStyle && <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>Select style first</span>}
            </div>
            <div className="vm-portion-grid">
              {portions.map(p => {
                const price = selectedStyle ? (prices[`${selectedStyle}|${p}`] ?? null) : null;
                const isActive = selectedPortion === p;
                const unavailable = price === null || price === undefined;
                return (
                  <button
                    key={p}
                    type="button"
                    className={`vm-portion-btn ${isActive ? 'vm-portion-btn--active' : ''} ${unavailable ? 'vm-portion-btn--disabled' : ''}`}
                    disabled={unavailable}
                    onClick={() => setSelectedPortion(p)}
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

          {/* Summary pill */}
          {canConfirm && (
            <div className="vm-summary">
              <span className="vm-summary-combo">
                {selectedStyle} · {selectedPortion}
              </span>
              <ChevronRight size={14} style={{ color: 'var(--color-label-tertiary)' }} />
              <span className="vm-summary-price">{formatCurrency(currentPrice, currency)}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{ padding: '10px var(--space-6)', height: 44, borderRadius: 'var(--radius-lg)' }}
          >
            {canConfirm
              ? `Add to Cart · ${formatCurrency(currentPrice, currency)}`
              : 'Select style & portion'}
          </button>
        </div>
      </div>
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
  const modalRef = useRef(null);
  useFocusTrap(modalRef, !!item);

  if (item !== prevItem) {
    setPrevItem(item);
    setSelections(getInitialSelections(item));
  }

  if (!item) return null;

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
    onConfirm(flatModifiers);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" ref={modalRef} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 24 }}>{item.emoji ?? '🍽️'}</span>
            <div>
              <h2 className="modal-title" style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)' }}>
                {item.name}
              </h2>
              <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}>
                {basePrice > 0
                  ? `Base Price: ${formatCurrency(basePrice, currency)}`
                  : 'Select your portion / options'}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
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
                          padding: 'var(--space-3) var(--space-4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'all var(--duration-fast) var(--ease-out)',
                          textAlign: 'left',
                          fontFamily: 'var(--font-family)',
                          boxShadow: isSelected ? '0 4px 12px rgba(0,122,255,0.1)' : 'var(--shadow-sm)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <div style={{
                            width: 16, height: 16,
                            borderRadius: maxSelect === 1 ? '50%' : 'var(--radius-xs)',
                            border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-label-tertiary)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isSelected ? 'var(--color-accent)' : 'transparent',
                            transition: 'all var(--duration-fast)',
                          }}>
                            {isSelected && <Check size={10} color="var(--color-bg)" strokeWidth={3} />}
                          </div>
                          <span style={{
                            fontSize: 'var(--text-footnote)',
                            fontWeight: isSelected ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                            color: isSelected ? 'var(--color-accent)' : 'var(--color-label)'
                          }}>
                            {opt.name}
                          </span>
                        </div>
                        {opt.priceAdd > 0 ? (
                          <span style={{ fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-bold)', color: isSelected ? 'var(--color-accent)' : 'var(--color-label-secondary)' }}>
                            {basePrice === 0 ? formatCurrency(opt.priceAdd, currency) : `+${formatCurrency(opt.priceAdd, currency)}`}
                          </span>
                        ) : (
                          <span style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-tertiary)' }}>
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
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSubmit}
            disabled={!isValid}
            style={{ padding: '10px var(--space-6)', height: 44, borderRadius: 'var(--radius-lg)' }}
          >
            Add to Cart · {formatCurrency(totalUnitPrice, currency)}
          </button>
        </div>
      </div>
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
        onConfirm={(mods, flatPrice) => {
          // For variant matrix: price IS the flat price, no base
          onConfirm(mods, flatPrice);
        }}
      />
    );
  }

  return (
    <ClassicModifierPicker
      item={item}
      currency={currency}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
