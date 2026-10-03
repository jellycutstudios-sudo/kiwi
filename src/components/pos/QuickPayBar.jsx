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
      const saved = localStorage.getItem('dineos_hide_quickpay');
      if (saved !== null) {
        return saved === 'true';
      }
      // On mobile screens by default, collapse 1-Tap Fast Pay to maximize cart item view space
      return typeof window !== 'undefined' && window.innerWidth <= 767;
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
        title="Show 1-Tap Fast Pay options"
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleCollapse(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', fontWeight: 600 }}>
          <Zap size={11} fill="#f59e0b" color="#f59e0b" />
          <span>1-Tap Fast Pay</span>
        </div>
        <ChevronDown size={11} />
      </div>
    );
  }

  return (
    <div className="quickpay-card">
      <div className="quickpay-grid-wrap">
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
                title={opt.isExact ? `Exact Cash (${formatCurrency(total, currency)})` : `Tender ${formatCurrency(opt.amount, currency)}, Change: ${formatCurrency(change, currency)}`}
              >
                {isBusy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <div className="quickpay-btn-main">
                    <Banknote size={11.5} />
                    <span>{opt.isExact ? 'Cash' : formatCurrency(opt.amount, currency)}</span>
                  </div>
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
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <div className="quickpay-btn-main">
                <CreditCard size={11.5} />
                <span>Card</span>
              </div>
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
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <div className="quickpay-btn-main">
                  <Smartphone size={11.5} />
                  <span>UPI</span>
                </div>
              )}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => toggleCollapse(true)}
          className="quickpay-toggle-mini"
          title="Minimize Fast Pay"
          aria-label="Hide 1-tap checkout"
        >
          <ChevronUp size={11} />
        </button>
      </div>
    </div>
  );
}
