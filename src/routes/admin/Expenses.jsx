import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useExpenseStore, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../../stores/expenseStore';
import { useShiftStore } from '../../stores/shiftStore';
import { formatCurrency } from '../../utils/formatCurrency';
import toast from 'react-hot-toast';
import {
  WalletCards, Plus, Search, Download, Trash2,
  CheckCircle2, AlertCircle, Layers, X
} from 'lucide-react';

export default function Expenses() {
  const { restaurant } = useAuthStore();
  const currency = restaurant?.currency ?? 'INR';
  const staffDoc = useAuthStore(s => s.staffDoc);
  const activeShift = useShiftStore(s => s.activeShift);

  const { expenses, loading, subscribeExpenses, addExpense, deleteExpense } = useExpenseStore();

  // Filters
  const [period, setPeriod] = useState('month'); // 'today', 'week', 'month', '30days', 'year', 'all'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMethod, setSelectedMethod] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('supplies');
  const [formMethod, setFormMethod] = useState('cash_drawer');
  const [formPayee, setFormPayee] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formNote, setFormNote] = useState('');
  const [formInvoice, setFormInvoice] = useState('');

  // Subscribe to live Firestore expenses on mount
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = subscribeExpenses(restaurant.id);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [restaurant?.id, subscribeExpenses]);

  // Date filtering logic
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return (expenses || []).filter(item => {
      const itemDate = new Date(item.date || item.createdAt);

      // Period filter
      if (period === 'today') {
        if (itemDate < startOfToday) return false;
      } else if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (itemDate < weekAgo) return false;
      } else if (period === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (itemDate < startOfMonth) return false;
      } else if (period === '30days') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (itemDate < monthAgo) return false;
      } else if (period === 'year') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        if (itemDate < startOfYear) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // Method filter
      if (selectedMethod !== 'all' && item.paymentMethod !== selectedMethod) {
        return false;
      }

      // Search query (payee, note, invoiceNumber, categoryLabel)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const payee = (item.payee || '').toLowerCase();
        const note = (item.note || '').toLowerCase();
        const inv = (item.invoiceNumber || '').toLowerCase();
        const catLabel = (item.categoryLabel || '').toLowerCase();
        if (!payee.includes(q) && !note.includes(q) && !inv.includes(q) && !catLabel.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, period, selectedCategory, selectedMethod, searchQuery]);

  // Aggregate KPI metrics
  const metrics = useMemo(() => {
    let total = 0;
    let drawerTotal = 0;
    let directTotal = 0;
    const catMap = {};

    filteredExpenses.forEach(exp => {
      const amt = Number(exp.amount) || 0;
      total += amt;
      if (exp.paymentMethod === 'cash_drawer') {
        drawerTotal += amt;
      } else {
        directTotal += amt;
      }

      const catKey = exp.category || 'misc';
      catMap[catKey] = (catMap[catKey] || 0) + amt;
    });

    // Find top category
    let topCatId = null;
    let topCatAmt = 0;
    Object.entries(catMap).forEach(([catId, sum]) => {
      if (sum > topCatAmt) {
        topCatAmt = sum;
        topCatId = catId;
      }
    });

    const topCatObj = EXPENSE_CATEGORIES.find(c => c.id === topCatId);
    const topCatPct = total > 0 ? Math.round((topCatAmt / total) * 100) : 0;

    return {
      total: Math.round(total * 100) / 100,
      count: filteredExpenses.length,
      drawerTotal: Math.round(drawerTotal * 100) / 100,
      directTotal: Math.round(directTotal * 100) / 100,
      topCategoryName: topCatObj ? topCatObj.label.split('(')[0].trim() : 'None',
      topCategoryPct: topCatPct
    };
  }, [filteredExpenses]);

  // Reset form
  const resetForm = () => {
    setFormAmount('');
    setFormCategory('supplies');
    setFormMethod('cash_drawer');
    setFormPayee('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNote('');
    setFormInvoice('');
    setIsSubmitting(false);
  };

  // Submit expense
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const numAmt = parseFloat(formAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      toast.error('Please enter a valid expense amount.');
      return;
    }

    if (!restaurant?.id) {
      toast.error('Restaurant not identified.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await addExpense(restaurant.id, {
        amount: numAmt,
        category: formCategory,
        paymentMethod: formMethod,
        payee: formPayee,
        date: formDate,
        note: formNote,
        invoiceNumber: formInvoice,
        createdByName: staffDoc?.name || 'Manager',
        createdById: staffDoc?.id || null
      });

      if (res?.ok) {
        if (res.syncedToTill) {
          toast.success(`Expense saved! Deducted ${formatCurrency(numAmt, currency)} from Cash Drawer float.`, {
            icon: '💵',
            duration: 4000
          });
        } else {
          toast.success('Expense recorded successfully!');
        }
        setShowModal(false);
        resetForm();
      } else {
        toast.error(res?.error || 'Failed to save expense');
      }
    } catch (err) {
      toast.error('Error saving expense: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete expense
  const handleDelete = async (id, payee, amount) => {
    if (!window.confirm(`Delete expense of ${formatCurrency(amount, currency)} ${payee ? `for ${payee}` : ''}?`)) {
      return;
    }
    try {
      await deleteExpense(restaurant?.id, id);
      toast.success('Expense removed.');
    } catch (err) {
      toast.error('Failed to delete expense: ' + err.message);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      toast.error('No expenses to export for this view.');
      return;
    }

    const headers = ['Date', 'Category', 'Payee / Vendor', 'Payment Method', 'Amount', 'Invoice #', 'Notes', 'Logged By'];
    const rows = filteredExpenses.map(item => {
      const d = item.date ? new Date(item.date).toLocaleDateString() : 'N/A';
      const cat = item.categoryLabel || item.category || 'Misc';
      const method = PAYMENT_METHODS.find(m => m.id === item.paymentMethod)?.label || item.paymentMethod;
      return [
        `"${d}"`,
        `"${cat.replace(/"/g, '""')}"`,
        `"${(item.payee || '').replace(/"/g, '""')}"`,
        `"${method.replace(/"/g, '""')}"`,
        item.amount || 0,
        `"${(item.invoiceNumber || '').replace(/"/g, '""')}"`,
        `"${(item.note || '').replace(/"/g, '""')}"`,
        `"${(item.createdByName || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kiwi_expenses_${period}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 className="text-title2" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.12)',
              color: 'var(--color-green, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(16, 185, 129, 0.25)'
            }}>
              <WalletCards size={20} />
            </div>
            <span>Expenses & Petty Cash</span>
          </h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 4, marginBottom: 0 }}>
            Track daily operating expenses, vendor bills, and auto-sync petty cash paid-outs with the till drawer.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCSV}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40 }}
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, background: 'var(--color-green, #10b981)' }}
          >
            <Plus size={16} />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-3)'
      }}>
        {/* Total Expenses */}
        <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Period Expenses
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', background: 'var(--color-bg)', padding: '2px 8px', borderRadius: 99 }}>
              {metrics.count} recorded
            </span>
          </div>
          <div className="text-title1" style={{ color: 'var(--color-label)', fontWeight: 800 }}>
            {formatCurrency(metrics.total, currency)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-label-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Filtered for: {period === 'all' ? 'All Time' : period === '30days' ? 'Past 30 Days' : period}</span>
          </div>
        </div>

        {/* Cash Drawer Paid-Outs */}
        <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Till Drawer Paid-Outs
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-green, #10b981)',
              background: 'rgba(16, 185, 129, 0.1)',
              padding: '2px 8px',
              borderRadius: 99,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <Layers size={11} /> Auto-Deducted
            </span>
          </div>
          <div className="text-title1" style={{ color: 'var(--color-green, #10b981)', fontWeight: 800 }}>
            {formatCurrency(metrics.drawerTotal, currency)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-label-tertiary)' }}>
            Petty cash taken directly from till float
          </div>
        </div>

        {/* Direct Overheads */}
        <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Direct Overheads
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', background: 'var(--color-bg)', padding: '2px 8px', borderRadius: 99 }}>
              UPI / Bank / Card
            </span>
          </div>
          <div className="text-title1" style={{ color: 'var(--color-label)', fontWeight: 800 }}>
            {formatCurrency(metrics.directTotal, currency)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-label-tertiary)' }}>
            Paid outside the cashier drawer
          </div>
        </div>

        {/* Top Expense Bucket */}
        <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
              Top Cost Category
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-orange, #f59e0b)',
              background: 'rgba(245, 158, 11, 0.1)',
              padding: '2px 8px',
              borderRadius: 99
            }}>
              {metrics.topCategoryPct}% of total
            </span>
          </div>
          <div className="text-title2" style={{ color: 'var(--color-label)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {metrics.topCategoryName}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-label-tertiary)' }}>
            Largest operational cost center
          </div>
        </div>
      </div>

      {/* ── FILTERS & SEARCH BAR ── */}
      <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* Period Pills */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div style={{
            display: 'inline-flex',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-separator)',
            borderRadius: 'var(--radius-md)',
            padding: 3,
            gap: 2,
            overflowX: 'auto',
            maxWidth: '100%'
          }}>
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: '30days', label: 'Past 30 Days' },
              { id: 'year', label: 'This Year' },
              { id: 'all', label: 'All Records' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                style={{
                  border: 'none',
                  background: period === p.id ? 'var(--color-bg-elevated)' : 'transparent',
                  color: period === p.id ? 'var(--color-label)' : 'var(--color-label-secondary)',
                  fontWeight: period === p.id ? 700 : 500,
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  boxShadow: period === p.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--color-label-tertiary)' }}>
            Showing <strong>{filteredExpenses.length}</strong> vouchers
          </div>
        </div>

        {/* Dropdowns + Search */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 220px', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, color: 'var(--color-label-tertiary)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search payee, invoice # or note..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 36, width: '100%', height: 38 }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <div style={{ minWidth: 180 }}>
            <select
              className="input"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ height: 38, cursor: 'pointer' }}
            >
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Dropdown */}
          <div style={{ minWidth: 170 }}>
            <select
              className="input"
              value={selectedMethod}
              onChange={e => setSelectedMethod(e.target.value)}
              style={{ height: 38, cursor: 'pointer' }}
            >
              <option value="all">All Payment Methods</option>
              {PAYMENT_METHODS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {(selectedCategory !== 'all' || selectedMethod !== 'all' || searchQuery) && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSelectedCategory('all');
                setSelectedMethod('all');
                setSearchQuery('');
              }}
              style={{ fontSize: '12px', height: 38 }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── EXPENSES TABLE / LEDGER ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading && expenses.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
            Loading expenses ledger...
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div style={{
            padding: 'var(--space-8) var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
            textAlign: 'center'
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-full, 9999px)',
              background: 'rgba(16, 185, 129, 0.08)',
              color: 'var(--color-green, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <WalletCards size={28} />
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: 'var(--color-label)' }}>
                No Expenses Found
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-label-secondary)', maxWidth: 360 }}>
                {searchQuery || selectedCategory !== 'all' || selectedMethod !== 'all'
                  ? 'No expense vouchers matched your active filter criteria.'
                  : 'Start tracking daily petty cash, kitchen supplies, utilities, and vendor costs.'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
              style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-green, #10b981)' }}
            >
              <Plus size={16} />
              <span>Record First Expense</span>
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid var(--color-separator)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-label-secondary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Category</th>
                  <th style={{ padding: '12px 16px' }}>Payee & Details</th>
                  <th style={{ padding: '12px 16px' }}>Payment Method</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', width: 60 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => {
                  const catObj = EXPENSE_CATEGORIES.find(c => c.id === exp.category) || {
                    icon: '📝',
                    label: exp.categoryLabel || 'Misc',
                    color: '#94a3b8'
                  };
                  const isDrawer = exp.paymentMethod === 'cash_drawer';
                  const dateStr = exp.date ? new Date(exp.date).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  }) : 'N/A';

                  return (
                    <tr
                      key={exp.id}
                      style={{
                        borderBottom: '1px solid var(--color-separator)',
                        transition: 'background 0.12s ease'
                      }}
                    >
                      {/* Date */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--color-label-secondary)', fontWeight: 500 }}>
                        {dateStr}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-separator)',
                          color: 'var(--color-label)'
                        }}>
                          <span>{catObj.icon}</span>
                          <span>{catObj.label.split('(')[0].trim()}</span>
                        </span>
                      </td>

                      {/* Payee & Details */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-label)' }}>
                              {exp.payee || 'Direct Vendor / Petty Cash'}
                            </span>
                            {exp.invoiceNumber && (
                              <span style={{
                                fontSize: '10px',
                                padding: '1px 5px',
                                borderRadius: 4,
                                background: 'rgba(59, 130, 246, 0.1)',
                                color: 'var(--color-accent, #3b82f6)',
                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                fontWeight: 600
                              }}>
                                #{exp.invoiceNumber}
                              </span>
                            )}
                          </div>
                          {exp.note && (
                            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                              {exp.note}
                            </span>
                          )}
                          {exp.createdByName && (
                            <span style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', opacity: 0.8 }}>
                              By {exp.createdByName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        {isDrawer ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            color: 'var(--color-green, #10b981)'
                          }}>
                            <Layers size={11} />
                            <span>Till Paid-Out</span>
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-separator)',
                            color: 'var(--color-label-secondary)'
                          }}>
                            {exp.paymentMethod === 'upi' ? 'UPI / QR' :
                             exp.paymentMethod === 'bank_transfer' ? 'Bank Wire' :
                             exp.paymentMethod === 'card' ? 'Card' :
                             'Personal Cash'}
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '14px',
                          color: 'var(--color-label)'
                        }}>
                          {formatCurrency(exp.amount, currency)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleDelete(exp.id, exp.payee, exp.amount)}
                          style={{
                            width: 30,
                            height: 30,
                            padding: 0,
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-label-tertiary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Delete expense"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RECORD EXPENSE MODAL ── */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 'var(--space-4)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) {
              setShowModal(false);
            }
          }}
        >
          <div
            className="card card-padded"
            style={{
              width: '100%',
              maxWidth: 540,
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 'var(--radius-xl, 16px)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              position: 'relative',
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-separator)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <div>
                <h3 className="text-title3" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <WalletCards size={20} color="var(--color-green, #10b981)" />
                  <span>Record New Expense</span>
                </h3>
                <p className="text-secondary" style={{ margin: '2px 0 0', fontSize: '12px' }}>
                  Log an operational cost, vendor bill, or register petty cash outflow.
                </p>
              </div>

              {/* Close Button with accessibility and touch area */}
              <button
                type="button"
                className="modal-close-touch"
                onClick={() => setShowModal(false)}
                disabled={isSubmitting}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveExpense} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Amount */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-label)', marginBottom: 6 }}>
                  Expense Amount ({currency}) <span style={{ color: 'var(--color-red)' }}>*</span>
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute',
                    left: 14,
                    fontSize: '18px',
                    fontWeight: 800,
                    color: 'var(--color-green, #10b981)'
                  }}>
                    {currency === 'INR' ? '₹' : currency}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    required
                    autoFocus
                    style={{
                      paddingLeft: 42,
                      fontSize: '20px',
                      fontWeight: 800,
                      height: 50,
                      width: '100%',
                      color: 'var(--color-label)'
                    }}
                  />
                </div>
              </div>

              {/* Payment Method Picker */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-label)', marginBottom: 6 }}>
                  Payment Method
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 8
                }}>
                  {PAYMENT_METHODS.map(m => {
                    const isSelected = formMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setFormMethod(m.id)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected
                            ? '1.5px solid var(--color-green, #10b981)'
                            : '1px solid var(--color-separator)',
                          background: isSelected
                            ? 'rgba(16, 185, 129, 0.08)'
                            : 'var(--color-bg)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{
                          fontWeight: 700,
                          fontSize: '12px',
                          color: isSelected ? 'var(--color-green, #10b981)' : 'var(--color-label)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}>
                          {m.isDrawer && <Layers size={13} />}
                          <span>{m.label.split('(')[0].trim()}</span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                          {m.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Auto-sync notice for Cash Drawer */}
                {formMethod === 'cash_drawer' && (
                  <div style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: activeShift ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    border: activeShift ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '11px',
                    color: activeShift ? 'var(--color-green, #10b981)' : 'var(--color-orange, #f59e0b)'
                  }}>
                    {activeShift ? (
                      <>
                        <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                        <span>
                          <strong>Till Drawer Auto-Sync:</strong> This payment will automatically register as an <em>Expense Paid-Out</em> in the current active shift register, keeping drawer cash balance 100% accurate.
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={14} style={{ flexShrink: 0 }} />
                        <span>
                          <strong>No Active Register Shift:</strong> There is no open shift right now. This expense will be recorded in accounting, but won't deduct from an active till drawer.
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Category Picker */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-label)', marginBottom: 6 }}>
                  Expense Category
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: 6,
                  maxHeight: 160,
                  overflowY: 'auto',
                  padding: 2
                }}>
                  {EXPENSE_CATEGORIES.map(c => {
                    const isSelected = formCategory === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFormCategory(c.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: isSelected
                            ? '1.5px solid var(--color-accent, #3b82f6)'
                            : '1px solid var(--color-separator)',
                          background: isSelected
                            ? 'rgba(59, 130, 246, 0.1)'
                            : 'var(--color-bg)',
                          color: isSelected ? 'var(--color-label)' : 'var(--color-label-secondary)',
                          fontSize: '11px',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <span>{c.icon}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.label.split('(')[0].trim()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payee + Date row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-label)', marginBottom: 6 }}>
                    Payee / Vendor Name
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Metro Cash, Dairy, Landlord"
                    value={formPayee}
                    onChange={e => setFormPayee(e.target.value)}
                    style={{ width: '100%', height: 38 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-label)', marginBottom: 6 }}>
                    Expense Date
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    required
                    style={{ width: '100%', height: 38 }}
                  />
                </div>
              </div>

              {/* Notes + Invoice Reference row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-label)', marginBottom: 6 }}>
                    Invoice / Receipt # <span style={{ color: 'var(--color-label-tertiary)', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. INV-9042"
                    value={formInvoice}
                    onChange={e => setFormInvoice(e.target.value)}
                    style={{ width: '100%', height: 38 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-label)', marginBottom: 6 }}>
                    Notes / Memo
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Details or reason..."
                    value={formNote}
                    onChange={e => setFormNote(e.target.value)}
                    style={{ width: '100%', height: 38 }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 'var(--space-2)',
                marginTop: 'var(--space-2)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--color-separator)'
              }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--color-green, #10b981)'
                  }}
                >
                  {isSubmitting ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Save Expense</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
