import toast from 'react-hot-toast';
import { useMenuStore } from '../stores/menuStore';

// A robust helper to translate Unicode strings to ASCII bytes with best-effort transliteration fallback
function unicodeToEscPosBytes(text) {
  const translitMap = {
    'é': 'e', 'è': 'e', 'à': 'a', 'ù': 'u', 'ç': 'c', 'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
    'ë': 'e', 'ï': 'i', 'ü': 'u', 'ö': 'o', 'ä': 'a', 'ñ': 'n',
    'ا': 'A', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
    'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
    'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
    'ة': 'h', 'ء': 'a', 'أ': 'A', 'إ': 'E', 'ؤ': 'w', 'ئ': 'y', 'ى': 'y',
    // Devanagari (Hindi / Marathi)
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
    'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '',
    '।': '.', '॥': '.'
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

// Lookup Category ID for a menu item ID
function getCategoryForMenuItem(menuItemId) {
  const categories = useMenuStore.getState().categories || [];
  const cat = categories.find(c => (c.items ?? []).some(item => item.id === menuItemId));
  return cat ? cat.id : null;
}

// Helper to get line width in characters: 32 for 58mm (2-inch), 48 for 80mm (3-inch)
function getPrinterLineWidth(printerConfig) {
  return printerConfig?.paperSize === '58mm' ? 32 : 48;
}

// Compile receipt payload for ESC/POS
function compileEscPosReceipt({ restaurant, order, items, taxInfo, staffName, printerConfig }) {
  const { name: restName = 'DineOS', address = '', phone = '' } = restaurant ?? {};
  const { currency = 'INR' } = restaurant ?? {};
  const lineWidth = getPrinterLineWidth(printerConfig);
  const is58mm = lineWidth === 32;
  
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

  const divider = '-'.repeat(lineWidth);
  
  writeBytes(INIT);
  
  if (printerConfig?.soundAlerts) {
    writeBytes(BUZZER_BELL);
  }
  
  if (printerConfig?.drawerKick && order.paymentMethod === 'cash') {
    writeBytes(DRAWER_KICK);
  }
  
  // Header
  writeBytes(ALIGN_CENTER);
  writeBytes(BOLD_ON);
  writeTextLine(restName);
  writeBytes(BOLD_OFF);
  
  if (address) writeTextLine(address);
  if (phone) writeTextLine(`Tel: ${phone}`);
  if (restaurant?.gstin) writeTextLine(`GSTIN: ${restaurant.gstin}`);
  if (restaurant?.fssai) writeTextLine(`FSSAI Lic: ${restaurant.fssai}`);
  
  writeTextLine(divider);
  
  writeBytes(ALIGN_LEFT);
  writeTextLine(`Date: ${new Date().toLocaleString()}`);
  const orderTypeLabel =
    order.type === 'dine-in'  ? `Table: ${order.tableName ?? '-'}` :
    order.type === 'takeaway' ? `Token: #${order.token ?? '-'}` :
    `Online`;
  writeTextLine(orderTypeLabel);
  
  if (order.customerName) writeTextLine(`Customer: ${order.customerName}`);
  if (staffName) writeTextLine(`Staff: ${staffName}`);
  
  writeTextLine(divider);
  
  // Table Header
  writeBytes(BOLD_ON);
  if (is58mm) {
    // 32 chars: Item(16) + Qty(6) + Amt(10) = 32
    writeTextLine('Item            Qty       Amt');
  } else {
    // 48 chars: Item(26) + Qty(8) + Amt(14) = 48
    writeTextLine('Item                      Qty         Amt   ');
  }
  writeBytes(BOLD_OFF);
  
  // Items — columns: 58mm: 16+6+10=32, 80mm: 26+8+14=48
  items.forEach(i => {
    if (is58mm) {
      const itemLeft = i.name.slice(0, 16).padEnd(16, ' ');
      const qtyMid = String(i.qty).padStart(6, ' ');
      const amtRight = (i.price * i.qty).toFixed(2).padStart(10, ' ');
      writeTextLine(`${itemLeft}${qtyMid}${amtRight}`);
    } else {
      const itemLeft = i.name.slice(0, 26).padEnd(26, ' ');
      const qtyMid = String(i.qty).padStart(8, ' ');
      const amtRight = (i.price * i.qty).toFixed(2).padStart(14, ' ');
      writeTextLine(`${itemLeft}${qtyMid}${amtRight}`);
    }
    if (i.selectedModifiers && i.selectedModifiers.length > 0) {
      writeTextLine(`  + ${i.selectedModifiers.map(m => m.name).join(', ')}`);
    }
  });
  
  writeTextLine(divider);
  
  // Totals breakdown
  const formatTotalLine = (label, valueStr) => {
    const space = lineWidth - label.length - valueStr.length;
    return label + ' '.repeat(Math.max(1, space)) + valueStr;
  };

  writeTextLine(formatTotalLine('Subtotal:', (order.subtotal ?? 0).toFixed(2)));
  
  if (order.discountAmount && order.discountAmount > 0) {
    const discLabel = `Discount${order.discountType === 'percent' ? `(${order.discount}%)` : ''}:`;
    writeTextLine(formatTotalLine(discLabel, `-${(order.discountAmount).toFixed(2)}`));
  }
  
  (taxInfo?.lines ?? []).forEach(l => {
    writeTextLine(formatTotalLine(`${l.label}:`, l.amount.toFixed(2)));
  });

  const serviceChargeAmt = order.serviceChargeAmount ?? order.serviceCharge ?? 0;
  if (serviceChargeAmt > 0) {
    writeTextLine(formatTotalLine('Service Charge:', serviceChargeAmt.toFixed(2)));
  }

  if (order.tipAmount && order.tipAmount > 0) {
    writeTextLine(formatTotalLine('Tip / Gratuity:', order.tipAmount.toFixed(2)));
  }

  if (order.giftCardDeduction && order.giftCardDeduction > 0) {
    const gcCode = order.giftCardCode ? ` (${order.giftCardCode})` : '';
    writeTextLine(formatTotalLine(`Gift Card${gcCode}:`, `-${order.giftCardDeduction.toFixed(2)}`));
  }
  
  writeBytes(BOLD_ON);
  writeTextLine(formatTotalLine(`TOTAL (${currency}):`, (order.total ?? 0).toFixed(2)));
  writeBytes(BOLD_OFF);
  
  writeTextLine(divider);
  writeBytes(ALIGN_CENTER);
  writeTextLine(`Payment: ${(order.paymentMethod ?? 'cash').toUpperCase()}`);
  if (order.upiRef) {
    writeTextLine(`UPI Ref: ${order.upiRef}`);
  }
  writeTextLine('Thank you for dining with us!');
  writeTextLine(`Order ID: ${order.id?.slice(-8) ?? ''}`);
  
  writeBytes([LF, LF]);
  writeBytes(CUT);
  
  return new Uint8Array(buffer);
}

// Compile kitchen station ticket for ESC/POS
function compileEscPosKitchenTicket({ order, items, staffName, printerConfig }) {
  const lineWidth = getPrinterLineWidth(printerConfig);
  const is58mm = lineWidth === 32;
  const ticketTitle = printerConfig?.ticketTitle || 'KITCHEN TICKET';

  const ESC = 27;
  const GS = 29;
  const LF = 10;
  
  const INIT = [ESC, 64];
  const ALIGN_CENTER = [ESC, 97, 1];
  const ALIGN_LEFT = [ESC, 97, 0];
  const BOLD_ON = [ESC, 69, 1];
  const BOLD_OFF = [ESC, 69, 0];
  const CUT = [GS, 86, 65, 0];
  const BUZZER_BELL = [7];
  const DOUBLE_SIZE = [GS, 33, 17]; // Double height and double width
  const NORMAL_SIZE = [GS, 33, 0];

  let buffer = [];
  
  const writeBytes = (bytes) => {
    buffer.push(...bytes);
  };
  
  const writeTextLine = (text) => {
    writeBytes(unicodeToEscPosBytes(text));
    writeBytes([LF]);
  };

  const divider = '-'.repeat(lineWidth);
  
  writeBytes(INIT);
  
  if (printerConfig?.soundAlerts) {
    writeBytes(BUZZER_BELL);
  }
  
  writeBytes(ALIGN_CENTER);
  writeBytes(DOUBLE_SIZE);
  writeBytes(BOLD_ON);
  writeTextLine(ticketTitle);
  writeBytes(NORMAL_SIZE);
  writeBytes(BOLD_OFF);
  
  writeTextLine(divider);
  writeBytes(ALIGN_LEFT);
  writeTextLine(`Station: ${printerConfig?.name || 'Kitchen'}`);
  writeTextLine(`Date: ${new Date().toLocaleString()}`);
  
  const orderTypeLabel =
    order.type === 'dine-in'  ? `Table: ${order.tableName ?? '-'}` :
    order.type === 'takeaway' ? `Token: #${order.token ?? '-'}` :
    `Online`;
  
  writeBytes(BOLD_ON);
  writeTextLine(orderTypeLabel);
  writeBytes(BOLD_OFF);
  
  if (order.customerName) writeTextLine(`Customer: ${order.customerName}`);
  if (staffName) writeTextLine(`Staff: ${staffName}`);
  
  writeTextLine(divider);
  
  writeBytes(BOLD_ON);
  if (is58mm) {
    // 32 chars: Item(26) + Qty(6) = 32
    writeTextLine('Item                      Qty   ');
  } else {
    // 48 chars: Item(40) + Qty(8) = 48
    writeTextLine('Item                                    Qty     ');
  }
  writeBytes(BOLD_OFF);
  
  // Items — columns: 58mm: 26+6=32, 80mm: 40+8=48
  items.forEach(i => {
    if (is58mm) {
      const itemLeft = i.name.slice(0, 26).padEnd(26, ' ');
      const qtyRight = String(i.qty).padStart(6, ' ');
      writeTextLine(`${itemLeft}${qtyRight}`);
    } else {
      const itemLeft = i.name.slice(0, 40).padEnd(40, ' ');
      const qtyRight = String(i.qty).padStart(8, ' ');
      writeTextLine(`${itemLeft}${qtyRight}`);
    }
    if (i.selectedModifiers && i.selectedModifiers.length > 0) {
      writeTextLine(`  + ${i.selectedModifiers.map(m => m.name).join(', ')}`);
    }
  });
  
  writeTextLine(divider);
  if (order.note) {
    writeTextLine(`Note: ${order.note}`);
    writeTextLine(divider);
  }
  writeTextLine(`Order ID: ${order.id?.slice(-8) ?? ''}`);
  
  writeBytes([LF, LF]);
  writeBytes(CUT);
  
  return new Uint8Array(buffer);
}

// Global cached Bluetooth printer connection
let cachedBleDevice = null;
let cachedBleCharacteristic = null;

// Global cached Serial port connection
let cachedSerialPort = null;

// Universal Web Bluetooth Thermal ESC/POS Driver
export async function pairBluetoothPrinter() {
  if (!navigator.bluetooth) {
    toast.error('Web Bluetooth is not supported on this browser. Please use Chrome or Edge.');
    return null;
  }

  try {
    toast.loading('Searching for Bluetooth Thermal Printers...', { id: 'ble-pair' });
    
    // Standard thermal printer service UUIDs (Chinese POS, ESC/POS, Star, Epson, Rongta, MPT, Sunmi)
    const printerServices = [
      '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS
      '0000ffe0-0000-1000-8000-00805f9b34fb', // HMSoft / Common 58mm/80mm BLE
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '0000fee7-0000-1000-8000-00805f9b34fb',
      '0000af30-0000-1000-8000-00805f9b34fb'
    ];

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: printerServices
    });

    device.addEventListener('gattserverdisconnected', () => {
      console.warn('[Web Bluetooth] Printer disconnected:', device.name);
      cachedBleDevice = null;
      cachedBleCharacteristic = null;
    });

    const server = await device.gatt.connect();
    
    // Scan services to find writable characteristic
    let writeChar = null;
    for (const serviceUuid of printerServices) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
            break;
          }
        }
        if (writeChar) break;
      } catch {
        // Continue to next service
      }
    }

    if (!writeChar) {
      // Fallback: search all available services
      const services = await server.getPrimaryServices();
      for (const s of services) {
        try {
          const chars = await s.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              writeChar = c;
              break;
            }
          }
        } catch {
          // Ignore service scanning error and continue
        }
      }
    }

    if (!writeChar) {
      throw new Error('Connected to Bluetooth device, but could not find a writable printer characteristic.');
    }

    cachedBleDevice = device;
    cachedBleCharacteristic = writeChar;
    toast.success(`Connected to ${device.name || 'Bluetooth Thermal Printer'}!`, { id: 'ble-pair' });
    return device;
  } catch (err) {
    console.error('[Web Bluetooth Pair Error]', err);
    if (err.name !== 'NotFoundError') {
      toast.error(err.message || 'Failed to pair Bluetooth printer', { id: 'ble-pair' });
    } else {
      toast.dismiss('ble-pair');
    }
    return null;
  }
}

async function sendToBluetoothPrinter(buffer) {
  try {
    // Check if we have an active connected characteristic
    if (!cachedBleDevice || !cachedBleDevice.gatt.connected || !cachedBleCharacteristic) {
      const device = await pairBluetoothPrinter();
      if (!device || !cachedBleCharacteristic) return;
    }

    // Packet chunking: send in 50-byte chunks to avoid Bluetooth buffer overflow
    const CHUNK_SIZE = 50;
    for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
      const chunk = buffer.slice(i, i + CHUNK_SIZE);
      if (cachedBleCharacteristic.properties.writeWithoutResponse) {
        await cachedBleCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await cachedBleCharacteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 20));
    }
    toast.success('Printed via Bluetooth! 🖨️');
  } catch (e) {
    console.warn('[ESC/POS Bluetooth Error]', e);
    toast.error('Bluetooth print failed: ' + (e.message || 'Disconnected'));
    cachedBleDevice = null;
    cachedBleCharacteristic = null;
  }
}

async function sendToSerialPrinter(buffer) {
  try {
    if (!navigator.serial) {
      throw new Error('Web Serial is not supported on this browser.');
    }
    // Reuse cached port if still open, otherwise request a new one
    if (!cachedSerialPort || !cachedSerialPort.readable) {
      cachedSerialPort = await navigator.serial.requestPort();
    }
    if (!cachedSerialPort.readable) {
      // Port not open yet — open it
      await cachedSerialPort.open({ baudRate: 9600 });
    }
    const writer = cachedSerialPort.writable.getWriter();
    await writer.write(buffer);
    writer.releaseLock();
    toast.success('Printed via Serial! 🖨️');
  } catch (e) {
    console.warn('[ESC/POS Serial Error]', e.message);
    cachedSerialPort = null; // Reset on error
    toast.error('Serial print failed: ' + (e.message || 'Port error'));
  }
}

async function sendToNetworkPrinter(ipAddress, buffer) {
  toast.success(`Sending print job to network printer ${ipAddress}...`);
  try {
    await fetch(`http://${ipAddress}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer
    });
  } catch (e) {
    console.warn('[ESC/POS Network Error]', e.message);
  }
}

// Loop through all receipt printers and execute print
export function printReceipt({ restaurant, order, items, taxInfo, staffName }) {
  const printers = restaurant?.peripheralConfig?.printers ?? [];
  const receiptPrinters = printers.filter(p => p.type === 'receipt');

  if (receiptPrinters.length === 0) {
    printReceiptBrowser({ restaurant, order, items, taxInfo, staffName, paperSize: '80mm' });
    return;
  }

  receiptPrinters.forEach(printer => {
    _sendReceiptToPrinter({ restaurant, order, items, taxInfo, staffName, printer });
  });
}

// Internal: send receipt to a single specific printer (used by both printReceipt and test-print)
function _sendReceiptToPrinter({ restaurant, order, items, taxInfo, staffName, printer }) {
  if (printer.mode === 'browser') {
    printReceiptBrowser({ restaurant, order, items, taxInfo, staffName, paperSize: printer.paperSize || '80mm' });
  } else {
    const buffer = compileEscPosReceipt({ restaurant, order, items, taxInfo, staffName, printerConfig: printer });
    if (printer.mode === 'bluetooth') {
      sendToBluetoothPrinter(buffer);
    } else if (printer.mode === 'serial') {
      sendToSerialPrinter(buffer);
    } else if (printer.mode === 'network') {
      sendToNetworkPrinter(printer.ipAddress, buffer);
    }
  }
}

// Send a test receipt to exactly one specific printer by its config object
export function printReceiptSingle({ restaurant, order, items, taxInfo, staffName, printer }) {
  if (!printer) return;
  _sendReceiptToPrinter({ restaurant, order, items, taxInfo, staffName, printer });
}

// Loop through all kitchen printers, filter items by category, and send ticket
export function printKitchenTickets({ restaurant, order, items, staffName }) {
  const kitchenConfig = restaurant?.kitchenConfig;
  // If mode is explicitly set to display_only or disabled, do not physically print tickets
  const kitchenMode = kitchenConfig?.mode || (restaurant?.modes?.includes('kds') ? 'both' : 'printer_only');
  if (kitchenMode === 'display_only' || kitchenMode === 'disabled') {
    return;
  }

  const printers = restaurant?.peripheralConfig?.printers ?? [];
  const kitchenPrinters = printers.filter(p => p.type === 'kitchen');
  const paperSize = kitchenConfig?.paperSize || '80mm';
  const ticketTitle = kitchenConfig?.ticketTitle || 'KITCHEN TICKET';

  // Fallback to default 3-inch (80mm) thermal browser print if no specific kitchen printer is registered
  if (kitchenPrinters.length === 0) {
    printKitchenBrowser({
      order,
      items,
      printerName: 'Kitchen (3" Thermal)',
      paperSize,
      title: ticketTitle
    });
    return;
  }

  kitchenPrinters.forEach(printer => {
    // Filter items routed to this printer
    const printerCats = printer.categories ?? [];
    const routedItems = items.filter(item => {
      // If categories array is empty, route everything
      if (printerCats.length === 0) return true;
      const itemCatId = getCategoryForMenuItem(item.menuItemId || item.id);
      return itemCatId && printerCats.includes(itemCatId);
    });

    if (routedItems.length === 0) {
      return;
    }

    const effectivePaperSize = printer.paperSize || paperSize;
    if (printer.mode === 'browser') {
      printKitchenBrowser({
        order,
        items: routedItems,
        printerName: printer.name || 'Kitchen',
        paperSize: effectivePaperSize,
        title: ticketTitle
      });
    } else {
      const buffer = compileEscPosKitchenTicket({
        order,
        items: routedItems,
        staffName,
        printerConfig: {
          ...printer,
          paperSize: effectivePaperSize,
          soundAlerts: printer.soundAlerts ?? kitchenConfig?.soundBuzzer ?? false,
          ticketTitle
        }
      });
      if (printer.mode === 'bluetooth') {
        sendToBluetoothPrinter(buffer);
      } else if (printer.mode === 'serial') {
        sendToSerialPrinter(buffer);
      } else if (printer.mode === 'network') {
        sendToNetworkPrinter(printer.ipAddress, buffer);
      }
    }
  });
}

// Dedicated single station ticket for KDS on-demand reprints
export function printSingleKitchenTicket({ restaurant, order, items, staffName, printerId }) {
  const kitchenConfig = restaurant?.kitchenConfig;
  const printers = restaurant?.peripheralConfig?.printers ?? [];
  const kitchenPrinters = printers.filter(p => p.type === 'kitchen');
  const targetPrinter = (printerId ? kitchenPrinters.find(p => p.id === printerId) : null) || kitchenPrinters[0];

  const orderItems = items || order?.items || [];
  if (orderItems.length === 0) {
    toast.error('No items to print on kitchen ticket');
    return;
  }

  const paperSize = targetPrinter?.paperSize || kitchenConfig?.paperSize || '80mm';
  const ticketTitle = kitchenConfig?.ticketTitle || 'KITCHEN TICKET';

  if (!targetPrinter || targetPrinter.mode === 'browser') {
    printKitchenBrowser({
      order,
      items: orderItems,
      printerName: targetPrinter?.name || 'Kitchen Station',
      paperSize,
      title: ticketTitle
    });
    return;
  }

  const buffer = compileEscPosKitchenTicket({
    order,
    items: orderItems,
    staffName: staffName || order?.staffName,
    printerConfig: {
      ...targetPrinter,
      paperSize,
      soundAlerts: targetPrinter.soundAlerts ?? kitchenConfig?.soundBuzzer ?? false,
      ticketTitle
    }
  });

  if (targetPrinter.mode === 'bluetooth') {
    sendToBluetoothPrinter(buffer);
  } else if (targetPrinter.mode === 'serial') {
    sendToSerialPrinter(buffer);
  } else if (targetPrinter.mode === 'network') {
    sendToNetworkPrinter(targetPrinter.ipAddress, buffer);
  }
}

function printReceiptBrowser({ restaurant, order, items, taxInfo, staffName, paperSize = '80mm' }) {
  const { currency = 'INR', name: restName, address = '', phone = '' } = restaurant ?? {};
  const is58mm = paperSize === '58mm';
  const win = window.open('', '_blank', 'width=360,height=600');
  if (!win) { alert('Please allow popups to print receipts.'); return; }

  const itemRows = items.map(i =>
    `<tr>
      <td>
        <div style="font-weight: ${is58mm ? 'bold' : 'normal'};">${i.name}</div>
        ${i.selectedModifiers && i.selectedModifiers.length > 0
          ? `<div style="font-size:9px; color:#555; padding-left:1mm;">+ ${i.selectedModifiers.map(m => m.name).join(', ')}</div>`
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

  const bodyWidth = is58mm ? '52mm' : '76mm';
  const baseFontSize = is58mm ? '10.5px' : '12px';
  const titleSize = is58mm ? '14px' : '17px';

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Receipt - ${order.id?.slice(-8) ?? ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${bodyWidth};
    font-family: 'Courier New', monospace;
    font-size: ${baseFontSize};
    color: #000;
    padding: ${is58mm ? '2mm 1mm' : '4mm 3mm'};
    line-height: 1.25;
  }
  .center { text-align: center; }
  .bold   { font-weight: bold; }
  .large  { font-size: ${titleSize}; letter-spacing: -0.5px; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  td:last-child { white-space: nowrap; }
  .total-row td { font-weight: bold; font-size: ${is58mm ? '12px' : '14px'}; border-top: 1px solid #000; padding-top: 3px; }
  .footer { margin-top: 8px; font-size: 10px; text-align: center; color: #444; }
  @media print {
    body { width: 100%; }
    @page { margin: 0; size: auto; }
  }
</style>
</head>
<body>
<div class="center bold large">${restName}</div>
${address ? `<div class="center">${address}</div>` : ''}
${phone ? `<div class="center">Tel: ${phone}</div>` : ''}
${restaurant?.gstin ? `<div class="center bold">GSTIN: ${restaurant.gstin}</div>` : ''}
${restaurant?.fssai ? `<div class="center">FSSAI Lic: ${restaurant.fssai}</div>` : ''}
<div class="divider"></div>
<div>Date: ${new Date().toLocaleString()}</div>
<div class="bold">${orderTypeLabel}</div>
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
  ${(order.serviceChargeAmount || order.serviceCharge) ? `<tr><td colspan="2">Service Charge</td><td style="text-align:right">${((order.serviceChargeAmount || order.serviceCharge) ?? 0).toFixed(2)}</td></tr>` : ''}
  ${(order.tipAmount && order.tipAmount > 0) ? `<tr><td colspan="2">Tip / Gratuity</td><td style="text-align:right">${(order.tipAmount).toFixed(2)}</td></tr>` : ''}
  ${(order.giftCardDeduction && order.giftCardDeduction > 0) ? `<tr><td colspan="2">Gift Card${order.giftCardCode ? ` (${order.giftCardCode})` : ''}</td><td style="text-align:right">-${(order.giftCardDeduction).toFixed(2)}</td></tr>` : ''}
  <tr class="total-row">
    <td colspan="2">TOTAL (${currency})</td>
    <td style="text-align:right">${(order.total ?? 0).toFixed(2)}</td>
  </tr>
</table>
<div class="divider"></div>
<div>Payment: ${(order.paymentMethod ?? 'cash').toUpperCase()}</div>
${order.upiRef ? `<div style="font-size:10px">UPI Ref: ${order.upiRef}</div>` : ''}
<div class="footer">Thank you for dining with us!<br/>Order ID: ${order.id?.slice(-8) ?? ''}</div>
</body>
</html>
`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

function printKitchenBrowser({ order, items, printerName, paperSize = '80mm', title = 'KITCHEN TICKET' }) {
  const is58mm = paperSize === '58mm';
  const win = window.open('', '_blank', 'width=360,height=480');
  if (!win) return;

  const itemRows = items.map(i =>
    `<tr>
      <td style="font-size: ${is58mm ? '13px' : '16px'}; font-weight: bold; vertical-align: top; padding-right: 6px;">${i.name}</td>
      <td style="font-size: ${is58mm ? '15px' : '18px'}; font-weight: 900; text-align: right; vertical-align: top;">×${i.qty}</td>
    </tr>
    ${i.selectedModifiers && i.selectedModifiers.length > 0
      ? `<tr><td colspan="2" style="font-size:11px; color:#222; font-weight:bold; padding-left:2mm; padding-bottom: 4px;">+ ${i.selectedModifiers.map(m => m.name).join(', ')}</td></tr>`
      : ''}`
  ).join('');

  const orderTypeLabel =
    order.type === 'dine-in'  ? `Table: ${order.tableName ?? '-'}` :
    order.type === 'takeaway' ? `Token: #${order.token ?? '-'}` :
    `Online`;

  const bodyWidth = is58mm ? '52mm' : '76mm';

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${title} - ${order.tableName || order.token || ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${bodyWidth};
    font-family: 'Courier New', monospace;
    font-size: ${is58mm ? '11px' : '13px'};
    padding: ${is58mm ? '3mm 2mm' : '4mm 3mm'};
    line-height: 1.25;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .large { font-size: ${is58mm ? '16px' : '20px'}; }
  .divider { border-top: 1.5px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; }
  @media print {
    body { width: 100%; }
    @page { margin: 0; size: auto; }
  }
</style>
</head>
<body>
<div class="center bold large">${title}</div>
<div class="center bold" style="font-size: ${is58mm ? '12px' : '14px'};">Station: ${printerName}</div>
<div class="divider"></div>
<div style="font-size: ${is58mm ? '13px' : '15px'}; font-weight: 900;">${orderTypeLabel}</div>
<div>Time: ${new Date().toLocaleTimeString()}</div>
${order.customerName ? `<div>Customer: ${order.customerName}</div>` : ''}
<div class="divider"></div>
<table>
  <tbody>${itemRows}</tbody>
</table>
<div class="divider"></div>
${order.note ? `<div style="font-size:${is58mm ? '12px' : '14px'}; font-weight:bold; background:#eee; padding:2px 4px; margin: 2px 0;">⚠️ Note: ${order.note}</div><div class="divider"></div>` : ''}
<div class="center" style="font-size: 10px; color: #444;">Order #${order.id?.slice(-6) ?? ''}</div>
</body>
</html>
`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

export function printTokenTicket({ token, orderType, customerName, restaurant }) {
  // Detect paper size from first receipt printer config, default to 80mm
  const printers = restaurant?.peripheralConfig?.printers ?? [];
  const receiptPrinter = printers.find(p => p.type === 'receipt');
  const paperSize = receiptPrinter?.paperSize || '80mm';
  const is58mm = paperSize === '58mm';
  const bodyWidth = is58mm ? '52mm' : '72mm';
  const tokenFontSize = is58mm ? '42px' : '58px';

  const win = window.open('', '_blank', 'width=280,height=300');
  if (!win) return;
  win.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Token #${token}</title>
<style>
  body { width: ${bodyWidth}; font-family: 'Courier New', monospace; text-align: center; padding: 6mm 3mm; margin: 0 auto; }
  .token { font-size: ${tokenFontSize}; font-weight: 900; margin: 6px 0; letter-spacing: -1px; }
  .label { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #444; font-weight: bold; }
  .divider { border-top: 1.5px dashed #000; margin: 6px 0; }
  .brand { font-size: 15px; font-weight: bold; margin-bottom: 2px; }
  @media print {
    body { width: 100%; }
    @page { margin: 0; size: auto; }
  }
</style>
</head>
<body>
<div class="brand">${restaurant?.name ?? 'DineOS'}</div>
<div class="divider"></div>
<div class="label">Your Token Number</div>
<div class="token">${String(token).padStart(3, '0')}</div>
<div class="divider"></div>
<div class="label">${orderType === 'dine-in' ? '🍽 Dine In' : '🛍 Takeaway / Pickup'}</div>
${customerName ? `<div style="margin-top:4px;font-size:12px;font-weight:bold;">${customerName}</div>` : ''}
<div style="font-size:10px;color:#666;margin-top:6px">${new Date().toLocaleTimeString()}</div>
</body>
</html>
`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}
