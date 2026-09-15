/**
 * Tax computation utility — supports:
 *  - India: CGST + SGST (e.g., 9% + 9% = 18% GST)
 *  - Middle East: VAT flat % (e.g., 5% UAE VAT, 15% KSA VAT)
 *  - None: 0 tax
 *  - Custom flat rate
 *  - Exclusive vs Inclusive tax mode
 */

export function computeTax(subtotal, taxConfig = {}) {
  const { type = 'none', rate = 0, cgst, sgst, mode = 'exclusive' } = taxConfig;
  const isInclusive = mode === 'inclusive';

  switch (type) {
    case 'gst': {
      // India GST — CGST + SGST
      const totalRate = (cgst != null && sgst != null) ? (cgst + sgst) : rate;
      const cgstRate = cgst ?? totalRate / 2;
      const sgstRate = sgst ?? totalRate / 2;

      if (isInclusive) {
        const baseSubtotal = totalRate > 0 ? Math.round((subtotal / (1 + totalRate / 100)) * 100) / 100 : subtotal;
        const taxTotal = Math.round((subtotal - baseSubtotal) * 100) / 100;
        const cgstAmt = Math.round((taxTotal * (cgstRate / (totalRate || 1))) * 100) / 100;
        const sgstAmt = Math.round((taxTotal - cgstAmt) * 100) / 100;
        return {
          type: 'gst',
          mode: 'inclusive',
          baseSubtotal,
          lines: [
            { label: `CGST (${cgstRate}%)`, amount: cgstAmt },
            { label: `SGST (${sgstRate}%)`, amount: sgstAmt },
          ],
          taxTotal,
          total: subtotal,
        };
      }

      const cgstAmt  = subtotal * cgstRate / 100;
      const sgstAmt  = subtotal * sgstRate / 100;
      return {
        type: 'gst',
        mode: 'exclusive',
        baseSubtotal: subtotal,
        lines: [
          { label: `CGST (${cgstRate}%)`, amount: cgstAmt },
          { label: `SGST (${sgstRate}%)`, amount: sgstAmt },
        ],
        taxTotal: cgstAmt + sgstAmt,
        total: subtotal + cgstAmt + sgstAmt,
      };
    }
    case 'vat': {
      if (isInclusive) {
        const baseSubtotal = rate > 0 ? Math.round((subtotal / (1 + rate / 100)) * 100) / 100 : subtotal;
        const vatAmt = Math.round((subtotal - baseSubtotal) * 100) / 100;
        return {
          type: 'vat',
          mode: 'inclusive',
          baseSubtotal,
          lines: [{ label: `VAT (${rate}%)`, amount: vatAmt }],
          taxTotal: vatAmt,
          total: subtotal,
        };
      }
      const vatAmt = subtotal * rate / 100;
      return {
        type: 'vat',
        mode: 'exclusive',
        baseSubtotal: subtotal,
        lines: [{ label: `VAT (${rate}%)`, amount: vatAmt }],
        taxTotal: vatAmt,
        total: subtotal + vatAmt,
      };
    }
    case 'flat': {
      if (isInclusive) {
        const baseSubtotal = rate > 0 ? Math.round((subtotal / (1 + rate / 100)) * 100) / 100 : subtotal;
        const taxAmt = Math.round((subtotal - baseSubtotal) * 100) / 100;
        return {
          type: 'flat',
          mode: 'inclusive',
          baseSubtotal,
          lines: [{ label: `Tax (${rate}%)`, amount: taxAmt }],
          taxTotal: taxAmt,
          total: subtotal,
        };
      }
      const taxAmt = subtotal * rate / 100;
      return {
        type: 'flat',
        mode: 'exclusive',
        baseSubtotal: subtotal,
        lines: [{ label: `Tax (${rate}%)`, amount: taxAmt }],
        taxTotal: taxAmt,
        total: subtotal + taxAmt,
      };
    }
    case 'none':
    default:
      return { type: 'none', lines: [], taxTotal: 0, total: subtotal };
  }
}
