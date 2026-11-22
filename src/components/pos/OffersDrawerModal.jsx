import { useState } from 'react';
import { X, Check, Tag, PlusCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { getAvailableOffers } from '../../utils/promoEngine';
import toast from 'react-hot-toast';

export default function OffersDrawerModal({
  isOpen,
  onClose,
  items = [],
  subtotal = 0,
  currency = 'INR',
  restaurant,
  appliedOffer,
  onApplyOffer,
  onRemoveOffer,
  onQuickAddItem
}) {
  const [promoCodeInput, setPromoCodeInput] = useState('');

  if (!isOpen) return null;

  const availableOffers = getAvailableOffers(restaurant, items, subtotal, appliedOffer?.id);

  const handleApplyPromoCode = (e) => {
    if (e) e.preventDefault();
    const clean = promoCodeInput.trim().toUpperCase();
    if (!clean) return;

    const matched = availableOffers.find(o => 
      o.id.toUpperCase() === clean || 
      o.tag.toUpperCase() === clean ||
      o.name.toUpperCase().includes(clean)
    );

    if (matched) {
      if (matched.isEligible) {
        onApplyOffer(matched);
        toast.success(`Applied: ${matched.name}!`, { icon: '🎉' });
        setPromoCodeInput('');
      } else {
        toast.error(matched.statusText || 'Cart does not yet qualify for this offer');
      }
    } else {
      toast.error('Invalid promo code');
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '88vh',
          background: 'var(--color-bg-elevated, #1e2230)',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px var(--color-separator, rgba(255,255,255,0.1))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-separator, rgba(255,255,255,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-bg, #131722)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18
            }}>
              🎁
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-label, #ffffff)' }}>
                Offers & Promotions
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-label-secondary, #94a3b8)' }}>
                BOGO, Combos & automatic deal rules
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-label-tertiary, #94a3b8)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Applied Offer Banner */}
        {appliedOffer && (
          <div style={{
            padding: '12px 18px',
            background: 'rgba(16, 185, 129, 0.12)',
            borderBottom: '1px solid rgba(16, 185, 129, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Check size={16} color="#10b981" />
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981', display: 'block' }}>
                  {appliedOffer.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-label-secondary, #94a3b8)' }}>
                  Total saving: <strong>{formatCurrency(appliedOffer.discountAmount, currency)}</strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => {
                onRemoveOffer();
                toast.success('Offer removed');
              }}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                height: 26,
                color: 'var(--color-red, #ef4444)',
                borderColor: 'rgba(239, 68, 68, 0.3)'
              }}
            >
              Remove
            </button>
          </div>
        )}

        {/* Scrollable Deals List */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flex: 1
        }}>
          {availableOffers.map(offer => {
            const isApplied = appliedOffer?.id === offer.id;

            return (
              <div
                key={offer.id}
                style={{
                  background: isApplied ? 'rgba(16, 185, 129, 0.06)' : 'var(--color-bg-base, #171c2a)',
                  border: isApplied 
                    ? '1.5px solid #10b981' 
                    : offer.isEligible 
                      ? '1px solid rgba(59, 130, 246, 0.4)' 
                      : '1px solid var(--color-separator, rgba(255,255,255,0.08))',
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{offer.icon || '🎁'}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-label, #ffffff)' }}>
                          {offer.name}
                        </span>
                        <span style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: `${offer.badgeColor || '#ef4444'}20`,
                          color: offer.badgeColor || '#ef4444'
                        }}>
                          {offer.tag}
                        </span>
                      </div>
                      <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--color-label-secondary, #94a3b8)', lineHeight: 1.3 }}>
                        {offer.description}
                      </p>
                    </div>
                  </div>

                  {/* Action Button */}
                  {isApplied ? (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#10b981',
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: 'rgba(16, 185, 129, 0.15)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0
                    }}>
                      <Check size={12} /> Applied
                    </span>
                  ) : offer.isEligible ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => {
                        onApplyOffer(offer);
                        toast.success(`Applied ${offer.name}! (Saved ${formatCurrency(offer.discountAmount, currency)})`, { icon: '🎉' });
                      }}
                      style={{
                        padding: '4px 12px',
                        height: 28,
                        fontSize: 11.5,
                        fontWeight: 700,
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      Apply · Save {formatCurrency(offer.discountAmount, currency)}
                    </button>
                  ) : (
                    <span style={{
                      fontSize: 10.5,
                      color: 'var(--color-label-tertiary, #64748b)',
                      background: 'rgba(255,255,255,0.04)',
                      padding: '3px 8px',
                      borderRadius: 6,
                      flexShrink: 0
                    }}>
                      Not eligible
                    </span>
                  )}
                </div>

                {/* Upsell Nudge Prompt if cart is almost eligible */}
                {!offer.isEligible && offer.nudge && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    fontSize: 11
                  }}>
                    <span style={{ color: 'var(--color-primary, #3b82f6)', fontWeight: 600 }}>
                      💡 {offer.nudge.text}
                    </span>
                    {onQuickAddItem && offer.nudge.itemId && (
                      <button
                        type="button"
                        onClick={() => {
                          onQuickAddItem(offer.nudge.itemId);
                          toast.success(`Added 1 more ${offer.nudge.itemName}!`, { icon: '🍕' });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-primary, #3b82f6)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 11,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 4px'
                        }}
                      >
                        <PlusCircle size={12} /> Add 1
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Promo Code Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--color-separator, rgba(255,255,255,0.08))',
          background: 'var(--color-bg, #131722)',
          display: 'flex',
          gap: 8,
          alignItems: 'center'
        }}>
          <Tag size={15} color="var(--color-label-tertiary, #94a3b8)" />
          <form onSubmit={handleApplyPromoCode} style={{ display: 'flex', gap: 6, flex: 1 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Have a promo code? (e.g. BOGO, FLAT100)"
              value={promoCodeInput}
              onChange={e => setPromoCodeInput(e.target.value)}
              style={{
                flex: 1,
                height: 32,
                fontSize: 12,
                padding: '0 10px',
                borderRadius: 8,
                textTransform: 'uppercase'
              }}
            />
            <button
              type="submit"
              disabled={!promoCodeInput.trim()}
              className="btn btn-secondary"
              style={{
                height: 32,
                padding: '0 14px',
                fontSize: 11.5,
                fontWeight: 700,
                borderRadius: 8
              }}
            >
              Apply
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
