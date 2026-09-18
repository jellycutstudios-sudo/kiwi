import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { formatCurrency } from '../../utils/formatCurrency';
import { Check, X, Share2, Printer, Smartphone, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DigitalReceiptModal({
  order,
  restaurant,
  currency = 'INR',
  onClose,
  onPrint
}) {
  const [qrUrl, setQrUrl] = useState('');

  const orderId = order?.id || 'POS-ORDER';
  const total = order?.total || 0;
  const items = order?.items || [];
  const restName = restaurant?.name || 'Kiwi POS';

  // Digital receipt public URL
  const receiptUrl = `${window.location.origin}/order/${restaurant?.slug || restaurant?.id}?receipt=${orderId}`;

  useEffect(() => {
    QRCode.toDataURL(receiptUrl, { width: 220, margin: 1, color: { dark: '#111827', light: '#ffffff' } })
      .then(url => setQrUrl(url))
      .catch(err => console.error('QR generation error:', err));
  }, [receiptUrl]);

  const handleShareWhatsApp = () => {
    let billText = `🧾 *${restName}* - Digital Receipt\n`;
    billText += `Order: #${orderId.slice(-6)}\n`;
    billText += `Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
    billText += `-------------------------\n`;
    items.forEach(it => {
      billText += `• ${it.name} x${it.qty} - ${formatCurrency(it.price * it.qty, currency)}\n`;
    });
    billText += `-------------------------\n`;
    billText += `*Total: ${formatCurrency(total, currency)}*\n\n`;
    billText += `View your digital e-bill online: ${receiptUrl}\n`;
    billText += `Thank you for your visit! ✨`;

    const encoded = encodeURIComponent(billText);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 420, textAlign: 'center' }}>
        <div className="modal-header" style={{ justifyContent: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(52, 199, 89, 0.15)',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Check size={24} strokeWidth={3} />
            </div>
            <h2 className="modal-title" style={{ fontSize: '18px', margin: 0 }}>Payment Complete!</h2>
          </div>
          <button
            className="btn btn-secondary btn-icon"
            onClick={onClose}
            style={{ position: 'absolute', right: '16px', top: '16px' }}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-label-primary)' }}>
              {formatCurrency(total, currency)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
              Order #{orderId.slice(-6)} · {order?.paymentMethod?.toUpperCase() || 'CASH'}
            </div>
          </div>

          {/* QR Code Container */}
          <div style={{
            background: '#ffffff',
            padding: '12px',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            border: '1px solid var(--color-separator)'
          }}>
            {qrUrl ? (
              <img src={qrUrl} alt="Digital Receipt QR" style={{ width: '180px', height: '180px', display: 'block' }} />
            ) : (
              <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Generating QR...
              </div>
            )}
            <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '6px', fontWeight: 600 }}>
              Scan to view paperless e-receipt 📲
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleShareWhatsApp}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                borderColor: '#25D366',
                color: '#15803d'
              }}
            >
              <MessageSquare size={16} color="#25D366" /> WhatsApp Bill
            </button>

            {onPrint && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onPrint}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Printer size={16} /> Print Receipt
              </button>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={onClose} style={{ width: '100%', height: '42px', fontSize: '15px' }} type="button">
            Done / Next Order
          </button>
        </div>
      </div>
    </div>
  );
}
