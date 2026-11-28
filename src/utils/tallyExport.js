/**
 * Tally ERP 9 & TallyPrime Sales Voucher XML Generator
 * Generates valid Tally XML importing sales invoices with standard ledgers:
 * - Party Ledger (Cash / Bank / Sundry Debtors)
 * - Sales Ledger (Sales Account)
 * - Output CGST & Output SGST (or Output IGST / VAT)
 */

export function generateTallyXML(orders, restaurant) {
  const companyName = restaurant?.name || 'Restaurant';
  const gstin = restaurant?.gstin || '';
  
  const vouchersXml = orders.map((order, idx) => {
    const rawDate = order.createdAt?.seconds 
      ? new Date(order.createdAt.seconds * 1000) 
      : new Date(order.createdAt || Date.now());
    
    // Tally requires YYYYMMDD date format
    const yyyy = rawDate.getFullYear();
    const mm = String(rawDate.getMonth() + 1).padStart(2, '0');
    const dd = String(rawDate.getDate()).padStart(2, '0');
    const tallyDate = `${yyyy}${mm}${dd}`;
    const voucherNumber = order.orderNumber || order.token || `INV-${order.id ? order.id.slice(0, 8) : idx + 1}`;
    
    const totalAmount = Number(order.total || 0).toFixed(2);
    const subtotal = Number(order.subtotal || (order.total - (order.taxAmount || order.taxTotal || 0))).toFixed(2);
    const taxTotal = Number(order.taxAmount || order.taxTotal || 0);
    const cgst = (taxTotal / 2).toFixed(2);
    const sgst = (taxTotal / 2).toFixed(2);
    const packagingAmt = Number(order.packagingAmount || 0);
    const roundOffAmt = Number(order.roundOffAmount || 0);
    const buyerGstin = order.customerGstin || order.customer?.gstin || '';

    const paymentMethod = (order.paymentMethod || 'cash').toLowerCase();
    let partyLedger = 'Cash';
    if (paymentMethod === 'card' || paymentMethod === 'upi') {
      partyLedger = 'Bank Accounts';
    } else if (paymentMethod === 'unpaid' || paymentMethod === 'room' || paymentMethod === 'khata') {
      partyLedger = order.customerName ? `${order.customerName} (Sundry Debtors)` : 'Sundry Debtors';
    }

    return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${tallyDate}</DATE>
        <GUID>DINEOS-${order.id || idx}</GUID>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${partyLedger}</PARTYLEDGERNAME>
        ${buyerGstin ? `<PARTYGSTIN>${buyerGstin}</PARTYGSTIN>` : ''}
        <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
        <NARRATION>POS Order #${voucherNumber} - Customer: ${order.customerName || 'Walk-in'} ${buyerGstin ? `[Buyer GSTIN: ${buyerGstin}] ` : ''}${gstin ? `[GSTIN: ${gstin}]` : ''}</NARRATION>
        
        <!-- Debit Party (Total Received) -->
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${partyLedger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>-${totalAmount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>

        <!-- Credit Sales (Subtotal) -->
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Sales Account</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${subtotal}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>

        ${taxTotal > 0 ? `
        <!-- Credit Output CGST -->
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Output CGST</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${cgst}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>

        <!-- Credit Output SGST -->
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Output SGST</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${sgst}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        ` : ''}

        ${(order.serviceChargeAmount || 0) > 0 ? `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Service Charge</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${Number(order.serviceChargeAmount).toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        ` : ''}

        ${packagingAmt > 0 ? `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Packaging Charges</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${packagingAmt.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        ` : ''}

        ${Math.abs(roundOffAmt) > 0 ? `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Round Off</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${roundOffAmt.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        ` : ''}

        ${(order.tipAmount || 0) > 0 ? `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Tips Collected</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${Number(order.tipAmount).toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        ` : ''}
      </VOUCHER>
    </TALLYMESSAGE>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ${vouchersXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

export function downloadTallyXML(orders, restaurant, filename = 'tally_sales_export.xml') {
  const xmlContent = generateTallyXML(orders, restaurant);
  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates CA-ready Indian GSTR-1 CSV summary (Slab-wise, B2B vs B2CS, SAC 996331, Document Continuity)
 */
export function generateGstr1CSV(orders = [], restaurant = {}) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const activeOrders = orders.filter(o => !['cancelled', 'void'].includes(String(o.status || '').toLowerCase()) && !o.isComplimentary);
  const cancelledCount = orders.filter(o => ['cancelled', 'void'].includes(String(o.status || '').toLowerCase())).length;

  const slabs = {};
  const b2bRows = [];
  let b2csTaxable = 0;
  let b2csTax = 0;
  let b2csTotal = 0;

  activeOrders.forEach((o, idx) => {
    const subtotal = Number(o.subtotal || 0);
    const disc = Number(o.discountAmount || 0) + Number(o.pointsDiscount || 0);
    const packaging = Number(o.packagingAmount || 0);
    const taxTotal = Number(o.taxTotal ?? o.taxAmount ?? o.taxInfo?.taxTotal ?? 0);
    const taxable = Math.max(0, Math.round(((o.taxInfo?.baseSubtotal ?? (subtotal - disc)) + (packaging > 0 ? packaging : 0)) * 100) / 100);
    const total = Number(o.total || 0);
    const roundOff = Number(o.roundOffAmount || 0);
    const effectiveRate = taxable > 0 ? Math.round((taxTotal / taxable) * 100) : 0;
    const rateKey = effectiveRate === 0 ? '0% (Exempt/Zero)' : `${effectiveRate}% GST`;

    if (!slabs[rateKey]) {
      slabs[rateKey] = { orders: 0, taxable: 0, cgst: 0, sgst: 0, packaging: 0, roundOff: 0, total: 0 };
    }
    slabs[rateKey].orders += 1;
    slabs[rateKey].taxable += taxable;
    slabs[rateKey].cgst += taxTotal / 2;
    slabs[rateKey].sgst += taxTotal / 2;
    slabs[rateKey].packaging += packaging;
    slabs[rateKey].roundOff += roundOff;
    slabs[rateKey].total += total;

    const buyerGstin = (o.customerGstin || o.customer?.gstin || '').trim();
    const invNo = o.orderNumber || o.token || `INV-${o.id ? o.id.slice(-8).toUpperCase() : idx + 1}`;
    const rawDate = o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt || Date.now());
    const dateStr = rawDate.toISOString().slice(0, 10);

    if (buyerGstin) {
      b2bRows.push([invNo, dateStr, buyerGstin, o.customerName || 'Corporate', '996331', taxable.toFixed(2), (taxTotal / 2).toFixed(2), (taxTotal / 2).toFixed(2), total.toFixed(2)]);
    } else {
      b2csTaxable += taxable;
      b2csTax += taxTotal;
      b2csTotal += total;
    }
  });

  const lines = [];
  lines.push([esc(`GSTR-1 Summary - ${restaurant?.name || 'Restaurant'}`), esc(`Supplier GSTIN: ${restaurant?.gstin || 'N/A'}`)].join(','));
  lines.push('');
  lines.push('SECTION 1: SLAB-WISE GST SUMMARY (SAC 996331)');
  lines.push(['GST Slab', 'Orders', 'Taxable Value', 'CGST', 'SGST', 'Packaging', 'Round Off', 'Invoice Value'].map(esc).join(','));
  Object.entries(slabs).forEach(([slab, s]) => {
    lines.push([
      slab,
      s.orders,
      s.taxable.toFixed(2),
      s.cgst.toFixed(2),
      s.sgst.toFixed(2),
      s.packaging.toFixed(2),
      s.roundOff.toFixed(2),
      s.total.toFixed(2)
    ].map(esc).join(','));
  });

  lines.push('');
  lines.push('SECTION 2: B2B INVOICES (WITH BUYER GSTIN)');
  lines.push(['Invoice No', 'Date', 'Buyer GSTIN', 'Party Name', 'SAC/HSN', 'Taxable Value', 'CGST', 'SGST', 'Invoice Value'].map(esc).join(','));
  if (b2bRows.length > 0) {
    b2bRows.forEach(r => lines.push(r.map(esc).join(',')));
  } else {
    lines.push(esc('No B2B invoices with buyer GSTIN in selected period'));
  }

  lines.push('');
  lines.push('SECTION 3: B2CS (RETAIL WALK-IN CONSOLIDATED)');
  lines.push(['SAC/HSN', 'Orders', 'Taxable Value', 'CGST', 'SGST', 'Total Value'].map(esc).join(','));
  lines.push(['996331', activeOrders.length - b2bRows.length, b2csTaxable.toFixed(2), (b2csTax / 2).toFixed(2), (b2csTax / 2).toFixed(2), b2csTotal.toFixed(2)].map(esc).join(','));

  lines.push('');
  lines.push('SECTION 4: DOCUMENT CONTINUITY');
  lines.push(['Total Orders in Range', 'Taxable/Active Invoices', 'Cancelled / Voided'].map(esc).join(','));
  lines.push([orders.length, activeOrders.length, cancelledCount].map(esc).join(','));

  return lines.join('\n');
}

export function downloadGstr1CSV(orders, restaurant, filename = 'gstr1_summary.csv') {
  const csv = generateGstr1CSV(orders, restaurant);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
