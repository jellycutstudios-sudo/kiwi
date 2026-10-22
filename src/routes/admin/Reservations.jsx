import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useTableStore } from '../../stores/tableStore';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, X, Calendar, Clock, Users, UserCheck, PhoneCall } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Reservations() {
  const { restaurant } = useAuthStore();
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'waitlist'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Real-time states
  const [reservations, setReservations] = useState(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const cached = localStorage.getItem(`dineos_cached_res_${today}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [waitlist, setWaitlist] = useState(() => {
    try {
      const cached = localStorage.getItem('dineos_cached_waitlist');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [tables, setTables] = useState(() => {
    try {
      const storeTables = useTableStore.getState().tables;
      if (storeTables && storeTables.length > 0) return storeTables;
    } catch {}
    return [];
  });
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
    date: new Date().toISOString().split('T')[0],
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
    const storeTables = useTableStore.getState().tables;
    if (storeTables && storeTables.length > 0) {
      setTables(storeTables);
    }
    return onSnapshot(collection(db, 'restaurants', restaurant.id, 'tables'), snap => {
      setTables(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
  }, [restaurant?.id]);

  // 2. Fetch reservations in real-time
  useEffect(() => {
    if (!restaurant?.id) return;
    try {
      const cached = localStorage.getItem(`dineos_cached_res_${selectedDate}`);
      if (cached) setReservations(JSON.parse(cached));
    } catch {}
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'reservations'),
      where('date', '==', selectedDate),
      orderBy('time', 'asc')
    );
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReservations(docs);
      try {
        localStorage.setItem(`dineos_cached_res_${selectedDate}`, JSON.stringify(docs));
      } catch {}
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
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setWaitlist(docs);
      try {
        localStorage.setItem('dineos_cached_waitlist', JSON.stringify(docs));
      } catch {}
    }, err => console.log('Waitlist fetch err:', err));
  }, [restaurant?.id]);

  const saveReservation = async () => {
    if (!resForm.name.trim() || !resForm.phone.trim()) {
      toast.error('Customer name and phone number are required');
      return;
    }

    const bookingDate = resForm.date || selectedDate;

    const payload = {
      name: resForm.name.trim(),
      phone: resForm.phone.trim().replace(/\D/g, ''),
      date: bookingDate,
      time: resForm.time,
      partySize: parseInt(resForm.partySize) || 2,
      tableId: resForm.tableId || null,
      notes: resForm.notes.trim() || '',
      status: 'confirmed'
    };

    try {
      if (editResId) {
        setReservations(prev => prev.map(r => r.id === editResId ? { ...r, ...payload } : r));
        toast.success('Reservation updated!');
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', editResId), payload);
      } else {
        const tempId = `res_${Date.now()}`;
        payload.createdAt = new Date();
        if (bookingDate === selectedDate) {
          setReservations(prev => [...prev, { id: tempId, ...payload }]);
        }
        toast.success('Reservation booked!');
        await addDoc(collection(db, 'restaurants', restaurant.id, 'reservations'), payload);
      }
      if (bookingDate !== selectedDate) {
        setSelectedDate(bookingDate);
      }
      setShowResForm(false);
      setEditResId(null);
      setResForm({ name: '', phone: '', date: bookingDate, time: '19:00', partySize: '2', tableId: '', notes: '' });
    } catch (e) {
      console.warn('Reservation cloud write deferred:', e);
    }
  };

  const deleteReservation = async (id) => {
    if (!confirm('Are you sure you want to delete this reservation?')) return;
    setReservations(prev => prev.filter(r => r.id !== id));
    toast.success('Reservation deleted');
    try {
      await deleteDoc(doc(db, 'restaurants', restaurant.id, 'reservations', id));
    } catch (e) {
      console.warn('Reservation delete deferred:', e);
    }
  };

  const updateResStatus = async (id, status) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    toast.success(`Reservation status updated to: ${status}`);
    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', id), { status });
    } catch (e) {
      console.warn('Res status update deferred:', e);
    }
  };

  const seatReservation = async (resObj, targetTableId) => {
    if (!targetTableId) {
      toast.error('Please select a table to seat the guest');
      return;
    }
    // Optimistic UI updates
    setReservations(prev => prev.map(r => r.id === resObj.id ? { ...r, status: 'seated', tableId: targetTableId } : r));
    setTables(prev => prev.map(t => t.id === targetTableId ? { ...t, status: 'occupied' } : t));
    try {
      useTableStore.getState().updateTableStatus?.(targetTableId, 'occupied');
    } catch {}
    setSeatRes(null);
    toast.success(`Guest seated at Table ${tables.find(t => t.id === targetTableId)?.name || targetTableId}!`, { icon: '🍽️' });

    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', resObj.id), {
        status: 'seated',
        tableId: targetTableId
      });
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'tables', targetTableId), {
        status: 'occupied'
      });
    } catch (e) {
      console.warn('Seating cloud write deferred:', e);
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

    const tempId = `wait_${Date.now()}`;
    setWaitlist(prev => [...prev, { id: tempId, ...payload }]);
    setShowWaitForm(false);
    setWaitForm({ name: '', phone: '', partySize: '2' });
    toast.success('Guest added to waitlist queue!');

    try {
      await addDoc(collection(db, 'restaurants', restaurant.id, 'waitlist'), payload);
    } catch (e) {
      console.warn('Waitlist add deferred:', e);
    }
  };

  const callWaitlistGuest = async (waitEntry) => {
    setWaitlist(prev => prev.map(w => w.id === waitEntry.id ? { ...w, status: 'called' } : w));
    toast.success('Guest notified/called!', { icon: '📞' });

    try {
      const cleanPhone = waitEntry.phone.replace(/\D/g, '');
      if (cleanPhone) {
        const msg = `Hello ${waitEntry.name}, your table for ${waitEntry.partySize} guests at ${restaurant?.name || 'our restaurant'} is ready! 🍽️`;
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');
      }
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'waitlist', waitEntry.id), { status: 'called' });
    } catch (e) {
      console.warn('Call guest deferred:', e);
    }
  };

  const seatWaitlistGuest = async (waitEntry, tableId) => {
    if (!tableId) return;
    setWaitlist(prev => prev.filter(w => w.id !== waitEntry.id));
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'occupied' } : t));
    try {
      useTableStore.getState().updateTableStatus?.(tableId, 'occupied');
    } catch {}
    setSeatRes(null);
    toast.success(`Guest seated!`, { icon: '🍽️' });

    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'waitlist', waitEntry.id), { status: 'seated' });
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'tables', tableId), { status: 'occupied' });
    } catch (e) {
      console.warn('Waitlist seating cloud write deferred:', e);
    }
  };

  const removeWaitlistGuest = async (id) => {
    setWaitlist(prev => prev.filter(w => w.id !== id));
    toast.success('Guest removed from waitlist queue');
    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'waitlist', id), { status: 'removed' });
    } catch (e) {
      console.warn('Remove waitlist guest deferred:', e);
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
            <button className="btn btn-primary" id="new-res-btn" onClick={() => { setEditResId(null); setResForm({ name: '', phone: '', date: selectedDate, time: '19:00', partySize: '2', tableId: '', notes: '' }); setShowResForm(true); }}>
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
          {/* Desktop Table View */}
          <div className="desktop-only" style={{ overflowX: 'auto' }}>
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
                              date: res.date || selectedDate,
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

          {/* Mobile Touch Cards View */}
          <div className="mobile-only" style={{ padding: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {reservations.map(res => {
                const matchedTable = tables.find(t => t.id === res.tableId);

                return (
                  <div 
                    key={res.id}
                    className="card"
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-separator)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                      opacity: res.status === 'cancelled' || res.status === 'no-show' ? 0.6 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-accent)' }}>
                          🕒 {res.time}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>
                          • {res.partySize} Guests
                        </span>
                      </div>
                      <span className={`badge ${
                        res.status === 'seated' ? 'badge-green' : 
                        res.status === 'confirmed' ? 'badge-blue' : 
                        res.status === 'no-show' ? 'badge-gray' : 'badge-red'
                      }`} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                        {res.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'var(--weight-bold)', fontSize: '14px' }}>{res.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>{res.phone}</div>
                      </div>
                      {matchedTable ? (
                        <span className="badge badge-blue">🪑 Table {matchedTable.name}</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </div>

                    {res.notes && (
                      <div style={{ fontSize: '11.5px', color: 'var(--color-label-tertiary)', background: 'var(--color-bg)', padding: '6px 8px', borderRadius: 'var(--radius-sm)' }}>
                        📝 {res.notes}
                      </div>
                    )}

                    {/* Touch Action Buttons */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', borderTop: '1px solid var(--color-separator)', paddingTop: 8, marginTop: 4 }}>
                      {res.status === 'confirmed' && (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => setSeatRes(res)}
                            style={{ height: 36, padding: '0 12px', fontSize: 12, fontWeight: 700, flex: 1 }}
                          >
                            Seat Party
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => updateResStatus(res.id, 'no-show')}
                            style={{ height: 36, padding: '0 10px', fontSize: 12 }}
                          >
                            No-Show
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => updateResStatus(res.id, 'cancelled')}
                            style={{ background: 'var(--color-red-light)', color: 'var(--color-red)', border: 'none', height: 36, padding: '0 10px', fontSize: 12 }}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ height: 36, padding: '0 10px' }}
                        onClick={() => {
                          setEditResId(res.id);
                          setResForm({
                            name: res.name,
                            phone: res.phone,
                            date: res.date || selectedDate,
                            time: res.time,
                            partySize: String(res.partySize),
                            tableId: res.tableId ?? '',
                            notes: res.notes ?? ''
                          });
                          setShowResForm(true);
                        }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button 
                        className="btn btn-icon btn-sm"
                        style={{ color: 'var(--color-red)', height: 36, width: 36 }}
                        onClick={() => deleteReservation(res.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {reservations.length === 0 && (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                  No bookings scheduled for this date.
                </div>
              )}
            </div>
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
          {/* Desktop Table View */}
          <div className="desktop-only" style={{ overflowX: 'auto' }}>
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

          {/* Mobile Touch Cards View */}
          <div className="mobile-only" style={{ padding: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {waitlist.map((wait, idx) => {
                const minsWaiting = Math.floor((currentTime - (wait.createdAt?.toDate ? wait.createdAt.toDate() : new Date(wait.createdAt))) / 60000);

                return (
                  <div 
                    key={wait.id}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ 
                          width: 24, height: 24, borderRadius: '50%', 
                          background: 'var(--color-accent-light)', color: 'var(--color-accent)', 
                          fontSize: '11px', fontWeight: 800, display: 'inline-flex', 
                          alignItems: 'center', justifyContent: 'center' 
                        }}>
                          #{idx + 1}
                        </span>
                        <span style={{ fontWeight: 'var(--weight-bold)', fontSize: '14.5px' }}>{wait.name}</span>
                        <span style={{ fontSize: '12.5px', color: 'var(--color-label-secondary)' }}>• {wait.partySize} Guests</span>
                      </div>
                      <span className={`badge ${wait.status === 'called' ? 'badge-orange' : 'badge-gray'}`} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                        {wait.status === 'called' ? 'Notified' : 'Waiting'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg)', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>{wait.phone}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: minsWaiting >= 30 ? 'var(--color-red)' : (minsWaiting >= 15 ? 'var(--color-orange)' : 'var(--color-green)') }}>
                        🕒 Waiting {minsWaiting}m
                      </span>
                    </div>

                    {/* Touch actions */}
                    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--color-separator)', paddingTop: 8, marginTop: 4 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => callWaitlistGuest(wait)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, fontSize: 12, fontWeight: 600, flex: 1 }}
                      >
                        <PhoneCall size={14} /> Notify (WA)
                      </button>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => setSeatRes(wait)}
                        style={{ height: 38, fontSize: 12, fontWeight: 700, flex: 1 }}
                      >
                        Seat Party
                      </button>
                      <button
                        className="btn btn-icon btn-sm"
                        style={{ color: 'var(--color-red)', height: 38, width: 38 }}
                        onClick={() => removeWaitlistGuest(wait.id)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {waitlist.length === 0 && (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                  No guests waiting in queue.
                </div>
              )}
            </div>
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
                <input id="res-name-input" className="form-input" placeholder="Enter guest name" value={resForm.name} onChange={e => setResForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input id="res-phone-input" className="form-input" placeholder="Enter phone number" value={resForm.phone} onChange={e => setResForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Reservation Date</label>
                  <input id="res-date-input" className="form-input" type="date" value={resForm.date} onChange={e => setResForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Reservation Time</label>
                  <input id="res-time-input" className="form-input" type="time" value={resForm.time} onChange={e => setResForm(f => ({ ...f, time: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Party Size</label>
                  <input id="res-size-input" className="form-input" type="number" min={1} value={resForm.partySize} onChange={e => setResForm(f => ({ ...f, partySize: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Assigned Table (Optional)</label>
                  <select id="res-table-select" className="form-select" value={resForm.tableId} onChange={e => setResForm(f => ({ ...f, tableId: e.target.value }))}>
                    <option value="">Auto-Assign Later</option>
                    {tables.map(t => (
                      <option key={t.id} value={t.id}>Table {t.name} (Cap: {t.capacity ?? 4})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Special Requests/Notes</label>
                <textarea
                  id="res-notes-input"
                  className="form-input"
                  rows={2}
                  placeholder="Window seat, anniversary, dietary requirements..."
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
                <input id="wait-name-input" className="form-input" placeholder="Enter guest name" value={waitForm.name} onChange={e => setWaitForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input id="wait-phone-input" className="form-input" placeholder="Enter phone number" value={waitForm.phone} onChange={e => setWaitForm(f => ({ ...f, phone: e.target.value }))} />
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
