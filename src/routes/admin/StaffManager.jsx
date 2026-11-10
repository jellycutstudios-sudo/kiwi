import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useStaffStore } from '../../stores/staffStore';
import { useBusinessConfig } from '../../hooks/useBusinessConfig';
import { collection, doc, onSnapshot, writeBatch, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  Plus, Edit2, Trash2, X, UserCheck, UserX, Eye, EyeOff, Sparkles, 
  LayoutGrid, List, Search, Copy, Check, Mail, Clock,
  Shield, CreditCard, Utensils, ChefHat
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

const ROLES = ['admin', 'manager', 'cashier', 'waiter', 'kitchen'];

const ROLE_CONFIG = {
  admin: {
    label: 'Admin',
    color: 'badge-purple',
    hex: '#8b5cf6',
    desc: 'Full Store Access',
    summary: 'Full control over settings, menu, reports, inventory & staff accounts.',
    permissions: ['Settings', 'Reports', 'Menu Editor', 'Staff PINs', 'Inventory'],
  },
  manager: {
    label: 'Manager',
    color: 'badge-green',
    hex: '#10b981',
    desc: 'Floor Supervisor',
    summary: 'Oversee daily floor operations, table assignments & void approvals.',
    permissions: ['Floor Plan', 'Void & Comp', 'Cash Shifts', 'Table Swap'],
  },
  cashier: {
    label: 'Cashier',
    color: 'badge-blue',
    hex: '#3b82f6',
    desc: 'Front Counter & Billing',
    summary: 'Operate the register, split checks, accept tenders & print receipts.',
    permissions: ['Register Billing', 'Split Checks', 'Tender Cash/Card', 'Receipts'],
  },
  waiter: {
    label: 'Waiter',
    color: 'badge-teal',
    hex: '#06b6d4',
    desc: 'Floor & Table Ordering',
    summary: 'Take table orders, fire kitchen courses & manage handheld terminal.',
    permissions: ['Take Orders', 'Seat Splitting', 'Fire Courses', 'Mobile POS'],
  },
  kitchen: {
    label: 'Kitchen',
    color: 'badge-orange',
    hex: '#f97316',
    desc: 'Kitchen Display (KDS)',
    summary: 'View incoming tickets, track prep timers & mark dishes ready.',
    permissions: ['KDS Screen', 'Prep Timers', 'Station Filter', 'Bump Tickets'],
  },
};

const ROLE_LABELS = {
  admin: 'Admin · Full Access',
  manager: 'Manager · Floor & Voids',
  cashier: 'Cashier · Register & Billing',
  waiter: 'Waiter · Tables & Orders',
  kitchen: 'Kitchen · KDS Display',
};

export default function StaffManager() {
  const { restaurant, staffDoc: currentUser } = useAuthStore();
  const { staff } = useStaffStore();
  const { isBillOnly } = useBusinessConfig();
  const [credentials, setCredentials] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [editId, setEditId] = useState(null);
  const [revealedPins, setRevealedPins] = useState({});
  const [showAllPins, setShowAllPins] = useState(false);

  // View mode: 'grid' (Cards) or 'list' (List)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('dineos_staff_view_mode') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [copiedPinId, setCopiedPinId] = useState(null);
  const [copiedRestId, setCopiedRestId] = useState(false);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('dineos_staff_view_mode', mode);
    } catch {
      // ignore
    }
  };

  const copyPin = (pin, name, id) => {
    if (!pin) {
      toast.error('No PIN configured for this staff member');
      return;
    }
    navigator.clipboard?.writeText(String(pin)).then(() => {
      setCopiedPinId(id);
      setTimeout(() => setCopiedPinId(null), 2000);
      toast.success(`Copied PIN (${pin}) for ${name}`, { icon: '📋' });
    }).catch(() => {
      toast.success(`PIN: ${pin}`);
    });
  };

  const copyRestaurantId = () => {
    const idToCopy = restaurant?.customId || restaurant?.id;
    if (!idToCopy) return;
    navigator.clipboard?.writeText(String(idToCopy)).then(() => {
      setCopiedRestId(true);
      setTimeout(() => setCopiedRestId(false), 2000);
      toast.success(`Copied Restaurant ID: ${idToCopy}`, { icon: '📋' });
    });
  };

  // Subscribe to isolated staff credentials (admin-only)
  useEffect(() => {
    if (!restaurant?.id || !db) return;
    const unsub = onSnapshot(
      collection(db, 'restaurants', restaurant.id, 'staff_credentials'),
      (snap) => {
        const map = {};
        snap.forEach(d => { map[d.id] = d.data(); });
        setCredentials(map);
      },
      (err) => console.warn('[StaffManager] Credentials listener error:', err.message)
    );
    return () => unsub();
  }, [restaurant?.id]);

  // Merge public staff profile with admin-only credentials
  const staffList = useMemo(() => {
    return staff.map(s => {
      const cred = credentials[s.id] || {};
      return {
        ...s,
        pin: cred.pin || s.pin || '',
        salaryType: cred.salaryType || s.salaryType || 'monthly',
        salaryRate: cred.salaryRate !== undefined ? cred.salaryRate : (s.salaryRate || 0),
        overtimeRate: cred.overtimeRate !== undefined ? cred.overtimeRate : (s.overtimeRate || '1.5'),
      };
    });
  }, [staff, credentials]);

  // Auto-heal / sync staff_auth documents for all staff members with a valid PIN
  useEffect(() => {
    if (!restaurant?.id || !db || staffList.length === 0) return;
    staffList.forEach(async (s) => {
      const pin = String(s.pin || '').trim();
      if (pin && pin.length === 4) {
        try {
          const authRef = doc(db, 'restaurants', restaurant.id, 'staff_auth', pin);
          const authSnap = await getDoc(authRef);
          if (!authSnap.exists()) {
            await setDoc(authRef, {
              staffId: s.id,
              name: s.name,
              role: s.role || 'cashier',
              active: s.active !== false,
              updatedAt: new Date()
            });
          }
        } catch {
          // ignore background sync warnings
        }
      }
    });
  }, [restaurant?.id, staffList]);

  const togglePinVisibility = (id) => {
    setRevealedPins(prev => ({
      ...prev,
      [id]: showAllPins ? false : !prev[id]
    }));
  };
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
    const existingPins = new Set(staffList.map(s => s.pin).filter(Boolean));
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

    if (!restaurant?.id) {
      toast.error('Restaurant session not found. Please log in or refresh.');
      return;
    }

    if (!restaurant.localStorageOnly && typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Connect to the internet before changing cloud staff records.');
      return;
    }

    const cleanPin = form.pin ? String(form.pin).trim() : '';

    if (!editId) {
      if (!cleanPin) {
        toast.error('4-digit PIN is required for staff login');
        return;
      }
      if (!/^\d{4}$/.test(cleanPin)) {
        toast.error('PIN must be exactly 4 digits (e.g. 1234)');
        return;
      }
    } else if (cleanPin) {
      if (!/^\d{4}$/.test(cleanPin)) {
        toast.error('New PIN must be exactly 4 digits');
        return;
      }
    }

    try {
      if (editId) {
        const oldPin = credentials[editId]?.pin || staffList.find(s => s.id === editId)?.pin;
        const targetPin = cleanPin || oldPin;
        if (targetPin) {
          const isPinInUse = staffList.some(s => s.id !== editId && s.pin === targetPin && s.active !== false);
          if (isPinInUse) {
            toast.error('PIN already in use — choose a different PIN');
            return;
          }
        }

        const publicMember = {
          id: editId,
          name: form.name.trim(),
          role: form.role,
          email: form.email?.trim() || null,
          salaryType: form.salaryType,
          updatedAt: new Date().toISOString()
        };

        const existingStaff = staff.find(s => s.id === editId);
        const isActive = existingStaff?.active !== false;
        const shouldSyncCloud = !restaurant.localStorageOnly;
        if (shouldSyncCloud) {
          const batch = writeBatch(db);
          batch.set(doc(db, 'restaurants', restaurant.id, 'staff', editId), {
            name: form.name.trim(),
            role: form.role,
            active: isActive,
            email: form.email?.trim() || null,
            salaryType: form.salaryType,
            updatedAt: new Date()
          }, { merge: true });
          batch.set(doc(db, 'restaurants', restaurant.id, 'staff_credentials', editId), {
            staffId: editId,
            pin: targetPin,
            salaryType: form.salaryType,
            salaryRate: Number(form.salaryRate) || 0,
            overtimeRate: form.salaryType === 'hourly' ? (Number(form.overtimeRate) || 1.5) : null,
            updatedAt: new Date()
          }, { merge: true });
          if (cleanPin && oldPin && cleanPin !== oldPin) {
            batch.delete(doc(db, 'restaurants', restaurant.id, 'staff_auth', oldPin));
          }
          if (targetPin) {
            batch.set(doc(db, 'restaurants', restaurant.id, 'staff_auth', targetPin), {
              staffId: editId,
              name: form.name.trim(),
              role: form.role,
              active: isActive,
              updatedAt: new Date()
            });
          }
          await batch.commit();
        }

        const updatedList = staff.map(s => s.id === editId ? { ...s, ...publicMember, pin: targetPin } : s);
        useStaffStore.getState().setStaffList(updatedList);

        toast.success('Staff updated!');
      } else {
        const isPinInUse = staffList.some(s => s.pin === cleanPin && s.active !== false);
        if (isPinInUse) {
          toast.error('PIN already in use — choose a different PIN');
          return;
        }

        const newStaffId = `staff_${Date.now()}`;
        const publicMember = {
          id: newStaffId,
          name: form.name.trim(),
          role: form.role,
          active: true,
          email: form.email?.trim() || null,
          salaryType: form.salaryType,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const shouldSyncCloud = !restaurant.localStorageOnly;
        let savedMember = { ...publicMember, pin: cleanPin };
        if (shouldSyncCloud) {
          const profileRef = doc(collection(db, 'restaurants', restaurant.id, 'staff'));
          const batch = writeBatch(db);
          batch.set(profileRef, {
            name: form.name.trim(),
            role: form.role,
            active: true,
            email: form.email?.trim() || null,
            salaryType: form.salaryType,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          batch.set(doc(db, 'restaurants', restaurant.id, 'staff_credentials', profileRef.id), {
            staffId: profileRef.id,
            pin: cleanPin,
            salaryType: form.salaryType,
            salaryRate: Number(form.salaryRate) || 0,
            overtimeRate: form.salaryType === 'hourly' ? (Number(form.overtimeRate) || 1.5) : null,
            updatedAt: new Date()
          });
          batch.set(doc(db, 'restaurants', restaurant.id, 'staff_auth', cleanPin), {
            staffId: profileRef.id,
            name: form.name.trim(),
            role: form.role,
            active: true,
            updatedAt: new Date()
          });
          await batch.commit();
          savedMember = { ...savedMember, id: profileRef.id };
        }
        useStaffStore.getState().setStaffList([...staff, savedMember]);

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
      if (!restaurant?.id) return;
      if (!restaurant.localStorageOnly && typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.error('Connect to the internet before changing cloud staff records.');
        return;
      }
      const nextActive = !current;
      const targetPin = credentials[id]?.pin || staffList.find(s => s.id === id)?.pin;

      if (nextActive && targetPin) {
        const isPinInUse = staffList.some(s => s.id !== id && s.pin === targetPin && s.active !== false);
        if (isPinInUse) {
          toast.error('PIN is currently in use by another active staff member. Update this staff member\'s PIN first.');
          return;
        }
      }

      const shouldSyncCloud = !restaurant.localStorageOnly;
      if (shouldSyncCloud) {
        const batch = writeBatch(db);
        batch.set(doc(db, 'restaurants', restaurant.id, 'staff', id), {
          active: nextActive,
          updatedAt: new Date()
        }, { merge: true });
        if (targetPin) {
          batch.set(doc(db, 'restaurants', restaurant.id, 'staff_auth', targetPin), {
            active: nextActive,
            updatedAt: new Date()
          }, { merge: true });
        }
        await batch.commit();
      }
      const updatedList = staff.map(s => s.id === id ? { ...s, active: nextActive, updatedAt: new Date().toISOString() } : s);
      useStaffStore.getState().setStaffList(updatedList);
      toast(nextActive ? 'Staff activated' : 'Staff deactivated', { icon: nextActive ? '✅' : '🔒' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to update active state: ' + err.message);
    }
  };

  const deleteStaff = async (id) => {
    if (!confirm('Remove this staff member?')) return;
    try {
      if (!restaurant?.id) return;
      if (!restaurant.localStorageOnly && typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.error('Connect to the internet before changing cloud staff records.');
        return;
      }
      const targetPin = credentials[id]?.pin || staffList.find(s => s.id === id)?.pin;
      const shouldSyncCloud = !restaurant.localStorageOnly;
      if (shouldSyncCloud) {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'restaurants', restaurant.id, 'staff', id));
        batch.delete(doc(db, 'restaurants', restaurant.id, 'staff_credentials', id));
        if (targetPin) batch.delete(doc(db, 'restaurants', restaurant.id, 'staff_auth', targetPin));
        await batch.commit();
      }
      useStaffStore.getState().setStaffList(staff.filter(s => s.id !== id));
      toast.success('Removed');
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove staff: ' + err.message);
    }
  };

  // Filter staff by search and role
  const filteredStaff = useMemo(() => {
    return staffList.filter(s => {
      if (roleFilter !== 'all' && s.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = s.name?.toLowerCase().includes(q);
        const matchRole = s.role?.toLowerCase().includes(q);
        const matchEmail = s.email?.toLowerCase().includes(q);
        const matchPin = s.pin && String(s.pin).includes(q);
        return matchName || matchRole || matchEmail || matchPin;
      }
      return true;
    });
  }, [staffList, roleFilter, searchQuery]);

  // Aggregate stats
  const staffStats = useMemo(() => {
    const total = staffList.length;
    const active = staffList.filter(s => s.active !== false).length;
    const counts = {};
    staffList.forEach(s => {
      const r = s.role || 'cashier';
      counts[r] = (counts[r] || 0) + 1;
    });
    return { total, active, counts };
  }, [staffList]);

  const restaurantLoginId = restaurant?.customId || restaurant?.id || '';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
      {/* ── Top Header Bar ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h2 className="text-title2" style={{ fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-label)' }}>
            {isBillOnly ? 'Cashier Accounts' : 'Staff Manager'}
          </h2>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--color-label-secondary)' }}>
            <span>Restaurant ID for PIN login:</span>
            <button
              type="button"
              onClick={copyRestaurantId}
              title="Click to copy Restaurant ID"
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--color-accent)',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(16, 185, 129, 0.28)',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px'
              }}
            >
              <span>{restaurantLoginId}</span>
              {copiedRestId ? <Check size={12} color="#059669" /> : <Copy size={12} />}
            </button>
            {restaurant?.customId && (
              <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                (Original ID: {restaurant.id})
              </span>
            )}
          </div>
        </div>

        <button 
          className="btn btn-primary" 
          id="add-staff-btn" 
          onClick={() => { 
            setEditId(null); 
            setForm({name:'',pin:'',role:'cashier',email:'',salaryType:'monthly',salaryRate:'',overtimeRate:'1.5'}); 
            setShowPin(false); 
            setShowForm(true); 
          }}
          style={{ height: 40, padding: '0 16px', borderRadius: 10, fontWeight: 700, boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)' }}
        >
          <Plus size={16}/> {isBillOnly ? 'Add Cashier' : 'Add Staff'}
        </button>
      </div>

      {/* ── Quick Role Filter Pill Strip ───────────────────────────── */}
      {staffList.length > 0 && (
        <div className="staff-manager-stats-bar">
          <button
            type="button"
            className={`staff-stat-pill ${roleFilter === 'all' ? 'active' : ''}`}
            onClick={() => setRoleFilter('all')}
          >
            <span>All Staff</span>
            <span className="staff-stat-pill-badge">{staffStats.total}</span>
          </button>

          {ROLES.map(role => {
            const count = staffStats.counts[role] || 0;
            if (count === 0 && roleFilter !== role) return null;
            return (
              <button
                key={role}
                type="button"
                className={`staff-stat-pill ${roleFilter === role ? 'active' : ''}`}
                onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
              >
                <span style={{ textTransform: 'capitalize' }}>{role}</span>
                <span className="staff-stat-pill-badge">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Main Container: Card View & List View ──────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar: Search + View Switcher + Show PINs */}
        <div className="staff-toolbar">
          <div className="staff-search-wrapper">
            <Search size={15} style={{ position: 'absolute', left: 11, color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="staff-search-input"
              placeholder="Search staff by name, role or PIN..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 2 }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* View Mode Toggle Switcher */}
            <div className="staff-view-switcher" role="tablist" aria-label="Staff layout view">
              <button
                type="button"
                className={`staff-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('grid')}
                title="Switch to Card Grid View"
              >
                <LayoutGrid size={13} />
                <span>Cards</span>
              </button>
              <button
                type="button"
                className={`staff-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('list')}
                title="Switch to Tabular List View"
              >
                <List size={13} />
                <span>List</span>
              </button>
            </div>

            {/* Global PIN Visibility Toggle */}
            {staffList.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setShowAllPins(prev => !prev);
                  setRevealedPins({});
                }}
                style={{ height: 32, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '0 10px', borderRadius: 8 }}
              >
                {showAllPins ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showAllPins ? 'Hide PINs' : 'Show All PINs'}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Content: Cards vs. List ──────────────────────────────── */}
        {filteredStaff.length === 0 ? (
          <div style={{ padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)' }}>
            <div style={{fontSize:36}}>👥</div>
            <div style={{marginTop:'var(--space-2)', fontWeight: 600}}>
              {staffList.length === 0 
                ? (isBillOnly ? 'No cashiers added yet' : 'No staff added yet')
                : 'No staff match your search or filter'}
            </div>
            {staffList.length > 0 && (
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={() => { setSearchQuery(''); setRoleFilter('all'); }}
                style={{ marginTop: 10 }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* =========================================================
             Card Grid View (Recommended for Modern Ergonomics)
             ========================================================= */
          <div className="staff-cards-grid">
            {filteredStaff.map(s => {
              const roleInfo = ROLE_CONFIG[s.role] || { label: s.role, color: 'badge-gray', hex: '#6366f1' };
              const isPinRevealed = showAllPins || revealedPins[s.id];
              const isCopied = copiedPinId === s.id;

              return (
                <div 
                  key={s.id} 
                  className={`staff-card role-${s.role || 'cashier'}`}
                  style={{ opacity: s.active === false ? 0.65 : 1 }}
                >
                  {/* Top: Avatar + Name + Badges */}
                  <div>
                    <div className="staff-card-header">
                      <div className="staff-card-avatar" style={{ background: roleInfo.hex }}>
                        <span>{s.name.charAt(0).toUpperCase()}</span>
                        <span 
                          className={`staff-status-dot ${s.active !== false ? 'active' : 'inactive'}`} 
                          title={s.active !== false ? 'Active' : 'Deactivated'}
                        />
                      </div>

                      <div className="staff-card-info">
                        <div className="staff-card-name" title={s.name}>
                          {s.name}
                        </div>
                        <div className="staff-card-badges">
                          <span className={`badge ${roleInfo.color}`}>
                            {s.role}
                          </span>
                          <span className={`badge ${s.active !== false ? 'badge-green' : 'badge-gray'}`}>
                            {s.active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: PIN Micro-Box with Instant Copy */}
                    <div className="staff-card-pin-box">
                      <div className="staff-pin-value-group">
                        <span className="staff-pin-label">PIN:</span>
                        <span className="staff-pin-digits" style={{ color: isPinRevealed ? 'var(--color-label)' : 'var(--color-label-secondary)' }}>
                          {isPinRevealed ? (s.pin || 'None') : '••••'}
                        </span>
                      </div>

                      <div className="staff-pin-actions">
                        <button
                          type="button"
                          className="staff-micro-icon-btn"
                          onClick={() => togglePinVisibility(s.id)}
                          aria-label={isPinRevealed ? `Hide PIN for ${s.name}` : `Show PIN for ${s.name}`}
                          title={isPinRevealed ? 'Hide PIN' : 'Reveal PIN'}
                        >
                          {isPinRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>

                        <button
                          type="button"
                          className="staff-micro-icon-btn"
                          onClick={() => copyPin(s.pin, s.name, s.id)}
                          title="Copy PIN to clipboard"
                        >
                          {isCopied ? <Check size={13} color="#059669" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>

                    {/* Metadata: Email & Pay Rate */}
                    {(s.email || s.salaryRate) && (
                      <div className="staff-card-meta">
                        {s.email && (
                          <span className="staff-card-meta-item" title={s.email}>
                            <Mail size={12} style={{ color: 'var(--color-label-tertiary)', flexShrink: 0 }} />
                            <span>{s.email}</span>
                          </span>
                        )}
                        {s.salaryRate ? (
                          <span className="staff-card-meta-item">
                            <Clock size={12} style={{ color: 'var(--color-label-tertiary)', flexShrink: 0 }} />
                            <span>{s.salaryType === 'hourly' ? 'Hourly' : 'Monthly'} ({formatCurrency(s.salaryRate, restaurant?.currency)})</span>
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Bottom: Action Buttons */}
                  <div className="staff-card-actions">
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      id={`edit-staff-${s.id}`} 
                      onClick={() => { 
                        setEditId(s.id); 
                        setForm({
                          name: s.name,
                          pin: '',
                          role: s.role,
                          email: s.email ?? '',
                          salaryType: s.salaryType || 'monthly',
                          salaryRate: s.salaryRate !== undefined ? String(s.salaryRate) : '',
                          overtimeRate: s.overtimeRate !== undefined ? String(s.overtimeRate) : '1.5'
                        }); 
                        setShowPin(false); 
                        setShowForm(true); 
                      }}
                      title="Edit staff member profile & permissions"
                    >
                      <Edit2 size={13} />
                      <span>Edit</span>
                    </button>

                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      onClick={() => toggleActive(s.id, s.active !== false)} 
                      id={`toggle-staff-${s.id}`}
                      title={s.active !== false ? 'Temporarily deactivate staff login' : 'Activate staff login'}
                    >
                      {s.active !== false ? (
                        <>
                          <UserX size={13} color="var(--color-red)"/>
                          <span>Deactivate</span>
                        </>
                      ) : (
                        <>
                          <UserCheck size={13} color="var(--color-green)"/>
                          <span>Activate</span>
                        </>
                      )}
                    </button>

                    {s.id !== currentUser?.id && (
                      <button 
                        type="button"
                        className="btn btn-secondary" 
                        style={{ color: 'var(--color-red)', padding: '0 9px' }} 
                        onClick={() => deleteStaff(s.id)} 
                        id={`delete-staff-${s.id}`}
                        title="Delete staff member permanently"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* =========================================================
             Refined List View (Clean & Compact)
             ========================================================= */
          <div className="staff-list-container">
            {filteredStaff.map(s => {
              const roleInfo = ROLE_CONFIG[s.role] || { label: s.role, color: 'badge-gray', hex: '#6366f1' };
              const isPinRevealed = showAllPins || revealedPins[s.id];
              const isCopied = copiedPinId === s.id;

              return (
                <div 
                  key={s.id} 
                  className="staff-list-row"
                  style={{ opacity: s.active === false ? 0.65 : 1 }}
                >
                  <div className="staff-list-left">
                    <div className="staff-card-avatar" style={{ width: 40, height: 40, fontSize: 16, borderRadius: 10, background: roleInfo.hex }}>
                      <span>{s.name.charAt(0).toUpperCase()}</span>
                      <span 
                        className={`staff-status-dot ${s.active !== false ? 'active' : 'inactive'}`} 
                        title={s.active !== false ? 'Active' : 'Deactivated'}
                      />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-label)' }}>
                        {s.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span className={`badge ${roleInfo.color}`}>{s.role}</span>
                        <span className={`badge ${s.active !== false ? 'badge-green' : 'badge-gray'}`}>
                          {s.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Center: PIN & Meta */}
                  <div className="staff-list-center">
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-separator)',
                      borderRadius: 8,
                      padding: '4px 10px'
                    }}>
                      <span className="staff-pin-label">PIN:</span>
                      <span className="staff-pin-digits" style={{ fontSize: 13, color: isPinRevealed ? 'var(--color-label)' : 'var(--color-label-secondary)' }}>
                        {isPinRevealed ? (s.pin || 'None') : '••••'}
                      </span>
                      <button
                        type="button"
                        className="staff-micro-icon-btn"
                        style={{ width: 22, height: 22 }}
                        onClick={() => togglePinVisibility(s.id)}
                        title={isPinRevealed ? 'Hide PIN' : 'Reveal PIN'}
                      >
                        {isPinRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                      <button
                        type="button"
                        className="staff-micro-icon-btn"
                        style={{ width: 22, height: 22 }}
                        onClick={() => copyPin(s.pin, s.name, s.id)}
                        title="Copy PIN"
                      >
                        {isCopied ? <Check size={11} color="#059669" /> : <Copy size={11} />}
                      </button>
                    </div>

                    {s.email && (
                      <span style={{ fontSize: 12, color: 'var(--color-label-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={12} color="var(--color-label-tertiary)" />
                        <span>{s.email}</span>
                      </span>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="staff-list-right">
                    <button 
                      type="button"
                      className="btn btn-secondary btn-sm" 
                      id={`edit-staff-${s.id}`} 
                      onClick={() => { 
                        setEditId(s.id); 
                        setForm({
                          name: s.name,
                          pin: '',
                          role: s.role,
                          email: s.email ?? '',
                          salaryType: s.salaryType || 'monthly',
                          salaryRate: s.salaryRate !== undefined ? String(s.salaryRate) : '',
                          overtimeRate: s.overtimeRate !== undefined ? String(s.overtimeRate) : '1.5'
                        }); 
                        setShowPin(false); 
                        setShowForm(true); 
                      }}
                    >
                      <Edit2 size={13}/>
                      <span>Edit</span>
                    </button>

                    <button 
                      type="button"
                      className="btn btn-secondary btn-sm" 
                      onClick={() => toggleActive(s.id, s.active !== false)} 
                      id={`toggle-staff-${s.id}`}
                    >
                      {s.active !== false ? (
                        <>
                          <UserX size={13} color="var(--color-red)"/>
                          <span>Deactivate</span>
                        </>
                      ) : (
                        <>
                          <UserCheck size={13} color="var(--color-green)"/>
                          <span>Activate</span>
                        </>
                      )}
                    </button>

                    {s.id !== currentUser?.id && (
                      <button 
                        type="button"
                        className="btn btn-secondary btn-sm" 
                        style={{ color: 'var(--color-red)' }} 
                        onClick={() => deleteStaff(s.id)} 
                        id={`delete-staff-${s.id}`}
                      >
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editId ? (isBillOnly ? 'Edit Cashier' : 'Edit Staff') : (isBillOnly ? 'Add Cashier' : 'Add Staff Member')}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowForm(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">
                  Full Name <span style={{ color: 'var(--color-red)' }}>*</span>
                </label>
                <input id="staff-name-input" className="form-input" placeholder={isBillOnly ? "e.g. Ramesh Cashier" : "e.g. Rahul Sharma"} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
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
                  <span>{isBillOnly ? '4-digit PIN used by the cashier to log into the register' : 'Numeric PIN used by staff to switch accounts and sign into POS'}</span>
                  <span style={{ fontWeight: 600, color: form.pin.length === 4 ? 'var(--color-green)' : 'inherit' }}>
                    {form.pin.length}/4 digits
                  </span>
                </div>
              </div>
              {isBillOnly ? (
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Role</label>
                    <span className="badge badge-blue">Cashier</span>
                  </div>
                  <div style={{
                    padding: '10px 14px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-separator)',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CreditCard size={15} color="#3b82f6" />
                      <span style={{ fontWeight: 600, color: 'var(--color-label)' }}>Cashier</span>
                    </div>
                    <span className="badge badge-blue">Register & Billing</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: '4px' }}>
                    Cashiers can only bill items and operate the register. Settings and sales reports are protected.
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Role</label>
                    <span className={`badge ${ROLE_CONFIG[form.role]?.color || 'badge-blue'}`}>
                      {ROLE_CONFIG[form.role]?.label || form.role}
                    </span>
                  </div>

                  {/* Clean Segmented Role Grid */}
                  <div className="staff-role-picker-grid" role="radiogroup" aria-label="Staff role selection">
                    {ROLES.map(r => {
                      const cfg = ROLE_CONFIG[r];
                      const isSelected = form.role === r;
                      const RoleIcon = r === 'admin' ? Shield :
                                       r === 'manager' ? UserCheck :
                                       r === 'cashier' ? CreditCard :
                                       r === 'waiter' ? Utensils : ChefHat;
                      return (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`staff-role-picker-btn role-${r} ${isSelected ? 'active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, role: r }))}
                          id={`staff-role-btn-${r}`}
                        >
                          <RoleIcon size={16} />
                          <span>{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Synced native select for forms and accessibility */}
                  <select
                    id="staff-role-select"
                    className="sr-only"
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || (r.charAt(0).toUpperCase()+r.slice(1))}</option>)}
                  </select>

                  {/* Organized Role Scope Card */}
                  <div className="staff-role-scope-card">
                    <div className="staff-role-scope-header">
                      <span className="staff-role-scope-title">{ROLE_CONFIG[form.role]?.desc}</span>
                      <span className="staff-role-scope-desc">{ROLE_CONFIG[form.role]?.summary}</span>
                    </div>
                    <div className="staff-role-scope-chips">
                      {ROLE_CONFIG[form.role]?.permissions?.map(perm => (
                        <span key={perm} className="staff-role-scope-chip">
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Email (optional)</label>
                <input id="staff-email-input" className="form-input" type="email" placeholder="staff@restaurant.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
              </div>
              {!isBillOnly && (
                <>
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
                </>
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
