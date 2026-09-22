import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectPrinterPaperSize,
  printInvoiceA4,
  printReceiptBrowser,
  printReceiptSingle,
  printReceipt
} from '../utils/print';

describe('Multi-Format Print & Auto-Detection Suite', () => {
  let mockWindowOpen;
  let mockDocumentWrite;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocumentWrite = vi.fn();
    mockWindowOpen = vi.fn(() => ({
      document: {
        write: mockDocumentWrite,
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    }));
    vi.stubGlobal('window', {
      open: mockWindowOpen,
    });
  });

  describe('detectPrinterPaperSize', () => {
    it('detects 58mm compact thermal printers correctly', () => {
      expect(detectPrinterPaperSize('Goojprt PT-210')).toBe('58mm');
      expect(detectPrinterPaperSize('MPT-II Bluetooth')).toBe('58mm');
      expect(detectPrinterPaperSize('POS-5802DD')).toBe('58mm');
      expect(detectPrinterPaperSize('ZJ-58 Mini')).toBe('58mm');
      expect(detectPrinterPaperSize('RPP-02 Mobile')).toBe('58mm');
      expect(detectPrinterPaperSize('2-inch Portable POS')).toBe('58mm');
      expect(detectPrinterPaperSize('Cat Thermal Mini')).toBe('58mm');
    });

    it('detects A4 normal / laser / inkjet printers correctly', () => {
      expect(detectPrinterPaperSize('HP LaserJet Pro')).toBe('a4');
      expect(detectPrinterPaperSize('Canon Pixma Inkjet')).toBe('a4');
      expect(detectPrinterPaperSize('Epson EcoTank L3210')).toBe('a4');
      expect(detectPrinterPaperSize('Office A4 Tax Invoice Printer')).toBe('a4');
      expect(detectPrinterPaperSize('PDF Export Document')).toBe('a4');
    });

    it('defaults to 80mm for standard thermal counter printers and unknown devices', () => {
      expect(detectPrinterPaperSize('Epson TM-T82')).toBe('80mm');
      expect(detectPrinterPaperSize('Star TSP100')).toBe('80mm');
      expect(detectPrinterPaperSize('POS-80 Counter')).toBe('80mm');
      expect(detectPrinterPaperSize('Receipt Printer 1')).toBe('80mm');
      expect(detectPrinterPaperSize('')).toBe('80mm');
      expect(detectPrinterPaperSize(null)).toBe('80mm');
    });
  });

  describe('A4 Full Tax Invoice Printing', () => {
    const sampleRestaurant = {
      name: 'Kiwi Gourmet Cafe',
      address: '100 Main Street, Cyber Hub',
      phone: '+91 98765 43210',
      email: 'billing@kiwicafe.com',
      gstin: '29ABCDE1234F1Z5',
      fssai: '10019011000123',
      currency: 'INR',
      receiptConfig: {
        footerMessage: 'Thank you for your business!'
      }
    };

    const sampleOrder = {
      id: 'ORD-98765432',
      type: 'dine-in',
      tableName: 'T-05',
      customerName: 'Rohit Sharma',
      customerPhone: '+91 91234 56789',
      subtotal: 500,
      total: 525,
      paymentMethod: 'upi',
      upiRef: 'UPI-77492019'
    };

    const sampleItems = [
      { name: 'Woodfired Pizza', qty: 1, price: 350, selectedModifiers: [{ name: 'Extra Cheese' }] },
      { name: 'Cold Brew', qty: 1, price: 150 }
    ];

    const sampleTaxInfo = {
      lines: [
        { label: 'CGST (2.5%)', amount: 12.5 },
        { label: 'SGST (2.5%)', amount: 12.5 }
      ]
    };

    it('generates an official A4 Tax Invoice document with GSTIN, SAC, and customer info', () => {
      printInvoiceA4({
        restaurant: sampleRestaurant,
        order: sampleOrder,
        items: sampleItems,
        taxInfo: sampleTaxInfo,
        staffName: 'Alice'
      });

      expect(mockWindowOpen).toHaveBeenCalled();
      expect(mockDocumentWrite).toHaveBeenCalled();

      const html = mockDocumentWrite.mock.calls[0][0];
      expect(html).toContain('Tax Invoice / Bill of Supply');
      expect(html).toContain('Kiwi Gourmet Cafe');
      expect(html).toContain('GSTIN: 29ABCDE1234F1Z5');
      expect(html).toContain('FSSAI: 10019011000123');
      expect(html).toContain('Rohit Sharma');
      expect(html).toContain('Woodfired Pizza');
      expect(html).toContain('Extra Cheese');
      expect(html).toContain('996331'); // Restaurant SAC code
      expect(html).toContain('CGST (2.5%)');
      expect(html).toContain('SGST (2.5%)');
      expect(html).toContain('PAID - UPI');
      expect(html).toContain('Authorized Signatory');
      expect(html).toContain('size: A4 portrait');
    });

    it('routes paperSize "a4" automatically from printReceiptBrowser', () => {
      printReceiptBrowser({
        restaurant: sampleRestaurant,
        order: sampleOrder,
        items: sampleItems,
        taxInfo: sampleTaxInfo,
        staffName: 'Alice',
        paperSize: 'a4'
      });

      expect(mockWindowOpen).toHaveBeenCalled();
      const html = mockDocumentWrite.mock.calls[0][0];
      expect(html).toContain('Tax Invoice / Bill of Supply');
    });

    it('routes paperSize "58mm" correctly with 52mm compact thermal width', () => {
      printReceiptBrowser({
        restaurant: sampleRestaurant,
        order: sampleOrder,
        items: sampleItems,
        taxInfo: sampleTaxInfo,
        staffName: 'Alice',
        paperSize: '58mm'
      });

      expect(mockWindowOpen).toHaveBeenCalled();
      const html = mockDocumentWrite.mock.calls[0][0];
      expect(html).toContain('width: 52mm');
    });

    it('routes paperSize "80mm" correctly with 76mm standard thermal width', () => {
      printReceiptBrowser({
        restaurant: sampleRestaurant,
        order: sampleOrder,
        items: sampleItems,
        taxInfo: sampleTaxInfo,
        staffName: 'Alice',
        paperSize: '80mm'
      });

      expect(mockWindowOpen).toHaveBeenCalled();
      const html = mockDocumentWrite.mock.calls[0][0];
      expect(html).toContain('width: 76mm');
    });

    it('routes to A4 Tax Invoice when printerConfig has paperSize "a4"', () => {
      printReceiptSingle({
        restaurant: sampleRestaurant,
        order: sampleOrder,
        items: sampleItems,
        taxInfo: sampleTaxInfo,
        staffName: 'Alice',
        printer: {
          name: 'Office Laser Printer',
          paperSize: 'a4',
          mode: 'browser'
        }
      });

      expect(mockWindowOpen).toHaveBeenCalled();
      const html = mockDocumentWrite.mock.calls[0][0];
      expect(html).toContain('Tax Invoice / Bill of Supply');
    });
  });
});
