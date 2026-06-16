import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, X, Calendar, Clock, Users, UserCheck, PhoneCall } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Reservations() {
  const { restaurant } = useAuthStore();
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'waitlist'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Real-time states
  const [reservations, setReservations] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [tables, setTables] = useState([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  
  // Modals
  const [showResForm, setShowResForm] = useState(false);
  const [showWaitForm, setShowWaitForm] = useState(false);
  const [editResId, setEditResId] = useState(null);
  const [seatRes, setSeatRes] = useState(null); // Holds reservation when selecting table to seat

  // Form states
  const [resForm, setResForm] = useState({
    name: '',
    phone: '',
    time: '19:00',
    partySize: '2',
    tableId: '',
    notes: ''
  });

  const [waitForm, setWaitForm] = useState({
    name: '',
    phone: '',
    partySize: '2'
  });

  // 1. Fetch tables list
  useEffect(() => {
    if (!restaurant?.id) return;
    return onSnapshot(collection(db, 'restaurants', restaurant.id, 'tables'), snap => {
      setTables(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [restaurant?.id]);

  // 2. Fetch reservations in real-time
  useEffect(() => {
    if (!restaurant?.id) return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'reservations'),
      where('date', '==', selectedDate),
      orderBy('time', 'asc')
    );
    return onSnapshot(q, snap => {
      setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.log('Res fetch err:', err));
  }, [restaurant?.id, selectedDate]);

  // 3. Fetch waitlist in real-time
  useEffect(() => {
    if (!restaurant?.id) return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'waitlist'),
      where('status', 'in', ['waiting', 'called']),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, snap => {
      setWaitlist(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.log('Waitlist fetch err:', err));
  }, [restaurant?.id]);

  const saveReservation = async () => {
    if (!resForm.name.trim() || !resForm.phone.trim()) {
      toast.error('Customer name and phone number are required');
      return;
    }

    const payload = {
      name: resForm.name.trim(),
      phone: resForm.phone.trim().replace(/\D/g, ''),
      date: selectedDate,
      time: resForm.time,
      partySize: parseInt(resForm.partySize) || 2,
      tableId: resForm.tableId || null,
      notes: resForm.notes.trim() || '',
      status: 'confirmed'
    };

    try {
      if (editResId) {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', editResId), payload);
        toast.success('Reservation updated!');
      } else {
        payload.createdAt = new Date();
        await addDoc(collection(db, 'restaurants', restaurant.id, 'reservations'), payload);
        toast.success('Reservation booked!');
      }
      setShowResForm(false);
      setEditResId(null);
      setResForm({ name: '', phone: '', time: '19:00', partySize: '2', tableId: '', notes: '' });
    } catch (e) {
      toast.error('Booking failed: ' + e.message);
    }
  };

  const deleteReservation = async (id) => {
    if (!confirm('Are you sure you want to delete this reservation?')) return;
    try {
      await deleteDoc(doc(db, 'restaurants', restaurant.id, 'reservations', id));
      toast.success('Reservation deleted');
    } catch (e) {
      toast.error('Failed: ' + e.message);
    }
  };

  const updateResStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', id), { status });
      toast.success(`Reservation status updated to: ${status}`);
    } catch (e) {
      toast.error('Update failed: ' + e.message);
    }
  };

  const seatReservation = async (resObj, targetTableId) => {
    if (!targetTableId) {
      toast.error('Please select a table to seat the guest');
      return;
    }
    try {
      // 1. Update reservation status to seated
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', resObj.id), {
        status: 'seated',
        tableId: targetTableId
      });

      // 2. Set Table status to occupied
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'tables', targetTableId), {
        status: 'occupied'
      });

      setSeatRes(null);
      toast.success(`Guest seated at Table ${tables.find(t => t.id === targetTableId)?.name || targetTableId}!`, { icon: '🍽️' });
    } catch (e) {
      toast.error('Seating failed: ' + e.message);
    }
  };

  const saveWaitlist = async () => {
    if (!waitForm.name.trim() || !waitForm.phone.trim()) {
      toast.error('Name and Phone are required');
      return;
    }

    const payload = {
      name: waitForm.name.trim(),
      phone: waitForm.phone.trim().replace(/\D/g, ''),
      partySize: parseInt(waitForm.partySize) || 2,
      status: 'waiting',
      createdAt: new Date()
    };

    try {
      await addDoc(collection(db, 'restaurants', restaurant.id, 'waitlist'), payload);
      setShowWaitForm(false);
      setWaitForm({ name: '', phone: '', partySize: '2' });
      toast.success('Guest added to waitlist queue!');
    } catch (e) {
      toast.error('Failed to add: ' + e.message);
    }
  };

  const callWaitlistGuest = async (waitEntry) => {
    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'waitlist', waitEntry.id), { status: 'called' });
      toast.success('Guest notified/called!', { icon: '📞' });
      
      const cleanPhone = waitEntry.phone.replace(/\D/g, '');
      if (cleanPhone) {
        const msg = `Hello ${waitEntry.name}, your table for ${waitEntry.partySize} guests at ${restaurant?.name || 'our restaurant'} is ready! 🍽️`;
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');
      }
    } catch (e) {
      toast.error('Update failed: ' + e.message);
    }
  };

  const seatWaitlistGuest = async (waitEntry, tableId) => {
    if (!tableId) return;
    try {
      // 1. Update waitlist entry status to seated
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'waitlist', waitEntry.id), { status: 'seated' });
      
      // 2. Set Table status to occupied
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'tables', tableId), { status: 'occupied' });

      setSeatRes(null);
      toast.success(`Guest seated!`, { icon: '🍽️' });
    } catch (e) {
      toast.error('Seating failed: ' + e.message);
    }
  };

  const removeWaitlistGuest = async (id) => {
    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'waitlist', id), { status: 'removed' });
      toast.success('Guest removed from waitlist queue');
    } catch (e) {
      toast.error('Failed: ' + e.message);
    }
  };

  // Stats
  const activeBookings = reservations.filter(r => r.status === 'confirmed');
  const seatedBookings = reservations.filter(r => r.status === 'seated');

  const stats = [
    { label: 'Total Bookings', value: reservations.length, icon: Calendar, color: 'var(--color-accent)', bg: 'var(--color-accent-light)' },
    { label: 'Seated Guests', value: seatedBookings.length, icon: UserCheck, color: 'var(--color-green)', bg: 'var(--color-green-light)' },
    { label: 'Pending Check-ins', value: activeBookings.length, icon: Clock, color: 'var(--color-orange)', bg: 'var(--color-orange-light)' },
    { label: 'Waitlist Size', value: waitlist.length, icon: Users, color: 'var(--color-purple)', bg: 'var(--color-purple-light)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 className="text-title2">Host Dashboard</h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Manage table reservations, scheduling, walk-in guest waitlist queues, and table seating.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {activeTab === 'bookings' ? (
            <button className="btn btn-primary" id="new-res-btn" onClick={() => { setEditResId(null); setResForm({ name: '', phone: '', time: '19:00', partySize: '2', tableId: '', notes: '' }); setShowResForm(true); }}>
              <Plus size={16} /> Book Reservation
            </button>
          ) : (
            <button className="btn btn-primary" id="new-wait-btn" onClick={() => { setShowWaitForm(true); }}>
              <Plus size={16} /> Add to Waitlist
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stat-grid">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-icon" style={{ background: s.bg }}>
              <s.icon size={20} color={s.color} />
            </div>
            <div className="stat-card-value">{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs / Filter Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', borderBottom: '1.5px solid var(--color-separator)' }}>
        <div style={{ display: 'flex', marginBottom: '-1.5px' }}>
          {[
            { key: 'bookings', label: 'Reservation Book', count: reservations.length },
            { key: 'waitlist', label: 'Waitlist Queue', count: waitlist.length }
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '12px 20px',
                background: 'none',
                border: 'none',
                borderBottom: `2.5px solid ${activeTab === t.key ? 'var(--color-accent)' : 'transparent'}`,
                color: activeTab === t.key ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                fontWeight: activeTab === t.key ? 'var(--weight-bold)' : 'var(--weight-semibold)',
                fontSize: 'var(--text-subhead)',
                cursor: 'pointer',
                transition: 'all var(--duration-fast)',
                fontFamily: 'var(--font-family)'
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span className="badge badge-gray" style={{ fontSize: 10, padding: '1px 5px' }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'bookings' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
            <span style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>
              Date:
            </span>
            <input
              type="date"
              className="form-input"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ height: 32, padding: '2px 8px', fontSize: 'var(--text-footnote)', width: 140 }}
            />
          </div>
        )}
      </div>

      {/* Booking List View */}
      {activeTab === 'bookings' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Bookings Ledger</span>
            <span className="badge badge-gray">{selectedDate}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {['Time', 'Guest Name', 'Phone', 'Party Size', 'Assigned Table', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: 'var(--space-3) var(--space-4)',
                      textAlign: h === 'Actions' || h === 'Status' ? 'center' : 'left',
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
                {reservations.map(res => {
                  const matchedTable = tables.find(t => t.id === res.tableId);
                  
                  return (
                    <tr key={res.id} style={{ borderBottom: '1px solid var(--color-separator)', opacity: res.status === 'cancelled' || res.status === 'no-show' ? 0.6 : 1 }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)' }}>
                        🕒 {res.time}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                        {res.name}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)' }}>
                        {res.phone}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>
                        {res.partySize} Guests
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)' }}>
                        {matchedTable ? (
                          <span className="badge badge-blue">🪑 Table {matchedTable.name}</span>
                        ) : (
                          <span style={{ color: 'var(--color-label-tertiary)', fontStyle: 'italic' }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <span className={`badge ${
                          res.status === 'seated' ? 'badge-green' : 
                          res.status === 'confirmed' ? 'badge-blue' : 
                          res.status === 'no-show' ? 'badge-gray' : 'badge-red'
                        }`} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                          {res.status}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                          {res.status === 'confirmed' && (
                            <>
                              <button
                                className="btn btn-success btn-xs"
                                onClick={() => setSeatRes(res)}
                                title="Seat Party"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                              >
                                Seat
                              </button>
                              <button
                                className="btn btn-secondary btn-xs"
                                onClick={() => updateResStatus(res.id, 'no-show')}
                                title="Mark No-Show"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                              >
                                No-Show
                              </button>
                              <button
                                className="btn btn-xs"
                                onClick={() => updateResStatus(res.id, 'cancelled')}
                                title="Cancel Booking"
                                style={{ background: 'var(--color-red-light)', color: 'var(--color-red)', border: 'none', padding: '4px 8px', fontSize: 11 }}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          <button className="btn btn-secondary btn-icon btn-sm" onClick={() => {
                            setEditResId(res.id);
                            setResForm({
                              name: res.name,
                              phone: res.phone,
                              time: res.time,
                              partySize: String(res.partySize),
                              tableId: res.tableId ?? '',
                              notes: res.notes ?? ''
                            });
                            setShowResForm(true);
                          }}>
                            <Edit2 size={12} />
                          </button>
                          <button className="btn btn-icon btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteReservation(res.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {reservations.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                      No bookings scheduled for this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Waitlist Queue View */}
      {activeTab === 'waitlist' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Walk-In Waiting Queue</span>
            <span className="badge badge-purple">{waitlist.length} in line</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {['Pos', 'Guest Name', 'Phone', 'Party Size', 'Wait Time', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: 'var(--space-3) var(--space-4)',
                      textAlign: h === 'Actions' || h === 'Status' || h === 'Pos' ? 'center' : 'left',
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
                {waitlist.map((wait, idx) => {
                  const minsWaiting = Math.floor((currentTime - (wait.createdAt?.toDate ? wait.createdAt.toDate() : new Date(wait.createdAt))) / 60000);
                  
                  return (
                    <tr key={wait.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                        {wait.name}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)' }}>
                        {wait.phone}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>
                        {wait.partySize} Guests
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)', color: minsWaiting >= 30 ? 'var(--color-red)' : (minsWaiting >= 15 ? 'var(--color-orange)' : 'var(--color-green)') }}>
                        🕒 {minsWaiting} mins
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <span className={`badge ${wait.status === 'called' ? 'badge-orange' : 'badge-gray'}`} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                          {wait.status === 'called' ? 'Notified' : 'Waiting'}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => callWaitlistGuest(wait)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, fontSize: 11 }}
                          >
                            <PhoneCall size={12} /> Notify
                          </button>
                          <button
                            className="btn btn-success btn-xs"
                            onClick={() => setSeatRes(wait)} // Using seatRes modal to trigger seating popup
                            style={{ height: 28, fontSize: 11 }}
                          >
                            Seat Party
                          </button>
                          <button
                            className="btn btn-icon btn-sm"
                            style={{ color: 'var(--color-red)' }}
                            onClick={() => removeWaitlistGuest(wait.id)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {waitlist.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                      No guests waiting in queue.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Booking Reservation Form Modal */}
      {showResForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowResForm(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editResId ? 'Edit Reservation' : 'New Table Reservation'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowResForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Guest Name</label>
                <input id="res-name-input" className="form-input" placeholder="e.g. Salman Malik" value={resForm.name} onChange={e => setResForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input id="res-phone-input" className="form-input" placeholder="e.g. 9876543210" value={resForm.phone} onChange={e => setResForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Reservation Time</label>
                  <input id="res-time-input" className="form-input" type="time" value={resForm.time} onChange={e => setResForm(f => ({ ...f, time: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Party Size</label>
                  <input id="res-size-input" className="form-input" type="number" min={1} value={resForm.partySize} onChange={e => setResForm(f => ({ ...f, partySize: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Table (Optional)</label>
                <select id="res-table-select" className="form-select" value={resForm.tableId} onChange={e => setResForm(f => ({ ...f, tableId: e.target.value }))}>
                  <option value="">Auto-Assign Later</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>Table {t.name} (Cap: {t.capacity ?? 4} - {t.status})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Special Requests/Notes</label>
                <textarea
                  id="res-notes-input"
                  className="form-input"
                  rows={2}
                  placeholder="e.g. Window seat, celebrating anniversary..."
                  value={resForm.notes}
                  onChange={e => setResForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ resize: 'none', fontFamily: 'var(--font-family)', fontSize: 'var(--text-footnote)' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowResForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-res-btn" onClick={saveReservation}>{editResId ? 'Save Changes' : 'Book Table'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Waitlist Form Modal */}
      {showWaitForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowWaitForm(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2 className="modal-title">Add walk-in to Waitlist</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowWaitForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Guest Name</label>
                <input id="wait-name-input" className="form-input" placeholder="e.g. David Miller" value={waitForm.name} onChange={e => setWaitForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input id="wait-phone-input" className="form-input" placeholder="e.g. 9876543210" value={waitForm.phone} onChange={e => setWaitForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Party Size</label>
                  <input id="wait-size-input" className="form-input" type="number" min={1} value={waitForm.partySize} onChange={e => setWaitForm(f => ({ ...f, partySize: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowWaitForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-wait-btn" onClick={saveWaitlist}>Add to Queue</button>
            </div>
          </div>
        </div>
      )}

      {/* Seat Selection Table Popup Modal */}
      {seatRes && (
        <div className="modal-overlay" onClick={() => setSeatRes(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2 className="modal-title">Select Table to Seat {seatRes.name}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setSeatRes(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Choose Available Table</label>
                <select id="seat-table-select" className="form-select" defaultValue={seatRes.tableId || ""}>
                  <option value="" disabled>-- Choose Free Table --</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id} disabled={t.status === 'occupied'}>
                      Table {t.name} (Cap: {t.capacity ?? 4} - {t.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSeatRes(null)}>Cancel</button>
              <button
                className="btn btn-success"
                onClick={() => {
                  const selectEl = document.getElementById('seat-table-select');
                  const targetTableId = selectEl?.value;
                  if (seatRes.createdAt) {
                    // It's a waitlist entry
                    seatWaitlistGuest(seatRes, targetTableId);
                  } else {
                    // It's a reservation
                    seatReservation(seatRes, targetTableId);
                  }
                }}
              >
                Seat Guest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
