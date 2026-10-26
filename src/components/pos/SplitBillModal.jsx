import { useState, useMemo } from 'react';
import { 
  X, Split, Users, Armchair, Check, CheckCircle2, 
  Printer, CreditCard, Banknote, Smartphone, Plus, Minus, 
  ArrowRightLeft, Receipt, Coins, ChevronRight, AlertCircle, Sparkles
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { 
  createSeatChecks, 
  createEvenChecks, 
  settleCheck, 
  areAllChecksSettled, 
  getRemainingBalance, 
  getTotalPaid,
  splitItemQuantity,
  computeCheckTotals
} from '../../utils/splitCheckEngine';
import { printReceipt } from '../../utils/print';
import { hapticTap } from '../../utils/soundNotifications';
import toast from 'react-hot-toast';
import { getTerminalAdapter, TERMINAL_PROVIDERS } from '../../services/terminal';

export default function SplitBillModal({
  isOpen,
  onClose,
  items = [],
  tableName,
  tableId,
  restaurant,
  currency = 'INR',
  orderDiscount = 0,
  orderDiscountType = 'fixed',
  editingOrderId,
  settledChecks = [],
  onSettleCheck,
  onCompleteOrder
}) {
  if (!isOpen) return null;

  // Split Modes: 'seat' | 'even' | 'custom'
  const [splitMode, setSplitMode] = useState('seat');
  const [numEvenGuests, setNumEvenGuests] = useState(2);
  const [sharedHandling, setSharedHandling] = useState('separate'); // 'separate' | 'distribute'
  const [activePayingCheckId, setActivePayingCheckId] = useState(null);
  const [movingItemContext, setMovingItemContext] = useState(null); // { item, fromCheckId }

  // Smart Terminal Live Dispatch State
  const [terminalDispatchCheck, setTerminalDispatchCheck] = useState(null);
  const [terminalDispatchStatus, setTerminalDispatchStatus] = useState('waiting'); // 'waiting' | 'approved' | 'declined'

  // Compute base order subtotal
  const orderSubtotal = useMemo(() => {
    return items.reduce((sum, i) => sum + ((Number(i.price) || 0) + (Number(i.modifierTotal) || 0)) * (Number(i.qty) || 1), 0);
  }, [items]);

  // Overall order total calculation
  const overallTotals = useMemo(() => {
    return computeCheckTotals(items, {
      restaurant,
      orderDiscount,
      orderDiscountType,
      totalOrderSubtotal: orderSubtotal
    });
  }, [items, restaurant, orderDiscount, orderDiscountType, orderSubtotal]);

  // Generate initial seat checks or custom checks state
  const [customChecks, setCustomChecks] = useState(() => {
    const seatInitial = createSeatChecks(items, {
      restaurant,
      orderDiscount,
      orderDiscountType,
      sharedHandling
    });
    // Re-apply any previously settled checks
    return seatInitial.map(chk => {
      const settled = settledChecks.find(s => s.checkId === chk.id || (s.seatNumber != null && s.seatNumber === chk.seatNumber));
      if (settled) {
        return {
          ...chk,
          isPaid: true,
          paidAt: settled.paidAt,
          paymentDetails: settled.paymentDetails || { method: settled.paymentMethod, amount: settled.total }
        };
      }
      return chk;
    });
  });

  // Even split checks calculation
  const evenChecks = useMemo(() => {
    const evens = createEvenChecks(overallTotals.total, numEvenGuests, items, { restaurant });
    return evens.map(chk => {
      const settled = settledChecks.find(s => s.checkId === chk.id);
      if (settled) {
        return {
          ...chk,
          isPaid: true,
          paidAt: settled.paidAt,
          paymentDetails: settled.paymentDetails || { method: settled.paymentMethod, amount: settled.total }
        };
      }
      return chk;
    });
  }, [overallTotals.total, numEvenGuests, items, restaurant, settledChecks]);

  // Active checks depending on mode
  const currentChecks = useMemo(() => {
    if (splitMode === 'even') return evenChecks;
    return customChecks;
  }, [splitMode, evenChecks, customChecks]);

  // Financial summary
  const totalPaid = useMemo(() => getTotalPaid(currentChecks), [currentChecks]);
  const remainingDue = useMemo(() => getRemainingBalance(currentChecks), [currentChecks]);
  const isOrderFullyPaid = useMemo(() => areAllChecksSettled(currentChecks), [currentChecks]);

  // Handle switching shared items rule in seat mode
  const handleToggleSharedHandling = (mode) => {
    hapticTap('light');
    setSharedHandling(mode);
    const newSeatChecks = createSeatChecks(items, {
      restaurant,
      orderDiscount,
      orderDiscountType,
      sharedHandling: mode
    });
    setCustomChecks(newSeatChecks);
  };

  // Add a blank new check in custom mode
  const handleAddCustomCheck = () => {
    hapticTap('medium');
    const nextNum = customChecks.length + 1;
    const newCheck = {
      id: `check-custom-${Date.now()}`,
      checkNumber: nextNum,
      title: `Check ${nextNum}`,
      seatNumber: null,
      items: [],
      subtotal: 0,
      taxTotal: 0,
      serviceChargeAmount: 0,
      discountAmount: 0,
      total: 0,
      isPaid: false,
      paidAt: null,
      paymentDetails: null
    };
    setCustomChecks([...customChecks, newCheck]);
  };

  // Move item between checks in custom mode
  const handleMoveItemToCheck = (targetCheckId) => {
    if (!movingItemContext) return;
    const { item, fromCheckId } = movingItemContext;
    if (fromCheckId === targetCheckId) {
      setMovingItemContext(null);
      return;
    }

    hapticTap('light');
    setCustomChecks(prev => {
      return prev.map(chk => {
        if (chk.id === fromCheckId) {
          const updatedItems = chk.items.filter(i => i.id !== item.id);
          const totals = computeCheckTotals(updatedItems, {
            restaurant,
            orderDiscount,
            orderDiscountType,
            totalOrderSubtotal: orderSubtotal
          });
          return { ...chk, items: updatedItems, ...totals };
        }
        if (chk.id === targetCheckId) {
          const updatedItems = [...chk.items, item];
          const totals = computeCheckTotals(updatedItems, {
            restaurant,
            orderDiscount,
            orderDiscountType,
            totalOrderSubtotal: orderSubtotal
          });
          return { ...chk, items: updatedItems, ...totals };
        }
        return chk;
      });
    });

    setMovingItemContext(null);
    toast.success(`Moved ${item.name} to check!`, { icon: '🔄', duration: 1500 });
  };

  // Print Guest Pre-Bill for a single check
  const handlePrintCheck = (check) => {
    hapticTap('light');
    const printOrder = {
      id: `${editingOrderId || 'ORDER'}-${check.checkNumber}`,
      type: 'dine-in',
      tableName: tableName ? `Table ${tableName} (${check.title})` : check.title,
      total: check.total,
      subtotal: check.subtotal,
      taxTotal: check.taxTotal || 0,
      serviceChargeAmount: check.serviceChargeAmount || 0,
      discountAmount: check.discountAmount || 0,
      paymentMethod: check.isPaid ? (check.paymentDetails?.method || 'Paid') : 'Guest Check (Unpaid)',
      isPaid: check.isPaid,
      currency
    };

    printReceipt({
      restaurant,
      order: printOrder,
      items: check.items.length > 0 ? check.items : items,
      taxInfo: check.taxInfo,
      staffName: 'Server'
    });
    toast.success(`Printing ${check.title} pre-bill...`, { icon: '🖨️' });
  };

  // Print all guest checks in one batch
  const handlePrintAllChecks = () => {
    hapticTap('medium');
    currentChecks.forEach((chk, idx) => {
      setTimeout(() => {
        handlePrintCheck(chk);
      }, idx * 250);
    });
  };

  // Execute final check settlement
  const executeCheckSettlement = async (check, method, paymentDetails) => {
    if (splitMode === 'even') {
      const updated = settleCheck(currentChecks, check.id, paymentDetails);
      if (onSettleCheck) {
        await onSettleCheck(check, method, paymentDetails);
      }
      setActivePayingCheckId(null);
      toast.success(`${check.title} settled via ${method.toUpperCase()}!`, { icon: '💳' });

      if (areAllChecksSettled(updated)) {
        toast.success(`Table ${tableName || ''} completely settled!`, { icon: '🎉', duration: 4000 });
        if (onCompleteOrder) onCompleteOrder();
      }
    } else {
      const updated = settleCheck(customChecks, check.id, paymentDetails);
      setCustomChecks(updated);
      if (onSettleCheck) {
        await onSettleCheck(check, method, paymentDetails);
      }
      setActivePayingCheckId(null);
      toast.success(`${check.title} settled via ${method.toUpperCase()}!`, { icon: '💳' });

      setTimeout(() => {
        handlePrintCheck({ ...check, isPaid: true, paymentDetails });
      }, 100);

      if (areAllChecksSettled(updated)) {
        toast.success(`All checks paid! Table ${tableName || ''} is now free!`, { icon: '🎉', duration: 4000 });
        if (onCompleteOrder) onCompleteOrder();
      }
    }
  };

  // Settle individual check payment
  const handlePayCheck = async (check, method) => {
    hapticTap('heavy');

    if (method === 'terminal') {
      const adapter = getTerminalAdapter(restaurant?.terminalConfig);
      setTerminalDispatchCheck(check);
      setTerminalDispatchStatus('waiting');
      adapter.initiatePayment({
        amount: check.total,
        currency,
        orderId: check.id,
        terminalId: restaurant?.terminalConfig?.terminalId
      }).catch(err => console.warn('Terminal init error:', err));
      return;
    }

    const paymentDetails = {
      method,
      amount: check.total,
      paidAt: new Date().toISOString()
    };
    await executeCheckSettlement(check, method, paymentDetails);
  };

  // Approve Terminal card payment
  const handleTerminalApprove = async (check) => {
    hapticTap('heavy');
    setTerminalDispatchStatus('approved');
    const paymentDetails = {
      method: 'terminal',
      amount: check.total,
      authCode: `AUTH_${Math.floor(100000 + Math.random() * 900000)}`,
      rrn: `RRN_${Date.now()}`,
      cardBrand: 'Contactless EMV',
      provider: restaurant?.terminalConfig?.provider || 'pax',
      terminalId: restaurant?.terminalConfig?.terminalId || 'COUNTER-01',
      paidAt: new Date().toISOString()
    };
    setTimeout(() => {
      setTerminalDispatchCheck(null);
      executeCheckSettlement(check, 'terminal', paymentDetails);
    }, 700);
  };

  return (
    <div className="pos-split-modal-backdrop" onClick={onClose}>
      <div 
        className="pos-split-modal-container" 
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="split-modal-title"
      >
        {/* Top Header */}
        <div className="pos-split-header">
          <div className="pos-split-header-left">
            <div className="pos-split-badge">
              <Split size={14} className="pos-split-badge-icon" />
              <span>Seat & Bill Splitter</span>
            </div>
            <h2 id="split-modal-title" className="pos-split-title">
              {tableName ? `Table ${tableName}` : 'Dine-In Check'}
              <span className="pos-split-item-count">({items.reduce((s, i) => s + i.qty, 0)} items)</span>
            </h2>
          </div>

          <div className="pos-split-header-stats">
            <div className="split-stat-box">
              <span className="split-stat-label">Total Bill</span>
              <span className="split-stat-val val--total">{formatCurrency(overallTotals.total, currency)}</span>
            </div>
            <div className="split-stat-box">
              <span className="split-stat-label">Paid So Far</span>
              <span className="split-stat-val val--paid">{formatCurrency(totalPaid, currency)}</span>
            </div>
            <div className="split-stat-box">
              <span className="split-stat-label">Remaining</span>
              <span className="split-stat-val val--due">{formatCurrency(remainingDue, currency)}</span>
            </div>
            <button 
              type="button" 
              className="pos-split-close-btn"
              onClick={onClose}
              title="Close split modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="pos-split-controls-bar">
          <div className="pos-split-segmented-tabs">
            <button
              type="button"
              className={`pos-split-tab ${splitMode === 'seat' ? 'active' : ''}`}
              onClick={() => { hapticTap('light'); setSplitMode('seat'); }}
            >
              <Armchair size={15} />
              <span>Split by Seat</span>
            </button>
            <button
              type="button"
              className={`pos-split-tab ${splitMode === 'even' ? 'active' : ''}`}
              onClick={() => { hapticTap('light'); setSplitMode('even'); }}
            >
              <Users size={15} />
              <span>Split Evenly (N Ways)</span>
            </button>
            <button
              type="button"
              className={`pos-split-tab ${splitMode === 'custom' ? 'active' : ''}`}
              onClick={() => { hapticTap('light'); setSplitMode('custom'); }}
            >
              <ArrowRightLeft size={15} />
              <span>Custom Checks</span>
            </button>
          </div>

          {/* Sub-controls depending on mode */}
          <div className="pos-split-sub-controls">
            {splitMode === 'seat' && (
              <div className="pos-split-shared-toggle">
                <span className="pos-split-toggle-label">Shared Dishes:</span>
                <button
                  type="button"
                  className={`split-sub-btn ${sharedHandling === 'separate' ? 'active' : ''}`}
                  onClick={() => handleToggleSharedHandling('separate')}
                >
                  Separate Check
                </button>
                <button
                  type="button"
                  className={`split-sub-btn ${sharedHandling === 'distribute' ? 'active' : ''}`}
                  onClick={() => handleToggleSharedHandling('distribute')}
                >
                  Divide Across Seats
                </button>
              </div>
            )}

            {splitMode === 'even' && (
              <div className="pos-split-even-picker">
                <span className="pos-split-toggle-label">Guests:</span>
                {[2, 3, 4, 5, 6].map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`split-pill-btn ${numEvenGuests === num ? 'active' : ''}`}
                    onClick={() => { hapticTap('light'); setNumEvenGuests(num); }}
                  >
                    {num}
                  </button>
                ))}
                <div className="split-stepper">
                  <button 
                    type="button" 
                    className="split-stepper-btn"
                    onClick={() => { hapticTap('light'); setNumEvenGuests(prev => Math.max(2, prev - 1)); }}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="split-stepper-val">{numEvenGuests}</span>
                  <button 
                    type="button" 
                    className="split-stepper-btn"
                    onClick={() => { hapticTap('light'); setNumEvenGuests(prev => Math.min(20, prev + 1)); }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            )}

            {splitMode === 'custom' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm pos-split-add-check-btn"
                onClick={handleAddCustomCheck}
              >
                <Plus size={14} /> Add Check
              </button>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-sm pos-split-print-all-btn"
              onClick={handlePrintAllChecks}
              title="Print all guest checks"
            >
              <Printer size={14} /> Print All Checks
            </button>
          </div>
        </div>

        {/* Moving item prompt banner */}
        {movingItemContext && (
          <div className="pos-split-move-banner">
            <span className="move-banner-text">
              Select destination check for: <strong>{movingItemContext.item.name}</strong> ({formatCurrency(movingItemContext.item.price * movingItemContext.item.qty, currency)})
            </span>
            <button
              type="button"
              className="move-banner-cancel"
              onClick={() => setMovingItemContext(null)}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Checks Grid */}
        <div className="pos-split-checks-grid">
          {currentChecks.map((check) => {
            const isPayingThis = activePayingCheckId === check.id;
            const isDestinationForMove = movingItemContext && movingItemContext.fromCheckId !== check.id;

            return (
              <div 
                key={check.id} 
                className={`pos-split-check-card ${check.isPaid ? 'is-paid' : ''} ${isDestinationForMove ? 'destination-highlight' : ''}`}
                onClick={() => {
                  if (isDestinationForMove) {
                    handleMoveItemToCheck(check.id);
                  }
                }}
              >
                {/* Check Header */}
                <div className="check-card-header">
                  <div className="check-title-group">
                    <span className="check-card-badge">#{check.checkNumber}</span>
                    <h3 className="check-card-title">{check.title}</h3>
                  </div>

                  {check.isPaid ? (
                    <span className="check-status-pill status--paid">
                      <CheckCircle2 size={12} /> Paid ({check.paymentDetails?.method?.toUpperCase() || 'PAID'})
                    </span>
                  ) : (
                    <span className="check-status-pill status--unpaid">
                      Unpaid
                    </span>
                  )}
                </div>

                {/* Items List */}
                <div className="check-card-items-wrap">
                  {check.isEvenSplit ? (
                    <div className="check-even-message">
                      <Sparkles size={16} className="even-icon" />
                      <span>Equal {100 / numEvenGuests}% share of table check</span>
                    </div>
                  ) : (check.items && check.items.length > 0) ? (
                    <div className="check-items-list">
                      {check.items.map((it, idx) => (
                        <div key={`${it.id}-${idx}`} className="check-item-row">
                          <div className="check-item-qty">{it.qty}x</div>
                          <div className="check-item-info">
                            <span className="check-item-name">{it.name}</span>
                            {it.selectedModifiers?.length > 0 && (
                              <span className="check-item-mods">
                                {it.selectedModifiers.map(m => m.name).join(', ')}
                              </span>
                            )}
                          </div>
                          <div className="check-item-price">
                            {formatCurrency(((Number(it.price) || 0) + (Number(it.modifierTotal) || 0)) * it.qty, currency)}
                          </div>

                          {/* Move Item button in custom mode */}
                          {splitMode === 'custom' && !check.isPaid && (
                            <button
                              type="button"
                              className="check-item-move-btn"
                              title="Move item to another check"
                              onClick={(e) => {
                                e.stopPropagation();
                                hapticTap('light');
                                setMovingItemContext({ item: it, fromCheckId: check.id });
                              }}
                            >
                              <ArrowRightLeft size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="check-card-empty">
                      <span>No items in this check yet.</span>
                      {isDestinationForMove && (
                        <span className="tap-to-move-hint">Tap here to move item here</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Totals Breakdown */}
                <div className="check-card-footer">
                  <div className="check-totals-row sub">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(check.subtotal, currency)}</span>
                  </div>
                  {check.taxTotal > 0 && (
                    <div className="check-totals-row sub">
                      <span>Tax:</span>
                      <span>{formatCurrency(check.taxTotal, currency)}</span>
                    </div>
                  )}
                  {check.serviceChargeAmount > 0 && (
                    <div className="check-totals-row sub">
                      <span>Service Charge:</span>
                      <span>{formatCurrency(check.serviceChargeAmount, currency)}</span>
                    </div>
                  )}
                  {check.discountAmount > 0 && (
                    <div className="check-totals-row sub discount">
                      <span>Discount:</span>
                      <span>-{formatCurrency(check.discountAmount, currency)}</span>
                    </div>
                  )}
                  <div className="check-totals-row grand">
                    <span className="grand-label">Total Due:</span>
                    <span className="grand-amount">{formatCurrency(check.total, currency)}</span>
                  </div>

                  {/* Actions Bar */}
                  <div className="check-actions-bar">
                    <button
                      type="button"
                      className="btn-check-action btn-print-check"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintCheck(check);
                      }}
                      title="Print check receipt"
                    >
                      <Printer size={13} />
                      <span>Print</span>
                    </button>

                    {check.isPaid ? (
                      <div className="check-settled-stamp">
                        <Check size={14} /> Settled
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-check-action btn-pay-check"
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticTap('light');
                          setActivePayingCheckId(isPayingThis ? null : check.id);
                        }}
                      >
                        <CreditCard size={13} />
                        <span>Pay {formatCurrency(check.total, currency)}</span>
                      </button>
                    )}
                  </div>

                  {/* Inline Payment Tender Sheet */}
                  {isPayingThis && !check.isPaid && (
                    <div className="check-tender-popup" onClick={e => e.stopPropagation()}>
                      <div className="tender-popup-title">
                        <span>Select Tender for #{check.checkNumber}</span>
                        <button type="button" onClick={() => setActivePayingCheckId(null)}>✕</button>
                      </div>
                      <div className="tender-buttons-row">
                        <button
                          type="button"
                          className="tender-btn tender--cash"
                          onClick={() => handlePayCheck(check, 'cash')}
                        >
                          <Banknote size={15} />
                          <span>Cash</span>
                        </button>
                        <button
                          type="button"
                          className="tender-btn tender--card"
                          onClick={() => handlePayCheck(check, 'card')}
                        >
                          <CreditCard size={15} />
                          <span>Card</span>
                        </button>
                        <button
                          type="button"
                          className="tender-btn tender--upi"
                          onClick={() => handlePayCheck(check, 'upi')}
                        >
                          <Smartphone size={15} />
                          <span>UPI</span>
                        </button>
                        <button
                          type="button"
                          className="tender-btn tender--terminal"
                          onClick={() => handlePayCheck(check, 'terminal')}
                        >
                          <Coins size={15} />
                          <span>Terminal</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Bottom Sticky Bar */}
        <div className="pos-split-bottom-bar">
          <div className="bottom-bar-left">
            <span className="bottom-bar-summary">
              {isOrderFullyPaid ? (
                <span className="summary--all-paid">
                  <CheckCircle2 size={16} /> All {currentChecks.length} checks fully paid & settled
                </span>
              ) : (
                <span>
                  Remaining balance to settle: <strong>{formatCurrency(remainingDue, currency)}</strong>
                </span>
              )}
            </span>
          </div>

          <div className="bottom-bar-right">
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={onClose}
            >
              Done / Return to Register
            </button>
          </div>
        </div>

        {/* Smart Terminal Live Dispatch Overlay */}
        {terminalDispatchCheck && (
          <div className="pos-split-terminal-overlay" onClick={e => e.stopPropagation()}>
            <div className="terminal-dispatch-card">
              <div className="terminal-dispatch-header">
                <div className="terminal-header-title">
                  <CreditCard size={17} />
                  <span>
                    📟 {(TERMINAL_PROVIDERS.find(p => p.id === (restaurant?.terminalConfig?.provider || 'simulator'))?.name) || 'Smart Card Terminal'}
                  </span>
                </div>
                <button
                  type="button"
                  className="terminal-close-btn"
                  onClick={() => setTerminalDispatchCheck(null)}
                >
                  ✕
                </button>
              </div>

              <div className="terminal-dispatch-body">
                <div className="terminal-amount-badge">
                  <span className="terminal-amount-label">{terminalDispatchCheck.title} · Amount Pushed</span>
                  <span className="terminal-amount-val">{formatCurrency(terminalDispatchCheck.total, currency)}</span>
                </div>

                <div className="terminal-nfc-wave">
                  <div className="nfc-pulse-ring ring-1" />
                  <div className="nfc-pulse-ring ring-2" />
                  <div className="nfc-center-icon">
                    <Smartphone size={32} />
                  </div>
                </div>

                <div className="terminal-status-message">
                  {terminalDispatchStatus === 'waiting' && (
                    <>
                      <div className="status-primary">Ready for Card or Mobile Tap</div>
                      <div className="status-sub">Customer taps contactless Apple Pay, Google Pay, or inserts chip card</div>
                    </>
                  )}
                  {terminalDispatchStatus === 'approved' && (
                    <>
                      <div className="status-primary text-emerald">Card Payment Approved ⚡</div>
                      <div className="status-sub">Updating check and firing thermal receipt...</div>
                    </>
                  )}
                </div>

                <div className="terminal-sim-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-md btn-simulate-tap"
                    onClick={() => handleTerminalApprove(terminalDispatchCheck)}
                  >
                    <CheckCircle2 size={16} />
                    <span>Customer Taps Card / Phone</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-cancel-terminal"
                    onClick={() => setTerminalDispatchCheck(null)}
                  >
                    Cancel Transaction
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
