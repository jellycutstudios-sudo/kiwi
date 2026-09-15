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

    const paymentMethod = (order.paymentMethod || 'cash').toLowerCase();
    let partyLedger = 'Cash';
    if (paymentMethod === 'card' || paymentMethod === 'upi') {
      partyLedger = 'Bank Accounts';
    } else if (paymentMethod === 'unpaid' || paymentMethod === 'room') {
      partyLedger = 'Sundry Debtors';
    }

    return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${tallyDate}</DATE>
        <GUID>DINEOS-${order.id || idx}</GUID>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${partyLedger}</PARTYLEDGERNAME>
        <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
        <NARRATION>POS Order #${voucherNumber} - Customer: ${order.customerName || 'Walk-in'} ${gstin ? `[GSTIN: ${gstin}]` : ''}</NARRATION>
        
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
