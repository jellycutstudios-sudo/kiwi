import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Modal Close Button Touch UX & Ergonomics', () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  const tableMapJsx = fs.readFileSync(path.resolve(__dirname, '../routes/TableMap.jsx'), 'utf-8');
  const paymentModalJsx = fs.readFileSync(path.resolve(__dirname, '../components/pos/PaymentModal.jsx'), 'utf-8');
  const tableSelectModalJsx = fs.readFileSync(path.resolve(__dirname, '../components/pos/TableSelectModal.jsx'), 'utf-8');

  it('defines .modal-close-touch with standard touch target >= 42px and mobile >= 44px', () => {
    expect(indexCss).toContain('.modal-close-touch');
    expect(indexCss).toContain('width: 42px');
    expect(indexCss).toContain('height: 42px');
    expect(indexCss).toContain('min-width: 42px');
    expect(indexCss).toContain('min-height: 42px');
    expect(indexCss).toContain('touch-action: manipulation');
    expect(indexCss).toContain('-webkit-tap-highlight-color: transparent');

    // Mobile media query for Apple HIG 44px touch target
    expect(indexCss).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.modal-close-touch[\s\S]*?width:\s*44px/);
    expect(indexCss).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.modal-close-touch[\s\S]*?min-height:\s*44px/);
  });

  it('provides dark mode contrast and tactile feedback for .modal-close-touch', () => {
    expect(indexCss).toContain('[data-theme="dark"] .modal-close-touch');
    expect(indexCss).toContain('.modal-close-touch:active');
    expect(indexCss).toContain('transform: scale(0.92)');
  });

  it('uses modal-close-touch on TableMap table order detail modal with 20px icon', () => {
    expect(tableMapJsx).toMatch(/<button[^>]*className="modal-close-touch"[^>]*onClick=\{\(\)\s*=>\s*setSelected\(null\)\}[^>]*title="Close table details"/);
    expect(tableMapJsx).toContain('<X size={20} strokeWidth={2.4} />');
  });

  it('uses modal-close-touch on TableMap secondary modals (Transfer, Merge, UPI, Floors)', () => {
    expect(tableMapJsx).toMatch(/<button[^>]*className="modal-close-touch"[^>]*onClick=\{\(\)\s*=>\s*setShowTransfer\(false\)\}/);
    expect(tableMapJsx).toMatch(/<button[^>]*className="modal-close-touch"[^>]*onClick=\{\(\)\s*=>\s*setShowMerge\(false\)\}/);
    expect(tableMapJsx).toMatch(/<button[^>]*className="modal-close-touch"[^>]*onClick=\{clearUpiSettle\}/);
    expect(tableMapJsx).toMatch(/<button[^>]*className="modal-close-touch"[^>]*onClick=\{\(\)\s*=>\s*setShowAddFloorModal\(false\)\}/);
    expect(tableMapJsx).toMatch(/<button[^>]*className="modal-close-touch"[^>]*onClick=\{\(\)\s*=>\s*setShowBulkModal\(false\)\}/);
  });

  it('applies touch-friendly close button to PaymentModal and TableSelectModal', () => {
    expect(paymentModalJsx).toContain('className="modal-close-touch"');
    expect(paymentModalJsx).toContain('id="payment-modal-close"');
    expect(paymentModalJsx).toContain('<X size={20} strokeWidth={2.4} />');

    expect(tableSelectModalJsx).toContain('className="modal-close-touch table-select-close-btn"');
    expect(tableSelectModalJsx).toContain('id="table-modal-close"');
    expect(tableSelectModalJsx).toContain('<X size={20} strokeWidth={2.4} />');
  });
});
