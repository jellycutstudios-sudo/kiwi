/**
 * Tax computation utility — supports:
 *  - India: CGST + SGST (e.g., 9% + 9% = 18% GST)
 *  - Middle East: VAT flat % (e.g., 5% UAE VAT, 15% KSA VAT)
 *  - None: 0 tax
 *  - Custom flat rate
 */

export function computeTax(subtotal, taxConfig = {}) {
  const { type = 'none', rate = 0, cgst, sgst } = taxConfig;

  switch (type) {
    case 'gst': {
      // India GST — CGST + SGST
      const cgstRate = cgst ?? rate / 2;
      const sgstRate = sgst ?? rate / 2;
      const cgstAmt  = subtotal * cgstRate / 100;
      const sgstAmt  = subtotal * sgstRate / 100;
      return {
        type: 'gst',
        lines: [
          { label: `CGST (${cgstRate}%)`, amount: cgstAmt },
          { label: `SGST (${sgstRate}%)`, amount: sgstAmt },
        ],
        taxTotal: cgstAmt + sgstAmt,
        total: subtotal + cgstAmt + sgstAmt,
      };
    }
    case 'vat': {
      // Middle East VAT
      const vatAmt = subtotal * rate / 100;
      return {
        type: 'vat',
        lines: [{ label: `VAT (${rate}%)`, amount: vatAmt }],
        taxTotal: vatAmt,
        total: subtotal + vatAmt,
      };
    }
    case 'flat': {
      const taxAmt = subtotal * rate / 100;
      return {
        type: 'flat',
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
