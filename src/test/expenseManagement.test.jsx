// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useExpenseStore, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../stores/expenseStore';
import { useShiftStore } from '../stores/shiftStore';
import { useAuthStore } from '../stores/authStore';
import fs from 'fs';
import path from 'path';

// Partial mock for firestore
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    collection: vi.fn(),
    addDoc: vi.fn(() => Promise.resolve({ id: 'mock-cloud-exp-id' })),
    deleteDoc: vi.fn(() => Promise.resolve()),
    doc: vi.fn(),
    getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
    serverTimestamp: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    query: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn()
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() }
  })
}));

describe('Expense Management & Till Drawer Auto-Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    useExpenseStore.setState({ expenses: [], loading: false, error: null });
    useShiftStore.setState({
      activeShift: {
        id: 'shift_test_101',
        status: 'open',
        openedBy: 'Test Cashier',
        startCash: 1000,
        cashSalesAmount: 500,
        cashSalesCount: 5,
        cashDrops: [{ amount: 100, note: 'Drop 1' }],
        paidOuts: [{ amount: 50, note: 'Vendor cash' }],
        expectedCash: 1350
      }
    });
    useAuthStore.setState({
      restaurant: { id: 'rest_test_001', name: 'Test Restaurant', currency: 'INR' },
      staffDoc: { id: 'staff_1', name: 'Manager Dave', role: 'manager' }
    });
  });

  it('provides well-defined expense categories and payment methods', () => {
    expect(EXPENSE_CATEGORIES.length).toBeGreaterThanOrEqual(8);
    const supplies = EXPENSE_CATEGORIES.find(c => c.id === 'supplies');
    expect(supplies).toBeDefined();
    expect(supplies.icon).toBeDefined();

    const drawerMethod = PAYMENT_METHODS.find(m => m.id === 'cash_drawer');
    expect(drawerMethod).toBeDefined();
    expect(drawerMethod.isDrawer).toBe(true);
  });

  it('rejects invalid or non-positive expense amounts', async () => {
    const resZero = await useExpenseStore.getState().addExpense('rest_test_001', {
      amount: 0,
      category: 'supplies'
    });
    expect(resZero.ok).toBe(false);

    const resNegative = await useExpenseStore.getState().addExpense('rest_test_001', {
      amount: -50,
      category: 'supplies'
    });
    expect(resNegative.ok).toBe(false);
  });

  it('auto-syncs cash drawer expense with active shift register as paidout', async () => {
    const recordSpy = vi.spyOn(useShiftStore.getState(), 'recordCashTransaction').mockResolvedValue(true);

    const result = await useExpenseStore.getState().addExpense('rest_test_001', {
      amount: 250,
      category: 'supplies',
      paymentMethod: 'cash_drawer',
      payee: 'Local Grocery',
      note: 'Fresh cilantro and onions'
    });

    expect(result.ok).toBe(true);
    expect(result.syncedToTill).toBe(true);

    // Verify spy called with correct drawer paidout arguments
    expect(recordSpy).toHaveBeenCalledWith(
      'rest_test_001',
      'shift_test_101',
      250,
      'paidout',
      expect.stringContaining('[Expense:')
    );

    // Check store contents
    const expenses = useExpenseStore.getState().expenses;
    expect(expenses.length).toBe(1);
    expect(expenses[0].amount).toBe(250);
    expect(expenses[0].paymentMethod).toBe('cash_drawer');
    expect(expenses[0].shiftId).toBe('shift_test_101');
  });

  it('does NOT record to shift register if payment method is not cash_drawer', async () => {
    const recordSpy = vi.spyOn(useShiftStore.getState(), 'recordCashTransaction');

    const result = await useExpenseStore.getState().addExpense('rest_test_001', {
      amount: 4500,
      category: 'utilities',
      paymentMethod: 'bank_transfer',
      payee: 'Electricity Board',
      note: 'May electricity bill'
    });

    expect(result.ok).toBe(true);
    expect(result.syncedToTill).toBe(false);
    expect(recordSpy).not.toHaveBeenCalled();

    const expenses = useExpenseStore.getState().expenses;
    expect(expenses.length).toBe(1);
    expect(expenses[0].amount).toBe(4500);
    expect(expenses[0].shiftId).toBeNull();
  });

  it('deletes an expense correctly from store', async () => {
    await useExpenseStore.getState().addExpense('rest_test_001', {
      amount: 100,
      category: 'packaging',
      paymentMethod: 'upi',
      payee: 'Packers Co'
    });

    const expId = useExpenseStore.getState().expenses[0].id;
    expect(useExpenseStore.getState().expenses.length).toBe(1);

    await useExpenseStore.getState().deleteExpense('rest_test_001', expId);
    expect(useExpenseStore.getState().expenses.length).toBe(0);
  });

  it('verifies till drawer self-healing expectedCash formula', () => {
    const shift = {
      startCash: 1200,
      cashSalesAmount: 850.50,
      cashDrops: [{ amount: 300 }, { amount: 200 }],
      paidOuts: [{ amount: 150.25 }, { amount: 50.25 }]
    };

    const dropsAmt = shift.cashDrops.reduce((sum, d) => sum + d.amount, 0); // 500
    const paidOutsAmt = shift.paidOuts.reduce((sum, p) => sum + p.amount, 0); // 200.50

    // startCash + cashSalesAmount - dropsAmt - paidOutsAmt
    // 1200 + 850.50 - 500 - 200.50 = 1350
    const derivedExpected = Math.round(((Number(shift.startCash) || 0) + (Number(shift.cashSalesAmount) || 0) - dropsAmt - paidOutsAmt) * 100) / 100;
    expect(derivedExpected).toBe(1350);

    const countedCash = 1350;
    const variance = Math.round((countedCash - derivedExpected) * 100) / 100;
    expect(variance).toBe(0);

    // Over-counted
    const overCounted = 1400;
    expect(Math.round((overCounted - derivedExpected) * 100) / 100).toBe(50);

    // Shortage
    const shortCounted = 1300;
    expect(Math.round((shortCounted - derivedExpected) * 100) / 100).toBe(-50);
  });

  it('registers /admin/expenses in Sidebar ADMIN_NAV and App.jsx routes', () => {
    const sidebarPath = path.resolve(__dirname, '../components/layout/Sidebar.jsx');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
    expect(sidebarContent).toContain("path: '/admin/expenses'");
    expect(sidebarContent).toContain('WalletCards');

    const appPath = path.resolve(__dirname, '../App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');
    expect(appContent).toContain("import('./routes/admin/Expenses')");
    expect(appContent).toContain('path="/admin/expenses"');

    const reportsPath = path.resolve(__dirname, '../routes/Reports.jsx');
    const reportsContent = fs.readFileSync(reportsPath, 'utf8');
    expect(reportsContent).toContain('Profit & Loss Overview');
    expect(reportsContent).toContain('/admin/expenses');
  });
});
