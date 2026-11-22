import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { formatCurrency } from '../../utils/formatCurrency';
import { Check, X, Printer, MessageSquare, FileText, Send, Loader2 } from 'lucide-react';
import { sendWhatsAppReceipt } from '../../services/whatsappService';
import toast from 'react-hot-toast';

export default function DigitalReceiptModal({
  order,
  restaurant,
  currency = 'INR',
  onClose,
  onPrint,
  onPrintA4
}) {
  const [qrUrl, setQrUrl] = useState('');
  const [phone, setPhone] = useState(() => order?.customerPhone || order?.customer?.phone || '');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const orderId = order?.id || 'POS-ORDER';
  const total = order?.total || 0;
  const items = order?.items || [];
  const restName = restaurant?.name || 'Kiwi POS';
  const isWhatsAppConfigured = Boolean((restaurant?.whatsapp?.enabled || restaurant?.settings?.whatsapp?.enabled) && (restaurant?.whatsapp?.phoneNumberId || restaurant?.settings?.whatsapp?.phoneNumberId));

  // Digital receipt public URL
  const receiptUrl = `${window.location.origin}/order/${restaurant?.slug || restaurant?.id}?receipt=${orderId}`;

  useEffect(() => {
    QRCode.toDataURL(receiptUrl, { width: 220, margin: 1, color: { dark: '#111827', light: '#ffffff' } })
      .then(url => setQrUrl(url))
      .catch(err => console.error('QR generation error:', err));
  }, [receiptUrl]);

  const handleSendCloudWhatsApp = async () => {
    if (!phone || !phone.trim()) {
      toast.error('Please enter customer mobile number');
      return;
    }
    setIsSending(true);
    try {
      const res = await sendWhatsAppReceipt({
        restaurant,
        orderId,
        customerName: order?.customerName || order?.customer?.name || '',
        customerPhone: phone.trim(),
        items,
        total,
        currency,
        paymentMethod: order?.paymentMethod || 'CASH',
        token: order?.token || null
      });

      if (res.ok) {
        setSentSuccess(true);
        toast.success(`Receipt delivered to +${res.phone} on WhatsApp!`, { icon: '📲' });
      } else {
        toast.error(res.error || 'Failed to send WhatsApp message');
      }
    } catch (err) {
      toast.error('Network error: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleShareWhatsAppWeb = () => {
    let billText = `🧾 *${restName}* - Digital Receipt\n`;
    billText += `Order: #${orderId.slice(-6).toUpperCase()}\n`;
    billText += `Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
    billText += `-------------------------\n`;
    items.forEach(it => {
      billText += `• ${it.name} x${it.qty || 1} - ${formatCurrency((it.price || 0) * (it.qty || 1), currency)}\n`;
    });
    billText += `-------------------------\n`;
    billText += `*Total: ${formatCurrency(total, currency)}*\n\n`;
    billText += `View your digital e-bill online: ${receiptUrl}\n`;
    billText += `Thank you for your visit! ✨`;

    const encoded = encodeURIComponent(billText);
    const targetPhone = phone ? phone.replace(/\D/g, '') : '';
    const url = targetPhone ? `https://wa.me/${targetPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 500, width: 'min(500px, 94vw)', textAlign: 'center' }}>
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
              Order #{orderId.slice(-6).toUpperCase()} · {order?.paymentMethod?.toUpperCase() || 'CASH'}
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
              <img src={qrUrl} alt="Digital Receipt QR" style={{ width: '170px', height: '170px', display: 'block' }} />
            ) : (
              <div style={{ width: '170px', height: '170px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Generating QR...
              </div>
            )}
            <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '6px', fontWeight: 600 }}>
              Scan to view paperless e-receipt 📲
            </div>
          </div>

          {/* Meta WhatsApp Cloud API Direct Dispatch or Web Share */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {isWhatsAppConfigured ? (
              <div style={{
                background: 'rgba(37, 211, 102, 0.07)',
                border: '1px solid rgba(37, 211, 102, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <MessageSquare size={14} color="#25D366" /> Meta Cloud WhatsApp
                  </span>
                  {sentSuccess && (
                    <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Check size={13} strokeWidth={3} /> Sent
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="tel"
                    className="input"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Customer Mobile (e.g. 9876543210)"
                    style={{ flex: 1, fontSize: '13px', height: '36px' }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={handleSendCloudWhatsApp}
                    disabled={isSending}
                    style={{
                      background: '#25D366',
                      color: '#ffffff',
                      border: 'none',
                      height: '36px',
                      padding: '0 14px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                    {sentSuccess ? 'Resend' : 'Send'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleShareWhatsAppWeb}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-label-secondary)',
                    fontSize: '11px',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left'
                  }}
                >
                  Or open in WhatsApp Web / App
                </button>
              </div>
            ) : (
              (!restaurant?.modes || restaurant.modes.includes('retention_crm')) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleShareWhatsAppWeb}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    borderColor: '#25D366',
                    color: '#15803d',
                    height: '36px'
                  }}
                >
                  <MessageSquare size={16} color="#25D366" /> Share via WhatsApp
                </button>
              )
            )}

            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              {onPrint && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onPrint}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', fontSize: '12px' }}
                >
                  <Printer size={15} /> Thermal Receipt
                </button>
              )}

              {onPrintA4 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onPrintA4}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', fontSize: '12px' }}
                  title="Print full A4 tax invoice for GST/tax billing"
                >
                  <FileText size={15} color="var(--color-primary)" /> A4 Tax Invoice
                </button>
              )}
            </div>
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
