import React, { useState } from 'react';
import { BUSINESS_PRESETS } from '../../hooks/useBusinessConfig';
import { Check, Sparkles, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BusinessPresetPicker({ currentBusinessType, currentModes, onApplyPreset }) {
  const [selectedId, setSelectedId] = useState(currentBusinessType || 'restaurant');
  const [showConfirm, setShowConfirm] = useState(false);
  const [presetToApply, setPresetToApply] = useState(null);

  const activePreset = BUSINESS_PRESETS.find(p => p.id === (currentBusinessType || 'restaurant')) || BUSINESS_PRESETS[2];

  const handleSelectPreset = (preset) => {
    if (preset.id === currentBusinessType) {
      toast('This preset is already active.', { icon: 'ℹ️' });
      return;
    }
    setPresetToApply(preset);
    setShowConfirm(true);
  };

  const confirmApply = () => {
    if (!presetToApply) return;
    onApplyPreset(presetToApply);
    setSelectedId(presetToApply.id);
    setShowConfirm(false);
    toast.success(`Switched business profile to ${presetToApply.name}! Modes and terminology updated.`, { icon: presetToApply.emoji });
  };

  return (
    <div className="card card-padded" style={{
      background: 'linear-gradient(135deg, rgba(var(--color-accent-rgb, 59, 130, 246), 0.04) 0%, rgba(var(--color-bg-secondary-rgb, 243, 244, 246), 0.5) 100%)',
      border: '1px solid var(--color-separator-opaque)',
      borderRadius: 'var(--radius-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>{activePreset.emoji}</span>
            <h3 className="text-title3" style={{ margin: 0 }}>Business Type & Workflow Profile</h3>
            <span style={{
              fontSize: '11px',
              fontWeight: 'var(--weight-bold)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: 'var(--color-accent-light)',
              color: 'var(--color-accent)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)'
            }}>
              Active: {activePreset.name}
            </span>
          </div>
          <p className="text-secondary text-footnote" style={{ margin: '4px 0 0' }}>
            Choose your business model to automatically optimize active modes, checkout flow, and terminology.
          </p>
        </div>
      </div>

      {/* Grid of Preset Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-3)',
      }}>
        {BUSINESS_PRESETS.map((preset) => {
          const isActive = (currentBusinessType || 'restaurant') === preset.id;
          return (
            <div
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: `2px solid ${isActive ? 'var(--color-accent)' : 'var(--color-separator)'}`,
                background: isActive ? 'var(--color-bg)' : 'var(--color-bg-secondary)',
                cursor: 'pointer',
                transition: 'all var(--duration-fast)',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                position: 'relative'
              }}
              className="preset-card-hover"
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '22px' }}>{preset.emoji}</span>
                    <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-primary)' }}>
                      {preset.name}
                    </span>
                  </div>
                  {isActive && (
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'var(--color-accent)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p style={{
                  fontSize: 'var(--text-caption2)',
                  color: 'var(--color-label-secondary)',
                  lineHeight: 1.35,
                  margin: 0
                }}>
                  {preset.desc}
                </p>
              </div>

              <div style={{
                marginTop: 'var(--space-3)',
                paddingTop: 'var(--space-2)',
                borderTop: '1px dashed var(--color-separator)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', fontWeight: 500 }}>
                  {preset.recommendedModes.length} Recommended Modes
                </span>
                <span style={{ fontSize: '11px', color: isActive ? 'var(--color-accent)' : 'var(--color-label-secondary)', fontWeight: 600 }}>
                  {isActive ? 'Current' : 'Select →'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm Modal */}
      {showConfirm && presetToApply && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowConfirm(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{presetToApply.emoji}</span> Switch to {presetToApply.name}?
              </h2>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <p style={{ fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)', margin: 0 }}>
                This will automatically configure Kiwi POS with recommended defaults for <strong>{presetToApply.name}</strong>:
              </p>
              <div style={{
                background: 'var(--color-bg-secondary)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '13px'
              }}>
                <div><strong>✨ Catalog Terminology:</strong> Uses "{presetToApply.terminology.catalog}" & "{presetToApply.terminology.item}"</div>
                <div><strong>⚡ Active Modes:</strong> {presetToApply.recommendedModes.map(m => `[${m}]`).join(' ')}</div>
                <div><strong>💼 Cash Mode:</strong> {presetToApply.recommendedShiftMode === 'staff' ? 'Individual Staff Banks' : 'Single Till'}</div>
              </div>
              <p className="text-secondary text-caption2" style={{ margin: 0 }}>
                You can still manually enable or disable any individual mode or feature in settings at any time.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmApply} type="button">
                Apply Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
