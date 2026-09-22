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

// Auto-detect paper size from printer name or Bluetooth device model
export function detectPrinterPaperSize(name) {
  if (!name || typeof name !== 'string') return '80mm';
  const n = name.toLowerCase().trim();

  // 58mm compact indicators (2-inch, 32 cols)
  if (
    n.includes('58') ||
    n.includes('pt-2') ||
    n.includes('pt2') ||
    n.includes('mpt-2') ||
    n.includes('mpt-ii') ||
    n.includes('mpt2') ||
    n.includes('pos-58') ||
    n.includes('pos58') ||
    n.includes('zj-58') ||
    n.includes('rpp-02') ||
    n.includes('ep-58') ||
    n.includes('g58') ||
    n.includes('mini') ||
    n.includes('cat') ||
    n.includes('2-inch') ||
    n.includes('2 inch') ||
    n.includes('2"')
  ) {
    return '58mm';
  }

  // A4 / Full sheet indicators
  if (
    n.includes('a4') ||
    n.includes('laser') ||
    n.includes('deskjet') ||
    n.includes('ecotank') ||
    n.includes('inkjet') ||
    n.includes('officejet') ||
    n.includes('brother') ||
    n.includes('canon') ||
    n.includes('hp ') ||
    n.includes('xerox') ||
    n.includes('letter') ||
    n.includes('invoice') ||
    n.includes('pdf')
  ) {
    return 'a4';
  }

  // Default to standard 80mm (3-inch, 48 cols)
  return '80mm';
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
  
  // Restaurant Thermal Logo (ESC/POS Raster Bit Image)
  const escPosLogoBase64 = restaurant?.receiptConfig?.escPosLogo;
  if (escPosLogoBase64) {
    try {
      const binStr = atob(escPosLogoBase64);
      const logoBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        logoBytes[i] = binStr.charCodeAt(i);
      }
      writeBytes(ALIGN_CENTER);
      writeBytes(logoBytes);
      writeBytes([LF]);
    } catch (e) {
      console.warn('[ESC/POS Logo Parse Warning]', e);
    }
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
    
    // Standard thermal printer service UUIDs (Chinese POS, ESC/POS, Star, Epson, Rongta, MPT, Sunmi, ISSC)
    const printerServices = [
      '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS
      '0000ffe0-0000-1000-8000-00805f9b34fb', // HMSoft / Common 58mm/80mm BLE
      '0000ffe5-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb', // Common POS-58 / Rongta / Chinese mini printers
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART
      '49535343-1e4d-4bd9-ba61-23c647249616', // ISSC SPP
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '0000fee7-0000-1000-8000-00805f9b34fb', // WeChat / Tencent BLE POS
      '0000af30-0000-1000-8000-00805f9b34fb',
      '0000ae30-0000-1000-8000-00805f9b34fb',
      '0000ae00-0000-1000-8000-00805f9b34fb',
      'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // Star Micronics BLE
      '0000180a-0000-1000-8000-00805f9b34fb'  // Device Info
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
    
    // Scan declared services to find writable characteristic
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
      try {
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
            // Ignore individual service scan error
          }
          if (writeChar) break;
        }
      } catch (scanErr) {
        console.warn('[BLE Scan Fallback Error]', scanErr);
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
    // Check if we have an active connected characteristic; if not, attempt silent reconnect first
    if (!cachedBleDevice || !cachedBleDevice.gatt.connected || !cachedBleCharacteristic) {
      if (cachedBleDevice && !cachedBleDevice.gatt.connected) {
        try {
          const server = await cachedBleDevice.gatt.connect();
          const services = await server.getPrimaryServices();
          let writeChar = null;
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
              // Ignore
            }
            if (writeChar) break;
          }
          if (writeChar) {
            cachedBleCharacteristic = writeChar;
          }
        } catch (silentErr) {
          console.warn('[BLE Silent Reconnect Failed]', silentErr);
          cachedBleDevice = null;
          cachedBleCharacteristic = null;
        }
      }

      if (!cachedBleDevice || !cachedBleCharacteristic) {
        const device = await pairBluetoothPrinter();
        if (!device || !cachedBleCharacteristic) return;
      }
    }

    // Packet chunking: default BLE ATT MTU is 23 (20-byte payload).
    // Sending in 20-byte chunks with 15ms throttle guarantees zero dropped packets on budget 58mm/80mm printers
    const CHUNK_SIZE = 20;
    for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
      const chunk = buffer.slice(i, i + CHUNK_SIZE);
      if (cachedBleCharacteristic.properties.writeWithoutResponse) {
        await cachedBleCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await cachedBleCharacteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 15));
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
    const defaultPaper = restaurant?.receiptConfig?.paperSize || '80mm';
    if (defaultPaper === 'a4') {
      printInvoiceA4({ restaurant, order, items, taxInfo, staffName });
    } else {
      printReceiptBrowser({ restaurant, order, items, taxInfo, staffName, paperSize: defaultPaper });
    }
    return;
  }

  receiptPrinters.forEach(printer => {
    _sendReceiptToPrinter({ restaurant, order, items, taxInfo, staffName, printer });
  });
}

// Internal: send receipt to a single specific printer (used by both printReceipt and test-print)
function _sendReceiptToPrinter({ restaurant, order, items, taxInfo, staffName, printer }) {
  const paperSize = printer.paperSize || '80mm';
  if (paperSize === 'a4') {
    printInvoiceA4({ restaurant, order, items, taxInfo, staffName });
    return;
  }

  if (printer.mode === 'browser') {
    printReceiptBrowser({ restaurant, order, items, taxInfo, staffName, paperSize });
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
  if (!printer) {
    const defaultPaper = restaurant?.receiptConfig?.paperSize || '80mm';
    if (defaultPaper === 'a4') {
      printInvoiceA4({ restaurant, order, items, taxInfo, staffName });
    } else {
      printReceiptBrowser({ restaurant, order, items, taxInfo, staffName, paperSize: defaultPaper });
    }
    return;
  }
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

export function printReceiptBrowser({ restaurant, order, items, taxInfo, staffName, paperSize = '80mm' }) {
  if (paperSize === 'a4') {
    printInvoiceA4({ restaurant, order, items, taxInfo, staffName });
    return;
  }

  const { currency = 'INR', name: restName, address = '', phone = '' } = restaurant ?? {};
  const logoUrl = restaurant?.receiptConfig?.thermalLogo || restaurant?.receiptConfig?.logoUrl || restaurant?.logo || restaurant?.onlineLogo;
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
  img { image-rendering: -webkit-optimize-contrast; image-rendering: pixelated; }
  .total-row td { font-weight: bold; font-size: ${is58mm ? '12px' : '14px'}; border-top: 1px solid #000; padding-top: 3px; }
  .footer { margin-top: 8px; font-size: 10px; text-align: center; color: #444; }
  @media print {
    body { width: 100%; }
    @page { margin: 0; size: auto; }
  }
</style>
</head>
<body>
${logoUrl ? `
<div class="center" style="margin-bottom: 6px;">
  <img src="${logoUrl}" alt="${restName}" style="max-width: ${is58mm ? '140px' : '180px'}; max-height: 60px; object-fit: contain; filter: contrast(160%) grayscale(100%); display: block; margin: 0 auto 4px;" />
</div>
` : ''}
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

// Full A4 / Letter Tax Invoice Generator
export function printInvoiceA4({ restaurant, order, items, taxInfo, staffName }) {
  const { currency = 'INR', name: restName = 'DineOS Restaurant', address = '', phone = '', email = '' } = restaurant ?? {};
  const logoUrl = restaurant?.receiptConfig?.logoUrl || restaurant?.logo || restaurant?.onlineLogo || restaurant?.receiptConfig?.thermalLogo;
  const gstin = restaurant?.gstin || '';
  const fssai = restaurant?.fssai || '';
  const invoiceId = order.id ? (order.id.startsWith('INV-') ? order.id : `INV-${order.id.slice(-8).toUpperCase()}`) : `INV-${Date.now().toString().slice(-6)}`;
  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();

  const win = window.open('', '_blank', 'width=850,height=900');
  if (!win) { alert('Please allow popups to print invoices.'); return; }

  const itemRowsHtml = (items || []).map((i, index) => {
    const itemTotal = (i.price * i.qty).toFixed(2);
    const sacCode = gstin ? '996331' : '-';
    return `
    <tr>
      <td style="text-align:center; padding: 8px 6px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
      <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-weight: 600; color: #111827;">${i.name}</div>
        ${i.selectedModifiers && i.selectedModifiers.length > 0
          ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">+ ${i.selectedModifiers.map(m => m.name).join(', ')}</div>`
          : ''}
      </td>
      <td style="text-align:center; padding: 8px 6px; color: #4b5563; border-bottom: 1px solid #e5e7eb;">${sacCode}</td>
      <td style="text-align:center; padding: 8px 6px; font-weight: 600; border-bottom: 1px solid #e5e7eb;">${i.qty}</td>
      <td style="text-align:right; padding: 8px 10px; color: #374151; border-bottom: 1px solid #e5e7eb;">${Number(i.price).toFixed(2)}</td>
      <td style="text-align:right; padding: 8px 10px; font-weight: 600; color: #111827; border-bottom: 1px solid #e5e7eb;">${itemTotal}</td>
    </tr>
    `;
  }).join('');

  const taxRowsHtml = (taxInfo?.lines ?? []).map(l =>
    `<tr>
      <td style="padding: 4px 0; color: #4b5563;">${l.label}:</td>
      <td style="text-align: right; padding: 4px 0; font-weight: 500; color: #111827;">${currency} ${Number(l.amount).toFixed(2)}</td>
    </tr>`
  ).join('');

  const orderTypeLabel =
    order.type === 'dine-in'  ? `Dine-In (${order.tableName ? `Table ${order.tableName}` : 'Table'})` :
    order.type === 'takeaway' ? `Takeaway (${order.token ? `Token #${order.token}` : 'Pickup'})` :
    `Online Delivery`;

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Tax Invoice - ${invoiceId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #1f2937;
      line-height: 1.4;
      background: #fff;
      padding: 24px 32px;
      margin: 0 auto;
      max-width: 800px;
    }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .badge-invoice {
      display: inline-block;
      background: #111827;
      color: #fff;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .meta-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .items-table th {
      background: #f3f4f6;
      color: #374151;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      padding: 10px 8px;
      border-bottom: 2px solid #d1d5db;
    }
    .totals-table { width: 100%; border-collapse: collapse; }
    .grand-total {
      font-size: 16px;
      font-weight: 800;
      color: #111827;
      border-top: 2px solid #111827;
      border-bottom: 2px solid #111827;
      padding: 8px 0;
    }
    @media print {
      body { max-width: 100%; padding: 0; }
      @page { size: A4 portrait; margin: 12mm 15mm; }
    }
  </style>
</head>
<body>
  <!-- Header Bar -->
  <table class="header-table">
    <tr>
      <td style="vertical-align: top; width: 60%;">
        ${logoUrl ? `<img src="${logoUrl}" alt="${restName}" style="max-height: 55px; max-width: 180px; object-fit: contain; margin-bottom: 8px; display: block;" />` : ''}
        <h1 style="font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 4px;">${restName}</h1>
        ${address ? `<div style="color: #4b5563; font-size: 12px; margin-bottom: 2px;">${address}</div>` : ''}
        ${phone ? `<div style="color: #4b5563; font-size: 12px; margin-bottom: 2px;">Tel: ${phone}</div>` : ''}
        ${email ? `<div style="color: #4b5563; font-size: 12px; margin-bottom: 2px;">Email: ${email}</div>` : ''}
        <div style="margin-top: 6px;">
          ${gstin ? `<span style="display: inline-block; font-weight: 700; font-size: 11.5px; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; margin-right: 6px;">GSTIN: ${gstin}</span>` : ''}
          ${fssai ? `<span style="display: inline-block; font-size: 11.5px; background: #f3f4f6; color: #374151; padding: 2px 8px; border-radius: 4px;">FSSAI: ${fssai}</span>` : ''}
        </div>
      </td>
      <td style="vertical-align: top; width: 40%; text-align: right;">
        <div class="badge-invoice">Tax Invoice / Bill of Supply</div>
        <div style="margin-top: 10px; font-size: 12px; color: #4b5563;">
          <div><strong style="color: #111827;">Invoice No:</strong> ${invoiceId}</div>
          <div><strong style="color: #111827;">Date & Time:</strong> ${orderDate}</div>
          <div><strong style="color: #111827;">Service Mode:</strong> ${orderTypeLabel}</div>
          ${staffName ? `<div><strong style="color: #111827;">Cashier / Server:</strong> ${staffName}</div>` : ''}
        </div>
      </td>
    </tr>
  </table>

  <!-- Customer & Order Meta -->
  <div class="meta-box">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="width: 50%; vertical-align: top;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">Billed To / Customer</div>
          <div style="font-size: 14px; font-weight: 700; color: #111827;">${order.customerName || 'Walk-in Customer'}</div>
          ${order.customerPhone ? `<div style="font-size: 12px; color: #4b5563; margin-top: 2px;">Phone: ${order.customerPhone}</div>` : ''}
        </td>
        <td style="width: 50%; vertical-align: top; text-align: right;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">Payment Summary</div>
          <div style="font-size: 13px; font-weight: 700; color: #047857;">PAID - ${(order.paymentMethod ?? 'cash').toUpperCase()}</div>
          ${order.upiRef ? `<div style="font-size: 11.5px; color: #4b5563; margin-top: 2px;">Ref: ${order.upiRef}</div>` : ''}
        </td>
      </tr>
    </table>
  </div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 5%; text-align: center;">#</th>
        <th style="width: 45%; text-align: left;">Item Description</th>
        <th style="width: 12%; text-align: center;">SAC / HSN</th>
        <th style="width: 10%; text-align: center;">Qty</th>
        <th style="width: 13%; text-align: right;">Rate (${currency})</th>
        <th style="width: 15%; text-align: right;">Amount (${currency})</th>
      </tr>
    </thead>
    <tbody>
      ${itemRowsHtml}
    </tbody>
  </table>

  <!-- Calculation & Totals Section -->
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
    <tr>
      <td style="width: 55%; vertical-align: top; padding-right: 30px;">
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; font-size: 11.5px; color: #4b5563;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 4px;">Terms & Conditions:</div>
          <div>1. Goods & services once supplied cannot be refunded or exchanged.</div>
          <div>2. This is a computer-generated tax invoice and requires no physical stamp.</div>
          ${restaurant?.receiptConfig?.footerMessage ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #d1d5db; color: #374151;">${restaurant.receiptConfig.footerMessage.replace(/\n/g, '<br/>')}</div>` : ''}
        </div>
      </td>
      <td style="width: 45%; vertical-align: top;">
        <table class="totals-table">
          <tr>
            <td style="padding: 4px 0; color: #4b5563;">Item Subtotal:</td>
            <td style="text-align: right; padding: 4px 0; font-weight: 600; color: #111827;">${currency} ${(order.subtotal ?? 0).toFixed(2)}</td>
          </tr>
          ${order.discountAmount && order.discountAmount > 0 ? `
          <tr>
            <td style="padding: 4px 0; color: #dc2626;">Discount${order.discountType === 'percent' ? ` (${order.discount}%)` : ''}:</td>
            <td style="text-align: right; padding: 4px 0; font-weight: 600; color: #dc2626;">-${currency} ${(order.discountAmount).toFixed(2)}</td>
          </tr>
          ` : ''}
          ${taxRowsHtml}
          ${(order.serviceChargeAmount || order.serviceCharge) ? `
          <tr>
            <td style="padding: 4px 0; color: #4b5563;">Service Charge:</td>
            <td style="text-align: right; padding: 4px 0; font-weight: 500;">${currency} ${((order.serviceChargeAmount || order.serviceCharge) ?? 0).toFixed(2)}</td>
          </tr>
          ` : ''}
          ${(order.tipAmount && order.tipAmount > 0) ? `
          <tr>
            <td style="padding: 4px 0; color: #4b5563;">Tip / Gratuity:</td>
            <td style="text-align: right; padding: 4px 0; font-weight: 500;">${currency} ${(order.tipAmount).toFixed(2)}</td>
          </tr>
          ` : ''}
          ${(order.giftCardDeduction && order.giftCardDeduction > 0) ? `
          <tr>
            <td style="padding: 4px 0; color: #059669;">Gift Card Applied:</td>
            <td style="text-align: right; padding: 4px 0; font-weight: 600; color: #059669;">-${currency} ${(order.giftCardDeduction).toFixed(2)}</td>
          </tr>
          ` : ''}
          <tr class="grand-total">
            <td style="padding: 10px 0;">Total Amount Payable:</td>
            <td style="text-align: right; padding: 10px 0;">${currency} ${(order.total ?? 0).toFixed(2)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Signatory Box -->
  <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
    <tr>
      <td style="width: 60%; vertical-align: bottom;">
        <div style="font-size: 11px; color: #9ca3af;">Thank you for your patronage! Visit again.</div>
      </td>
      <td style="width: 40%; text-align: center; vertical-align: top;">
        <div style="font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 40px;">For ${restName}</div>
        <div style="border-top: 1px solid #9ca3af; padding-top: 4px; font-size: 11px; color: #6b7280;">Authorized Signatory</div>
      </td>
    </tr>
  </table>
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
