/**
 * Universal Inherited Tax Engine (Shopify / Stripe architecture)
 * Supports:
 *  1. 3-Tier Fallback Inheritance: Item Override -> Category Override -> Store taxConfig Default
 *  2. 1-Pass Universal Calculation with Penny-Accurate Rounding
 *  3. India GST (CGST + SGST), Middle East / UK VAT, Flat Tax, or Tax-Exempt / Zero-Rated (0%)
 *  4. Tax Inclusive vs Exclusive per rate or global
 *  5. Contextual Service-Type Tax (e.g. Dine-In vs Takeaway vs Delivery)
 *  6. 100% backward compatible with legacy computeTax(subtotal, taxConfig)
 */

/**
 * Resolves the effective tax rate, type, and mode for a given item using 3-tier inheritance:
 * 1. Item Level Override
 * 2. Category Level Override
 * 3. Contextual Rule (e.g. reduced rate for takeaway in UK/Germany)
 * 4. Store Default Fallback
 */
export function resolveItemTaxRule(item = {}, category = {}, taxConfig = {}, orderType = 'dine-in') {
  // 1. Item Level Override
  if (item?.taxRate != null && item.taxRate !== '') {
    const rate = Number(item.taxRate);
    return {
      rate,
      type: item.taxType || taxConfig?.type || 'vat',
      mode: item.taxMode || taxConfig?.mode || 'exclusive',
      label: item.taxLabel || (rate === 0 ? 'Zero-Rated (0%)' : (taxConfig?.type === 'vat' ? `VAT (${rate}%)` : `Tax (${rate}%)`))
    };
  }

  // 2. Category Level Override
  if (category?.taxRate != null && category.taxRate !== '') {
    const rate = Number(category.taxRate);
    return {
      rate,
      type: category.taxType || taxConfig?.type || 'vat',
      mode: category.taxMode || taxConfig?.mode || 'exclusive',
      label: category.taxLabel || (rate === 0 ? 'Zero-Rated (0%)' : (taxConfig?.type === 'vat' ? `VAT (${rate}%)` : `Tax (${rate}%)`))
    };
  }

  // 3. Service-mode contextual rule (e.g. reduced rate for takeaway in UK/Germany)
  if (orderType === 'takeaway' && taxConfig?.takeawayRate != null && taxConfig.takeawayRate !== '') {
    const takeawayRate = Number(taxConfig.takeawayRate);
    return {
      rate: takeawayRate,
      type: taxConfig.type || 'vat',
      mode: taxConfig.mode || 'exclusive',
      label: taxConfig.takeawayLabel || (taxConfig.type === 'vat' ? `VAT (${takeawayRate}%)` : `Tax (${takeawayRate}%)`)
    };
  }

  // 4. Store Default Fallback
  const defaultRate = taxConfig?.type === 'gst'
    ? ((taxConfig?.cgst != null && taxConfig?.sgst != null) ? (Number(taxConfig.cgst) + Number(taxConfig.sgst)) : (Number(taxConfig?.rate) || 0))
    : (Number(taxConfig?.rate) || 0);

  return {
    rate: Number(defaultRate) || 0,
    type: taxConfig?.type || 'none',
    mode: taxConfig?.mode || 'exclusive',
    cgst: taxConfig?.cgst != null ? Number(taxConfig.cgst) : undefined,
    sgst: taxConfig?.sgst != null ? Number(taxConfig.sgst) : undefined,
    label: taxConfig?.type === 'vat' ? `VAT (${defaultRate}%)` : `Tax (${defaultRate}%)`
  };
}

/**
 * 1-Pass Universal Line-Item Tax Calculation
 */
export function computeOrderTaxes(items = [], categoriesMap = {}, taxConfig = {}, options = {}) {
  const {
    discountAmount = 0,
    pointsDiscount = 0,
    serviceChargeAmount = 0,
    serviceChargeTaxable = false,
    orderType = 'dine-in'
  } = options;

  if (!items || items.length === 0) {
    return {
      type: taxConfig?.type || 'none',
      mode: taxConfig?.mode || 'exclusive',
      baseSubtotal: 0,
      lines: [],
      taxTotal: 0,
      total: 0
    };
  }

  const taxLinesMap = {};
  let grossSubtotal = 0;
  let computedBaseSubtotal = 0;
  let totalCalculatedTax = 0;

  // Total discounts to distribute proportionally across line items
  const totalItemSubtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity ?? i.qty) || 1), 0);
  const totalNetDiscount = Math.min(totalItemSubtotal, (Number(discountAmount) || 0) + (Number(pointsDiscount) || 0));
  const discountRatio = totalItemSubtotal > 0 ? (1 - totalNetDiscount / totalItemSubtotal) : 1;

  for (const item of items) {
    const qty = Number(item.quantity ?? item.qty) || 1;
    const price = Number(item.price) || 0;
    const rawLineTotal = Math.round(price * qty * 100) / 100;
    grossSubtotal += rawLineTotal;

    // Apply proportional discount to line item base
    const lineNetTotal = Math.round(rawLineTotal * discountRatio * 100) / 100;

    // Resolve category (direct categoryId or scan categoriesMap)
    let category = (item.categoryId && categoriesMap?.[item.categoryId]) ? categoriesMap[item.categoryId] : null;
    if (!category && categoriesMap) {
      const targetId = item.menuItemId || item.id;
      for (const cat of Object.values(categoriesMap)) {
        if (Array.isArray(cat?.items) && cat.items.some(i => i.id === targetId || i.id === item.id)) {
          category = cat;
          break;
        }
      }
    }
    category = category || {};

    const itemTaxRule = resolveItemTaxRule(item, category, taxConfig, orderType);

    if (itemTaxRule.type === 'none' || itemTaxRule.rate === 0) {
      computedBaseSubtotal += lineNetTotal;
      if (itemTaxRule.rate === 0 && (item.taxRate === 0 || category.taxRate === 0)) {
        const zeroLabel = itemTaxRule.label || 'Zero-Rated (0%)';
        if (!taxLinesMap[zeroLabel]) {
          taxLinesMap[zeroLabel] = { label: zeroLabel, amount: 0 };
        }
      }
      continue;
    }

    const rate = itemTaxRule.rate;
    const isInclusive = itemTaxRule.mode === 'inclusive';

    if (itemTaxRule.type === 'gst') {
      const cgstRate = itemTaxRule.cgst ?? (rate / 2);
      const sgstRate = itemTaxRule.sgst ?? (rate / 2);
      const cgstLabel = `CGST (${cgstRate}%)`;
      const sgstLabel = `SGST (${sgstRate}%)`;

      if (isInclusive) {
        const base = Math.round((lineNetTotal / (1 + rate / 100)) * 100) / 100;
        const lineTax = Math.round((lineNetTotal - base) * 100) / 100;
        const cgstAmt = Math.round((lineTax * (cgstRate / (rate || 1))) * 100) / 100;
        const sgstAmt = Math.round((lineTax - cgstAmt) * 100) / 100;

        computedBaseSubtotal += base;
        totalCalculatedTax += lineTax;

        taxLinesMap[cgstLabel] = { label: cgstLabel, amount: (taxLinesMap[cgstLabel]?.amount || 0) + cgstAmt };
        taxLinesMap[sgstLabel] = { label: sgstLabel, amount: (taxLinesMap[sgstLabel]?.amount || 0) + sgstAmt };
      } else {
        const cgstAmt = Math.round(((lineNetTotal * cgstRate) / 100) * 100) / 100;
        const sgstAmt = Math.round(((lineNetTotal * sgstRate) / 100) * 100) / 100;
        const lineTax = Math.round((cgstAmt + sgstAmt) * 100) / 100;

        computedBaseSubtotal += lineNetTotal;
        totalCalculatedTax += lineTax;

        taxLinesMap[cgstLabel] = { label: cgstLabel, amount: (taxLinesMap[cgstLabel]?.amount || 0) + cgstAmt };
        taxLinesMap[sgstLabel] = { label: sgstLabel, amount: (taxLinesMap[sgstLabel]?.amount || 0) + sgstAmt };
      }
    } else {
      // VAT / Flat rate
      const taxLabel = itemTaxRule.label;
      if (isInclusive) {
        const base = Math.round((lineNetTotal / (1 + rate / 100)) * 100) / 100;
        const lineTax = Math.round((lineNetTotal - base) * 100) / 100;

        computedBaseSubtotal += base;
        totalCalculatedTax += lineTax;

        taxLinesMap[taxLabel] = { label: taxLabel, amount: (taxLinesMap[taxLabel]?.amount || 0) + lineTax };
      } else {
        const lineTax = Math.round(((lineNetTotal * rate) / 100) * 100) / 100;

        computedBaseSubtotal += lineNetTotal;
        totalCalculatedTax += lineTax;

        taxLinesMap[taxLabel] = { label: taxLabel, amount: (taxLinesMap[taxLabel]?.amount || 0) + lineTax };
      }
    }
  }

  // Service charge tax calculation if taxable
  if (serviceChargeTaxable && serviceChargeAmount > 0) {
    const scDefaultRate = taxConfig?.type === 'gst' ? ((taxConfig.cgst ?? 9) + (taxConfig.sgst ?? 9)) : (taxConfig?.rate ?? 0);
    if (scDefaultRate > 0) {
      const scTax = Math.round(((serviceChargeAmount * scDefaultRate) / 100) * 100) / 100;
      totalCalculatedTax += scTax;
      const scLabel = `Tax on Service Charge (${scDefaultRate}%)`;
      taxLinesMap[scLabel] = { label: scLabel, amount: scTax };
    }
  }

  // Format lines array with rounding
  const lines = Object.values(taxLinesMap).map(l => ({
    label: l.label,
    amount: Math.round(l.amount * 100) / 100
  }));

  const finalTaxTotal = Math.round(totalCalculatedTax * 100) / 100;
  const isAllInclusive = taxConfig?.mode === 'inclusive';

  return {
    type: taxConfig?.type || 'none',
    mode: taxConfig?.mode || 'exclusive',
    baseSubtotal: Math.round(computedBaseSubtotal * 100) / 100,
    lines,
    taxTotal: finalTaxTotal,
    total: isAllInclusive ? Math.round((grossSubtotal - totalNetDiscount) * 100) / 100 : Math.round((computedBaseSubtotal + finalTaxTotal) * 100) / 100
  };
}

/**
 * Universal computeTax entrypoint
 * Backward compatible: accepts numeric subtotal or items array / options.items
 */
export function computeTax(subtotal, taxConfig = {}, options = {}) {
  // If called with items array directly or via options
  if (Array.isArray(subtotal)) {
    return computeOrderTaxes(subtotal, options.categoriesMap || {}, taxConfig, options);
  }
  if (options && options.items && Array.isArray(options.items) && options.items.length > 0) {
    return computeOrderTaxes(options.items, options.categoriesMap || {}, taxConfig, {
      ...options,
      subtotal
    });
  }

  // Legacy single-subtotal flat formula (100% backward compatible)
  const numSubtotal = Number(subtotal) || 0;
  const { type = 'none', rate = 0, cgst, sgst, mode = 'exclusive' } = taxConfig;
  const isInclusive = mode === 'inclusive';

  switch (type) {
    case 'gst': {
      // India GST — CGST + SGST
      const totalRate = (cgst != null && sgst != null) ? (Number(cgst) + Number(sgst)) : Number(rate);
      const cgstRate = cgst != null ? Number(cgst) : totalRate / 2;
      const sgstRate = sgst != null ? Number(sgst) : totalRate / 2;

      if (isInclusive) {
        const baseSubtotal = totalRate > 0 ? Math.round((numSubtotal / (1 + totalRate / 100)) * 100) / 100 : numSubtotal;
        const taxTotal = Math.round((numSubtotal - baseSubtotal) * 100) / 100;
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
          total: numSubtotal,
        };
      }

      const cgstAmt  = Math.round((numSubtotal * cgstRate / 100) * 100) / 100;
      const sgstAmt  = Math.round((numSubtotal * sgstRate / 100) * 100) / 100;
      const taxTotal = Math.round((cgstAmt + sgstAmt) * 100) / 100;
      return {
        type: 'gst',
        mode: 'exclusive',
        baseSubtotal: numSubtotal,
        lines: [
          { label: `CGST (${cgstRate}%)`, amount: cgstAmt },
          { label: `SGST (${sgstRate}%)`, amount: sgstAmt },
        ],
        taxTotal,
        total: Math.round((numSubtotal + taxTotal) * 100) / 100,
      };
    }
    case 'vat': {
      const numRate = Number(rate) || 0;
      if (isInclusive) {
        const baseSubtotal = numRate > 0 ? Math.round((numSubtotal / (1 + numRate / 100)) * 100) / 100 : numSubtotal;
        const vatAmt = Math.round((numSubtotal - baseSubtotal) * 100) / 100;
        return {
          type: 'vat',
          mode: 'inclusive',
          baseSubtotal,
          lines: [{ label: `VAT (${numRate}%)`, amount: vatAmt }],
          taxTotal: vatAmt,
          total: numSubtotal,
        };
      }
      const vatAmt = Math.round((numSubtotal * numRate / 100) * 100) / 100;
      return {
        type: 'vat',
        mode: 'exclusive',
        baseSubtotal: numSubtotal,
        lines: [{ label: `VAT (${numRate}%)`, amount: vatAmt }],
        taxTotal: vatAmt,
        total: Math.round((numSubtotal + vatAmt) * 100) / 100,
      };
    }
    case 'flat': {
      const numRate = Number(rate) || 0;
      if (isInclusive) {
        const baseSubtotal = numRate > 0 ? Math.round((numSubtotal / (1 + numRate / 100)) * 100) / 100 : numSubtotal;
        const taxAmt = Math.round((numSubtotal - baseSubtotal) * 100) / 100;
        return {
          type: 'flat',
          mode: 'inclusive',
          baseSubtotal,
          lines: [{ label: `Tax (${numRate}%)`, amount: taxAmt }],
          taxTotal: taxAmt,
          total: numSubtotal,
        };
      }
      const taxAmt = Math.round((numSubtotal * numRate / 100) * 100) / 100;
      return {
        type: 'flat',
        mode: 'exclusive',
        baseSubtotal: numSubtotal,
        lines: [{ label: `Tax (${numRate}%)`, amount: taxAmt }],
        taxTotal: taxAmt,
        total: Math.round((numSubtotal + taxAmt) * 100) / 100,
      };
    }
    case 'none':
    default:
      return { type: 'none', lines: [], taxTotal: 0, total: numSubtotal };
  }
}
