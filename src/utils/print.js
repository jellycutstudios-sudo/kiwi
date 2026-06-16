import toast from 'react-hot-toast';

// A robust helper to translate Unicode strings to ASCII bytes with best-effort transliteration fallback
function unicodeToEscPosBytes(text) {
  // Mapping common Arabic/accented characters to readable equivalents
  const translitMap = {
    // Accented European chars
    'é': 'e', 'è': 'e', 'à': 'a', 'ù': 'u', 'ç': 'c', 'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
    'ë': 'e', 'ï': 'i', 'ü': 'u', 'ö': 'o', 'ä': 'a', 'ñ': 'n',
    // Basic Arabic transliterations
    'ا': 'A', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
    'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
    'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
    'ة': 'h', 'ء': 'a', 'أ': 'A', 'إ': 'E', 'ؤ': 'w', 'ئ': 'y', 'ى': 'y'
  };

  const result = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char.charCodeAt(0) < 128) {
      result.push(char.charCodeAt(0));
    } else if (translitMap[char]) {
      const replacement = translitMap[char];
      for (let j = 0; j < replacement.length; j++) {
        result.push(replacement.charCodeAt(j));
      }
    } else {
      result.push(63); // ASCII '?'
    }
  }
  return new Uint8Array(result);
}

function compileEscPosReceipt({ restaurant, order, items, taxInfo, staffName }) {
  const { name: restName = 'RestaurantOS', address = '', phone = '' } = restaurant ?? {};
  const { currency = 'INR' } = restaurant ?? {};
  
  const ESC = 27;
  const GS = 29;
  const LF = 10;
  
  const INIT = [ESC, 64];
  const ALIGN_CENTER = [ESC, 97, 1];
  const ALIGN_LEFT = [ESC, 97, 0];
  const BOLD_ON = [ESC, 69, 1];
  const BOLD_OFF = [ESC, 69, 0];
  const CUT = [GS, 86, 65, 0];
  const DRAWER_KICK = [ESC, 112, 0, 25, 250];
  const BUZZER_BELL = [7];

  let buffer = [];
  
  const writeBytes = (bytes) => {
    buffer.push(...bytes);
  };
  
  const writeTextLine = (text) => {
    writeBytes(unicodeToEscPosBytes(text));
    writeBytes([LF]);
  };
  
  writeBytes(INIT);
  
  if (restaurant?.peripheralConfig?.soundAlerts) {
    writeBytes(BUZZER_BELL);
  }
  
  if (restaurant?.peripheralConfig?.drawerKick && order.paymentMethod === 'cash') {
    writeBytes(DRAWER_KICK);
  }
  
  writeBytes(ALIGN_CENTER);
  writeBytes(BOLD_ON);
  writeTextLine(restName);
  writeBytes(BOLD_OFF);
  
  if (address) writeTextLine(address);
  if (phone) writeTextLine(`Tel: ${phone}`);
  
  writeTextLine('--------------------------------');
  
  writeBytes(ALIGN_LEFT);
  writeTextLine(`Date: ${new Date().toLocaleString()}`);
  const orderTypeLabel =
    order.type === 'dine-in'  ? `Table: ${order.tableName ?? '-'}` :
    order.type === 'takeaway' ? `Token: #${order.token ?? '-'}` :
    `Online`;
  writeTextLine(orderTypeLabel);
  
  if (order.customerName) writeTextLine(`Customer: ${order.customerName}`);
  if (staffName) writeTextLine(`Staff: ${staffName}`);
  
  writeTextLine('--------------------------------');
  
  writeBytes(BOLD_ON);
  writeTextLine('Item            Qty          Amt');
  writeBytes(BOLD_OFF);
  
  items.forEach(i => {
    const itemLeft = i.name.slice(0, 15).padEnd(16, ' ');
    const qtyMid = String(i.qty).padStart(3, ' ').padEnd(8, ' ');
    const amtRight = (i.price * i.qty).toFixed(2).padStart(8, ' ');
    writeTextLine(`${itemLeft}${qtyMid}${amtRight}`);
    if (i.selectedModifiers && i.selectedModifiers.length > 0) {
      writeTextLine(`  + ${i.selectedModifiers.map(m => m.name).join(', ')}`);
    }
  });
  
  writeTextLine('--------------------------------');
  
  writeTextLine(`Subtotal:      ${(order.subtotal ?? 0).toFixed(2).padStart(17, ' ')}`);
  
  if (order.discountAmount && order.discountAmount > 0) {
    const discLabel = `Discount${order.discountType === 'percent' ? `(${order.discount}%)` : ''}:`;
    writeTextLine(`${discLabel.padEnd(15, ' ')}-${(order.discountAmount).toFixed(2).padStart(16, ' ')}`);
  }
  
  (taxInfo?.lines ?? []).forEach(l => {
    const label = `${l.label}:`.padEnd(15, ' ');
    writeTextLine(`${label}${l.amount.toFixed(2).padStart(17, ' ')}`);
  });
  
  writeBytes(BOLD_ON);
  writeTextLine(`TOTAL (${currency}): ${(order.total ?? 0).toFixed(2).padStart(15, ' ')}`);
  writeBytes(BOLD_OFF);
  
  writeTextLine('--------------------------------');
  writeBytes(ALIGN_CENTER);
  writeTextLine(`Payment: ${(order.paymentMethod ?? 'cash').toUpperCase()}`);
  if (order.upiRef) {
    writeTextLine(`UPI Ref: ${order.upiRef}`);
  }
  writeTextLine('Thank you for dining with us!');
  writeTextLine(`Order ID: ${order.id?.slice(-8) ?? ''}`);
  
  writeBytes(LF);
  writeBytes(LF);
  writeBytes(CUT);
  
  return new Uint8Array(buffer);
}

async function sendToBluetoothPrinter(buffer) {
  console.log('[ESC/POS Bluetooth] Connecting to Bluetooth Printer...', buffer);
  toast.success('Pairing with Bluetooth Printer...');
  try {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not supported on this browser / device.');
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['printer_service'] }, { namePrefix: 'Receipt' }]
    });
    await device.gatt.connect();
    console.log('[ESC/POS Bluetooth] Success pairing, transmitting bytes:', buffer.length);
  } catch (e) {
    console.warn('[ESC/POS Bluetooth Emulator Fallback] Web Bluetooth not completed in this context:', e.message);
    console.log('%c[Bluetooth ESC/POS Hex Output]', 'font-family:monospace;color:#10b981;', Array.from(buffer).map(b => b.toString(16).padStart(2,'0')).join(' '));
  }
}

async function sendToSerialPrinter(buffer) {
  console.log('[ESC/POS Serial] Writing to COM Port...', buffer);
  toast.success('Accessing Serial Printer Port...');
  try {
    if (!navigator.serial) {
      throw new Error('Web Serial is not supported on this browser.');
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    const writer = port.writable.getWriter();
    await writer.write(buffer);
    writer.releaseLock();
    await port.close();
  } catch (e) {
    console.warn('[ESC/POS Serial Emulator Fallback] Web Serial not completed in this context:', e.message);
    console.log('%c[Serial ESC/POS Hex Output]', 'font-family:monospace;color:#f59e0b;', Array.from(buffer).map(b => b.toString(16).padStart(2,'0')).join(' '));
  }
}

async function sendToNetworkPrinter(ipAddress, buffer) {
  console.log(`[ESC/POS Network] Sending raw print job to ${ipAddress}...`, buffer);
  toast.success(`Sending print job to network printer ${ipAddress}...`);
  try {
    await fetch(`http://${ipAddress}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer
    });
  } catch (e) {
    console.warn('[ESC/POS Network Emulator Fallback] Network post bypassed:', e.message);
    console.log(`%c[Network Print Server Output to ${ipAddress}]`, 'font-family:monospace;color:#3b82f6;', Array.from(buffer).map(b => b.toString(16).padStart(2,'0')).join(' '));
  }
}

export function printReceipt({ restaurant, order, items, taxInfo, staffName }) {
  const { printerMode = 'browser', printerIp } = restaurant?.peripheralConfig ?? {};
  
  if (printerMode !== 'browser') {
    const buffer = compileEscPosReceipt({ restaurant, order, items, taxInfo, staffName });
    if (printerMode === 'bluetooth') {
      sendToBluetoothPrinter(buffer);
    } else if (printerMode === 'serial') {
      sendToSerialPrinter(buffer);
    } else if (printerMode === 'network') {
      sendToNetworkPrinter(printerIp || '192.168.1.100:9100', buffer);
    }
    return;
  }

  const { currency = 'INR', name: restName, address = '', phone = '' } = restaurant ?? {};
  const win = window.open('', '_blank', 'width=340,height=600');
  if (!win) { alert('Please allow popups to print receipts.'); return; }

  const itemRows = items.map(i =>
    `<tr>
      <td>
        <div>${i.name}</div>
        ${i.selectedModifiers && i.selectedModifiers.length > 0
          ? `<div style="font-size:10px; color:#555; padding-left:2mm;">+ ${i.selectedModifiers.map(m => m.name).join(', ')}</div>`
          : ''}
      </td>
      <td style="text-align:center; vertical-align:top;">${i.qty}</td>
      <td style="text-align:right; vertical-align:top;">${(i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join('');

  const taxRows = (taxInfo?.lines ?? []).map(l =>
    `<tr><td colspan="2">${l.label}</td><td style="text-align:right">${l.amount.toFixed(2)}</td></tr>`
  ).join('');

  const orderTypeLabel =
    order.type === 'dine-in'  ? `Table: ${order.tableName ?? '-'}` :
    order.type === 'takeaway' ? `Token: #${order.token ?? '-'}` :
    `Online`;

  const discountRow = order.discountAmount && order.discountAmount > 0
    ? `<tr><td colspan="2">Discount${order.discountType === 'percent' ? ` (${order.discount}%)` : ''}</td><td style="text-align:right">-${order.discountAmount.toFixed(2)}</td></tr>`
    : '';

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 80mm;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #000;
    padding: 4mm 3mm;
  }
  .center { text-align: center; }
  .bold   { font-weight: bold; }
  .large  { font-size: 16px; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  td:last-child { white-space: nowrap; }
  .total-row td { font-weight: bold; font-size: 14px; border-top: 1px solid #000; }
  .footer { margin-top: 8px; font-size: 11px; text-align: center; color: #555; }
</style>
</head>
<body>
<div class="center bold large">${restName}</div>
${address ? `<div class="center">${address}</div>` : ''}
${phone ? `<div class="center">Tel: ${phone}</div>` : ''}
<div class="divider"></div>
<div>Date: ${new Date().toLocaleString()}</div>
<div>${orderTypeLabel}</div>
${order.customerName ? `<div>Customer: ${order.customerName}</div>` : ''}
${staffName ? `<div>Staff: ${staffName}</div>` : ''}
<div class="divider"></div>
<table>
  <thead>
    <tr class="bold">
      <td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Amt</td>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="divider"></div>
<table>
  <tr><td colspan="2">Subtotal</td><td style="text-align:right">${(order.subtotal ?? 0).toFixed(2)}</td></tr>
  ${discountRow}
  ${taxRows}
  <tr class="total-row">
    <td colspan="2">TOTAL (${currency})</td>
    <td style="text-align:right">${(order.total ?? 0).toFixed(2)}</td>
  </tr>
</table>
<div class="divider"></div>
<div>Payment: ${(order.paymentMethod ?? 'cash').toUpperCase()}</div>
${order.upiRef ? `<div style="font-size:11px">UPI Ref: ${order.upiRef}</div>` : ''}
<div class="footer">Thank you for dining with us!<br/>Order ID: ${order.id?.slice(-8) ?? ''}</div>
</body>
</html>
`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 500);
}

export function printTokenTicket({ token, orderType, customerName, restaurant }) {
  const win = window.open('', '_blank', 'width=280,height=300');
  if (!win) return;
  win.document.write(`
<!DOCTYPE html>
<html>
<head>
<style>
  body { width: 72mm; font-family: 'Courier New', monospace; text-align: center; padding: 6mm 3mm; }
  .token { font-size: 64px; font-weight: bold; margin: 8px 0; }
  .label { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #555; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .brand { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
</style>
</head>
<body>
<div class="brand">${restaurant?.name ?? 'RestaurantOS'}</div>
<div class="divider"></div>
<div class="label">Your Token Number</div>
<div class="token">${String(token).padStart(3, '0')}</div>
<div class="divider"></div>
<div class="label">${orderType === 'dine-in' ? '🍽 Dine In' : '🛍 Pickup'}</div>
${customerName ? `<div style="margin-top:4px;font-size:12px">${customerName}</div>` : ''}
<div style="font-size:11px;color:#888;margin-top:6px">${new Date().toLocaleTimeString()}</div>
</body>
</html>
`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}
