import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';

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

export default function ModifierModal({ item, currency, onConfirm, onClose }) {
  const [prevItem, setPrevItem] = useState(item);
  const [selections, setSelections] = useState(() => getInitialSelections(item));

  if (item !== prevItem) {
    setPrevItem(item);
    setSelections(getInitialSelections(item));
  }

  if (!item) return null;

  const modifierGroups = item.modifierGroups ?? [];

  // Toggle option selection
  const handleSelect = (group, option) => {
    const groupId = group.id;
    const current = selections[groupId] ?? [];
    const maxSelect = group.maxSelect ?? 1;

    let updated = [];
    if (maxSelect === 1) {
      // Single select: replace selection
      const isAlreadySelected = current.some(o => o.id === option.id);
      if (isAlreadySelected && !group.required) {
        // If not required, allow deselecting
        updated = [];
      } else {
        updated = [option];
      }
    } else {
      // Multi-select: toggle selection
      const exists = current.some(o => o.id === option.id);
      if (exists) {
        updated = current.filter(o => o.id !== option.id);
      } else {
        if (current.length < maxSelect) {
          updated = [...current, option];
        } else {
          // If at limit, remove first and add new (sliding window) or just ignore?
          // Let's do sliding window so it feels responsive, or we can just ignore.
          // Sliding window is nice, but keeping it simple: replace the oldest or ignore.
          // Let's ignore (do nothing) or alert. Actually, just replace oldest is very smooth!
          updated = [...current.slice(1), option];
        }
      }
    }

    setSelections(prev => ({
      ...prev,
      [groupId]: updated
    }));
  };

  // Calculate prices
  const basePrice = item.price ?? 0;
  const modifierTotal = Object.values(selections).reduce((sum, opts) => {
    return sum + opts.reduce((s, o) => s + (o.priceAdd ?? 0), 0);
  }, 0);
  const totalUnitPrice = basePrice + modifierTotal;

  // Validation
  const isGroupSatisfied = (group) => {
    if (!group.required) return true;
    const selectedCount = selections[group.id]?.length ?? 0;
    return selectedCount > 0;
  };

  const isValid = modifierGroups.every(isGroupSatisfied);

  // Compile selected modifiers list
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
          priceAdd: opt.priceAdd ?? 0
        });
      });
    });
    onConfirm(flatModifiers);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 24 }}>{item.emoji ?? '🍽️'}</span>
            <div>
              <h2 className="modal-title" style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)' }}>
                {item.name}
              </h2>
              <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}>
                Base Price: {formatCurrency(basePrice, currency)}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {modifierGroups.map(group => {
            const groupSelections = selections[group.id] ?? [];
            const satisfied = isGroupSatisfied(group);
            const maxSelect = group.maxSelect ?? 1;

            return (
              <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {/* Group Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)' }}>
                      {group.name}
                    </span>
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

                {/* Options list */}
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
                          {/* Selection indicator */}
                          <div style={{
                            width: 16,
                            height: 16,
                            borderRadius: maxSelect === 1 ? '50%' : 'var(--radius-xs)',
                            border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-label-tertiary)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isSelected ? 'var(--color-accent)' : 'transparent',
                            transition: 'all var(--duration-fast)',
                          }}>
                            {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
                          </div>
                          <span style={{
                            fontSize: 'var(--text-footnote)',
                            fontWeight: isSelected ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                            color: isSelected ? 'var(--color-accent)' : 'var(--color-label)'
                          }}>
                            {opt.name}
                          </span>
                        </div>
                        {opt.priceAdd > 0 && (
                          <span style={{
                            fontSize: 'var(--text-caption1)',
                            fontWeight: 'var(--weight-bold)',
                            color: isSelected ? 'var(--color-accent)' : 'var(--color-label-secondary)'
                          }}>
                            +{formatCurrency(opt.priceAdd, currency)}
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
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
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
