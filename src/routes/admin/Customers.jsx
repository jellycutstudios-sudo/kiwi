import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { collection, setDoc, deleteDoc, doc, query, where, getDocs, getDoc, limit, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, X, Search, Users, Award, DollarSign, Calendar, Ticket } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

export default function Customers() {
  const { restaurant } = useAuthStore();
  const [activeTab, setActiveTab] = useState('crm'); // 'crm' | 'giftcards'
  
  // CRM States
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPhone, setEditPhone] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [form, setForm] = useState({
    name: '',
    phone: '',
    birthday: '',
    notes: '',
    points: '0',
    visitCount: '0',
    lifetimeSpend: '0'
  });

  // Gift Cards States
  const [giftCards, setGiftCards] = useState([]);
  const [showGcForm, setShowGcForm] = useState(false);
  const [gcForm, setGcForm] = useState({
    initialValue: '100',
    expiresAt: ''
  });

  const currency = restaurant?.currency ?? 'INR';

  const [prevRestId, setPrevRestId] = useState(restaurant?.id);
  if (restaurant?.id !== prevRestId) {
    setPrevRestId(restaurant?.id);
    setLoading(true);
  }

  // Load customers with pagination and server-side search
  const fetchCustomers = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true);
    try {
      const cleanSearch = search.trim();
      if (!cleanSearch) {
        const q = query(
          collection(db, 'restaurants', restaurant.id, 'customers'),
          orderBy('name'),
          limit(50)
        );
        const snap = await getDocs(q);
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        const isPhone = /^\d+$/.test(cleanSearch.replace(/\D/g, ''));
        if (isPhone) {
          const cleanPhone = cleanSearch.replace(/\D/g, '');
          const docRef = doc(db, 'restaurants', restaurant.id, 'customers', cleanPhone);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setCustomers([{ id: docSnap.id, ...docSnap.data() }]);
          } else {
            const q = query(
              collection(db, 'restaurants', restaurant.id, 'customers'),
              where('phone', '>=', cleanPhone),
              where('phone', '<=', cleanPhone + '\uf8ff'),
              limit(50)
            );
            const snap = await getDocs(q);
            setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }
        } else {
          const q = query(
            collection(db, 'restaurants', restaurant.id, 'customers'),
            where('name', '>=', cleanSearch),
            where('name', '<=', cleanSearch + '\uf8ff'),
            limit(50)
          );
          const snap = await getDocs(q);
          setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      }
    } catch (e) {
      console.error('Error fetching customers:', e);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [restaurant, search]);

  // Debounced trigger for customers search
  useEffect(() => {
    if (!restaurant?.id) return;
    const delayDebounceFn = setTimeout(() => {
      fetchCustomers();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [restaurant?.id, fetchCustomers]);

  // Load gift cards in real-time when activeTab is giftcards
  useEffect(() => {
    if (!restaurant?.id || activeTab !== 'giftcards') return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'gift_cards'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setGiftCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('Error fetching gift cards:', err);
    });
    return unsub;
  }, [restaurant?.id, activeTab]);

  // ── Customer CRM Actions ──────────────────────────────────
  const saveCustomer = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and Phone Number are required');
      return;
    }

    const cleanPhone = form.phone.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      toast.error('Please enter a valid phone number');
      return;
    }

    const payload = {
      name: form.name.trim(),
      phone: cleanPhone,
      birthday: form.birthday || '',
      notes: form.notes.trim() || '',
      points: parseFloat(form.points) || 0,
      visitCount: parseInt(form.visitCount) || 0,
      lifetimeSpend: parseFloat(form.lifetimeSpend) || 0,
    };

    try {
      if (editPhone) {
        if (editPhone !== cleanPhone) {
          const docRef = doc(db, 'restaurants', restaurant.id, 'customers', cleanPhone);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            toast.error('A customer with this new phone number already exists');
            return;
          }
          await setDoc(doc(db, 'restaurants', restaurant.id, 'customers', cleanPhone), payload);
          await deleteDoc(doc(db, 'restaurants', restaurant.id, 'customers', editPhone));
        } else {
          await setDoc(doc(db, 'restaurants', restaurant.id, 'customers', editPhone), payload);
        }
        toast.success('Customer updated!');
      } else {
        const docRef = doc(db, 'restaurants', restaurant.id, 'customers', cleanPhone);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          toast.error('A customer with this phone number already exists');
          return;
        }
        payload.createdAt = new Date();
        await setDoc(docRef, payload);
        toast.success('Customer profile created!');
      }
      setShowForm(false);
      setEditPhone(null);
      setForm({ name: '', phone: '', birthday: '', notes: '', points: '0', visitCount: '0', lifetimeSpend: '0' });
      fetchCustomers();
    } catch (e) {
      toast.error('Failed to save: ' + e.message);
    }
  };

  const deleteCustomer = async (phone) => {
    if (!confirm('Are you sure you want to delete this customer profile? Points history and spend logs will be lost.')) return;
    try {
      await deleteDoc(doc(db, 'restaurants', restaurant.id, 'customers', phone));
      toast.success('Customer removed from directory');
      fetchCustomers();
    } catch (e) {
      toast.error('Failed to delete: ' + e.message);
    }
  };

  // ── Gift Cards Actions ─────────────────────────────────────
  const generateGiftCard = async () => {
    if (!gcForm.initialValue || parseFloat(gcForm.initialValue) <= 0) {
      toast.error('Initial value must be greater than 0');
      return;
    }

    const val = parseFloat(gcForm.initialValue);
    
    // Generate a cryptographically secure random card code
    const arr = new Uint16Array(2);
    crypto.getRandomValues(arr);
    const r1 = 1000 + (arr[0] % 9000);
    const r2 = 1000 + (arr[1] % 9000);
    const code = `GC-${r1}-${r2}`;

    const payload = {
      initialValue: val,
      balance: val,
      status: 'active',
      createdAt: new Date(),
      expiresAt: gcForm.expiresAt ? new Date(gcForm.expiresAt) : null
    };

    try {
      await setDoc(doc(db, 'restaurants', restaurant.id, 'gift_cards', code), payload);
      toast.success(`Issued Gift Card: ${code}`, { duration: 6000 });
      setShowGcForm(false);
      setGcForm({ initialValue: '100', expiresAt: '' });
    } catch (e) {
      toast.error('Failed to generate: ' + e.message);
    }
  };

  const deleteGiftCard = async (code) => {
    if (!confirm('Are you sure you want to void this gift card? Remaining balance will be lost.')) return;
    try {
      await deleteDoc(doc(db, 'restaurants', restaurant.id, 'gift_cards', code));
      toast.success('Gift card voided');
    } catch (e) {
      toast.error('Failed to delete: ' + e.message);
    }
  };

  // Calculations for CRM
  const filteredCustomers = customers;

  const totalSpendVal = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.lifetimeSpend || 0), 0);
  }, [customers]);

  const totalPointsVal = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.points || 0), 0);
  }, [customers]);

  const stats = useMemo(() => {
    return [
      { label: 'Matching Customers', value: customers.length, icon: Users, color: 'var(--color-accent)', bg: 'var(--color-accent-light)' },
      { label: 'Loyalty Points (Matching)', value: Math.round(totalPointsVal), icon: Award, color: 'var(--color-orange)', bg: 'var(--color-orange-light)' },
      { label: 'Customer Spend (Matching)', value: formatCurrency(totalSpendVal, currency), icon: DollarSign, color: 'var(--color-green)', bg: 'var(--color-green-light)' },
    ];
  }, [customers, totalPointsVal, totalSpendVal, currency]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 className="text-title2">CRM & Promotional Ledger</h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Manage loyalty accounts, birthdays, and issue prepaid gift card codes.
          </p>
        </div>
        <div>
          {activeTab === 'crm' ? (
            <button className="btn btn-primary" id="add-customer-btn" onClick={() => { setEditPhone(null); setForm({ name: '', phone: '', birthday: '', notes: '', points: '0', visitCount: '0', lifetimeSpend: '0' }); setShowForm(true); }}>
              <Plus size={16} /> Add Customer
            </button>
          ) : (
            <button className="btn btn-primary" id="issue-gift-card-btn" onClick={() => { setGcForm({ initialValue: '100', expiresAt: '' }); setShowGcForm(true); }}>
              <Plus size={16} /> Issue Gift Card
            </button>
          )}
        </div>
      </div>

      {/* Tabs Selector Navigation */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--color-separator)', marginBottom: '-1px' }}>
        {[
          { key: 'crm', label: 'Customer Database', icon: Users },
          { key: 'giftcards', label: 'Prepaid Gift Cards', icon: Ticket }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: `2.5px solid ${activeTab === tab.key ? 'var(--color-accent)' : 'transparent'}`,
              color: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-label-secondary)',
              fontWeight: activeTab === tab.key ? 'var(--weight-bold)' : 'var(--weight-semibold)',
              fontSize: 'var(--text-subhead)',
              cursor: 'pointer',
              transition: 'all var(--duration-fast)',
              fontFamily: 'var(--font-family)',
              marginBottom: '-2px'
            }}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content: Customer CRM Directory ────────────── */}
      {activeTab === 'crm' && (
        <>
          {/* Stats Cards */}
          <div className="stat-grid">
            {stats.map((s, i) => (
              <div key={i} className="stat-card">
                <div className="stat-card-icon" style={{ background: s.bg }}>
                  <s.icon size={20} color={s.color} />
                </div>
                <div className="stat-card-value">
                  {loading ? <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 6 }} /> : s.value}
                </div>
                <div className="stat-card-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter and Search Bar */}
          <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-bg)', border: '1px solid var(--color-separator)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Search size={16} color="var(--color-label-tertiary)" />
            <input
              className="form-input"
              placeholder="Search by customer name or phone number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              id="crm-search-input"
              style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 'var(--text-footnote)' }}
            />
          </div>

          {/* Customers Ledger */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Customer Database</span>
              <span className="badge badge-gray">{filteredCustomers.length} accounts</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                    {['Customer Name', 'Phone Number', 'Visits', 'Loyalty Balance', 'Lifetime Value', 'Birthday', 'Notes', 'Actions'].map(h => (
                      <th key={h} style={{
                        padding: 'var(--space-3) var(--space-4)',
                        textAlign: h === 'Actions' ? 'center' : (h === 'Lifetime Value' || h === 'Loyalty Balance' ? 'right' : 'left'),
                        fontSize: 'var(--text-caption1)',
                        fontWeight: 'var(--weight-semibold)',
                        color: 'var(--color-label-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map(cust => (
                    <tr key={cust.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                        {cust.name}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)' }}>
                        {cust.phone}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                        {cust.visitCount ?? 0}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', textAlign: 'right', color: 'var(--color-orange)' }}>
                        {cust.points ?? 0} pts
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', textAlign: 'right', color: 'var(--color-green)' }}>
                        {formatCurrency(cust.lifetimeSpend ?? 0, currency)}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)' }}>
                        {cust.birthday ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={12} /> {cust.birthday}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-tertiary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cust.notes}>
                        {cust.notes || '—'}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                          <button className="btn btn-secondary btn-icon btn-sm" id={`edit-cust-${cust.phone}`} onClick={() => {
                            setEditPhone(cust.phone);
                            setForm({
                              name: cust.name,
                              phone: cust.phone,
                              birthday: cust.birthday ?? '',
                              notes: cust.notes ?? '',
                              points: String(cust.points ?? 0),
                              visitCount: String(cust.visitCount ?? 0),
                              lifetimeSpend: String(cust.lifetimeSpend ?? 0)
                            });
                            setShowForm(true);
                          }}>
                            <Edit2 size={12} />
                          </button>
                          <button className="btn btn-icon btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteCustomer(cust.phone)} id={`delete-cust-${cust.phone}`}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                        No customer accounts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Tab Content: Prepaid Gift Cards Ledger ─────────── */}
      {activeTab === 'giftcards' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Prepaid Gift Vouchers</span>
            <span className="badge badge-gray">{giftCards.length} vouchers</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {['Voucher Code', 'Initial Value', 'Remaining Balance', 'Expiry Date', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: 'var(--space-3) var(--space-4)',
                      textAlign: h === 'Actions' || h === 'Status' ? 'center' : (h === 'Initial Value' || h === 'Remaining Balance' ? 'right' : 'left'),
                      fontSize: 'var(--text-caption1)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--color-label-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {giftCards.map(gc => {
                  const expiryStr = gc.expiresAt?.toDate
                    ? gc.expiresAt.toDate().toLocaleDateString()
                    : (gc.expiresAt ? new Date(gc.expiresAt).toLocaleDateString() : 'Never');
                  
                  const isExpired = gc.expiresAt && (gc.expiresAt.toDate ? gc.expiresAt.toDate() : new Date(gc.expiresAt)) < new Date();
                  const computedStatus = isExpired && gc.status === 'active' ? 'expired' : gc.status;

                  return (
                    <tr key={gc.id} style={{ borderBottom: '1px solid var(--color-separator)', opacity: computedStatus === 'redeemed' || computedStatus === 'expired' ? 0.6 : 1 }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
                        🎫 {gc.id}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', textAlign: 'right' }}>
                        {formatCurrency(gc.initialValue, currency)}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', textAlign: 'right', color: 'var(--color-green)' }}>
                        {formatCurrency(gc.balance, currency)}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)' }}>
                        {expiryStr}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <span className={`badge ${
                          computedStatus === 'active' ? 'badge-green' : 
                          computedStatus === 'redeemed' ? 'badge-blue' : 'badge-red'
                        }`} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                          {computedStatus}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <button className="btn btn-icon btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteGiftCard(gc.id)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {giftCards.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                      No gift vouchers issued yet. Generate a card to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Add / Edit Customer CRM Form ───────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editPhone ? 'Edit Customer Account' : 'New Customer Account'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input id="cust-name-input" className="form-input" placeholder="e.g. Salman Malik" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input id="cust-phone-input" className="form-input" placeholder="e.g. 9876543210" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Loyalty Points Balance</label>
                  <input id="cust-points-input" className="form-input" type="number" min={0} value={form.points} onChange={e => setForm(f => ({ ...f, points: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Birthday</label>
                  <input id="cust-birthday-input" className="form-input" type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Total Visits</label>
                  <input id="cust-visits-input" className="form-input" type="number" min={0} value={form.visitCount} onChange={e => setForm(f => ({ ...f, visitCount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lifetime Spend ({currency})</label>
                  <input id="cust-spend-input" className="form-input" type="number" min={0} step={0.01} value={form.lifetimeSpend} onChange={e => setForm(f => ({ ...f, lifetimeSpend: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  id="cust-notes-input"
                  className="form-input"
                  rows={2}
                  placeholder="Preferences, allergies, or delivery notes..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ resize: 'none', fontFamily: 'var(--font-family)', fontSize: 'var(--text-footnote)' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-cust-btn" onClick={saveCustomer}>{editPhone ? 'Save Changes' : 'Create Profile'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Issue Gift Card Form ───────────────────── */}
      {showGcForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowGcForm(false)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2 className="modal-title">Issue Prepaid Gift Card</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowGcForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Card Value ({currency})</label>
                <input id="gc-value-input" className="form-input" type="number" min={1} value={gcForm.initialValue} onChange={e => setGcForm(g => ({ ...g, initialValue: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Expiry Date (Optional)</label>
                <input id="gc-expiry-input" className="form-input" type="date" value={gcForm.expiresAt} onChange={e => setGcForm(g => ({ ...g, expiresAt: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowGcForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-gc-btn" onClick={generateGiftCard}>Generate Voucher</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
