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
  const [cashTendered, setCashTendered] = useState(() => (total > 0 ? total.toString() : ''));
  const [loading, setLoading] = useState(false);

  // Ensure cashTendered defaults to total when entering cash mode or total changes
  useEffect(() => {
    if (paymentMethod === 'cash' && (!cashTendered || parseFloat(cashTendered) <= 0)) {
      setCashTendered(total > 0 ? total.toString() : '');
    }
  }, [paymentMethod, total]);

  // Smart quick cash options for 1-tap cashier checkout
  const quickCashOptions = useMemo(() => {
    if (total <= 0) return [];
    const exact = Math.round(total * 100) / 100;
    const result = [
      { amount: exact, label: 'Exact', change: 0 }
    ];

    const candidates = new Set();

    // 1. Next round step of 10, 20, 50 (for small bills < 100)
    if (total < 100) {
      const next10 = Math.ceil(total / 10) * 10;
      if (next10 > total) candidates.add(next10);
      const next20 = Math.ceil(total / 20) * 20;
      if (next20 > total) candidates.add(next20);
      const next50 = Math.ceil(total / 50) * 50;
      if (next50 > total) candidates.add(next50);
    }

    // 2. Next round step of 50 (if total < 500)
    if (total < 500) {
      const next50 = Math.ceil(total / 50) * 50;
      if (next50 > total) candidates.add(next50);
    }

    // 3. Next round step of 100
    const next100 = Math.ceil(total / 100) * 100;
    if (next100 > total) candidates.add(next100);

    // 4. Next round step of 500
    const next500 = Math.ceil(total / 500) * 500;
    if (next500 > total) candidates.add(next500);

    // 5. Next round step of 1000
    const next1000 = Math.ceil(total / 1000) * 1000;
    if (next1000 > total) candidates.add(next1000);

    // 6. Next round step of 2000 (INR or high cash)
    if (currency === 'INR' || total >= 500) {
      const next2000 = Math.ceil(total / 2000) * 2000;
      if (next2000 > total) candidates.add(next2000);
    }

    const sorted = Array.from(candidates).sort((a, b) => a - b);
    for (const amt of sorted) {
      if (result.length >= 4) break;
      const changeAmt = Math.round((amt - total) * 100) / 100;
      const isBanknote = [10, 20, 50, 100, 200, 500, 1000, 2000].includes(amt);
      result.push({
        amount: amt,
        label: isBanknote ? `${formatCurrency(amt, currency)} Note` : `Round`,
        change: changeAmt
      });
    }

    // Fallback if less than 4 options (e.g. large catering bills)
    let mul = 2;
    while (result.length < 4) {
      const nextVal = Math.ceil((total * mul) / 1000) * 1000;
      if (nextVal > total && !result.some(r => r.amount === nextVal)) {
        result.push({
          amount: nextVal,
          label: 'Round',
          change: Math.round((nextVal - total) * 100) / 100
        });
      }
      mul++;
      if (mul > 10) break;
    }

    return result;
  }, [total, currency]);

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

    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
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
      <div className="modal animate-slide-up payment-modal-mobile" style={{ maxWidth: 530, width: '100%', maxHeight: '96vh', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.12)', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-separator)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
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

        <div className="modal-body" style={{ flex: 1, maxHeight: 'calc(96vh - 130px)', overflowY: 'auto', padding: '12px 16px 20px 16px' }}>
          {/* Apple Pay / Stripe Luxury Fintech Amount Due Card */}
          <div style={{
            background: 'linear-gradient(145deg, #090d16 0%, #0f172a 60%, #1e293b 100%)',
            borderRadius: 16,
            padding: '16px 20px 14px',
            textAlign: 'center',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 10px 28px -6px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 6
            }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Amount Due
              </span>
              <span style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: '#e2e8f0',
                background: 'rgba(255, 255, 255, 0.12)',
                padding: '2px 8px',
                borderRadius: 999
              }}>
                {tableName ? `Table ${tableName}` : (tokenNumber ? `Token #${tokenNumber}` : 'Register')}
              </span>
            </div>

            <div style={{
              fontSize: 'clamp(28px, 7vw, 38px)',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: '#ffffff',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.15
            }}>
              {formatCurrency(total, currency)}
            </div>

            {(discountAmt > 0 || getPointsDiscountAmount() > 0 || giftCardDeduction > 0 || tipAmount > 0) && (
              <div style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: 11,
                color: '#cbd5e1',
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap'
              }}>
                <span style={{ opacity: 0.85 }}>Subtotal: {formatCurrency(subtotal, currency)}</span>
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
              marginTop: 10,
              padding: '10px 14px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 12,
              border: '1px solid var(--color-separator)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>
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
            marginTop: 10,
            padding: '8px 12px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 12,
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
                <Ticket size={14} color="var(--color-accent)" />
                <span>Have a Gift Card or Voucher?</span>
                {giftCardCode && (
                  <span style={{ background: '#10b981', color: '#ffffff', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 }}>
                    Applied
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--color-label-secondary)' }}>
                {isVoucherOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </div>
            </div>

            {isVoucherOpen && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-separator)' }}>
                {giftCardCode ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(16, 185, 129, 0.12)', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>
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
                      style={{ color: '#dc2626', padding: '3px 8px', fontSize: 11, fontWeight: 700 }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="form-input"
                      placeholder="Enter gift card code (e.g. GC-XXXX)"
                      value={gcInput}
                      onChange={e => setGcInput(e.target.value)}
                      style={{ height: 34, fontSize: 12, flex: 1, textTransform: 'uppercase', borderRadius: 8 }}
                      id="gift-card-redeem-input"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleVerifyGiftCard}
                      disabled={verifyingGc || !gcInput.trim()}
                      style={{ height: 34, padding: '0 12px', borderRadius: 8, fontWeight: 700, fontSize: 12 }}
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
            marginTop: 10,
            padding: '10px 12px',
            background: 'var(--color-bg-secondary)',
            borderRadius: 12,
            border: '1px solid var(--color-separator)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                <HeartHandshake size={14} color="var(--color-accent, #3b82f6)" />
                <span>Tip / Gratuity</span>
              </div>
              {tipAmount > 0 && (
                <div style={{ fontSize: 12, color: '#059669', fontWeight: 800 }}>
                  +{formatCurrency(tipAmount, currency)}
                </div>
              )}
            </div>

            {/* Segmented tip chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
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
                      padding: '6px 2px',
                      borderRadius: 8,
                      border: isSelected ? '1.5px solid #0f172a' : '1px solid var(--color-separator)',
                      background: isSelected ? '#0f172a' : 'var(--color-bg-primary, #ffffff)',
                      color: isSelected ? '#ffffff' : 'var(--color-label)',
                      fontWeight: 700,
                      fontSize: 11.5,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-family)',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 8px rgba(15, 23, 42, 0.2)' : 'none'
                    }}
                  >
                    <div>{preset.label}</div>
                    {preset.key !== 'none' && preset.key !== 'custom' && (
                      <div style={{ fontSize: 9, opacity: isSelected ? 0.85 : 0.7, marginTop: 1, fontWeight: 700 }}>
                        {formatCurrency((tipBaseAmount * parseFloat(preset.key)) / 100, currency)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom tip input */}
            {tipPreset === 'custom' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  id="tip-custom-input"
                  type="number"
                  className="form-input"
                  placeholder="Enter custom tip amount"
                  value={customTip}
                  min="0"
                  step="0.01"
                  onChange={e => setCustomTip(e.target.value)}
                  onBlur={() => {
                    const val = parseFloat(customTip);
                    if (!isNaN(val) && val >= 0) setTip(val);
                    else { setCustomTip(''); setTip(0); }
                  }}
                  style={{ flex: 1, height: 32, fontSize: 12, borderRadius: 8 }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12 }}
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
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {t('paymentMethod')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
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
                      padding: '10px 4px',
                      borderRadius: 12,
                      border: isSelected ? '1.5px solid #0f172a' : '1px solid var(--color-separator)',
                      background: isSelected ? '#0f172a' : 'var(--color-bg-primary, #ffffff)',
                      color: isSelected ? '#ffffff' : 'var(--color-label)',
                      boxShadow: isSelected ? '0 4px 14px rgba(15, 23, 42, 0.25)' : '0 1px 3px rgba(0,0,0,0.03)',
                      transform: isSelected ? 'translateY(-1px)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                      fontFamily: 'var(--font-family)',
                    }}
                  >
                    <div style={{ marginBottom: 3 }}>
                      <m.icon size={18} color={isSelected ? '#38bdf8' : 'var(--color-label-secondary)'} />
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 800 }}>
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
              marginTop: 12,
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
                  Total Due: <strong style={{ color: 'var(--color-label)' }}>{formatCurrency(total, currency)}</strong>
                </span>
              </div>

              {/* Input row with clear button */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
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
                <input
                  id="cash-tendered-input"
                  className="form-input"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={cashTendered}
                  onChange={e => setCashTendered(e.target.value)}
                  onFocus={e => e.target.select()}
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    height: 48,
                    borderRadius: 10,
                    paddingLeft: 36,
                    paddingRight: 36,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    background: 'var(--color-bg-primary, #ffffff)'
                  }}
                />
                {cashTendered && (
                  <button
                    type="button"
                    onClick={() => setCashTendered('')}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: 'var(--color-bg-tertiary, #e2e8f0)',
                      border: 'none',
                      color: 'var(--color-label-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 1-Tap Smart Cash Denomination Chips */}
              {quickCashOptions.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
                  {quickCashOptions.map((opt, idx) => {
                    const isSelected = Math.abs(parseFloat(cashTendered || 0) - opt.amount) < 0.01;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCashTendered(opt.amount.toString())}
                        style={{
                          padding: '8px 12px',
                          background: isSelected ? '#0f172a' : 'var(--color-bg-primary, #ffffff)',
                          color: isSelected ? '#ffffff' : 'var(--color-label)',
                          border: `1.5px solid ${isSelected ? '#0f172a' : 'var(--color-separator)'}`,
                          borderRadius: 10,
                          cursor: 'pointer',
                          transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: isSelected ? '0 4px 12px rgba(15, 23, 42, 0.2)' : '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: 9.5, opacity: isSelected ? 0.75 : 0.6, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(opt.amount, currency)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 9, opacity: isSelected ? 0.75 : 0.6, textTransform: 'uppercase', fontWeight: 700 }}>
                            {opt.change > 0 ? 'Change' : 'No Change'}
                          </div>
                          <div style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: isSelected ? '#34d399' : (opt.change > 0 ? '#059669' : 'var(--color-label-secondary)'),
                            fontVariantNumeric: 'tabular-nums'
                          }}>
                            {opt.change > 0 ? `+${formatCurrency(opt.change, currency)}` : 'Exact'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Quick Bill Adder Strip */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase' }}>Add:</span>
                {(currency === 'INR' ? [50, 100, 200, 500] : [5, 10, 20, 50]).map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      const current = parseFloat(cashTendered) || 0;
                      setCashTendered((current + val).toString());
                    }}
                    className="btn btn-secondary btn-xs"
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 6,
                      background: 'var(--color-bg-primary, #ffffff)',
                      border: '1px solid var(--color-separator)'
                    }}
                  >
                    +{currency === 'INR' ? `₹${val}` : `${val}`}
                  </button>
                ))}
              </div>

              {/* Live Change / Remaining Bal Display */}
              {change !== null && change >= 0 && (
                <div style={{
                  padding: '10px 14px',
                  background: change > 0 
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)'
                    : 'var(--color-bg-primary, #ffffff)',
                  borderRadius: 10,
                  border: change > 0 ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--color-separator)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: change > 0 ? '#10b981' : 'var(--color-bg-tertiary)',
                      color: change > 0 ? '#ffffff' : 'var(--color-label-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: change > 0 ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none'
                    }}>
                      <Coins size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: change > 0 ? '#059669' : 'var(--color-label)' }}>
                        {change > 0 ? 'Change to Return' : 'Exact Tendered'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-label-secondary)' }}>
                        {change > 0 ? 'Hand cash back to customer' : 'No balance due'}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 20,
                    fontWeight: 900,
                    fontVariantNumeric: 'tabular-nums',
                    color: change > 0 ? '#059669' : 'var(--color-label)',
                    letterSpacing: '-0.02em'
                  }}>
                    {formatCurrency(change, currency)}
                  </div>
                </div>
              )}
              {change !== null && change < 0 && (
                <div style={{
                  padding: '10px 14px',
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.06) 100%)',
                  borderRadius: 10,
                  border: '1.5px solid rgba(239, 68, 68, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#dc2626'
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>Remaining Due</div>
                    <div style={{ fontSize: 10, opacity: 0.85 }}>Additional cash needed</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(Math.abs(change), currency)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Card payment section */}
          {paymentMethod === 'card' && (
            <div style={{
              marginTop: 12,
              padding: '16px 18px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 14,
              border: '1px solid var(--color-separator)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                }}>
                  <CreditCard size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--color-label)' }}>
                    External Card Machine / EDC POS
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                    Swipe, insert chip, or tap contactless card on your reader
                  </div>
                </div>
              </div>

              <div style={{
                background: 'var(--color-bg-primary, #ffffff)',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--color-separator)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label-secondary)' }}>Amount to Charge:</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(total, currency)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 0 }}>
                  Approval Code / Card Ref (Optional)
                </label>
                <input
                  id="card-ref-input"
                  className="form-input"
                  placeholder="e.g. Last 4 digits or Auth Code"
                  value={upiRef || ''}
                  onChange={e => setUpiRef(e.target.value)}
                  style={{ height: 34, fontSize: 12, borderRadius: 8 }}
                />
              </div>
            </div>
          )}

          {/* Terminal section */}
          {paymentMethod === 'terminal' && (
            <div style={{
              marginTop: 12,
              padding: '16px 18px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 14,
              border: '1px solid var(--color-separator)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
                }}>
                  <CreditCard size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--color-label)' }}>
                    Smart Reader / Stripe Terminal
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                    {restaurant?.stripeReaderId ? `Connected to Reader: ${restaurant.stripeReaderId}` : 'Interactive reader simulation mode'}
                  </div>
                </div>
              </div>

              <div style={{
                background: 'var(--color-bg-primary, #ffffff)',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--color-separator)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label-secondary)' }}>Ready for Customer Tap:</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(total, currency)}
                </span>
              </div>

              <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>
                Clicking <strong>Complete Payment</strong> will prompt the reader to accept Apple Pay, Google Wallet, or physical cards.
              </div>
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
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(upiUrl)
                        .then(() => toast.success('UPI link copied!'))
                        .catch(() => toast.error('Could not copy link to clipboard'));
                    } else {
                      toast.error('Clipboard access not supported');
                    }
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
              height: 46,
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: canConfirm ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'var(--color-bg-secondary)',
              color: canConfirm ? '#ffffff' : 'var(--color-label-tertiary)',
              border: canConfirm ? 'none' : '1.5px solid var(--color-separator-opaque)',
              boxShadow: canConfirm ? '0 4px 16px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)' : 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.65,
              transition: 'transform 0.08s ease, box-shadow 0.15s ease, background 0.15s ease'
            }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.5} />}
            <span>Complete Payment &middot; {formatCurrency(total, currency)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
