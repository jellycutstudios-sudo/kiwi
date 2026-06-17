import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useStaffStore } from '../../stores/staffStore';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, X, UserCheck, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

const ROLES = ['cashier', 'waiter', 'kitchen', 'admin'];

export default function StaffManager() {
  const { restaurant, staffDoc: currentUser } = useAuthStore();
  const { staff } = useStaffStore();
  const [showForm, setShowForm] = useState(false);
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

  const saveStaff = async () => {
    if (!form.name.trim() || (!editId && form.pin.length < 4)) {
      toast.error('Name required and PIN must be 4 digits');
      return;
    }
    if (editId) {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'staff', editId), {
        name: form.name.trim(),
        role: form.role,
        salaryType: form.salaryType,
        salaryRate: Number(form.salaryRate) || 0,
        overtimeRate: form.salaryType === 'hourly' ? (Number(form.overtimeRate) || 1.5) : null,
        ...(form.pin ? { pin: form.pin } : {}),
      });
      toast.success('Staff updated!');
    } else {
      // Check PIN uniqueness
      if (staff.some(s => s.pin === form.pin)) {
        toast.error('PIN already in use — choose a different PIN');
        return;
      }
      await addDoc(collection(db, 'restaurants', restaurant.id, 'staff'), {
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
  };

  const toggleActive = async (id, current) => {
    await updateDoc(doc(db, 'restaurants', restaurant.id, 'staff', id), { active: !current });
    toast(current ? 'Staff deactivated' : 'Staff activated', { icon: current ? '🔒' : '✅' });
  };

  const deleteStaff = async (id) => {
    if (!confirm('Remove this staff member?')) return;
    await deleteDoc(doc(db, 'restaurants', restaurant.id, 'staff', id));
    toast.success('Removed');
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
        <button className="btn btn-primary" id="add-staff-btn" onClick={() => { setEditId(null); setForm({name:'',pin:'',role:'cashier',email:'',salaryType:'monthly',salaryRate:'',overtimeRate:'1.5'}); setShowForm(true); }}>
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
            <div key={s.id} style={{
              display:'flex', alignItems:'center', gap:'var(--space-4)',
              padding:'var(--space-4) var(--space-5)',
              borderBottom:'1px solid var(--color-separator)',
              opacity: s.active === false ? 0.5 : 1,
              transition:'opacity var(--duration-fast)',
            }}>
              <div style={{
                width:40, height:40, borderRadius:'50%',
                background:'var(--color-accent-light)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:'var(--weight-bold)', color:'var(--color-accent)', fontSize:'var(--text-body)',
              }}>
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:'var(--weight-semibold)'}}>{s.name}</div>
                <div style={{fontSize:'var(--text-caption1)', color:'var(--color-label-secondary)', marginTop:1}}>
                  PIN: {'●'.repeat(s.pin?.length ?? 4)} {s.email ? `· ${s.email}` : ''} {s.salaryRate ? `· ${s.salaryType === 'hourly' ? 'Hourly' : 'Monthly'} (${formatCurrency(s.salaryRate, restaurant?.currency)})` : ''}
                </div>
              </div>
              <span className={`badge ${roleColors[s.role] ?? 'badge-gray'}`}>{s.role}</span>
              <span className={`badge ${s.active !== false ? 'badge-green' : 'badge-gray'}`}>
                {s.active !== false ? 'Active' : 'Inactive'}
              </span>
              <div style={{display:'flex', gap:'var(--space-2)'}}>
                <button className="btn btn-secondary btn-icon btn-sm" id={`edit-staff-${s.id}`} onClick={() => { setEditId(s.id); setForm({name:s.name,pin:'',role:s.role,email:s.email??'',salaryType:s.salaryType||'monthly',salaryRate:s.salaryRate!==undefined?String(s.salaryRate):'',overtimeRate:s.overtimeRate!==undefined?String(s.overtimeRate):'1.5'}); setShowForm(true); }}>
                  <Edit2 size={12}/>
                </button>
                <button className="btn btn-secondary btn-icon btn-sm" onClick={() => toggleActive(s.id, s.active !== false)} id={`toggle-staff-${s.id}`}>
                  {s.active !== false ? <UserX size={12} color="var(--color-red)"/> : <UserCheck size={12} color="var(--color-green)"/>}
                </button>
                {s.id !== currentUser?.id && (
                  <button className="btn btn-icon btn-sm" style={{color:'var(--color-red)'}} onClick={() => deleteStaff(s.id)} id={`delete-staff-${s.id}`}>
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
                <label className="form-label">Full Name</label>
                <input id="staff-name-input" className="form-input" placeholder="e.g. Ahmed Al-Hassan" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">PIN (4 digits) {editId && '— leave blank to keep current'}</label>
                <input id="staff-pin-input" className="form-input" type="password" placeholder="••••" maxLength={4} value={form.pin} onChange={e=>setForm(f=>({...f,pin:e.target.value.replace(/\D/,'')}))} />
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
