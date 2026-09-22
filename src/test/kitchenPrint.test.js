import { describe, it, expect, vi, beforeEach } from 'vitest';
import { printKitchenTickets, printSingleKitchenTicket } from '../utils/print';

describe('Kitchen Printing & Routing Suite', () => {
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

  const sampleOrder = {
    id: 'ORD-12345',
    type: 'dine-in',
    tableName: 'T-10',
    items: [
      { name: 'Margherita Pizza', qty: 2, price: 300 }
    ]
  };

  it('skips physical printing when kitchenConfig.mode is display_only', () => {
    const restaurant = {
      id: 'rest-1',
      kitchenConfig: { mode: 'display_only' },
      peripheralConfig: { printers: [] }
    };

    printKitchenTickets({
      restaurant,
      order: sampleOrder,
      items: sampleOrder.items,
      staffName: 'Sam'
    });

    expect(mockWindowOpen).not.toHaveBeenCalled();
    expect(mockDocumentWrite).not.toHaveBeenCalled();
  });

  it('skips physical printing when kitchenConfig.mode is disabled', () => {
    const restaurant = {
      id: 'rest-1',
      kitchenConfig: { mode: 'disabled' },
      peripheralConfig: { printers: [] }
    };

    printKitchenTickets({
      restaurant,
      order: sampleOrder,
      items: sampleOrder.items,
      staffName: 'Sam'
    });

    expect(mockWindowOpen).not.toHaveBeenCalled();
    expect(mockDocumentWrite).not.toHaveBeenCalled();
  });

  it('triggers 3-inch (80mm) thermal ticket printing when mode is printer_only', () => {
    const restaurant = {
      id: 'rest-1',
      kitchenConfig: {
        mode: 'printer_only',
        paperSize: '80mm',
        ticketTitle: 'KITCHEN ORDER TICKET'
      },
      peripheralConfig: { printers: [] }
    };

    printKitchenTickets({
      restaurant,
      order: sampleOrder,
      items: sampleOrder.items,
      staffName: 'Sam'
    });

    expect(mockWindowOpen).toHaveBeenCalled();
    expect(mockDocumentWrite).toHaveBeenCalled();
    const html = mockDocumentWrite.mock.calls[0][0];
    expect(html).toContain('KITCHEN ORDER TICKET');
    expect(html).toContain('Margherita Pizza');
    expect(html).toContain('76mm'); // 3-inch 80mm printable width
  });

  it('triggers 3-inch (80mm) thermal ticket printing when mode is both', () => {
    const restaurant = {
      id: 'rest-1',
      kitchenConfig: {
        mode: 'both',
        paperSize: '80mm',
        ticketTitle: 'KOT - CHEF PASS'
      },
      peripheralConfig: { printers: [] }
    };

    printKitchenTickets({
      restaurant,
      order: sampleOrder,
      items: sampleOrder.items,
      staffName: 'Sam'
    });

    expect(mockWindowOpen).toHaveBeenCalled();
    const html = mockDocumentWrite.mock.calls[0][0];
    expect(html).toContain('KOT - CHEF PASS');
    expect(html).toContain('Table: T-10');
  });

  it('supports 2-inch (58mm) compact size when configured', () => {
    const restaurant = {
      id: 'rest-1',
      kitchenConfig: {
        mode: 'both',
        paperSize: '58mm',
        ticketTitle: 'KITCHEN'
      },
      peripheralConfig: { printers: [] }
    };

    printKitchenTickets({
      restaurant,
      order: sampleOrder,
      items: sampleOrder.items,
      staffName: 'Sam'
    });

    expect(mockWindowOpen).toHaveBeenCalled();
    const html = mockDocumentWrite.mock.calls[0][0];
    expect(html).toContain('52mm'); // 2-inch 58mm printable width
  });

  it('prints single kitchen ticket on demand via printSingleKitchenTicket', () => {
    const restaurant = {
      id: 'rest-1',
      kitchenConfig: {
        paperSize: '80mm',
        ticketTitle: 'REPRINT KOT'
      },
      peripheralConfig: { printers: [] }
    };

    printSingleKitchenTicket({
      restaurant,
      order: sampleOrder,
      items: sampleOrder.items,
      staffName: 'Manager'
    });

    expect(mockWindowOpen).toHaveBeenCalled();
    const html = mockDocumentWrite.mock.calls[0][0];
    expect(html).toContain('REPRINT KOT');
  });
});
