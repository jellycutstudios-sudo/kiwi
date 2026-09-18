import React, { useState } from 'react';
import { formatCurrency } from '../../utils/formatCurrency';
import { HelpCircle, Calculator, Check, ArrowRight } from 'lucide-react';

export default function TaxCalculatorHelper({ taxConfig, currency, onSelectMode }) {
  const [samplePrice, setSamplePrice] = useState(100);
  const currentMode = taxConfig?.mode || 'exclusive';

  // Determine effective tax rate
  let effectiveRate = 5;
  if (taxConfig?.type === 'gst') {
    effectiveRate = (taxConfig?.cgst ?? 9) + (taxConfig?.sgst ?? 9);
  } else if (taxConfig?.type === 'vat' || taxConfig?.type === 'flat') {
    effectiveRate = taxConfig?.rate ?? 5;
  }

  // Exclusive calculation
  const exclBase = samplePrice;
  const exclTax = (samplePrice * effectiveRate) / 100;
  const exclTotal = exclBase + exclTax;

  // Inclusive calculation
  const inclTotal = samplePrice;
  const inclBase = samplePrice / (1 + effectiveRate / 100);
  const inclTax = inclTotal - inclBase;

  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4)',
      border: '1px solid var(--color-separator-opaque)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calculator size={18} color="var(--color-accent)" />
          <h4 style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', margin: 0 }}>
            Visual Tax Calculation Sandbox & Explainer
          </h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>Try with price:</span>
          <input
            type="number"
            min={1}
            value={samplePrice}
            onChange={e => setSamplePrice(parseFloat(e.target.value) || 0)}
            className="form-input"
            style={{ width: '80px', height: '28px', fontSize: '12px', padding: '2px 8px' }}
          />
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--space-3)'
      }}>
        {/* Exclusive Card */}
        <div
          onClick={() => onSelectMode('exclusive')}
          style={{
            border: `2px solid ${currentMode === 'exclusive' ? 'var(--color-accent)' : 'var(--color-separator)'}`,
            borderRadius: 'var(--radius-md)',
            background: currentMode === 'exclusive' ? 'var(--color-bg)' : 'transparent',
            padding: 'var(--space-3) var(--space-4)',
            cursor: 'pointer',
            transition: 'all var(--duration-fast)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>Tax Exclusive (Added on Top)</span>
              {currentMode === 'exclusive' && (
                <span style={{ fontSize: '10px', background: 'var(--color-accent)', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  Active Mode
                </span>
              )}
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', margin: '0 0 10px', lineHeight: 1.35 }}>
              Menu shows base price. Tax is calculated and added to the bill at checkout. (Common in US, Canada, Dine-in India).
            </p>

            <div style={{
              background: 'rgba(0,0,0,0.03)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>Menu Display Price:</span>
                <strong>{formatCurrency(exclBase, currency)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>+ Tax ({effectiveRate}%):</span>
                <span style={{ color: 'var(--color-accent)' }}>+{formatCurrency(exclTax, currency)}</span>
              </div>
              <div style={{ borderTop: '1px dashed var(--color-separator)', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Customer Pays:</span>
                <span>{formatCurrency(exclTotal, currency)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className={`btn ${currentMode === 'exclusive' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            style={{ marginTop: '10px', height: '28px', fontSize: '11px' }}
            onClick={(e) => { e.stopPropagation(); onSelectMode('exclusive'); }}
          >
            {currentMode === 'exclusive' ? '✓ Selected' : 'Set as Exclusive'}
          </button>
        </div>

        {/* Inclusive Card */}
        <div
          onClick={() => onSelectMode('inclusive')}
          style={{
            border: `2px solid ${currentMode === 'inclusive' ? 'var(--color-accent)' : 'var(--color-separator)'}`,
            borderRadius: 'var(--radius-md)',
            background: currentMode === 'inclusive' ? 'var(--color-bg)' : 'transparent',
            padding: 'var(--space-3) var(--space-4)',
            cursor: 'pointer',
            transition: 'all var(--duration-fast)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>Tax Inclusive (Included Inside Price)</span>
              {currentMode === 'inclusive' && (
                <span style={{ fontSize: '10px', background: 'var(--color-accent)', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  Active Mode
                </span>
              )}
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', margin: '0 0 10px', lineHeight: 1.35 }}>
              Customer pays exactly what is on the menu. Tax is separated automatically for government filing. (Standard in UK, EU, UAE/Middle East, Australia).
            </p>

            <div style={{
              background: 'rgba(0,0,0,0.03)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>Menu Display Price:</span>
                <strong>{formatCurrency(inclTotal, currency)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>Net Store Revenue:</span>
                <span>{formatCurrency(inclBase, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>Included Tax ({effectiveRate}%):</span>
                <span style={{ color: 'var(--color-accent)' }}>{formatCurrency(inclTax, currency)}</span>
              </div>
              <div style={{ borderTop: '1px dashed var(--color-separator)', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Customer Pays:</span>
                <span>{formatCurrency(inclTotal, currency)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className={`btn ${currentMode === 'inclusive' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            style={{ marginTop: '10px', height: '28px', fontSize: '11px' }}
            onClick={(e) => { e.stopPropagation(); onSelectMode('inclusive'); }}
          >
            {currentMode === 'inclusive' ? '✓ Selected' : 'Set as Inclusive'}
          </button>
        </div>
      </div>
    </div>
  );
}
