import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  packBitsToEscPosRaster,
  ditherGrayscalePixels,
  thresholdGrayscalePixels,
} from '../utils/thermalLogo';
import { printReceipt } from '../utils/print';

describe('Thermal Logo Processing & Receipt Printing Suite', () => {
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

  describe('ESC/POS Bit Packing', () => {
    it('generates standard GS v 0 raster command headers and packs bits MSB-first', () => {
      // 8 pixels wide, 2 pixels high = 16 pixels = 2 bytes of data
      // Row 0: 1 0 1 0 1 0 1 0 (0xAA)
      // Row 1: 0 1 0 1 0 1 0 1 (0x55)
      const binary = new Uint8Array([
        1, 0, 1, 0, 1, 0, 1, 0,
        0, 1, 0, 1, 0, 1, 0, 1
      ]);
      const bytes = packBitsToEscPosRaster(binary, 8, 2);

      // GS v 0 m xL xH yL yH
      // Header: [29, 118, 48, 0, 1, 0, 2, 0]
      expect(bytes[0]).toBe(29);  // GS
      expect(bytes[1]).toBe(118); // v
      expect(bytes[2]).toBe(48);  // 0
      expect(bytes[3]).toBe(0);   // m
      expect(bytes[4]).toBe(1);   // xL (1 byte wide)
      expect(bytes[5]).toBe(0);   // xH
      expect(bytes[6]).toBe(2);   // yL (2 dots high)
      expect(bytes[7]).toBe(0);   // yH

      // Data bytes
      expect(bytes[8]).toBe(0xAA); // 10101010
      expect(bytes[9]).toBe(0x55); // 01010101
      expect(bytes.length).toBe(10);
    });
  });

  describe('Dithering & Thresholding Algorithms', () => {
    it('correctly thresholds pure black, gray, and white pixels', () => {
      const gray = new Float32Array([0, 100, 150, 255]);
      const binary = thresholdGrayscalePixels(gray, 4, 1, 128);

      expect(binary[0]).toBe(1); // 0 < 128 -> black (1)
      expect(binary[1]).toBe(1); // 100 < 128 -> black (1)
      expect(binary[2]).toBe(0); // 150 >= 128 -> white (0)
      expect(binary[3]).toBe(0); // 255 >= 128 -> white (0)
    });

    it('inverts black and white when invert flag is true', () => {
      const gray = new Float32Array([0, 255]);
      const binaryInverted = thresholdGrayscalePixels(gray, 2, 1, 128, true);

      expect(binaryInverted[0]).toBe(0); // inverted from black to white
      expect(binaryInverted[1]).toBe(1); // inverted from white to black
    });

    it('diffuses quantization error across neighbor pixels using Floyd-Steinberg', () => {
      // 2x2 grid of mid-gray (128)
      const gray = new Float32Array([128, 128, 128, 128]);
      const binary = ditherGrayscalePixels(gray, 2, 2, 128);

      // In dithering, not all pixels are identical because error diffuses
      expect(binary.length).toBe(4);
      const blackCount = binary.filter(b => b === 1).length;
      expect(blackCount).toBeGreaterThan(0);
      expect(blackCount).toBeLessThan(4);
    });
  });

  describe('Receipt HTML Printing with Thermal Logo', () => {
    const mockOrder = {
      id: 'ORD-TEST-999',
      type: 'dine-in',
      tableName: 'T-01',
      total: 250,
      subtotal: 250,
      paymentMethod: 'cash'
    };

    it('includes thermalLogo <img> in the printed HTML receipt', () => {
      const restaurantWithLogo = {
        name: 'The Golden Spoon',
        currency: 'INR',
        receiptConfig: {
          thermalLogo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        },
        peripheralConfig: { printers: [] } // Triggers browser print
      };

      printReceipt({
        restaurant: restaurantWithLogo,
        order: mockOrder,
        items: [{ name: 'Pasta', qty: 1, price: 250 }],
        taxInfo: { lines: [] },
        staffName: 'Alice'
      });

      expect(mockWindowOpen).toHaveBeenCalled();
      expect(mockDocumentWrite).toHaveBeenCalled();

      const htmlContent = mockDocumentWrite.mock.calls[0][0];
      expect(htmlContent).toContain('<img src="data:image/png;base64,');
      expect(htmlContent).toContain('The Golden Spoon');
      expect(htmlContent).toContain('image-rendering: pixelated');
    });

    it('falls back cleanly to plain text header when no logo is set', () => {
      const restaurantNoLogo = {
        name: 'Plain Diner',
        currency: 'INR',
        peripheralConfig: { printers: [] }
      };

      printReceipt({
        restaurant: restaurantNoLogo,
        order: mockOrder,
        items: [{ name: 'Burger', qty: 1, price: 150 }],
        taxInfo: { lines: [] },
        staffName: 'Bob'
      });

      expect(mockDocumentWrite).toHaveBeenCalled();
      const htmlContent = mockDocumentWrite.mock.calls[0][0];
      expect(htmlContent).not.toContain('<img src=');
      expect(htmlContent).toContain('Plain Diner');
    });
  });
});
