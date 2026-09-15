import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useOrderStore } from '../../stores/orderStore';
import { useGiftCardStore } from '../../stores/giftCardStore';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { X, Banknote, CreditCard, Smartphone, Split, Ticket, HeartHandshake, Check, Loader2, ChevronDown, ChevronUp, Sparkles, Coins } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';

const METHODS = [
  { key: 'cash',     label: 'Cash',     icon: Banknote,    color: 'var(--color-label)' },
  { key: 'card',     label: 'Card',     icon: CreditCard,  color: 'var(--color-label)' },
  { key: 'terminal', label: 'Terminal', icon: CreditCard,  color: 'var(--color-label)' },
  { key: 'upi',      label: 'UPI',      icon: Smartphone,  color: 'var(--color-label)' },
  { key: 'split',    label: 'Split',    icon: Split,        color: 'var(--color-label)' },
];

export default function PaymentModal({ total, currency, onConfirm, onClose }) {
  const { t } = useTranslation();
  const { restaurant } = useAuthStore();
  const modalRef = useRef(null);
  useFocusTrap(modalRef, true);
  const { 
    paymentMethod, setPaymentMethod, getSubtotal, getDiscountAmount, 
    setSplitPayments, customer, redeemingPoints, setRedeemingPoints, 
    getPointsDiscountAmount, tipAmount, setTip,
    tableName, tokenNumber, upiRef, setUpiRef
  } = useOrderStore();

  const {
    giftCardCode, giftCardDeduction, applyGiftCard, removeGiftCard
  } = useGiftCardStore();

  const subtotal = getSubtotal();
  const discountAmt = getDiscountAmount();

  // Tip preset state
  const [tipPreset, setTipPreset] = useState('none'); // 'none' | '15' | '18' | '20' | 'custom'
  const [customTip, setCustomTip] = useState('');

  // Collapsible voucher drawer state
  const [isVoucherOpen, setIsVoucherOpen] = useState(() => Boolean(giftCardCode));

  // Compute subtotal for tip base
  const tipBaseAmount = subtotal - getDiscountAmount() - getPointsDiscountAmount();
  const [cashTendered, setCashTendered] = useState('');
  const [loading, setLoading] = useState(false);

  // Quick cash options for 1-tap fast cashier checkout
  const quickCashOptions = useMemo(() => {
    if (total <= 0) return [];
    const exact = Math.round(total * 100) / 100;
    const opts = [exact];
    const next100 = Math.ceil(total / 100) * 100;
    if (next100 > total && !opts.includes(next100)) opts.push(next100);
    const next500 = Math.ceil(total / 500) * 500;
    if (next500 > total && !opts.includes(next500)) opts.push(next500);
    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total && !opts.includes(next1000) && opts.length < 4) opts.push(next1000);
    if (opts.length < 4 && !opts.includes(exact + 500)) opts.push(exact + 500);
    return opts.slice(0, 4);
  }, [total]);

  // Terminal Simulator states
  const [terminalStatus, setTerminalStatus] = useState(null); // null | 'connecting' | 'waiting' | 'processing' | 'success' | 'declined'
  const [terminalDeclineReason, setTerminalDeclineReason] = useState('Insufficient Funds');
  const [terminalSimDecline, setTerminalSimDecline] = useState(false);
  const [terminalInstantMode, setTerminalInstantMode] = useState(false);

  const [qrDataUrl, setQrDataUrl] = useState('');

  // Generate UPI QR Code URL dynamically
  useEffect(() => {
    if (paymentMethod === 'upi') {
      const vpa = restaurant?.upiConfig?.vpa || 'demo@upi';
      const name = restaurant?.upiConfig?.name || 'DineOS Demo';
      // Sanitize order ref note
      const noteBase = tableName ? `Table ${tableName}` : (tokenNumber ? `Token ${tokenNumber}` : 'POS Order');
      const sanitizedNote = noteBase.replace(/[^a-zA-Z0-9]/g, '_');
      const upiUrl = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${total.toFixed(2)}&cu=${currency || 'INR'}&tn=${sanitizedNote}`;
      
      QRCode.toDataURL(upiUrl, { width: 220, margin: 1, color: { dark: '#1f2937', light: '#ffffff' } })
        .then(url => setQrDataUrl(url))
        .catch(err => {
          console.error('[QR Generation Error]', err);
          // Fallback to QRServer API
          setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiUrl)}`);
        });
    }
  }, [paymentMethod, restaurant, total, currency, tableName, tokenNumber]);

  // Gift Card states
  const [gcInput, setGcInput] = useState('');
  const [verifyingGc, setVerifyingGc] = useState(false);

  // Split billing states
  const [splitMode, setSplitMode] = useState('equal'); // 'equal' | 'mixed'
  const [numGuests, setNumGuests] = useState(2);
  const [guestSplits, setGuestSplits] = useState([]);
  
  const [mixedPayments, setMixedPayments] = useState([]);
  const [nextAmount, setNextAmount] = useState('');
  const [nextMethod, setNextMethod] = useState('cash');

  const [prevPaymentMethod, setPrevPaymentMethod] = useState(paymentMethod);
  if (paymentMethod !== prevPaymentMethod) {
    setPrevPaymentMethod(paymentMethod);
    setCashTendered('');
  }

  const [prevSplitParams, setPrevSplitParams] = useState({ numGuests, total, paymentMethod, splitMode });
  if (
    prevSplitParams.numGuests !== numGuests ||
    prevSplitParams.total !== total ||
    prevSplitParams.paymentMethod !== paymentMethod ||
    prevSplitParams.splitMode !== splitMode
  ) {
    setPrevSplitParams({ numGuests, total, paymentMethod, splitMode });
    if (paymentMethod === 'split' && splitMode === 'equal') {
      const splitAmt = Math.round((total / numGuests) * 100) / 100;
      const splits = Array.from({ length: numGuests }).map((_, idx) => {
        const amt = idx === numGuests - 1 ? total - splitAmt * (numGuests - 1) : splitAmt;
        return {
          id: idx + 1,
          amount: Math.round(amt * 100) / 100,
          method: 'cash',
          paid: false
        };
      });
      setGuestSplits(splits);
    }
  }

  const [prevMixedParams, setPrevMixedParams] = useState({ mixedPayments, total, paymentMethod, splitMode });
  if (
    prevMixedParams.mixedPayments !== mixedPayments ||
    prevMixedParams.total !== total ||
    prevMixedParams.paymentMethod !== paymentMethod ||
    prevMixedParams.splitMode !== splitMode
  ) {
    setPrevMixedParams({ mixedPayments, total, paymentMethod, splitMode });
    if (paymentMethod === 'split' && splitMode === 'mixed') {
      const totalPaid = mixedPayments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = Math.max(0, total - totalPaid);
      if (remaining > 0) {
        setNextAmount(remaining.toFixed(2));
      } else {
        setNextAmount('');
      }
    }
  }

  const change = paymentMethod === 'cash' && cashTendered
    ? parseFloat(cashTendered) - total
    : null;

  const addMixedPayment = () => {
    const amt = parseFloat(nextAmount);
    const totalPaid = mixedPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, total - totalPaid);
    
    if (!amt || amt <= 0) return;
    const addedAmount = Math.round(Math.min(amt, remaining) * 100) / 100;
    
    setMixedPayments(prev => [...prev, { method: nextMethod, amount: addedAmount }]);
    setNextAmount('');
  };

  const removeMixedPayment = (idx) => {
    setMixedPayments(prev => prev.filter((_, i) => i !== idx));
  };

  // Confirm validations
  const totalPaidMixed = mixedPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingMixed = Math.max(0, total - totalPaidMixed);

  const allEqualPaid = splitMode === 'equal' && guestSplits.every(g => g.paid);
  const allMixedPaid = splitMode === 'mixed' && (totalPaidMixed >= total - 0.01);
  const splitPaid = paymentMethod === 'split' && (allEqualPaid || allMixedPaid);

  const canConfirm = paymentMethod !== 'split'
    ? (!loading && (paymentMethod !== 'cash' || !cashTendered || parseFloat(cashTendered) >= total - 0.01))
    : (!loading && splitPaid);

  const handleVerifyGiftCard = async () => {
    if (!gcInput.trim()) return;
    setVerifyingGc(true);
    try {
      const code = gcInput.trim().toUpperCase();
      const docRef = doc(db, 'restaurants', restaurant.id, 'gift_cards', code);
      const snap = await getDoc(docRef);
      
      if (snap.exists()) {
        const card = snap.data();
        const now = new Date();
        const expiry = card.expiresAt ? (card.expiresAt.toDate ? card.expiresAt.toDate() : new Date(card.expiresAt)) : null;
        
        if (card.status !== 'active' || card.balance <= 0) {
          toast.error('This gift card has already been redeemed or is inactive');
        } else if (expiry && expiry < now) {
          toast.error('This gift card has expired');
        } else {
          applyGiftCard(code, card.balance, restaurant);
          toast.success(`Applied Gift Card! balance: ${formatCurrency(card.balance, currency)}`);
          setGcInput('');
        }
      } else {
        toast.error('Invalid Gift Card code');
      }
    } catch (e) {
      toast.error('Verification failed: ' + e.message);
    } finally {
      setVerifyingGc(false);
    }
  };

  const startTerminalSimulation = () => {
    setTerminalStatus('connecting');

    const stripeKey = restaurant?.stripePublishableKey;
    const readerId = restaurant?.stripeReaderId;

    if (stripeKey && readerId) {
      toast.success('Initializing Stripe Terminal SDK...');
      
      const loadStripeSDK = () => {
        return new Promise((resolve, reject) => {
          if (window.StripeTerminal) {
            resolve(window.StripeTerminal);
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://js.stripe.com/v3/terminal-v1.js';
          script.onload = () => resolve(window.StripeTerminal);
          script.onerror = () => reject(new Error('Failed to load Stripe SDK script'));
          document.head.appendChild(script);
        });
      };

      loadStripeSDK()
        .then((StripeTerminal) => {
          try {
            // Token provider must call your backend to get a real Stripe ConnectionToken.
            // See: https://stripe.com/docs/terminal/fleet/sdk-basics#connection-tokens
            const tokenProvider = async () => {
              // TODO: Replace with a real call to your backend endpoint:
              // const resp = await fetch('/api/stripe/connection-token', { method: 'POST' });
              // const { secret } = await resp.json();
              // return secret;
              throw new Error('Stripe ConnectionToken backend endpoint not configured. Set up /api/stripe/connection-token on your server.');
            };

            StripeTerminal.create({
              onConnectionStatusChange: (status) => {
                if (import.meta.env.DEV) console.info('[Stripe] ConnectionStatus:', status.status);
              },
              onPaymentStatusChange: (status) => {
                if (import.meta.env.DEV) console.info('[Stripe] PaymentStatus:', status.status);
              },
              tokenProvider
            });

            toast.success(`Connected to Stripe Reader: ${readerId}`);
            
            setTerminalStatus('waiting');
            if (terminalInstantMode) {
              setTimeout(() => {
                processTerminalTap();
              }, 800);
            }
          } catch (err) {
            console.error('[Stripe SDK Connect Error]', err);
            setTerminalStatus('declined');
            setTerminalDeclineReason(err.message);
          }
        })
        .catch(err => {
          console.error('[Stripe SDK Load Error]', err);
          setTerminalStatus('declined');
          setTerminalDeclineReason('Failed to load payment reader drivers.');
        });
      return;
    }

    const delay = terminalInstantMode ? 200 : 1200;
    setTimeout(() => {
      setTerminalStatus('waiting');
      if (terminalInstantMode) {
        setTimeout(() => {
          processTerminalTap();
        }, 600);
      }
    }, delay);
  };

  const processTerminalTap = () => {
    setTerminalStatus('processing');
    const delay = terminalInstantMode ? 300 : 1800;
    
    setTimeout(() => {
      if (terminalSimDecline) {
        setTerminalStatus('declined');
        toast.error(`Terminal Payment Declined: ${terminalDeclineReason}`);
      } else {
        setTerminalStatus('success');
        toast.success('Terminal Payment Approved!');
        setTimeout(async () => {
          setSplitPayments([]);
          setTerminalStatus(null);
          await onConfirm();
        }, 1000);
      }
    }, delay);
  };

  const handleConfirm = async () => {
    if (!canConfirm) {
      if (paymentMethod === 'split') {
        toast.error('Full amount must be paid across splits before confirming.');
      } else if (paymentMethod === 'cash' && cashTendered && parseFloat(cashTendered) < total - 0.01) {
        toast.error('Cash tendered is less than the total payable.');
      }
      return;
    }

    if (paymentMethod === 'split') {
      const finalSplits = splitMode === 'equal'
        ? guestSplits.map(g => ({ method: g.method, amount: g.amount }))
        : mixedPayments;
      const splitTotal = finalSplits.reduce((s, p) => s + (p.amount || 0), 0);
      if (splitTotal < total - 0.01) {
        toast.error(`Split amount (${formatCurrency(splitTotal, currency)}) is less than total (${formatCurrency(total, currency)})`);
        return;
      }
      if (splitMode === 'equal' && !guestSplits.every(g => g.paid)) {
        toast.error('All guest splits must be marked as paid before confirming.');
        return;
      }
      setSplitPayments(finalSplits);
    } else {
      setSplitPayments([]); // Clear if single payment
    }

    setLoading(true);

    if (paymentMethod === 'terminal') {
      setLoading(false);
      startTerminalSimulation();
      return;
    }

    await onConfirm();
    setLoading(false);
  };

  if (terminalStatus) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal animate-slide-up" ref={modalRef} style={{ maxWidth: 420, overflow: 'hidden' }}>
          <div style={{
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            textAlign: 'center',
            minHeight: '380px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative'
          }}>
            {/* Terminal Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-2)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-label-secondary)', fontWeight: 'var(--weight-bold)', letterSpacing: '1px' }}>
                📟 TERMINAL SIMULATOR
              </div>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setTerminalStatus(null)}
                style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
              >
                Cancel
              </button>
            </div>

            {/* Screen Box */}
            <div style={{
              background: '#111827',
              color: '#34D399',
              fontFamily: 'monospace',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              margin: 'var(--space-4) 0',
              textAlign: 'left',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)',
              border: '2px solid #374151',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: '140px'
            }}>
              {terminalStatus === 'connecting' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>&gt; INITIALIZING API...</div>
                  <div style={{ color: '#FBBF24' }}>&gt; CONNECTING READER OVER LAN...</div>
                  <div className="blink" style={{ color: '#60A5FA' }}>[ CONNECTING... ]</div>
                </div>
              )}
              {terminalStatus === 'waiting' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ color: '#38BDF8', fontSize: 13, fontWeight: 'bold' }}>AMOUNT: {formatCurrency(total, currency)}</div>
                  <div className="blink" style={{ color: '#34D399', margin: '8px 0', fontSize: 14, fontWeight: 'bold' }}>📡 TAP / INSERT CARD</div>
                  <button 
                    type="button" 
                    className="btn btn-success btn-sm"
                    onClick={processTerminalTap}
                    style={{ marginTop: 8 }}
                  >
                    💳 Simulate Card Tap
                  </button>
                </div>
              )}
              {terminalStatus === 'processing' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>&gt; CARD DETECTED. READING CHIP...</div>
                  <div>&gt; SENDING AUTH REQUEST...</div>
                  <div className="blink" style={{ color: '#FBBF24' }}>[ PROCESSING... ]</div>
                </div>
              )}
              {terminalStatus === 'success' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ color: '#34D399', fontSize: 42 }}>✓</div>
                  <div style={{ color: '#34D399', fontWeight: 'bold', fontSize: 14 }}>TRANSACTION APPROVED</div>
                  <div style={{ color: '#9CA3AF', fontSize: 10 }}>PRINTING RECEIPT...</div>
                </div>
              )}
              {terminalStatus === 'declined' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ color: '#F87171', fontSize: 42 }}>❌</div>
                  <div style={{ color: '#F87171', fontWeight: 'bold', fontSize: 14 }}>PAYMENT DECLINED</div>
                  <div style={{ color: '#E5E7EB', fontSize: 11 }}>Reason: {terminalDeclineReason}</div>
                  <button 
                    type="button" 
                    className="btn btn-primary btn-xs" 
                    onClick={startTerminalSimulation}
                    style={{ marginTop: 8, padding: '4px 12px' }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>

            {/* Sim Control panel */}
            <div style={{
              background: 'var(--color-bg-tertiary)',
              padding: '10px var(--space-3)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-separator)',
              fontSize: '11px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              textAlign: 'left'
            }}>
              <div style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-label-secondary)', marginBottom: 2 }}>
                ⚙️ SIMULATION CONTROLS
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚡ Instant Approval Mode:</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={terminalInstantMode} 
                    onChange={e => setTerminalInstantMode(e.target.checked)} 
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>❌ Force Decline Transaction:</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={terminalSimDecline} 
                    onChange={e => setTerminalSimDecline(e.target.checked)}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                </label>
              </div>
              {terminalSimDecline && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span>Decline Reason:</span>
                  <select 
                    className="form-select"
                    value={terminalDeclineReason}
                    onChange={e => setTerminalDeclineReason(e.target.value)}
                    style={{ padding: '2px 4px', fontSize: 11, borderRadius: 'var(--radius-xs)', height: 24, border: '1px solid var(--color-separator)' }}
                  >
                    <option value="Insufficient Funds">Insufficient Funds</option>
                    <option value="Card Expired">Card Expired</option>
                    <option value="Incorrect PIN">Incorrect PIN</option>
                    <option value="Network Timeout">Network Timeout</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ backdropFilter: 'blur(8px)', background: 'rgba(0, 0, 0, 0.65)' }}>
      <div className="modal animate-slide-up" style={{ maxWidth: 510, maxHeight: '92vh', borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-separator)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
            }}>
              <CreditCard size={18} />
            </div>
            <div>
              <h2 className="modal-title" style={{ fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>
                {t('payment')}
              </h2>
              <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 1 }}>
                {tableName ? `Table ${tableName}` : (tokenNumber ? `Token #${tokenNumber}` : 'Direct Register Checkout')}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} id="payment-modal-close" style={{ width: 30, height: 30, borderRadius: '50%' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, maxHeight: 'calc(92vh - 130px)', overflowY: 'auto', padding: '14px 18px 20px 18px' }}>
          {/* Apple Pay / Stripe Luxury Fintech Amount Due Card */}
          <div style={{
            background: 'linear-gradient(135deg, #090d16 0%, #0f172a 55%, #1e293b 100%)',
            borderRadius: 16,
            padding: '16px 20px',
            textAlign: 'center',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Ambient emerald sheen */}
            <div style={{
              position: 'absolute',
              top: -24,
              right: -24,
              width: 90,
              height: 90,
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%)',
              pointerEvents: 'none'
            }} />

            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Amount Due
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: '#ffffff', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
              {formatCurrency(total, currency)}
            </div>
            {(discountAmt > 0 || getPointsDiscountAmount() > 0 || giftCardDeduction > 0 || tipAmount > 0) && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ opacity: 0.8 }}>Subtotal: {formatCurrency(subtotal, currency)}</span>
                {discountAmt > 0 && <span style={{ color: '#34d399', fontWeight: 700 }}>• Disc: -{formatCurrency(discountAmt, currency)}</span>}
                {getPointsDiscountAmount() > 0 && <span style={{ color: '#fbbf24', fontWeight: 700 }}>• Points: -{formatCurrency(getPointsDiscountAmount(), currency)}</span>}
                {tipAmount > 0 && <span style={{ color: '#38bdf8', fontWeight: 700 }}>• Tip: +{formatCurrency(tipAmount, currency)}</span>}
                {giftCardDeduction > 0 && <span style={{ color: '#a78bfa', fontWeight: 700 }}>• Card: -{formatCurrency(giftCardDeduction, currency)}</span>}
              </div>
            )}
          </div>

          {/* Loyalty Points Redemption Toggle */}
          {customer && customer.points > 0 && (
            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--color-separator)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  Redeem Loyalty Points
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 1 }}>
                  Available: <strong>{customer.points} pts</strong> (Value: {formatCurrency(customer.points / 10, currency)})
                </span>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={redeemingPoints}
                  onChange={e => setRedeemingPoints(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </label>
            </div>
          )}

          {/* Collapsible Gift Card / Voucher Drawer */}
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 14,
            border: '1px solid var(--color-separator)',
            transition: 'all 0.2s ease'
          }}>
            <div 
              onClick={() => setIsVoucherOpen(!isVoucherOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--color-label)' }}>
                <Ticket size={15} color="var(--color-accent)" />
                <span>Have a Gift Card or Voucher?</span>
                {giftCardCode && (
                  <span style={{ background: '#10b981', color: '#ffffff', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>
                    Applied
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--color-label-secondary)' }}>
                {isVoucherOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {isVoucherOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-separator)' }}>
                {giftCardCode ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(16, 185, 129, 0.12)', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>
                        🎫 {giftCardCode} Applied
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                        Deduction: <strong>-{formatCurrency(giftCardDeduction, currency)}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={removeGiftCard}
                      style={{ color: '#dc2626', padding: '4px 8px', fontSize: 11, fontWeight: 700 }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="form-input"
                      placeholder="Enter gift card code (e.g. GC-XXXX)"
                      value={gcInput}
                      onChange={e => setGcInput(e.target.value)}
                      style={{ height: 36, fontSize: 13, flex: 1, textTransform: 'uppercase', borderRadius: 8 }}
                      id="gift-card-redeem-input"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleVerifyGiftCard}
                      disabled={verifyingGc || !gcInput.trim()}
                      style={{ height: 36, padding: '0 14px', borderRadius: 8, fontWeight: 700 }}
                      id="gift-card-redeem-btn"
                    >
                      {verifyingGc ? '...' : 'Apply'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Tip / Gratuity Section (Segmented Luxury Bar) ── */}
          <div style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 14,
            border: '1px solid var(--color-separator)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                <HeartHandshake size={14} color="#f59e0b" />
                <span>Tip / Gratuity</span>
              </div>
              {tipAmount > 0 && (
                <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 800 }}>
                  +{formatCurrency(tipAmount, currency)}
                </div>
              )}
            </div>

            {/* Apple-style segmented tip chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {[
                { key: 'none', label: 'No Tip' },
                { key: '15',   label: '15%' },
                { key: '18',   label: '18%' },
                { key: '20',   label: '20%' },
                { key: 'custom', label: 'Custom' },
              ].map(preset => {
                const isSelected = tipPreset === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    id={`tip-preset-${preset.key}`}
                    onClick={() => {
                      setTipPreset(preset.key);
                      if (preset.key === 'none') {
                        setTip(0);
                        setCustomTip('');
                      } else if (preset.key !== 'custom') {
                        const pct = parseFloat(preset.key);
                        setTip((tipBaseAmount * pct) / 100);
                        setCustomTip('');
                      } else {
                        setCustomTip(tipAmount > 0 ? tipAmount.toFixed(2) : '');
                      }
                    }}
                    style={{
                      padding: '8px 4px',
                      borderRadius: 10,
                      border: isSelected ? '1.5px solid #f59e0b' : '1px solid var(--color-separator-opaque)',
                      background: isSelected ? '#f59e0b' : '#ffffff',
                      color: isSelected ? '#000000' : 'var(--color-label)',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-family)',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 6px rgba(245, 158, 11, 0.3)' : 'none'
                    }}
                  >
                    <div>{preset.label}</div>
                    {preset.key !== 'none' && preset.key !== 'custom' && (
                      <div style={{ fontSize: 9, opacity: 0.85, marginTop: 2, fontWeight: 700 }}>
                        {formatCurrency((tipBaseAmount * parseFloat(preset.key)) / 100, currency)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom tip input */}
            {tipPreset === 'custom' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  id="tip-custom-input"
                  type="number"
                  className="form-input"
                  placeholder="Enter custom tip"
                  value={customTip}
                  min="0"
                  step="0.01"
                  onChange={e => setCustomTip(e.target.value)}
                  onBlur={() => {
                    const val = parseFloat(customTip);
                    if (!isNaN(val) && val >= 0) setTip(val);
                    else { setCustomTip(''); setTip(0); }
                  }}
                  style={{ flex: 1, height: 36, fontSize: 13, borderRadius: 8 }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ height: 36, padding: '0 14px', borderRadius: 8 }}
                  onClick={() => {
                    const val = parseFloat(customTip);
                    if (!isNaN(val) && val >= 0) setTip(val);
                    else { setCustomTip(''); setTip(0); }
                  }}
                >
                  Set Tip
                </button>
              </div>
            )}
          </div>

          {/* Payment Methods (Balanced 5-Card Single Row) */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              {t('paymentMethod')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {METHODS.map(m => {
                const isSelected = paymentMethod === m.key;
                return (
                  <button
                    key={m.key}
                    id={`payment-method-${m.key}`}
                    type="button"
                    onClick={() => setPaymentMethod(m.key)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '12px 6px',
                      borderRadius: 14,
                      border: isSelected ? '2px solid #0f172a' : '1px solid var(--color-separator)',
                      background: isSelected ? '#0f172a' : '#ffffff',
                      color: isSelected ? '#ffffff' : 'var(--color-label)',
                      boxShadow: isSelected ? '0 6px 18px rgba(15, 23, 42, 0.25)' : 'none',
                      transform: isSelected ? 'translateY(-2px)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                      fontFamily: 'var(--font-family)',
                    }}
                  >
                    <div style={{ marginBottom: 4 }}>
                      <m.icon size={20} color={isSelected ? '#38bdf8' : 'var(--color-label-secondary)'} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800 }}>
                      {m.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Split Bill section */}
          {paymentMethod === 'split' && (
            <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Tab Selector */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--color-separator)', marginBottom: 'var(--space-2)' }}>
                <button
                  type="button"
                  onClick={() => setSplitMode('equal')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: `2.5px solid ${splitMode === 'equal' ? 'var(--color-accent)' : 'transparent'}`,
                    color: splitMode === 'equal' ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                    fontWeight: 'var(--weight-bold)',
                    fontSize: 'var(--text-footnote)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-family)',
                  }}
                >
                  Split Equally
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode('mixed')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: `2.5px solid ${splitMode === 'mixed' ? 'var(--color-accent)' : 'transparent'}`,
                    color: splitMode === 'mixed' ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                    fontWeight: 'var(--weight-bold)',
                    fontSize: 'var(--text-footnote)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-family)',
                  }}
                >
                  Mixed Payments
                </button>
              </div>

              {/* Mode: Equal */}
              {splitMode === 'equal' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <span style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>NUMBER OF GUESTS</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        className="qty-btn"
                        disabled={numGuests <= 2}
                        onClick={() => setNumGuests(n => Math.max(2, n - 1))}
                        style={{ width: 28, height: 28 }}
                      >-</button>
                      <span style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', minWidth: 24, textAlign: 'center' }}>
                        {numGuests}
                      </span>
                      <button
                        type="button"
                        className="qty-btn"
                        disabled={numGuests >= 10}
                        onClick={() => setNumGuests(n => Math.min(10, n + 1))}
                        style={{ width: 28, height: 28 }}
                      >+</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
                    {guestSplits.map((guest) => (
                      <div
                        key={guest.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px var(--space-3)',
                          background: guest.paid ? 'var(--color-green-light)' : 'var(--color-bg-secondary)',
                          borderRadius: 'var(--radius-md)',
                          border: `1.5px solid ${guest.paid ? 'var(--color-green)' : 'var(--color-separator-opaque)'}`,
                          transition: 'all var(--duration-fast)',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-footnote)', color: guest.paid ? 'var(--color-green)' : 'var(--color-label)' }}>
                            Guest {guest.id}
                          </span>
                          <span style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)', marginLeft: 8 }}>
                            ({formatCurrency(guest.amount, currency)})
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          {!guest.paid && (
                            <select
                              className="form-select"
                              value={guest.method}
                              onChange={e => {
                                const updated = guestSplits.map(g => g.id === guest.id ? { ...g, method: e.target.value } : g);
                                setGuestSplits(updated);
                              }}
                              style={{ width: 75, height: 28, padding: '2px 4px', fontSize: 11, borderRadius: 'var(--radius-xs)', border: '1px solid var(--color-separator-opaque)' }}
                            >
                              <option value="cash">Cash</option>
                              <option value="card">Card</option>
                              <option value="upi">UPI</option>
                            </select>
                          )}
                          <button
                            type="button"
                            className={`btn btn-xs ${guest.paid ? 'btn-secondary' : 'btn-success'}`}
                            onClick={() => {
                              const updated = guestSplits.map(g => g.id === guest.id ? { ...g, paid: !g.paid } : g);
                              setGuestSplits(updated);
                            }}
                            style={{ fontSize: 11, padding: '4px 10px', height: 28, borderRadius: 'var(--radius-sm)' }}
                          >
                            {guest.paid ? 'Undo' : 'Pay'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mode: Mixed */}
              {splitMode === 'mixed' && (
                <div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Amount"
                      value={nextAmount}
                      onChange={e => setNextAmount(e.target.value)}
                      style={{ flex: 1, height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                    />
                    <select
                      className="form-select"
                      value={nextMethod}
                      onChange={e => setNextMethod(e.target.value)}
                      style={{ width: 80, height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="upi">UPI</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={addMixedPayment}
                      disabled={!nextAmount || parseFloat(nextAmount) <= 0 || remainingMixed <= 0}
                      style={{ height: 32, padding: '0 var(--space-4)' }}
                    >
                      Add
                    </button>
                  </div>

                  {/* Captured payments */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase' }}>
                      Payments Captured:
                    </div>
                    {mixedPayments.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px var(--space-3)',
                          background: 'var(--color-bg-secondary)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-separator)'
                        }}
                      >
                        <div style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)', textTransform: 'capitalize' }}>
                          {p.method}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)' }}>
                            {formatCurrency(p.amount, currency)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeMixedPayment(idx)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {mixedPayments.length === 0 && (
                      <div style={{ textAlign: 'center', color: 'var(--color-label-tertiary)', fontSize: 11, padding: '6px 0' }}>
                        No payments added yet.
                      </div>
                    )}
                  </div>

                  {/* Mixed Balances */}
                  <div style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-label-secondary)' }}>
                      <span>Total Paid:</span>
                      <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-label)' }}>{formatCurrency(totalPaidMixed, currency)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-footnote)', color: remainingMixed > 0 ? 'var(--color-orange)' : 'var(--color-green)' }}>
                      <span>Remaining:</span>
                      <span style={{ fontWeight: 'var(--weight-bold)' }}>{formatCurrency(remainingMixed, currency)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cash tendered field */}
          {paymentMethod === 'cash' && (
            <div style={{
              marginTop: 14,
              padding: '14px 16px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 14,
              border: '1px solid var(--color-separator)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Cash Tendered
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                  Due: <strong style={{ color: 'var(--color-label)' }}>{formatCurrency(total, currency)}</strong>
                </span>
              </div>

              {/* Input row */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                  id="cash-tendered-input"
                  className="form-input"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={cashTendered}
                  onChange={e => setCashTendered(e.target.value)}
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    height: 48,
                    borderRadius: 10,
                    paddingLeft: 38,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 18,
                  fontWeight: 800,
                  color: 'var(--color-label-secondary)',
                  pointerEvents: 'none'
                }}>
                  {currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹')}
                </span>
              </div>

              {/* 1-Tap Quick Cash Denomination Chips */}
              {quickCashOptions.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${quickCashOptions.length}, 1fr)`, gap: 6, marginBottom: 10 }}>
                  {quickCashOptions.map((opt, idx) => {
                    const isSelected = parseFloat(cashTendered) === opt;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCashTendered(opt.toString())}
                        style={{
                          padding: '7px 4px',
                          background: isSelected ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                          color: isSelected ? '#ffffff' : 'var(--color-label)',
                          border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-separator-opaque)'}`,
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          lineHeight: 1.2,
                          boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'
                        }}
                      >
                        <span style={{ fontSize: 9, opacity: 0.8, textTransform: 'uppercase', fontWeight: 800 }}>
                          {idx === 0 ? 'Exact' : 'Round'}
                        </span>
                        <span>{formatCurrency(opt, currency)}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Live Change / Remaining Bal Display */}
              {change !== null && change >= 0 && (
                <div style={{
                  padding: '10px 14px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)',
                  borderRadius: 10,
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#059669',
                  animation: 'fadeIn 0.2s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700 }}>
                    <Coins size={16} />
                    <span>Change to Return</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(change, currency)}
                  </div>
                </div>
              )}
              {change !== null && change < 0 && (
                <div style={{
                  padding: '10px 14px',
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.08) 100%)',
                  borderRadius: 10,
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#dc2626'
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Remaining Due</span>
                  <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(Math.abs(change), currency)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* UPI scan to pay section */}
          {paymentMethod === 'upi' && (
            <div style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-4)',
              background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-xl)',
              border: '1.5px solid var(--color-separator-opaque)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-4)',
              textAlign: 'center'
            }}>
              {/* QR Container */}
              <div style={{
                background: '#ffffff',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                border: '1px solid var(--color-separator)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: 236,
                height: 236
              }}>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="UPI QR Code" style={{ width: 212, height: 212, display: 'block' }} />
                ) : (
                  <div style={{ color: 'var(--color-label-tertiary)', fontSize: 11 }}>Generating QR Code...</div>
                )}
              </div>

              {/* Merchant Details & Instructions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 'var(--weight-bold)', color: 'var(--color-label)' }}>
                  📲 SCAN TO PAY WITH ANY UPI APP
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                  Merchant VPA: <strong style={{ color: 'var(--color-accent)' }}>{restaurant?.upiConfig?.vpa || 'demo@upi'}</strong>
                </div>
                {restaurant?.upiConfig?.name && (
                  <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                    Name: <strong>{restaurant.upiConfig.name}</strong>
                  </div>
                )}
                {!restaurant?.upiConfig?.vpa && (
                  <div style={{
                    fontSize: 9,
                    color: 'var(--color-orange)',
                    background: 'rgba(255,149,0,0.1)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    marginTop: 4
                  }}>
                    ⚠️ Using demo VPA fallback. Configure custom UPI VPA in Settings.
                  </div>
                )}
              </div>

              {/* Supported apps */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 2,
                opacity: 0.85
              }}>
                {['Google Pay', 'PhonePe', 'Paytm', 'BHIM'].map(app => (
                  <span key={app} style={{
                    fontSize: 9,
                    fontWeight: 'var(--weight-bold)',
                    color: 'var(--color-label-secondary)',
                    padding: '2px 6px',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-separator-opaque)'
                  }}>
                    {app}
                  </span>
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    const vpa = restaurant?.upiConfig?.vpa || 'demo@upi';
                    const name = restaurant?.upiConfig?.name || 'DineOS Demo';
                    const noteBase = tableName ? `Table ${tableName}` : (tokenNumber ? `Token ${tokenNumber}` : 'POS Order');
                    const sanitizedNote = noteBase.replace(/[^a-zA-Z0-9]/g, '_');
                    const upiUrl = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${total.toFixed(2)}&cu=${currency || 'INR'}&tn=${sanitizedNote}`;
                    navigator.clipboard.writeText(upiUrl);
                    toast.success('UPI link copied!');
                  }}
                  style={{ flex: 1, fontSize: 10, padding: '6px 0', height: 28 }}
                >
                  🔗 Copy UPI Link
                </button>
              </div>

              {/* Cashier input for reference ID */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)' }}>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 0 }}>UPI Transaction ID / Ref (Optional)</label>
                <input
                  id="upi-ref-input"
                  className="form-input"
                  placeholder="e.g. Last 4 or 6 digits of UPI Ref No."
                  value={upiRef || ''}
                  onChange={e => setUpiRef(e.target.value)}
                  style={{ height: 32, fontSize: 11 }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--color-separator)',
          display: 'flex',
          gap: 12,
          background: 'var(--color-bg-primary)',
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          flexShrink: 0
        }}>
          <button 
            className="btn btn-secondary" 
            onClick={onClose} 
            id="payment-cancel-btn"
            style={{ flex: '0 0 auto', padding: '0 20px', height: 44, borderRadius: 12, fontWeight: 700 }}
          >
            {t('cancel')}
          </button>
          <button
            className="btn btn-success btn-lg"
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            id="payment-confirm-btn"
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: canConfirm ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#334155',
              color: canConfirm ? '#ffffff' : '#94a3b8',
              border: 'none',
              boxShadow: canConfirm ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.7,
              transition: 'all 0.15s ease'
            }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            <span>Complete Payment &middot; {formatCurrency(total, currency)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
