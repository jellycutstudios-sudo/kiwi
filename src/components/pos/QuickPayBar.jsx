import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../../utils/formatCurrency';
import { Zap, Banknote, CreditCard, Smartphone, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

export default function QuickPayBar({
  total,
  currency,
  onQuickPay,
  isProcessing = false,
  hasUpi = false
}) {
  const [activeBtn, setActiveBtn] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('dineos_hide_quickpay') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = (collapse) => {
    setIsCollapsed(collapse);
    try {
      localStorage.setItem('dineos_hide_quickpay', collapse ? 'true' : 'false');
    } catch (e) {
      console.warn('Could not save quickpay preference:', e);
    }
  };

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

  if (isCollapsed) {
    return (
      <div
        className="quickpay-collapsed-bar"
        onClick={() => toggleCollapse(false)}
        title="Show 1-Tap Fast Checkout options"
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleCollapse(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700 }}>
          <Zap size={13} fill="#f59e0b" color="#f59e0b" />
          <span>1-Tap Fast Pay</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: 'var(--color-label-tertiary)' }}>
          <span>Show options</span>
          <ChevronDown size={13} />
        </div>
      </div>
    );
  }

  return (
    <div className="quickpay-card">
      <div className="quickpay-card-header">
        <div className="quickpay-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Zap size={13} fill="#f59e0b" color="#f59e0b" />
            <span className="quickpay-title">1-Tap Fast Pay</span>
          </div>
          <span className="quickpay-badge-hint">· Instant settle</span>
        </div>
        <button
          type="button"
          onClick={() => toggleCollapse(true)}
          className="quickpay-toggle-btn"
          title="Hide 1-tap checkout options"
          aria-label="Hide 1-tap checkout"
        >
          <span>Hide</span>
          <ChevronUp size={12} />
        </button>
      </div>

      {/* Button Row */}
      <div
        className="quickpay-grid"
        style={{
          gridTemplateColumns: `repeat(${cashOptions.length + (hasUpi ? 2 : 1)}, 1fr)`
        }}
      >
        {/* Cash Tender Buttons */}
        {cashOptions.map((opt) => {
          const btnKey = `cash-${opt.amount}`;
          const isBusy = activeBtn === btnKey;
          const change = opt.amount - total;
          return (
            <button
              key={btnKey}
              type="button"
              disabled={isProcessing}
              onClick={() => handlePay('cash', opt.amount, btnKey)}
              className={`quickpay-btn ${opt.isExact ? 'quickpay-btn-exact' : 'quickpay-btn-cash'}`}
              title={opt.isExact ? 'Exact Cash' : `Tender ${formatCurrency(opt.amount, currency)}, Change: ${formatCurrency(change, currency)}`}
            >
              {isBusy ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <>
                  <div className="quickpay-btn-main">
                    <Banknote size={12.5} />
                    <span>{opt.isExact ? 'Cash' : formatCurrency(opt.amount, currency)}</span>
                  </div>
                  <span className="quickpay-btn-sub">
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
          className="quickpay-btn quickpay-btn-card"
          title="Card Tap / POS Terminal"
        >
          {activeBtn === 'card' ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <>
              <div className="quickpay-btn-main">
                <CreditCard size={12.5} />
                <span>Card</span>
              </div>
              <span className="quickpay-btn-sub">
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
            className="quickpay-btn quickpay-btn-upi"
            title="Instant Dynamic UPI QR"
          >
            {activeBtn === 'upi' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <>
                <div className="quickpay-btn-main">
                  <Smartphone size={12.5} />
                  <span>UPI</span>
                </div>
                <span className="quickpay-btn-sub">
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
