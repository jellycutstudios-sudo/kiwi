import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useOrderStore } from '../../stores/orderStore';
import { useGiftCardStore } from '../../stores/giftCardStore';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { X, Banknote, CreditCard, Smartphone, Split, Ticket, HeartHandshake } from 'lucide-react';
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

  // Compute subtotal for tip base
  const tipBaseAmount = subtotal - getDiscountAmount() - getPointsDiscountAmount();
  const [cashTendered, setCashTendered] = useState('');
  const [loading, setLoading] = useState(false);

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
      const name = restaurant?.upiConfig?.name || 'RestaurantOS Demo';
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
    if (!canConfirm) return;
    setLoading(true);

    if (paymentMethod === 'split') {
      const finalSplits = splitMode === 'equal'
        ? guestSplits.map(g => ({ method: g.method, amount: g.amount }))
        : mixedPayments;
      setSplitPayments(finalSplits);
    } else {
      setSplitPayments([]); // Clear if single payment
    }

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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">💳 {t('payment')}</h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose} id="payment-modal-close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {/* Amount due */}
          <div style={{
            background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-indigo) 100%)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-5) var(--space-6)',
            textAlign: 'center',
            color: '#fff',
          }}>
            <div style={{ fontSize: 'var(--text-footnote)', opacity: 0.85, marginBottom: 'var(--space-1)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.05em' }}>
              AMOUNT DUE
            </div>
            <div style={{ fontSize: 'var(--text-largeTitle)', fontWeight: 'var(--weight-heavy)', letterSpacing: '-0.02em' }}>
              {formatCurrency(total, currency)}
            </div>
            {(discountAmt > 0 || getPointsDiscountAmount() > 0 || giftCardDeduction > 0 || tipAmount > 0) && (
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4, display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>Subtotal: {formatCurrency(subtotal, currency)}</span>
                {discountAmt > 0 && <span>• Discount: -{formatCurrency(discountAmt, currency)}</span>}
                {getPointsDiscountAmount() > 0 && <span>• Points Disc: -{formatCurrency(getPointsDiscountAmount(), currency)}</span>}
                {tipAmount > 0 && <span>• Tip: +{formatCurrency(tipAmount, currency)}</span>}
                {giftCardDeduction > 0 && <span>• Gift Card: -{formatCurrency(giftCardDeduction, currency)}</span>}
              </div>
            )}
          </div>

          {/* Loyalty Points Redemption Toggle */}
          {customer && customer.points > 0 && (
            <div style={{
              marginTop: 'var(--space-3)',
              marginBottom: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-separator)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)' }}>
                  Redeem Loyalty Points
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
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

          {/* Gift Card Verification Panel */}
          <div style={{
            marginTop: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-separator)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>
              <Ticket size={14} color="var(--color-accent)" />
              <span>Redeem Gift Card / Voucher</span>
            </div>

            {giftCardCode ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-green-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-green-opaque)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-bold)', color: 'var(--color-green)' }}>
                    🎫 {giftCardCode} Applied
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--color-label-secondary)' }}>
                    Deduction: <strong>-{formatCurrency(giftCardDeduction, currency)}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={removeGiftCard}
                  style={{ color: 'var(--color-red)', padding: '2px 6px', fontSize: 10 }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="Enter Gift Card code (e.g. GC-XXXX)"
                  value={gcInput}
                  onChange={e => setGcInput(e.target.value)}
                  style={{ height: 32, fontSize: 'var(--text-footnote)', flex: 1, textTransform: 'uppercase' }}
                  id="gift-card-redeem-input"
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleVerifyGiftCard}
                  disabled={verifyingGc || !gcInput.trim()}
                  style={{ height: 32, padding: '0 12px' }}
                  id="gift-card-redeem-btn"
                >
                  {verifyingGc ? '...' : 'Apply'}
                </button>
              </div>
            )}
          </div>

          {/* ── Tip / Gratuity Section ── */}
          <div style={{
            marginTop: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-separator)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>
              <HeartHandshake size={14} color="var(--color-orange)" />
              <span>Tip / Gratuity</span>
            </div>

            {/* Preset buttons */}
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
                        // Keep existing tip for custom but let user edit
                        setCustomTip(tipAmount > 0 ? tipAmount.toFixed(2) : '');
                      }
                    }}
                    style={{
                      padding: '6px 4px',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${isSelected ? 'var(--color-orange)' : 'var(--color-separator-opaque)'}`,
                      background: isSelected ? 'rgba(255,149,0,0.1)' : 'transparent',
                      color: isSelected ? 'var(--color-orange)' : 'var(--color-label-secondary)',
                      fontWeight: 'var(--weight-bold)',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-family)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {preset.label}
                    {preset.key !== 'none' && preset.key !== 'custom' && (
                      <div style={{ fontSize: 9, opacity: 0.8, marginTop: 1 }}>
                        {formatCurrency((tipBaseAmount * parseFloat(preset.key)) / 100, currency)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom tip input */}
            {tipPreset === 'custom' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="tip-custom-input"
                  type="number"
                  className="form-input"
                  placeholder="Enter tip amount"
                  value={customTip}
                  min="0"
                  step="0.01"
                  onChange={e => setCustomTip(e.target.value)}
                  onBlur={() => {
                    const val = parseFloat(customTip);
                    if (!isNaN(val) && val >= 0) setTip(val);
                    else { setCustomTip(''); setTip(0); }
                  }}
                  style={{ flex: 1, height: 32, fontSize: 'var(--text-footnote)' }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ height: 32, padding: '0 12px' }}
                  onClick={() => {
                    const val = parseFloat(customTip);
                    if (!isNaN(val) && val >= 0) setTip(val);
                    else { setCustomTip(''); setTip(0); }
                  }}
                >
                  Apply
                </button>
              </div>
            )}

            {/* Active tip indicator */}
            {tipAmount > 0 && (
              <div style={{ fontSize: 11, color: 'var(--color-orange)', fontWeight: 'var(--weight-semibold)', textAlign: 'right' }}>
                Tip: +{formatCurrency(tipAmount, currency)}
              </div>
            )}
          </div>

          {/* Payment methods */}
          <div>
            <div className="form-label" style={{ marginBottom: 'var(--space-3)' }}>{t('paymentMethod')}</div>
            <div className="payment-methods" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
              {METHODS.map(m => (
                <button
                  key={m.key}
                  id={`payment-method-${m.key}`}
                  className={`payment-method-card ${paymentMethod === m.key ? 'selected' : ''}`}
                  onClick={() => setPaymentMethod(m.key)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 'var(--space-3) var(--space-2)',
                    borderRadius: 'var(--radius-lg)',
                    border: `2px solid ${paymentMethod === m.key ? m.color : 'var(--color-separator-opaque)'}`,
                    background: paymentMethod === m.key ? 'rgba(128,128,128,0.08)' : 'transparent',
                    boxShadow: paymentMethod === m.key ? `0 8px 16px -4px rgba(0,0,0,0.1), 0 4px 8px -4px ${m.color}` : 'none',
                    transform: paymentMethod === m.key ? 'translateY(-2px)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    fontFamily: 'var(--font-family)',
                  }}
                >
                  <div style={{ marginBottom: 6, transform: paymentMethod === m.key ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.2s ease' }}>
                    <m.icon size={20} color={paymentMethod === m.key ? m.color : 'var(--color-label-secondary)'} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 'var(--weight-bold)', color: paymentMethod === m.key ? 'var(--color-label)' : 'var(--color-label-secondary)' }}>
                    {m.label}
                  </div>
                </button>
              ))}
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
            <div className="form-group">
              <label className="form-label">Cash Tendered</label>
              <input
                id="cash-tendered-input"
                className="form-input"
                type="number"
                placeholder={`0.00`}
                value={cashTendered}
                onChange={e => setCashTendered(e.target.value)}
                style={{ fontSize: 'var(--text-title3)', fontWeight: 'var(--weight-bold)' }}
              />
              {change !== null && change >= 0 && (
                <div style={{
                  marginTop: 'var(--space-2)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-green-light)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-green)',
                  fontWeight: 'var(--weight-semibold)',
                  fontSize: 'var(--text-subhead)',
                }}>
                  Change: {formatCurrency(change, currency)}
                </div>
              )}
              {change !== null && change < 0 && (
                <div style={{
                  marginTop: 'var(--space-2)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-red-light)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-red)',
                  fontWeight: 'var(--weight-semibold)',
                  fontSize: 'var(--text-subhead)',
                }}>
                  Insufficient amount
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
                    const name = restaurant?.upiConfig?.name || 'RestaurantOS Demo';
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

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} id="payment-cancel-btn">
            {t('cancel')}
          </button>
          <button
            className="btn btn-success btn-lg"
            onClick={handleConfirm}
            disabled={!canConfirm}
            id="payment-confirm-btn"
            style={{ minWidth: 150 }}
          >
            {loading ? '...' : `✓ Confirm · ${formatCurrency(total, currency)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
