import React, { useState } from 'react';
import { formatCurrency } from '../../utils/formatCurrency';
import { Printer, Eye, Sparkles, Check, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { printReceiptSingle } from '../../utils/print';

export default function ReceiptDesigner({ settings, updateField }) {
  const currency = settings?.currency || 'INR';
  const paperSize = settings?.receiptConfig?.paperSize || '80mm';
  const headerMessage = settings?.receiptConfig?.headerMessage ?? 'Welcome & Thank You!';
  const footerMessage = settings?.receiptConfig?.footerMessage ?? 'Wi-Fi: KiwiCafe | Pass: freshcoffee\nFollow us on Instagram @kiwipos';
  const showTaxBreakdown = settings?.receiptConfig?.showTaxBreakdown ?? true;
  const showCashier = settings?.receiptConfig?.showCashier ?? true;
  const showQrCode = settings?.receiptConfig?.showQrCode ?? true;
  const showWifi = settings?.receiptConfig?.showWifi ?? true;

  const handleTestPrint = () => {
    toast.success('Sending test receipt to printer...');
    const testOrder = {
      id: 'REC-' + Math.floor(1000 + Math.random() * 9000),
      type: 'dine-in',
      tableName: 'T-04',
      token: '42',
      subtotal: 350,
      total: 367.5,
      tax: 17.5,
      paymentMethod: 'cash'
    };
    const testItems = [
      { name: 'Special Filter Coffee', qty: 2, price: 90 },
      { name: 'Artisan Croissant', qty: 1, price: 170 }
    ];
    printReceiptSingle({
      restaurant: settings,
      order: testOrder,
      items: testItems,
      staffName: 'Sam (Cashier)'
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)' }}>
      {/* Configuration Form */}
      <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h3 className="text-title3" style={{ marginBottom: '2px' }}>🧾 Receipt Customizer</h3>
          <p className="text-secondary text-footnote">
            Customize how your customer paper and digital receipts appear. Changes preview live on the right.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Receipt Header Greeting</label>
          <input
            className="form-input"
            placeholder="e.g. Welcome to Kiwi Cafe!"
            value={headerMessage}
            onChange={e => updateField('receiptConfig.headerMessage', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Receipt Footer Note / Wi-Fi Details</label>
          <textarea
            className="form-input"
            placeholder="e.g. Wi-Fi: CoffeeShop / Pass: 1234\nThank you for supporting our local business!"
            value={footerMessage}
            onChange={e => updateField('receiptConfig.footerMessage', e.target.value)}
            style={{ minHeight: '80px', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div className="form-group">
            <label className="form-label">Default Paper Size</label>
            <select
              className="form-select"
              value={paperSize}
              onChange={e => updateField('receiptConfig.paperSize', e.target.value)}
            >
              <option value="80mm">3-inch (80mm) Standard</option>
              <option value="58mm">2-inch (58mm) Compact</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Logo on Receipt</label>
            <input
              className="form-input"
              placeholder="https://.../logo.png"
              value={settings?.receiptConfig?.logoUrl || ''}
              onChange={e => updateField('receiptConfig.logoUrl', e.target.value)}
            />
          </div>
        </div>

        <div style={{
          background: 'var(--color-bg-secondary)',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 'var(--weight-bold)' }}>Receipt Information Elements</span>
          
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ fontSize: '13px' }}>Print Tax Summary / GSTIN / VAT Breakdown</span>
            <input
              type="checkbox"
              checked={showTaxBreakdown}
              onChange={e => updateField('receiptConfig.showTaxBreakdown', e.target.checked)}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ fontSize: '13px' }}>Print Cashier / Server Name</span>
            <input
              type="checkbox"
              checked={showCashier}
              onChange={e => updateField('receiptConfig.showCashier', e.target.checked)}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ fontSize: '13px' }}>Print Order QR Code / E-Bill Link</span>
            <input
              type="checkbox"
              checked={showQrCode}
              onChange={e => updateField('receiptConfig.showQrCode', e.target.checked)}
            />
          </label>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTestPrint}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Printer size={16} /> Print Test Sample Receipt
          </button>
        </div>
      </div>

      {/* Live Visual Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-label-secondary)', fontSize: '12px', fontWeight: 600 }}>
          <Eye size={14} /> Live Thermal Receipt Mockup ({paperSize})
        </div>

        {/* Paper Container */}
        <div style={{
          width: paperSize === '58mm' ? '260px' : '330px',
          background: '#ffffff',
          color: '#111827',
          padding: '24px 20px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          borderRadius: '4px',
          fontFamily: '"Courier Prime", Courier, monospace',
          fontSize: paperSize === '58mm' ? '11px' : '12px',
          lineHeight: '1.4',
          position: 'relative',
          transition: 'all 0.2s ease',
          borderTop: '4px solid #e5e7eb',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #9ca3af', paddingBottom: '12px', marginBottom: '10px' }}>
            {settings?.receiptConfig?.logoUrl && (
              <img
                src={settings.receiptConfig.logoUrl}
                alt="Logo"
                style={{ maxHeight: '36px', maxWidth: '140px', objectFit: 'contain', margin: '0 auto 6px' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div style={{ fontWeight: 'bold', fontSize: '15px', letterSpacing: '0.05em' }}>
              {settings?.name || 'MY AWESOME STORE'}
            </div>
            {settings?.address && (
              <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
                {settings.address}
              </div>
            )}
            {settings?.phone && (
              <div style={{ fontSize: '11px', color: '#4b5563' }}>
                Tel: {settings.phone}
              </div>
            )}
            {settings?.gstin && showTaxBreakdown && (
              <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '2px' }}>
                TAX ID / GSTIN: {settings.gstin}
              </div>
            )}
            {headerMessage && (
              <div style={{ fontSize: '11px', fontStyle: 'italic', marginTop: '6px', color: '#374151' }}>
                {headerMessage}
              </div>
            )}
          </div>

          {/* Metadata info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '8px' }}>
            <span>Bill: #REC-4821</span>
            <span>Table: T-04 / Tok: 42</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '10px', color: '#4b5563' }}>
            <span>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            {showCashier && <span>Staff: Sam</span>}
          </div>

          {/* Item Table Header */}
          <div style={{ borderTop: '1px solid #111827', borderBottom: '1px solid #111827', padding: '4px 0', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ flex: 1 }}>Item</span>
            <span style={{ width: '30px', textAlign: 'center' }}>Qty</span>
            <span style={{ width: '65px', textAlign: 'right' }}>Price</span>
          </div>

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0', borderBottom: '1px dashed #9ca3af' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ flex: 1 }}>Special Filter Coffee</span>
              <span style={{ width: '30px', textAlign: 'center' }}>2</span>
              <span style={{ width: '65px', textAlign: 'right' }}>{formatCurrency(180, currency)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ flex: 1 }}>Artisan Croissant</span>
              <span style={{ width: '30px', textAlign: 'center' }}>1</span>
              <span style={{ width: '65px', textAlign: 'right' }}>{formatCurrency(170, currency)}</span>
            </div>
          </div>

          {/* Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '8px 0', borderBottom: '1px solid #111827' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span>{formatCurrency(350, currency)}</span>
            </div>
            {showTaxBreakdown && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4b5563' }}>
                <span>Tax (5%):</span>
                <span>{formatCurrency(17.5, currency)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', marginTop: '4px' }}>
              <span>TOTAL:</span>
              <span>{formatCurrency(367.5, currency)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4b5563' }}>
              <span>Paid via Cash:</span>
              <span>{formatCurrency(367.5, currency)}</span>
            </div>
          </div>

          {/* Footer & QR */}
          <div style={{ textAlign: 'center', paddingTop: '12px' }}>
            {showQrCode && (
              <div style={{
                margin: '0 auto 8px',
                width: '60px',
                height: '60px',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                fontWeight: 'bold',
                color: '#4b5563'
              }}>
                [QR CODE]
              </div>
            )}
            {footerMessage && (
              <div style={{ fontSize: '10.5px', color: '#4b5563', whiteSpace: 'pre-line' }}>
                {footerMessage}
              </div>
            )}
            <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '8px' }}>
              Powered by Kiwi POS
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
