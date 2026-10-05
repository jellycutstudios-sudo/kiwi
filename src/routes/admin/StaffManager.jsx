import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useStaffStore } from '../../stores/staffStore';
import { collection, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, X, UserCheck, UserX, Eye, EyeOff, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

const ROLES = ['cashier', 'waiter', 'kitchen', 'admin'];

export default function StaffManager() {
  const { restaurant, staffDoc: currentUser } = useAuthStore();
  const { staff } = useStaffStore();
  const [showForm, setShowForm] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    pin: '',
    role: 'cashier',
    email: '',
    salaryType: 'monthly',
    salaryRate: '',
    overtimeRate: '1.5'
  });

  const generatePin = () => {
    const existingPins = new Set(staff.map(s => s.pin).filter(Boolean));
    for (let attempts = 0; attempts < 100; attempts++) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000));
      if (!existingPins.has(candidate)) {
        setForm(f => ({ ...f, pin: candidate }));
        setShowPin(true);
        toast.success(`Generated PIN: ${candidate}`, { icon: '🔑' });
        return;
      }
    }
  };

  const saveStaff = async () => {
    if (!form.name.trim()) {
      toast.error('Staff name is required');
      return;
    }

    if (!editId) {
      if (!form.pin) {
        toast.error('4-digit PIN is required for staff login');
        return;
      }
      if (!/^\d{4}$/.test(form.pin)) {
        toast.error('PIN must be exactly 4 digits (e.g. 1234)');
        return;
      }
    } else if (form.pin) {
      if (!/^\d{4}$/.test(form.pin)) {
        toast.error('New PIN must be exactly 4 digits');
        return;
      }
    }

    try {
      if (editId) {
        if (form.pin) {
          const isPinInUse = staff.some(s => s.id !== editId && s.pin === form.pin && s.active !== false);
          if (isPinInUse) {
            toast.error('PIN already in use — choose a different PIN');
            return;
          }
        }

        const staffRef = doc(db, 'restaurants', restaurant.id, 'staff', editId);
        await updateDoc(staffRef, {
          name: form.name.trim(),
          role: form.role,
          salaryType: form.salaryType,
          salaryRate: Number(form.salaryRate) || 0,
          overtimeRate: form.salaryType === 'hourly' ? (Number(form.overtimeRate) || 1.5) : null,
          ...(form.pin ? { pin: form.pin } : {}),
        });

        toast.success('Staff updated!');
      } else {
        const isPinInUse = staff.some(s => s.pin === form.pin && s.active !== false);
        if (isPinInUse) {
          toast.error('PIN already in use — choose a different PIN');
          return;
        }

        const staffColRef = collection(db, 'restaurants', restaurant.id, 'staff');
        await addDoc(staffColRef, {
          name: form.name.trim(),
          pin: form.pin,
          role: form.role,
          active: true,
          email: form.email.trim() || null,
          salaryType: form.salaryType,
          salaryRate: Number(form.salaryRate) || 0,
          overtimeRate: form.salaryType === 'hourly' ? (Number(form.overtimeRate) || 1.5) : null,
          createdAt: new Date(),
        });

        toast.success('Staff member added!');
      }

      setShowForm(false);
      setShowPin(false);
      setEditId(null);
      setForm({
        name: '',
        pin: '',
        role: 'cashier',
        email: '',
        salaryType: 'monthly',
        salaryRate: '',
        overtimeRate: '1.5'
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save staff: ' + err.message);
    }
  };

  const toggleActive = async (id, current) => {
    try {
      const nextActive = !current;
      if (nextActive) {
        const target = staff.find(s => s.id === id);
        if (target?.pin) {
          const isPinInUse = staff.some(s => s.id !== id && s.pin === target.pin && s.active !== false);
          if (isPinInUse) {
            toast.error('PIN is currently in use by another active staff member. Update this staff member\'s PIN first.');
            return;
          }
        }
      }

      const staffRef = doc(db, 'restaurants', restaurant.id, 'staff', id);
      await updateDoc(staffRef, { active: nextActive });
      toast(nextActive ? 'Staff activated' : 'Staff deactivated', { icon: nextActive ? '✅' : '🔒' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to update active state: ' + err.message);
    }
  };

  const deleteStaff = async (id) => {
    if (!confirm('Remove this staff member?')) return;
    try {
      const staffRef = doc(db, 'restaurants', restaurant.id, 'staff', id);
      await deleteDoc(staffRef);
      toast.success('Removed');
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove staff: ' + err.message);
    }
  };

  const roleColors = { admin:'badge-purple', cashier:'badge-blue', waiter:'badge-teal', kitchen:'badge-orange' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h2 className="text-title2">Staff Manager</h2>
          <p className="text-secondary text-subhead" style={{marginTop:2}}>
            Restaurant ID for PIN login: <strong style={{fontFamily:'var(--font-mono)', color:'var(--color-accent)'}}>{restaurant?.customId || restaurant?.id}</strong>
            {restaurant?.customId && (
              <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginLeft: '8px' }}>
                (Original ID: {restaurant.id})
              </span>
            )}
          </p>
        </div>
        <button className="btn btn-primary" id="add-staff-btn" onClick={() => { setEditId(null); setForm({name:'',pin:'',role:'cashier',email:'',salaryType:'monthly',salaryRate:'',overtimeRate:'1.5'}); setShowPin(false); setShowForm(true); }}>
          <Plus size={16}/> Add Staff
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Staff Members ({staff.length})</span>
        </div>
        <div>
          {staff.length === 0 ? (
            <div style={{ padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)' }}>
              <div style={{fontSize:32}}>👥</div>
              <div style={{marginTop:'var(--space-2)'}}>No staff added yet</div>
            </div>
          ) : staff.map(s => (
            <div key={s.id} className="staff-row" style={{ opacity: s.active === false ? 0.5 : 1 }}>
              <div className="staff-avatar">
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div className="staff-info">
                <div style={{fontWeight:'var(--weight-semibold)', color:'var(--color-label)'}}>{s.name}</div>
                <div style={{fontSize:'var(--text-caption1)', color:'var(--color-label-secondary)', marginTop:1, wordBreak: 'break-all'}}>
                  PIN: {'●'.repeat(s.pin?.length ?? 4)} {s.email ? `· ${s.email}` : ''} {s.salaryRate ? `· ${s.salaryType === 'hourly' ? 'Hourly' : 'Monthly'} (${formatCurrency(s.salaryRate, restaurant?.currency)})` : ''}
                </div>
              </div>
              <div className="staff-meta">
                <span className={`badge ${roleColors[s.role] ?? 'badge-gray'}`}>{s.role}</span>
                <span className={`badge ${s.active !== false ? 'badge-green' : 'badge-gray'}`}>
                  {s.active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="staff-actions">
                <button className="btn btn-secondary btn-icon btn-sm" id={`edit-staff-${s.id}`} onClick={() => { setEditId(s.id); setForm({name:s.name,pin:'',role:s.role,email:s.email??'',salaryType:s.salaryType||'monthly',salaryRate:s.salaryRate!==undefined?String(s.salaryRate):'',overtimeRate:s.overtimeRate!==undefined?String(s.overtimeRate):'1.5'}); setShowPin(false); setShowForm(true); }}>
                  <Edit2 size={12}/>
                </button>
                <button className="btn btn-secondary btn-icon btn-sm" onClick={() => toggleActive(s.id, s.active !== false)} id={`toggle-staff-${s.id}`}>
                  {s.active !== false ? <UserX size={12} color="var(--color-red)"/> : <UserCheck size={12} color="var(--color-green)"/>}
                </button>
                {s.id !== currentUser?.id && (
                  <button className="btn btn-secondary btn-icon btn-sm" style={{color:'var(--color-red)'}} onClick={() => deleteStaff(s.id)} id={`delete-staff-${s.id}`}>
                    <Trash2 size={12}/>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editId ? 'Edit Staff' : 'Add Staff Member'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowForm(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">
                  Full Name <span style={{ color: 'var(--color-red)' }}>*</span>
                </label>
                <input id="staff-name-input" className="form-input" placeholder="e.g. Rahul Sharma" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    PIN (4 digits) {!editId && <span style={{ color: 'var(--color-red)' }}>*</span>}
                    {editId && <span style={{ fontWeight: 'normal', color: 'var(--color-label-tertiary)', marginLeft: 4 }}>— leave blank to keep current</span>}
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={generatePin}
                    title="Generate a random unique 4-digit PIN"
                  >
                    <Sparkles size={12} /> Auto-Generate
                  </button>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="staff-pin-input"
                    className="form-input"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="••••"
                    maxLength={4}
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                    style={{ letterSpacing: form.pin ? '0.2em' : 'normal', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-label-secondary)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onClick={() => setShowPin(p => !p)}
                    title={showPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                  <span>Numeric PIN used by staff to switch accounts and sign into POS</span>
                  <span style={{ fontWeight: 600, color: form.pin.length === 4 ? 'var(--color-green)' : 'inherit' }}>
                    {form.pin.length}/4 digits
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select id="staff-role-select" className="form-select" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Email (optional)</label>
                <input id="staff-email-input" className="form-input" type="email" placeholder="staff@restaurant.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Salary Type</label>
                  <select id="staff-salary-type-select" className="form-select" value={form.salaryType} onChange={e=>setForm(f=>({...f,salaryType:e.target.value}))}>
                    <option value="monthly">Monthly Salary</option>
                    <option value="hourly">Hourly Rate</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Rate / Salary ({restaurant?.currency || 'INR'})</label>
                  <input id="staff-salary-rate-input" className="form-input" type="number" min={0} placeholder="e.g. 25000 or 50" value={form.salaryRate} onChange={e=>setForm(f=>({...f,salaryRate:e.target.value}))} />
                </div>
              </div>
              {form.salaryType === 'hourly' && (
                <div className="form-group">
                  <label className="form-label">Overtime Multiplier</label>
                  <input id="staff-overtime-rate-input" className="form-input" type="number" min={1} step={0.1} placeholder="e.g. 1.5" value={form.overtimeRate} onChange={e=>setForm(f=>({...f,overtimeRate:e.target.value}))} />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-staff-btn" onClick={saveStaff}>{editId ? 'Save Changes' : 'Add Staff'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
