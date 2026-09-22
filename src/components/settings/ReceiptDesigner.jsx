import React, { useState } from 'react';
import { formatCurrency } from '../../utils/formatCurrency';
import { Printer, Eye, Sparkles, Check, RefreshCw, Upload, Image, Sliders, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { printReceiptSingle } from '../../utils/print';
import { convertLogoForThermal } from '../../utils/thermalLogo';

export default function ReceiptDesigner({ settings, updateField }) {
  const currency = settings?.currency || 'INR';
  const paperSize = settings?.receiptConfig?.paperSize || '80mm';
  const headerMessage = settings?.receiptConfig?.headerMessage ?? 'Welcome & Thank You!';
  const footerMessage = settings?.receiptConfig?.footerMessage ?? 'Wi-Fi: KiwiCafe | Pass: freshcoffee\nFollow us on Instagram @kiwipos';
  const showTaxBreakdown = settings?.receiptConfig?.showTaxBreakdown ?? true;
  const showCashier = settings?.receiptConfig?.showCashier ?? true;
  const showQrCode = settings?.receiptConfig?.showQrCode ?? true;

  const currentLogoUrl = settings?.receiptConfig?.logoUrl || settings?.logo || '';
  const currentThermalLogo = settings?.receiptConfig?.thermalLogo || '';

  // Thermal Converter States
  const [converting, setConverting] = useState(false);
  const [previewThermalMode, setPreviewThermalMode] = useState(true);
  const [algorithm, setAlgorithm] = useState(() => settings?.receiptConfig?.thermalSettings?.algorithm || 'dither');
  const [threshold, setThreshold] = useState(() => settings?.receiptConfig?.thermalSettings?.threshold ?? 128);
  const [invert, setInvert] = useState(() => settings?.receiptConfig?.thermalSettings?.invert ?? false);

  // Convert and update logo in state & config
  const processLogo = async (source, customOpts = {}) => {
    if (!source) return;
    setConverting(true);
    const opts = {
      maxWidth: paperSize === '58mm' ? 256 : 384,
      maxHeight: 130,
      algorithm: customOpts.algorithm ?? algorithm,
      threshold: customOpts.threshold ?? threshold,
      invert: customOpts.invert ?? invert,
    };

    try {
      const res = await convertLogoForThermal(source, opts);
      updateField('receiptConfig.logoUrl', res.originalUrl || currentLogoUrl || res.thermalDataUrl);
      updateField('receiptConfig.thermalLogo', res.thermalDataUrl);
      updateField('receiptConfig.escPosLogo', res.escPosBase64);
      updateField('receiptConfig.thermalSettings', {
        algorithm: opts.algorithm,
        threshold: opts.threshold,
        invert: opts.invert
      });
      toast.success('Logo converted for thermal billing! 🖨️');
    } catch (err) {
      console.error('[Thermal Logo Conversion Error]', err);
      toast.error('Failed to convert logo: ' + err.message);
    } finally {
      setConverting(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processLogo(file);
    e.target.value = '';
  };

  const handleAlgorithmChange = (newAlgo) => {
    setAlgorithm(newAlgo);
    if (currentLogoUrl || currentThermalLogo) {
      processLogo(currentLogoUrl || currentThermalLogo, { algorithm: newAlgo });
    }
  };

  const handleThresholdChange = (newThreshold) => {
    setThreshold(newThreshold);
    if (currentLogoUrl || currentThermalLogo) {
      processLogo(currentLogoUrl || currentThermalLogo, { threshold: newThreshold });
    }
  };

  const handleInvertChange = (newInvert) => {
    setInvert(newInvert);
    if (currentLogoUrl || currentThermalLogo) {
      processLogo(currentLogoUrl || currentThermalLogo, { invert: newInvert });
    }
  };

  const handleRemoveLogo = () => {
    updateField('receiptConfig.logoUrl', '');
    updateField('receiptConfig.thermalLogo', '');
    updateField('receiptConfig.escPosLogo', '');
    toast.success('Logo removed from receipt.');
  };

  const handleTestPrint = () => {
    toast.success('Sending test receipt with logo to printer...');
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
      staffName: 'Sam (Cashier)',
      printer: {
        paperSize: paperSize || '80mm',
        mode: 'browser'
      }
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)' }}>
      {/* Configuration Form */}
      <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <h3 className="text-title3" style={{ marginBottom: '2px' }}>🧾 Receipt Customizer</h3>
          <p className="text-secondary text-footnote">
            Upload your logo, convert it into high-contrast 1-bit thermal format, and customize customer receipts.
          </p>
        </div>

        {/* ── Logo Upload & Thermal Converter ─────────────────────────── */}
        <div style={{
          background: 'var(--color-bg-secondary)',
          border: '1.5px solid var(--color-separator)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Image size={18} color="var(--color-primary)" />
              <span style={{ fontSize: '13.5px', fontWeight: 'bold' }}>Restaurant Logo for Thermal Printing</span>
            </div>
            {currentThermalLogo && (
              <span className="badge badge-green" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} /> Thermal Ready
              </span>
            )}
          </div>

          <p className="text-secondary text-caption1" style={{ margin: 0, lineHeight: 1.4 }}>
            Thermal receipt printers print in 1-bit black & white. DineOS automatically dithers and converts your logo so it prints crisply without becoming a dark blob.
          </p>

          {/* Upload Dropzone / Button */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="file"
              id="receipt-logo-file-input"
              accept="image/png, image/jpeg, image/webp, image/svg+xml"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => document.getElementById('receipt-logo-file-input').click()}
              disabled={converting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={14} />
              {converting ? 'Converting for Thermal...' : (currentLogoUrl ? 'Replace Logo' : 'Upload Logo File')}
            </button>

            {currentLogoUrl && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleRemoveLogo}
                style={{ color: 'var(--color-red)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>

          {/* Logo Previews (Original vs Thermal B&W) */}
          {(currentLogoUrl || currentThermalLogo) && (
            <div style={{
              marginTop: '4px',
              padding: '10px',
              background: '#ffffff',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px'
            }}>
              {/* Original Preview */}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                  Original Upload
                </span>
                <div style={{ height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '4px', padding: '4px' }}>
                  <img
                    src={currentLogoUrl || currentThermalLogo}
                    alt="Original Logo"
                    style={{ maxHeight: '48px', maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>

              {/* Converted Thermal Preview */}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a', display: 'block', marginBottom: '4px' }}>
                  Thermal Print Output (1-Bit)
                </span>
                <div style={{ height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', padding: '4px' }}>
                  <img
                    src={currentThermalLogo || currentLogoUrl}
                    alt="Thermal Logo"
                    style={{ maxHeight: '48px', maxWidth: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Thermal Tuning Controls */}
          {(currentLogoUrl || currentThermalLogo) && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              paddingTop: '6px',
              borderTop: '1px dashed var(--color-separator)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Dither / Threshold Mode:</span>
                <div style={{ display: 'inline-flex', background: 'var(--color-bg)', padding: '2px', borderRadius: '6px', border: '1px solid var(--color-separator)' }}>
                  <button
                    type="button"
                    onClick={() => handleAlgorithmChange('dither')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: algorithm === 'dither' ? 'var(--color-accent)' : 'transparent',
                      color: algorithm === 'dither' ? '#fff' : 'var(--color-label-secondary)'
                    }}
                  >
                    Dithered (Photo/Color)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlgorithmChange('threshold')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: algorithm === 'threshold' ? 'var(--color-accent)' : 'transparent',
                      color: algorithm === 'threshold' ? '#fff' : 'var(--color-label-secondary)'
                    }}
                  >
                    Sharp Threshold
                  </button>
                </div>
              </div>

              {/* Threshold sensitivity slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)', minWidth: '95px' }}>
                  Contrast / Cutoff:
                </span>
                <input
                  type="range"
                  min="40"
                  max="220"
                  value={threshold}
                  onChange={e => handleThresholdChange(Number(e.target.value))}
                  style={{ flex: 1, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '11px', fontWeight: 700, minWidth: '28px', textAlign: 'right' }}>
                  {threshold}
                </span>
              </div>

              {/* Invert toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={invert}
                  onChange={e => handleInvertChange(e.target.checked)}
                />
                <span>Invert Black/White (for white logos on dark background)</span>
              </label>
            </div>
          )}

          {/* Or URL Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', whiteSpace: 'nowrap' }}>Or Logo URL:</span>
            <input
              className="form-input form-input-sm"
              placeholder="https://.../logo.png"
              value={settings?.receiptConfig?.logoUrl || ''}
              onChange={e => {
                const val = e.target.value;
                updateField('receiptConfig.logoUrl', val);
                if (val && (val.startsWith('http') || val.startsWith('data:'))) {
                  processLogo(val);
                }
              }}
              style={{ fontSize: '11px', height: '28px' }}
            />
          </div>
        </div>

        {/* ── Receipt Texts ─────────────────────────── */}
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
              onChange={e => {
                const newSize = e.target.value;
                updateField('receiptConfig.paperSize', newSize);
                if (currentLogoUrl) {
                  processLogo(currentLogoUrl, { maxWidth: newSize === '58mm' ? 256 : 384 });
                }
              }}
            >
              <option value="80mm">3-inch (80mm) Standard Thermal</option>
              <option value="58mm">2-inch (58mm) Compact Thermal</option>
              <option value="a4">A4 Full Sheet (Tax Invoice)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Preview Mode</label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPreviewThermalMode(!previewThermalMode)}
              style={{ height: '36px', width: '100%', fontSize: '12px' }}
            >
              {previewThermalMode ? '🖨️ Thermal 1-Bit View' : '🎨 Original Color View'}
            </button>
          </div>
        </div>

        {/* Elements Checkboxes */}
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
            className="btn btn-primary"
            onClick={handleTestPrint}
            style={{ width: '100%', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' }}
          >
            <Printer size={16} /> Print Test Thermal Receipt with Logo
          </button>
        </div>
      </div>

      {/* Live Visual Mockup (Thermal or A4 Tax Invoice) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-label-secondary)', fontSize: '12px', fontWeight: 600 }}>
          <Eye size={14} /> Live {paperSize === 'a4' ? 'A4 Tax Invoice' : 'Thermal Receipt'} Mockup ({paperSize === '58mm' ? '2" 58mm' : paperSize === 'a4' ? 'A4 Normal' : '3" 80mm'})
        </div>

        {paperSize === 'a4' ? (
          /* A4 Tax Invoice Container */
          <div style={{
            width: '380px',
            background: '#ffffff',
            color: '#1f2937',
            padding: '24px 20px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            borderRadius: '4px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '11px',
            lineHeight: '1.35',
            borderTop: '4px solid #111827',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            transition: 'all 0.2s ease'
          }}>
            {/* A4 Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #e5e7eb', paddingBottom: '10px' }}>
              <div>
                {(currentThermalLogo || currentLogoUrl) && (
                  <img
                    src={previewThermalMode ? (currentThermalLogo || currentLogoUrl) : currentLogoUrl}
                    alt="Logo"
                    style={{ maxHeight: '38px', maxWidth: '130px', objectFit: 'contain', marginBottom: '4px', display: 'block' }}
                  />
                )}
                <div style={{ fontWeight: '800', fontSize: '14px', color: '#111827' }}>{settings?.name || 'MY AWESOME STORE'}</div>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>{settings?.address || '123 Market St, Downtown'}</div>
                {settings?.phone && <div style={{ fontSize: '10px', color: '#6b7280' }}>Tel: {settings.phone}</div>}
                {settings?.gstin && <div style={{ fontSize: '9.5px', color: '#0369a1', fontWeight: 'bold', marginTop: '2px' }}>GSTIN: {settings.gstin}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ background: '#111827', color: '#fff', padding: '2px 8px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                  TAX INVOICE
                </span>
                <div style={{ fontSize: '9.5px', color: '#4b5563', marginTop: '6px' }}>
                  <div><strong>Inv:</strong> #INV-4821</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  {showCashier && <div><strong>Staff:</strong> Sam</div>}
                </div>
              </div>
            </div>

            {/* Billed To Box */}
            <div style={{ background: '#f9fafb', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <div><strong>Billed To:</strong> Walk-in Guest (Table T-04)</div>
              <div style={{ color: '#047857', fontWeight: 'bold' }}>PAID - CASH</div>
            </div>

            {/* Itemized Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', borderBottom: '1.5px solid #d1d5db', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>#</th>
                  <th style={{ padding: '4px 6px' }}>Item Description</th>
                  <th style={{ padding: '4px 6px', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Rate</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '5px 6px' }}>1</td>
                  <td style={{ padding: '5px 6px', fontWeight: '500' }}>Special Filter Coffee</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>2</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right' }}>{formatCurrency(90, currency)}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(180, currency)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '5px 6px' }}>2</td>
                  <td style={{ padding: '5px 6px', fontWeight: '500' }}>Artisan Croissant</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>1</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right' }}>{formatCurrency(170, currency)}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(170, currency)}</td>
                </tr>
              </tbody>
            </table>

            {/* Totals Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
              <div style={{ width: '55%', fontSize: '9.5px', color: '#6b7280' }}>
                <div style={{ fontWeight: 'bold', color: '#374151' }}>Terms & Notes:</div>
                <div>{headerMessage || 'Thank you for your visit!'}</div>
                {footerMessage && <div style={{ marginTop: '2px', whiteSpace: 'pre-line' }}>{footerMessage}</div>}
              </div>
              <div style={{ width: '42%', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4b5563' }}>Subtotal:</span>
                  <span>{formatCurrency(350, currency)}</span>
                </div>
                {showTaxBreakdown && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
                    <span>GST (5%):</span>
                    <span>{formatCurrency(17.5, currency)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800', fontSize: '12px', borderTop: '1.5px solid #111827', paddingTop: '4px', marginTop: '2px' }}>
                  <span>Grand Total:</span>
                  <span>{formatCurrency(367.5, currency)}</span>
                </div>
              </div>
            </div>

            {/* Signatory Box */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #f3f4f6', paddingTop: '10px', fontSize: '9px', color: '#6b7280' }}>
              <div>Computer Generated Tax Invoice</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderTop: '1px dashed #9ca3af', width: '90px', paddingTop: '2px' }}>Auth Signatory</div>
              </div>
            </div>
          </div>
        ) : (
        /* Paper Container */
        <div style={{
          width: paperSize === '58mm' ? '260px' : '330px',
          background: '#ffffff',
          color: '#111827',
          padding: '24px 20px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          borderRadius: '4px',
          fontFamily: '"Courier Prime", Courier, monospace',
          fontSize: paperSize === '58mm' ? '11px' : '12px',
          lineHeight: '1.35',
          position: 'relative',
          transition: 'all 0.2s ease',
          borderTop: '4px solid #e5e7eb',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #9ca3af', paddingBottom: '12px', marginBottom: '10px' }}>
            {(currentThermalLogo || currentLogoUrl) && (
              <div style={{ marginBottom: '6px' }}>
                <img
                  src={previewThermalMode ? (currentThermalLogo || currentLogoUrl) : currentLogoUrl}
                  alt="Restaurant Logo"
                  style={{
                    maxHeight: '52px',
                    maxWidth: paperSize === '58mm' ? '150px' : '180px',
                    objectFit: 'contain',
                    margin: '0 auto',
                    display: 'block',
                    filter: previewThermalMode ? 'contrast(160%) grayscale(100%)' : 'none',
                    imageRendering: 'pixelated'
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
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
        )}
      </div>
    </div>
  );
}
