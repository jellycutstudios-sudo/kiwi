import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../../utils/formatCurrency';
import { Zap, Banknote, CreditCard, Smartphone, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QuickPayBar({
  total,
  currency,
  onQuickPay,
  isProcessing = false,
  hasUpi = false
}) {
  const [activeBtn, setActiveBtn] = useState(null);

  // Calculate intelligent rounded cash tender options
  const cashOptions = useMemo(() => {
    if (!total || total <= 0) return [];
    const exact = Math.round(total * 100) / 100;
    const opts = [{ label: 'Exact', amount: exact, isExact: true }];

    // Round up options depending on currency size
    const isHighDenom = ['INR', 'JPY', 'KRW', 'IDR'].includes(currency);
    const step1 = isHighDenom ? 50 : 5;
    const step2 = isHighDenom ? 100 : 10;
    const step3 = isHighDenom ? 500 : 20;

    const round1 = Math.ceil(total / step1) * step1;
    if (round1 > total && !opts.some(o => o.amount === round1)) {
      opts.push({ label: `${round1}`, amount: round1 });
    }

    const round2 = Math.ceil(total / step2) * step2;
    if (round2 > total && !opts.some(o => o.amount === round2)) {
      opts.push({ label: `${round2}`, amount: round2 });
    }

    const round3 = Math.ceil(total / step3) * step3;
    if (round3 > total && !opts.some(o => o.amount === round3) && opts.length < 3) {
      opts.push({ label: `${round3}`, amount: round3 });
    }

    return opts.slice(0, 3);
  }, [total, currency]);

  if (!total || total <= 0) return null;

  const handlePay = async (method, tendered, btnKey) => {
    if (isProcessing) return;
    setActiveBtn(btnKey);
    try {
      await onQuickPay(method, tendered);
    } finally {
      setActiveBtn(null);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(var(--color-accent-rgb, 59, 130, 246), 0.05) 0%, rgba(var(--color-bg-secondary-rgb, 243, 244, 246), 0.6) 100%)',
      borderRadius: 'var(--radius-lg)',
      padding: '10px 12px',
      border: '1px solid var(--color-separator-opaque)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginTop: '6px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <Zap size={13} fill="currentColor" />
          <span>1-Tap Fast Checkout</span>
        </div>
        <span style={{ fontSize: '10.5px', color: 'var(--color-label-tertiary)' }}>No modal · Instant settle</span>
      </div>

      {/* Button Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cashOptions.length + (hasUpi ? 2 : 1)}, 1fr)`,
        gap: '6px'
      }}>
        {/* Cash Tender Buttons */}
        {cashOptions.map((opt, i) => {
          const btnKey = `cash-${opt.amount}`;
          const isBusy = activeBtn === btnKey;
          const change = opt.amount - total;
          return (
            <button
              key={btnKey}
              type="button"
              disabled={isProcessing}
              onClick={() => handlePay('cash', opt.amount, btnKey)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 4px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(52, 199, 89, 0.35)',
                background: opt.isExact ? 'rgba(52, 199, 89, 0.12)' : 'var(--color-bg)',
                color: '#15803d',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                minHeight: '44px'
              }}
              className="quick-pay-btn"
              title={opt.isExact ? 'Exact Cash' : `Tender ${formatCurrency(opt.amount, currency)}, Change: ${formatCurrency(change, currency)}`}
            >
              {isBusy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 800, fontSize: '12px' }}>
                    <Banknote size={13} />
                    <span>{opt.isExact ? 'Cash' : formatCurrency(opt.amount, currency)}</span>
                  </div>
                  <span style={{ fontSize: '9.5px', color: '#166534', marginTop: '1px' }}>
                    {opt.isExact ? formatCurrency(total, currency) : `Chg: ${formatCurrency(change, currency)}`}
                  </span>
                </>
              )}
            </button>
          );
        })}

        {/* Quick Card Button */}
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => handlePay('card', total, 'card')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 4px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(0, 122, 255, 0.35)',
            background: 'var(--color-bg)',
            color: 'var(--color-accent)',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            minHeight: '44px'
          }}
          className="quick-pay-btn"
          title="Card Tap / POS Terminal"
        >
          {activeBtn === 'card' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 800, fontSize: '12px' }}>
                <CreditCard size={13} />
                <span>Card</span>
              </div>
              <span style={{ fontSize: '9.5px', color: 'var(--color-label-secondary)', marginTop: '1px' }}>
                Tap / POS
              </span>
            </>
          )}
        </button>

        {/* Quick UPI Button */}
        {hasUpi && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handlePay('upi', total, 'upi')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 4px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              background: 'var(--color-bg)',
              color: '#9333ea',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              minHeight: '44px'
            }}
            className="quick-pay-btn"
            title="Instant Dynamic UPI QR"
          >
            {activeBtn === 'upi' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 800, fontSize: '12px' }}>
                  <Smartphone size={13} />
                  <span>UPI</span>
                </div>
                <span style={{ fontSize: '9.5px', color: '#7e22ce', marginTop: '1px' }}>
                  QR Code
                </span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
