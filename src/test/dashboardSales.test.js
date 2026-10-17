import { describe, it, expect } from 'vitest';
import { getOrderTimestampMs } from '../utils/timezoneUtils';

// Helper replicating the verified calculation logic in Dashboard.jsx
function computeSalesStats({ rawDocs = [], offlineOrders = [], activeMemOrders = [], today, endOfToday, restaurantId }) {
  const existingIds = new Set(rawDocs.map(d => d.id));
  const combined = [
    ...rawDocs,
    ...offlineOrders.filter(o => !existingIds.has(o.id)),
    ...activeMemOrders.filter(o => !existingIds.has(o.id))
  ];

  const todayBilled = combined.filter(d => {
    if (d.status === 'cancelled' || d.status === 'void') return false;
    const isBilled = d.status === 'billed' || (d.paymentMethod && d.paymentMethod !== 'unpaid') || d.paid === true;
    if (!isBilled) return false;
    const settleTime = getOrderTimestampMs(d.paidAt) || getOrderTimestampMs(d.updatedAt) || getOrderTimestampMs(d.createdAt);
    return settleTime && settleTime >= today.getTime() && settleTime <= endOfToday.getTime();
  });

  const todayOpen = combined.filter(d => {
    if (d.status === 'cancelled' || d.status === 'void' || d.status === 'billed') return false;
    if (d.paid === true || (d.paymentMethod && d.paymentMethod !== 'unpaid')) return false;
    const orderTime = getOrderTimestampMs(d);
    return !orderTime || (orderTime >= today.getTime() && orderTime <= endOfToday.getTime()) || activeMemOrders.some(m => m.id === d.id);
  });

  const billedSales = Math.round(todayBilled.reduce((s, d) => s + (Number(d.total) || 0), 0) * 100) / 100;
  const billedOrders = todayBilled.length;
  const openSales = Math.round(todayOpen.reduce((s, d) => s + (Number(d.total) || 0), 0) * 100) / 100;
  const totalSales = Math.round((billedSales + openSales) * 100) / 100;

  const paymentSplit = { cash: 0, card: 0, upi: 0, split: 0 };
  todayBilled.forEach(d => {
    if (d.paymentMethod === 'split' && Array.isArray(d.splitPayments)) {
      d.splitPayments.forEach(p => {
        const m = (p.method === 'terminal') ? 'card' : (p.method || 'cash');
        paymentSplit[m] = (paymentSplit[m] || 0) + 1;
      });
    } else if (d.paymentMethod) {
      const methodKey = d.paymentMethod === 'terminal' ? 'card' : d.paymentMethod;
      paymentSplit[methodKey] = (paymentSplit[methodKey] || 0) + 1;
    }
  });

  return {
    settledSales: billedSales,
    settledOrders: billedOrders,
    openSales,
    openOrders: todayOpen.length,
    totalSales,
    totalOrders: billedOrders + todayOpen.length,
    paymentSplit
  };
}

describe('Dashboard Today Sale Number Logic', () => {
  const today = new Date('2026-10-17T00:00:00.000Z');
  const endOfToday = new Date('2026-10-17T23:59:59.999Z');

  it('correctly calculates settled sales and orders for today', () => {
    const rawDocs = [
      { id: '1', status: 'billed', total: 450, paymentMethod: 'upi', paidAt: '2026-10-17T10:00:00.000Z' },
      { id: '2', status: 'billed', total: 250, paymentMethod: 'cash', paidAt: '2026-10-17T11:30:00.000Z' },
    ];
    const stats = computeSalesStats({ rawDocs, today, endOfToday });
    expect(stats.settledSales).toBe(700);
    expect(stats.settledOrders).toBe(2);
    expect(stats.paymentSplit.upi).toBe(1);
    expect(stats.paymentSplit.cash).toBe(1);
  });

  it('excludes cancelled and void orders from sales numbers', () => {
    const rawDocs = [
      { id: '1', status: 'billed', total: 500, paymentMethod: 'cash', paidAt: '2026-10-17T10:00:00.000Z' },
      { id: '2', status: 'cancelled', total: 1000, paymentMethod: 'cash', paidAt: '2026-10-17T10:05:00.000Z' },
      { id: '3', status: 'void', total: 300, paymentMethod: 'upi', paidAt: '2026-10-17T10:10:00.000Z' },
    ];
    const stats = computeSalesStats({ rawDocs, today, endOfToday });
    expect(stats.settledSales).toBe(500);
    expect(stats.settledOrders).toBe(1);
    expect(stats.paymentSplit.cash).toBe(1);
  });

  it('includes orders created yesterday but settled today (midnight crossover)', () => {
    const rawDocs = [
      {
        id: 'late_table_1',
        createdAt: '2026-10-16T23:45:00.000Z',
        paidAt: '2026-10-17T00:30:00.000Z',
        status: 'billed',
        paymentMethod: 'card',
        total: 1200
      }
    ];
    const stats = computeSalesStats({ rawDocs, today, endOfToday });
    expect(stats.settledSales).toBe(1200);
    expect(stats.settledOrders).toBe(1);
  });

  it('excludes orders settled yesterday even if fetched in lookback query', () => {
    const rawDocs = [
      {
        id: 'yesterday_order',
        createdAt: '2026-10-16T22:00:00.000Z',
        paidAt: '2026-10-16T22:45:00.000Z',
        status: 'billed',
        paymentMethod: 'cash',
        total: 800
      }
    ];
    const stats = computeSalesStats({ rawDocs, today, endOfToday });
    expect(stats.settledSales).toBe(0);
    expect(stats.settledOrders).toBe(0);
  });

  it('separates live dining open orders from settled sales without polluting revenue', () => {
    const rawDocs = [
      { id: 'settled_1', status: 'billed', total: 600, paymentMethod: 'cash', paidAt: '2026-10-17T12:00:00.000Z' },
      { id: 'open_table_1', status: 'preparing', total: 950, paymentMethod: 'unpaid', createdAt: '2026-10-17T12:15:00.000Z' }
    ];
    const stats = computeSalesStats({ rawDocs, today, endOfToday });
    expect(stats.settledSales).toBe(600);
    expect(stats.settledOrders).toBe(1);
    expect(stats.openSales).toBe(950);
    expect(stats.openOrders).toBe(1);
    expect(stats.totalSales).toBe(1550);
  });

  it('accurately parses split payments into respective payment methods without double-counting', () => {
    const rawDocs = [
      {
        id: 'split_1',
        status: 'billed',
        paymentMethod: 'split',
        total: 1000,
        paidAt: '2026-10-17T13:00:00.000Z',
        splitPayments: [
          { method: 'cash', amount: 400 },
          { method: 'upi', amount: 600 }
        ]
      }
    ];
    const stats = computeSalesStats({ rawDocs, today, endOfToday });
    expect(stats.paymentSplit.cash).toBe(1);
    expect(stats.paymentSplit.upi).toBe(1);
    expect(stats.paymentSplit.card).toBe(0);
  });
});
