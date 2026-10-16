import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useStaffStore } from '../../stores/staffStore';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatCurrency';
import { exportPayrollToCSV } from '../../utils/payrollExport';
import { 
  Users, DollarSign, Wallet, Download, Edit2, 
  Search, Calendar, Save, X, AlertCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Payroll() {
  const { restaurant } = useAuthStore();
  const { staff: staffList } = useStaffStore();
  
  // Date state - defaults to current YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });

  const [payrollEntries, setPayrollEntries] = useState(() => {
    try {
      const restId = useAuthStore.getState().restaurant?.id;
      const d = new Date();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const curMonth = `${d.getFullYear()}-${mm}`;
      const cached = localStorage.getItem(`dineos_cached_payroll_${restId}_${curMonth}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return {};
  });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Editing state
  const [editingStaff, setEditingStaff] = useState(null); // staff object
  const [editForm, setEditForm] = useState({
    hoursWorked: '',
    overtimeHours: '',
    bonus: '',
    deductions: '',
    notes: '',
    salaryRate: '',
    salaryType: 'monthly',
    overtimeRate: '1.5'
  });

  // 2. Fetch Payroll Entries for selected month
  useEffect(() => {
    if (!restaurant?.id || !selectedMonth) return;
    try {
      const cached = localStorage.getItem(`dineos_cached_payroll_${restaurant.id}_${selectedMonth}`);
      if (cached) setPayrollEntries(JSON.parse(cached));
    } catch {}
    return onSnapshot(collection(db, 'restaurants', restaurant.id, 'payroll', selectedMonth, 'entries'), snap => {
      const entries = {};
      snap.docs.forEach(d => {
        entries[d.id] = { id: d.id, ...d.data() };
      });
      setPayrollEntries(entries);
      try {
        localStorage.setItem(`dineos_cached_payroll_${restaurant.id}_${selectedMonth}`, JSON.stringify(entries));
      } catch {}
    }, () => {});
  }, [restaurant?.id, selectedMonth]);

  // 3. Compute display data combining staff data & month's payroll entries
  const payrollRecords = useMemo(() => {
    return staffList.map(staff => {
      const entry = payrollEntries[staff.id] || {};
      
      // Fall back to staff base settings if no monthly entry exists
      const salaryType = entry.salaryType || staff.salaryType || 'monthly';
      const salaryRate = entry.salaryRate !== undefined ? entry.salaryRate : (staff.salaryRate || 0);
      const overtimeRate = entry.overtimeRate !== undefined ? entry.overtimeRate : (staff.overtimeRate || 1.5);
      
      const hoursWorked = entry.hoursWorked || 0;
      const overtimeHours = entry.overtimeHours || 0;
      const bonus = entry.bonus || 0;
      const deductions = entry.deductions || 0;
      const notes = entry.notes || '';

      // Compute gross & net pay
      const grossPay = salaryType === 'hourly'
        ? (salaryRate * hoursWorked) + (salaryRate * overtimeRate * overtimeHours) + bonus
        : salaryRate + bonus;
      const netPay = Math.max(0, grossPay - deductions);

      return {
        staffId: staff.id,
        staffName: staff.name,
        role: staff.role,
        active: staff.active !== false,
        salaryType,
        salaryRate,
        overtimeRate,
        hoursWorked,
        overtimeHours,
        bonus,
        deductions,
        notes,
        grossPay,
        netPay,
        hasSavedEntry: !!payrollEntries[staff.id]
      };
    }).filter(record => record.active || record.hasSavedEntry); // Show active staff, or inactive staff who have a payroll entry for this month
  }, [staffList, payrollEntries]);

  // Filter records by search query
  const filteredRecords = useMemo(() => {
    return payrollRecords.filter(r => 
      r.staffName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.role.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [payrollRecords, searchQuery]);

  // Compute overall summary stats
  const totalStaff = filteredRecords.length;
  const totalGross = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + r.grossPay, 0);
  }, [filteredRecords]);
  const totalNet = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + r.netPay, 0);
  }, [filteredRecords]);

  // Handle opening edit modal
  const openEditModal = (record) => {
    setEditingStaff(record);
    setEditForm({
      hoursWorked: record.hoursWorked || '',
      overtimeHours: record.overtimeHours || '',
      bonus: record.bonus || '',
      deductions: record.deductions || '',
      notes: record.notes || '',
      salaryRate: record.salaryRate || '',
      salaryType: record.salaryType,
      overtimeRate: record.overtimeRate || '1.5'
    });
  };

  // Save payroll entry to Firestore
  const savePayrollEntry = async () => {
    if (!restaurant?.id || !selectedMonth || !editingStaff) return;

    try {
      const rate = Number(editForm.salaryRate) || 0;
      const type = editForm.salaryType;
      const otRate = Number(editForm.overtimeRate) || 1.5;
      const hours = type === 'hourly' ? (Number(editForm.hoursWorked) || 0) : 0;
      const otHours = type === 'hourly' ? (Number(editForm.overtimeHours) || 0) : 0;
      const bonus = Number(editForm.bonus) || 0;
      const deductions = Number(editForm.deductions) || 0;

      // Compute values to save
      let grossPay = 0;
      if (type === 'hourly') {
        grossPay = (rate * hours) + (rate * otRate * otHours) + bonus;
      } else {
        grossPay = rate + bonus;
      }
      const netPay = Math.max(0, grossPay - deductions);

      // Optimistic local state update
      const newEntry = {
        id: editingStaff.staffId,
        staffId: editingStaff.staffId,
        staffName: editingStaff.staffName,
        role: editingStaff.role,
        salaryType: type,
        salaryRate: rate,
        overtimeRate: otRate,
        hoursWorked: hours,
        overtimeHours: otHours,
        bonus,
        deductions,
        notes: editForm.notes.trim(),
        grossPay,
        netPay,
        updatedAt: new Date().toISOString()
      };
      setPayrollEntries(prev => {
        const next = { ...prev, [editingStaff.staffId]: newEntry };
        try {
          localStorage.setItem(`dineos_cached_payroll_${restaurant.id}_${selectedMonth}`, JSON.stringify(next));
        } catch {}
        return next;
      });

      toast.success(`Payroll saved for ${editingStaff.staffName}`);
      setEditingStaff(null);

      // 1. Write the payroll entry for this month
      const entryRef = doc(db, 'restaurants', restaurant.id, 'payroll', selectedMonth, 'entries', editingStaff.staffId);
      await setDoc(entryRef, {
        ...newEntry,
        updatedAt: new Date()
      });

      // 2. Also sync base salary rates back to the staff document if they changed
      const staffRef = doc(db, 'restaurants', restaurant.id, 'staff', editingStaff.staffId);
      await setDoc(staffRef, {
        salaryType: type,
        salaryRate: rate,
        overtimeRate: type === 'hourly' ? otRate : null
      }, { merge: true });
    } catch (e) {
      console.warn('Payroll cloud save deferred:', e);
    }
  };

  const handleExport = () => {
    if (payrollRecords.length === 0) {
      toast.error('No payroll data to export');
      return;
    }
    exportPayrollToCSV(payrollRecords, selectedMonth, restaurant?.currency || 'INR');
    toast.success('Spreadsheet exported!');
  };

  // Real-time calculation in the modal form
  const modalCalculations = () => {
    const rate = Number(editForm.salaryRate) || 0;
    const type = editForm.salaryType;
    const otRate = Number(editForm.overtimeRate) || 1.5;
    const hours = type === 'hourly' ? (Number(editForm.hoursWorked) || 0) : 0;
    const otHours = type === 'hourly' ? (Number(editForm.overtimeHours) || 0) : 0;
    const bonus = Number(editForm.bonus) || 0;
    const deductions = Number(editForm.deductions) || 0;

    const gross = type === 'hourly'
      ? (rate * hours) + (rate * otRate * otHours) + bonus
      : rate + bonus;
    const net = Math.max(0, gross - deductions);

    return { gross, net };
  };

  const { gross: tempGross, net: tempNet } = editingStaff ? modalCalculations() : { gross: 0, net: 0 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 className="text-title2">Payroll Management</h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Manage staff salaries, calculate pay, and export payroll spreadsheets.
          </p>
        </div>
        
        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Calendar size={18} className="text-secondary" />
            <input 
              type="month" 
              className="form-input" 
              style={{ width: 'auto', padding: '8px 12px' }} 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)} 
            />
          </div>
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Stat Grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--color-accent-light)', color: 'var(--color-accent)' }}>
            <Users size={20} />
          </div>
          <span className="stat-card-value">{totalStaff}</span>
          <span className="stat-card-label">Staff Count</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--color-orange-light)', color: 'var(--color-orange)' }}>
            <DollarSign size={20} />
          </div>
          <span className="stat-card-value">{formatCurrency(totalGross, restaurant?.currency)}</span>
          <span className="stat-card-label">Total Gross Payroll</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--color-green-light)', color: 'var(--color-green)' }}>
            <Wallet size={20} />
          </div>
          <span className="stat-card-value">{formatCurrency(totalNet, restaurant?.currency)}</span>
          <span className="stat-card-label">Total Net Payroll</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <span className="card-title">Employee Salaries</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '1 1 200px', maxWidth: 320 }}>
            <Search size={16} className="text-secondary" style={{ marginRight: -32, zIndex: 1 }} />
            <input 
              className="form-input" 
              placeholder="Search staff or role..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 'var(--space-8)', width: '100%' }}
            />
          </div>
        </div>

        {/* Desktop Table */}
        <div className="desktop-only" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 800 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)' }}>
                <th style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>Employee</th>
                <th style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>Salary Structure</th>
                <th style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>Hours / OT</th>
                <th style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>Additions / Deduct.</th>
                <th style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>Gross Pay</th>
                <th style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>Net Pay</th>
                <th style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)', textAlign: 'center' }}>Status</th>
                <th style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                    <div style={{ fontSize: 32 }}>👥</div>
                    <div style={{ marginTop: 'var(--space-2)' }}>No matching employees found</div>
                  </td>
                </tr>
              ) : filteredRecords.map(r => (
                <tr key={r.staffId} style={{ borderBottom: '1px solid var(--color-separator)', transition: 'background var(--duration-fast)' }}>
                  <td style={{ padding: 'var(--space-4) var(--space-5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: 'var(--color-accent-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)', fontSize: 'var(--text-subhead)',
                      }}>
                        {r.staffName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 'var(--weight-semibold)' }}>{r.staffName}</div>
                        <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'capitalize' }}>{r.role}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td style={{ padding: 'var(--space-4) var(--space-5)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className={`badge ${r.salaryType === 'hourly' ? 'badge-blue' : 'badge-purple'}`} style={{ width: 'fit-content' }}>
                        {r.salaryType === 'hourly' ? 'Hourly' : 'Monthly'}
                      </span>
                      <span style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-medium)' }}>
                        {formatCurrency(r.salaryRate, restaurant?.currency)}
                        {r.salaryType === 'hourly' ? '/hr' : ''}
                      </span>
                    </div>
                  </td>

                  <td style={{ padding: 'var(--space-4) var(--space-5)' }}>
                    {r.salaryType === 'hourly' ? (
                      <div style={{ fontSize: 'var(--text-footnote)' }}>
                        <div><strong>{r.hoursWorked}</strong> hrs</div>
                        {r.overtimeHours > 0 && (
                          <div className="text-secondary" style={{ fontSize: 'var(--text-caption1)' }}>
                            +{r.overtimeHours} OT hrs (x{r.overtimeRate})
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </td>

                  <td style={{ padding: 'var(--space-4) var(--space-5)' }}>
                    <div style={{ fontSize: 'var(--text-footnote)' }}>
                      {r.bonus > 0 && <div className="text-green">+{formatCurrency(r.bonus, restaurant?.currency)} bonus</div>}
                      {r.deductions > 0 && <div className="text-red">-{formatCurrency(r.deductions, restaurant?.currency)} ded.</div>}
                      {r.bonus === 0 && r.deductions === 0 && <span className="text-tertiary">—</span>}
                    </div>
                  </td>

                  <td style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-medium)' }}>
                    {formatCurrency(r.grossPay, restaurant?.currency)}
                  </td>

                  <td style={{ padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-accent)' }}>
                    {formatCurrency(r.netPay, restaurant?.currency)}
                  </td>

                  <td style={{ padding: 'var(--space-4) var(--space-5)', textAlign: 'center' }}>
                    <span className={`badge ${r.hasSavedEntry ? 'badge-green' : 'badge-gray'}`}>
                      {r.hasSavedEntry ? 'Saved' : 'Draft'}
                    </span>
                  </td>

                  <td style={{ padding: 'var(--space-4) var(--space-5)', textAlign: 'right' }}>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => openEditModal(r)}
                      style={{ padding: '6px 12px' }}
                    >
                      <Edit2 size={12} /> Edit Pay
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Touch Cards View */}
        <div className="mobile-only" style={{ padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {filteredRecords.map(r => (
              <div
                key={r.staffId}
                className="card"
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-separator)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: 'var(--color-accent-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)', fontSize: 'var(--text-subhead)',
                      flexShrink: 0
                    }}>
                      {r.staffName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'var(--weight-bold)', fontSize: '15px' }}>{r.staffName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', textTransform: 'capitalize' }}>{r.role}</div>
                    </div>
                  </div>
                  <span className={`badge ${r.hasSavedEntry ? 'badge-green' : 'badge-gray'}`}>
                    {r.hasSavedEntry ? 'Saved' : 'Draft'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', background: 'var(--color-bg)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Structure</div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, marginTop: 2 }}>
                      <span className={`badge ${r.salaryType === 'hourly' ? 'badge-blue' : 'badge-purple'}`} style={{ fontSize: 10 }}>
                        {r.salaryType === 'hourly' ? 'Hourly' : 'Monthly'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                      {formatCurrency(r.salaryRate, restaurant?.currency)}{r.salaryType === 'hourly' ? '/hr' : ''}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Net Payout</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-accent)', marginTop: 2 }}>
                      {formatCurrency(r.netPay, restaurant?.currency)}
                    </div>
                    {r.salaryType === 'hourly' && (
                      <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        {r.hoursWorked} hrs {r.overtimeHours > 0 ? `(+${r.overtimeHours} OT)` : ''}
                      </div>
                    )}
                  </div>
                </div>

                {(r.bonus > 0 || r.deductions > 0) && (
                  <div style={{ display: 'flex', gap: 12, fontSize: '11.5px', padding: '0 4px' }}>
                    {r.bonus > 0 && <span className="text-green">+{formatCurrency(r.bonus, restaurant?.currency)} bonus</span>}
                    {r.deductions > 0 && <span className="text-red">-{formatCurrency(r.deductions, restaurant?.currency)} ded.</span>}
                  </div>
                )}

                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => openEditModal(r)}
                  style={{ width: '100%', height: 38, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}
                >
                  <Edit2 size={13} /> Edit Pay Details
                </button>
              </div>
            ))}
            {filteredRecords.length === 0 && (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                No matching employees found
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Payroll Modal */}
      {editingStaff && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingStaff(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Edit Payroll Details</h3>
                <span className="text-secondary text-caption1" style={{ textTransform: 'capitalize' }}>
                  {editingStaff.staffName} · {editingStaff.role} · {selectedMonth}
                </span>
              </div>
              <button className="btn btn-secondary btn-icon" onClick={() => setEditingStaff(null)}><X size={16} /></button>
            </div>
            
            <div className="modal-body">
              {/* Info alert if edit changes base salary */}
              <div style={{ 
                background: 'var(--color-accent-light)', 
                color: 'var(--color-accent)', 
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'flex-start',
                fontSize: 'var(--text-footnote)'
              }}>
                <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>Modifying base rate or salary type below will also update the employee's main profile configuration.</span>
              </div>

              {/* Base Salary Config */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Salary Type</label>
                  <select 
                    className="form-select" 
                    value={editForm.salaryType} 
                    onChange={e => setEditForm(f => ({ ...f, salaryType: e.target.value }))}
                  >
                    <option value="monthly">Monthly Salary</option>
                    <option value="hourly">Hourly Rate</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Base Rate ({restaurant?.currency || 'INR'})</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={editForm.salaryRate} 
                    onChange={e => setEditForm(f => ({ ...f, salaryRate: e.target.value }))} 
                  />
                </div>
              </div>

              {/* Hourly specific inputs */}
              {editForm.salaryType === 'hourly' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
                  <div className="form-group">
                    <label className="form-label">Hours Worked</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="e.g. 160" 
                      value={editForm.hoursWorked} 
                      onChange={e => setEditForm(f => ({ ...f, hoursWorked: e.target.value }))} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Overtime Hours</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="e.g. 10" 
                      value={editForm.overtimeHours} 
                      onChange={e => setEditForm(f => ({ ...f, overtimeHours: e.target.value }))} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">OT Multiplier</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      step={0.1}
                      value={editForm.overtimeRate} 
                      onChange={e => setEditForm(f => ({ ...f, overtimeRate: e.target.value }))} 
                    />
                  </div>
                </div>
              )}

              {/* Bonus and Deductions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Bonus / Additions</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0.00" 
                    value={editForm.bonus} 
                    onChange={e => setEditForm(f => ({ ...f, bonus: e.target.value }))} 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Deductions</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0.00" 
                    value={editForm.deductions} 
                    onChange={e => setEditForm(f => ({ ...f, deductions: e.target.value }))} 
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">Payroll Notes</label>
                <input 
                  className="form-input" 
                  placeholder="e.g. Worked holiday shifts, late deductions..." 
                  value={editForm.notes} 
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} 
                />
              </div>

              {/* Computation Summary in Modal */}
              <div style={{ 
                borderTop: '1px solid var(--color-separator)',
                marginTop: 'var(--space-3)',
                paddingTop: 'var(--space-4)',
                display: 'flex',
                justifyContent: 'space-between',
                background: 'var(--color-bg-secondary)',
                margin: 'var(--space-3) calc(-1 * var(--space-6)) calc(-1 * var(--space-6)) calc(-1 * var(--space-6))',
                padding: 'var(--space-4) var(--space-6)'
              }}>
                <div>
                  <span className="text-secondary text-caption1">Gross Amount</span>
                  <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-body)' }}>
                    {formatCurrency(tempGross, restaurant?.currency)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="text-accent text-caption1" style={{ fontWeight: 'var(--weight-semibold)' }}>Net Payout</span>
                  <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title3)', color: 'var(--color-accent)' }}>
                    {formatCurrency(tempNet, restaurant?.currency)}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingStaff(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePayrollEntry}>
                <Save size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
