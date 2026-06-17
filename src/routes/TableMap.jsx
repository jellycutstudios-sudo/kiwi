import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useTableStore } from '../stores/tableStore';
import { useOrderStore } from '../stores/orderStore';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/formatCurrency';
import { printReceipt } from '../utils/print';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';

export default function TableMap() {
  const navigate = useNavigate();
  const { restaurant } = useAuthStore();
  const { tables, subscribe, freeTable } = useTableStore();
  const { updateOrderStatus, loadOrderToCart, settleOrder, clearCart, setTable, setOrderType } = useOrderStore();
  const [selected, setSelected] = useState(null);
  const [tableOrders, setTableOrders] = useState({});
  const [reservations, setReservations] = useState([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];

  const [activeFloor, setActiveFloor] = useState('Ground Floor');
  const allFloors = useMemo(() => {
    return Array.from(new Set(['Ground Floor', ...tables.map(t => t.floor || 'Ground Floor')]));
  }, [tables]);

  // UPI Settle Modal state
  const [upiOrderToSettle, setUpiOrderToSettle] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [settlingUpi, setSettlingUpi] = useState(false);

  const clearUpiSettle = () => {
    setUpiOrderToSettle(null);
    setQrDataUrl('');
    setUpiRef('');
  };

  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = subscribe(restaurant.id);
    return unsub;
  }, [restaurant?.id, subscribe]);

  // Listen to all active orders with tableId
  useEffect(() => {
    if (!restaurant?.id) return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('status', 'in', ['pending', 'preparing', 'ready', 'served']),
      where('type', '==', 'dine-in')
    );
    return onSnapshot(q, snap => {
      const map = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.tableId) map[data.tableId] = { id: d.id, ...data };
      });
      setTableOrders(map);
    });
  }, [restaurant?.id]);

  // Listen to reservations for the selected date
  useEffect(() => {
    if (!restaurant?.id) return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'reservations'),
      where('date', '==', todayStr),
      where('status', '==', 'confirmed')
    );
    return onSnapshot(q, snap => {
      setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [restaurant?.id, todayStr]);

  const selectedTable = tables.find(t => t.id === selected);
  const currency = restaurant?.currency ?? 'INR';

  // Generate UPI QR Code URL dynamically
  useEffect(() => {
    if (!upiOrderToSettle) return;
    const vpa = restaurant?.upiConfig?.vpa || 'demo@upi';
    const name = restaurant?.upiConfig?.name || 'RestaurantOS Demo';
    const tableInfo = selectedTable ? `Table ${selectedTable.name}` : 'Table Order';
    const sanitizedNote = tableInfo.replace(/[^a-zA-Z0-9]/g, '_');
    const upiUrl = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${(upiOrderToSettle.total ?? 0).toFixed(2)}&cu=${currency || 'INR'}&tn=${sanitizedNote}`;
    
    QRCode.toDataURL(upiUrl, { width: 220, margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then(url => setQrDataUrl(url))
      .catch(err => {
        console.error('[QR Generation Error]', err);
        // Fallback to QRServer API
        setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiUrl)}`);
      });
  }, [upiOrderToSettle, restaurant, currency, selectedTable]);

  const handleSettle = async (method) => {
    if (!selectedOrder) return;
    try {
      await settleOrder(restaurant.id, selectedOrder.id, method, selectedOrder.total);
      await freeTable(restaurant.id, selected);
      setSelected(null);
      toast.success(`Bill settled via ${method.toUpperCase()}! Table is now free.`, { icon: '💳' });
    } catch (err) {
      toast.error('Failed to settle: ' + err.message);
    }
  };

  const handlePrintBill = () => {
    if (!selectedOrder) return;
    printReceipt({
      restaurant,
      order: selectedOrder,
      items: selectedOrder.items,
      taxInfo: selectedOrder.taxInfo,
      staffName: selectedOrder.customerName || 'Waiter',
    });
    toast.success('Bill sent to printer!', { icon: '🖨️' });
  };

  const handleAddItems = () => {
    if (!selectedOrder) return;
    loadOrderToCart(selectedOrder);
    toast.success(`Loaded order for ${selectedTable.name} to POS cart. Add items now!`);
    navigate('/pos');
  };

  const statusConfig = {
    free: { 
      color: '#10b981', // emerald green
      bg: '#f0fdf4', // light green tint
      text: '#15803d', // medium green for text
      badge: 'badge-green',
      label: 'Free' 
    },
    occupied: { 
      color: '#ef4444', // red
      bg: '#fef2f2', // light red tint
      text: '#b91c1c', // medium red for text
      badge: 'badge-red',
      label: 'Occupied' 
    },
    reserved: { 
      color: '#f59e0b', // amber orange
      bg: '#fffbeb', // light amber tint
      text: '#b45309', // medium amber for text
      badge: 'badge-orange',
      label: 'Reserved' 
    },
  };

  const selectedOrder = selected ? tableOrders[selected] : null;

  // Render visual chairs dynamically around a table card
  const renderChairs = (table) => {
    const chairs = [];
    const capacity = table.capacity || 4;
    const size = table.w || 80;
    const shape = table.shape || 'rect';
    const isOccupied = table.status === 'occupied';

    // Scan order items for occupant emojis
    const order = tableOrders[table.id];
    const defaultEmojis = ['🍕', '🍹', '🍔', '🧁', '🍜', '☕', '🍩', '🌮', '🍣', '🍟', '🍷', '🍝', '😋', '🥤'];
    const keywordMap = {
      'pizza': '🍕',
      'burger': '🍔',
      'fry': '🍟',
      'fries': '🍟',
      'pasta': '🍝',
      'spaghetti': '🍝',
      'noodle': '🍜',
      'ramen': '🍜',
      'soup': '🥣',
      'sushi': '🍣',
      'taco': '🌮',
      'sandwich': '🥪',
      'salad': '🥗',
      'steak': '🥩',
      'chicken': '🍗',
      'cake': '🧁',
      'dessert': '🍩',
      'donut': '🍩',
      'coffee': '☕',
      'tea': '🍵',
      'drink': '🍹',
      'cocktail': '🍹',
      'juice': '🥤',
      'soda': '🥤',
      'beer': '🍺',
      'wine': '🍷',
    };

    const occupantEmojis = [];
    if (isOccupied && order && order.items) {
      for (const item of order.items) {
        const nameLower = (item.name || '').toLowerCase();
        for (const [key, emoji] of Object.entries(keywordMap)) {
          if (nameLower.includes(key) && !occupantEmojis.includes(emoji)) {
            occupantEmojis.push(emoji);
            break;
          }
        }
        if (occupantEmojis.length >= capacity) break;
      }
    }

    let seedOffset = 0;
    while (occupantEmojis.length < capacity) {
      const hash = ((table.id ?? '') + seedOffset).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const fallback = defaultEmojis[hash % defaultEmojis.length];
      if (!occupantEmojis.includes(fallback)) {
        occupantEmojis.push(fallback);
      }
      seedOffset++;
    }


    if (shape === 'round') {
      const radius = size / 2;
      const dist = radius + 5;
      for (let i = 0; i < capacity; i++) {
        const angle = (i * 2 * Math.PI) / capacity - Math.PI / 2;
        const x = radius + dist * Math.cos(angle) - 7;
        const y = radius + dist * Math.sin(angle) - 7;
        chairs.push(
          <div
            key={`chair-${i}`}
            className="table-chair chair-round"
            style={{ left: x, top: y, width: 14, height: 14, borderRadius: '50%' }}
          />
        );
      }
    } else {
      // Rectangular table: distribute chairs along the 4 edges
      let topCount = 0;
      let bottomCount = 0;
      let leftCount = 0;
      let rightCount = 0;

      if (capacity === 1 || capacity === 2 || capacity === 3) {
        topCount = 1;
        if (capacity >= 2) bottomCount = 1;
        if (capacity >= 3) leftCount = 1;
      } else if (capacity > 3) {
        topCount = Math.ceil(capacity / 4);
        bottomCount = Math.floor(capacity / 4) + (capacity % 4 >= 2 ? 1 : 0);
        leftCount = Math.floor(capacity / 4) + (capacity % 4 >= 3 ? 1 : 0);
        rightCount = Math.floor(capacity / 4);
      }

      let chairIndex = 0;
      const addChairsForEdge = (count, edge) => {
        const step = size / (count + 1);
        for (let i = 0; i < count; i++) {
          const offset = (i + 1) * step;
          let style = {};
          if (edge === 'top') {
            style = { left: offset - 9, top: -13, width: 18, height: 10, borderRadius: '3px 3px 0 0' };
          } else if (edge === 'bottom') {
            style = { left: offset - 9, top: size + 3, width: 18, height: 10, borderRadius: '0 0 3px 3px' };
          } else if (edge === 'left') {
            style = { left: -13, top: offset - 9, width: 10, height: 18, borderRadius: '3px 0 0 3px' };
          } else if (edge === 'right') {
            style = { left: size + 3, top: offset - 9, width: 10, height: 18, borderRadius: '0 3px 3px 0' };
          }
          chairs.push(
            <div
              key={`chair-${edge}-${i}`}
              className="table-chair"
              style={style}
            />
          );
        }
      };

      addChairsForEdge(topCount, 'top');
      addChairsForEdge(bottomCount, 'bottom');
      addChairsForEdge(leftCount, 'left');
      addChairsForEdge(rightCount, 'right');
    }

    return chairs;
  };

  return (
    <div style={{ display:'flex', gap:'var(--space-5)', height:'calc(100vh - 120px)', overflow:'hidden' }}>
      {/* Main map */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
        {/* Legend */}
        <div style={{ display:'flex', gap:'var(--space-3)', flexWrap:'wrap', alignItems:'center' }}>
          {Object.entries(statusConfig).map(([k, v]) => {
            const count = tables.filter(t => (t.floor || 'Ground Floor') === activeFloor && t.status === k).length;
            return (
              <div 
                key={k} 
                style={{ 
                  display:'flex', 
                  alignItems:'center', 
                  gap:'var(--space-2)', 
                  fontSize:'12px',
                  fontWeight: 'var(--weight-semibold)',
                  color: v.text,
                  background: v.bg,
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid transparent'
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} />
                <span>{v.label}</span>
                <span style={{ opacity: 0.75, fontSize: '10px' }}>({count})</span>
              </div>
            );
          })}
          <div className="badge badge-gray" style={{ marginLeft:'auto', fontWeight: 'var(--weight-semibold)' }}>
            📍 {tables.length} tables configured
          </div>
        </div>

        {/* Floor Selection Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-separator)', paddingBottom: '10px' }}>
          {allFloors.map(floor => {
            const isActive = activeFloor === floor;
            const floorTableCount = tables.filter(t => (t.floor || 'Ground Floor') === floor).length;
            return (
              <button
                key={floor}
                type="button"
                className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setActiveFloor(floor);
                  setSelected(null); // Clear selected table on floor switch
                }}
                style={{ padding: '6px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span>{floor}</span>
                <span style={{ 
                  fontSize: 10, 
                  opacity: 0.85, 
                  background: isActive ? 'var(--color-label)' : 'var(--color-bg-secondary)', 
                  color: isActive ? 'var(--color-on-dark)' : 'var(--color-label-secondary)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  border: 'none',
                  fontWeight: 'bold'
                }}>
                  {floorTableCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Canvas */}
        <div className="table-canvas-wrapper">
          <div className="table-canvas">
            {tables.filter(t => (t.floor || 'Ground Floor') === activeFloor).map(t => {
              const cfg = statusConfig[t.status] ?? statusConfig.free;
              const order = tableOrders[t.id];
              const isReserved = reservations.some(r => r.tableId === t.id);
              return (
                <button
                  key={t.id}
                  id={`map-table-${t.id}`}
                  onClick={() => setSelected(selected === t.id ? null : t.id)}
                  className={`table-item ${t.shape === 'round' ? 'round' : 'rect'} status-${selected === t.id ? 'selected' : t.status || 'free'}`}
                  style={{
                    position: 'absolute',
                    left: t.x ?? 80,
                    top: t.y ?? 80,
                    width: t.w ?? 80,
                    height: t.h ?? 80,
                  }}
                >
                  {renderChairs(t)}
                  <span className="table-label">
                    {t.name}
                  </span>
                  <span className="table-capacity">
                    👥 {t.capacity}p
                  </span>
                  {order && (
                    <span style={{ 
                      fontSize: '10px', 
                      fontWeight: 'var(--weight-bold)', 
                      color: '#ffffff',
                      background: cfg.color,
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-full)',
                      marginTop: '4px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      scale: '0.9',
                      zIndex: 3
                    }}>
                      {formatCurrency(order.total ?? 0, currency)}
                    </span>
                  )}
                  {isReserved && t.status === 'free' && (
                    <span style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      background: '#f59e0b',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                      fontWeight: 'bold',
                      border: '1.5px solid #ffffff',
                      zIndex: 4
                    }} title="Reserved Today">
                      📅
                    </span>
                  )}
                </button>
              );
            })}
            {tables.length === 0 && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--color-label-tertiary)', gap:'var(--space-3)' }}>
                <div style={{fontSize:40}}>🗺️</div>
                <div>No tables — set up your floor plan in Admin → Floor Plan Editor</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table detail panel */}
      {selected && selectedTable && (
        <div className="card" style={{ width:300, flexShrink:0, display:'flex', flexDirection:'column', animation:'slideInRight var(--duration-normal) var(--ease-spring)' }}>
          <div className="card-header">
            <span className="card-title" style={{ fontSize: '18px', fontWeight: 'var(--weight-bold)' }}>Table {selectedTable.name}</span>
            <button className="btn btn-secondary btn-icon btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div style={{ padding:'var(--space-4)', display:'flex', flexDirection:'column', gap:'var(--space-4)', flex:1 }}>
            <div style={{ display:'flex', gap:'var(--space-2)' }}>
              <span className={`badge ${selectedTable.status === 'free' ? 'badge-green' : selectedTable.status === 'occupied' ? 'badge-red' : 'badge-orange'}`} style={{ textTransform: 'capitalize' }}>
                {selectedTable.status}
              </span>
              <span className="badge badge-gray">{selectedTable.capacity} seats</span>
            </div>

            {selectedOrder ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight:'var(--weight-semibold)', fontSize: '13px' }}>Current Order</span>
                  <span style={{ fontSize:'10px', color:'var(--color-label-tertiary)', fontFamily: 'monospace' }}>
                    ID: #{selectedOrder.id.slice(-8).toUpperCase()}
                  </span>
                </div>

                <div style={{ 
                  background: 'var(--color-bg-secondary)', 
                  borderRadius: 'var(--radius-md)', 
                  padding: 'var(--space-3) var(--space-4)',
                  display:'flex', 
                  flexDirection:'column', 
                  gap:'var(--space-2)',
                  border: '1px solid var(--color-separator)'
                }}>
                  {(selectedOrder.items??[]).map((item,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'var(--text-footnote)' }}>
                      <span style={{ fontWeight: 'var(--weight-medium)' }}>
                        <span style={{ color: 'var(--color-label-secondary)', marginRight: 'var(--space-1)' }}>×{item.qty}</span>
                        {item.name}
                      </span>
                      <span style={{ fontWeight: 'var(--weight-semibold)' }}>
                        {formatCurrency(item.price*item.qty, currency)}
                      </span>
                    </div>
                  ))}
                  <div style={{ borderTop:'1px dashed var(--color-separator)', paddingTop:'var(--space-2)', marginTop: '4px', fontWeight:'var(--weight-bold)', display:'flex', justifyContent:'space-between', fontSize: 'var(--text-subhead)' }}>
                    <span>Total</span>
                    <span style={{ color: 'var(--color-accent)' }}>
                      {formatCurrency(selectedOrder.total??0, currency)}
                    </span>
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)' }}>
                  {/* Status updates */}
                  {selectedOrder.status !== 'ready' && selectedOrder.status !== 'served' && (
                    <button className="btn btn-primary" onClick={async()=>{await updateOrderStatus(restaurant.id,selectedOrder.id,'ready');toast.success('Order ready!');}} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px' }}>
                      ✅ Mark Ready
                    </button>
                  )}
                  {selectedOrder.status === 'ready' && (
                    <button className="btn btn-success" onClick={async()=>{await updateOrderStatus(restaurant.id,selectedOrder.id,'served');toast.success('Served!');}} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', background: '#10b981', borderColor: '#10b981', color: '#ffffff' }}>
                      🍽️ Mark Served
                    </button>
                  )}

                  {/* Waiter Actions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <button className="btn btn-secondary btn-sm" onClick={handleAddItems} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '36px', fontSize: '12px' }}>
                      ➕ Add Items
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handlePrintBill} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '36px', fontSize: '12px' }}>
                      🖨️ Print Bill
                    </button>
                  </div>

                  {/* Table Operations: Move & Merge */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <button 
                      type="button"
                      className="btn btn-secondary btn-sm" 
                      onClick={() => setShowTransfer(true)} 
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '36px', fontSize: '12px' }}
                    >
                      🔄 Move Table
                    </button>
                    <button 
                      type="button"
                      className="btn btn-secondary btn-sm" 
                      onClick={() => setShowMerge(true)} 
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '36px', fontSize: '12px' }}
                    >
                      🔗 Merge Bills
                    </button>
                  </div>

                  {/* Settle / Free Table */}
                  {selectedOrder.paymentMethod === 'unpaid' ? (
                    <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)', marginBottom: 'var(--space-2)', fontWeight: 'var(--weight-bold)', letterSpacing: '0.04em' }}>
                        Settle Payment
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                        {['cash', 'card', 'upi'].map(m => {
                          let emoji = '💵';
                          let color = '#059669';
                          let bg = '#ecfdf5';
                          if (m === 'card') { emoji = '💳'; color = '#2563eb'; bg = '#eff6ff'; }
                          if (m === 'upi') { emoji = '📱'; color = '#7c3aed'; bg = '#f5f3ff'; }
                          return (
                            <button
                              key={m}
                              className="btn"
                              style={{
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                padding: '8px 0',
                                fontWeight: 'var(--weight-bold)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '2px',
                                borderColor: color,
                                background: bg,
                                color: color,
                                boxShadow: 'none',
                                height: 'auto'
                              }}
                              onClick={() => {
                                if (m === 'upi') {
                                  setUpiOrderToSettle(selectedOrder);
                                } else {
                                  handleSettle(m);
                                }
                              }}
                            >
                              <span style={{ fontSize: '14px' }}>{emoji}</span>
                              <span>{m}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <button 
                      className="btn btn-secondary" 
                      style={{ 
                        marginTop: 'var(--space-2)', 
                        height: '40px', 
                        borderColor: 'var(--color-separator)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      onClick={async () => {
                        if (selectedOrder) {
                          await updateOrderStatus(restaurant.id, selectedOrder.id, 'billed');
                        }
                        await freeTable(restaurant.id, selectedTable.id);
                        setSelected(null);
                        toast.success('Table freed!');
                      }}
                    >
                      🚪 Free Table
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)' }}>
                {(() => {
                  const resForTable = reservations.find(r => r.tableId === selectedTable.id);
                  if (resForTable) {
                    return (
                      <div style={{
                        background: 'var(--color-orange-light)',
                        border: '1.5px solid var(--color-orange)',
                        color: 'var(--color-orange)',
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}>
                        <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-caption1)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          📅 Reserved at {resForTable.time}
                        </span>
                        <span style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)' }}>
                          {resForTable.name} ({resForTable.phone})
                        </span>
                        <span style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)' }}>
                          Size: {resForTable.partySize} guests
                        </span>
                        {resForTable.notes && (
                          <span style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--color-label-secondary)', borderTop: '1px dashed var(--color-separator)', paddingTop: 4, marginTop: 2 }}>
                            Notes: {resForTable.notes}
                          </span>
                        )}
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={async () => {
                            try {
                              await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', resForTable.id), { status: 'seated' });
                              await updateDoc(doc(db, 'restaurants', restaurant.id, 'tables', selectedTable.id), { status: 'occupied' });
                              toast.success(`Seated ${resForTable.name} at Table ${selectedTable.name}!`);
                            } catch (e) {
                              toast.error('Failed to seat: ' + e.message);
                            }
                          }}
                          style={{ marginTop: 6, background: 'var(--color-orange)', border: 'none', height: 32 }}
                        >
                          Seat Guest
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div style={{ 
                      textAlign:'center', 
                      color:'var(--color-label-tertiary)', 
                      padding:'var(--space-5) var(--space-3)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      background: '#fcfcfc',
                      border: '1.5px dashed var(--color-separator)',
                      borderRadius: 'var(--radius-lg)'
                    }}>
                      <div style={{ fontSize: 28 }}>🍽️</div>
                      <div style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-label)', fontSize: 'var(--text-footnote)' }}>
                        Table is Available
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', lineHeight: '1.4' }}>
                        No active order currently seated.
                      </div>
                      <button 
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: 'var(--space-2)', width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onClick={() => {
                          clearCart();
                          setTable(selectedTable.id, selectedTable.name);
                          setOrderType('dine-in');
                          toast.success(`Started new order for ${selectedTable.name}`);
                          navigate('/pos');
                        }}
                      >
                        ⚡ Start Order
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Move Table Modal */}
      {showTransfer && selectedTable && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🔀 Move Table</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowTransfer(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <p style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)', marginBottom: 8 }}>
                Move order from <strong>{selectedTable.name}</strong> to:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                {tables
                  .filter(t => t.id !== selectedTable.id && t.status === 'free')
                  .map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="btn btn-secondary"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}
                      onClick={async () => {
                        const res = await useOrderStore.getState().transferTable(
                          restaurant.id,
                          selectedTable.id,
                          t.id,
                          selectedOrder.id,
                          t.name
                        );
                        if (res.ok) {
                          toast.success(`Moved order to ${t.name}!`);
                          setSelected(null);
                          setShowTransfer(false);
                        } else {
                          toast.error('Move failed: ' + res.error);
                        }
                      }}
                    >
                      <span style={{ fontWeight: 'bold' }}>🪑 {t.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>{t.capacity} seats</span>
                    </button>
                  ))}
                {tables.filter(t => t.id !== selectedTable.id && t.status === 'free').length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-label-tertiary)' }}>
                    No vacant tables available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Merge Bills Modal */}
      {showMerge && selectedTable && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowMerge(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🔗 Merge Bills</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowMerge(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <p style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)', marginBottom: 8 }}>
                Merge items from <strong>{selectedTable.name}</strong> into:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                {tables
                  .filter(t => t.id !== selectedTable.id && t.status === 'occupied' && tableOrders[t.id])
                  .map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="btn btn-secondary"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}
                      onClick={async () => {
                        const primaryOrder = tableOrders[t.id];
                        if (!primaryOrder) return;
                        const res = await useOrderStore.getState().mergeTables(
                          restaurant.id,
                          t.id,
                          selectedTable.id,
                          primaryOrder.id,
                          selectedOrder.id
                        );
                        if (res.ok) {
                          toast.success(`Merged bills into ${t.name}!`);
                          setSelected(null);
                          setShowMerge(false);
                        } else {
                          toast.error('Merge failed: ' + res.error);
                        }
                      }}
                    >
                      <span style={{ fontWeight: 'bold' }}>🪑 {t.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--color-accent)' }}>
                        {formatCurrency(tableOrders[t.id]?.total ?? 0, currency)}
                      </span>
                    </button>
                  ))}
                {tables.filter(t => t.id !== selectedTable.id && t.status === 'occupied' && tableOrders[t.id]).length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-label-tertiary)' }}>
                    No other occupied tables to merge into
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPI Settle Modal */}
      {upiOrderToSettle && selectedTable && (
        <div className="modal-overlay" onClick={clearUpiSettle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div className="modal animate-slide-up" style={{ maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="modal-title">📱 Collect UPI Payment</h3>
              <button className="btn btn-secondary btn-icon btn-sm" onClick={clearUpiSettle}>✕</button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', padding: '20px' }}>
              {/* Amount and Table Details */}
              <div style={{
                background: 'linear-gradient(135deg, var(--color-brand-lavender) 0%, var(--color-brand-mint) 100%)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                width: '100%',
                color: 'var(--color-label)',
              }}>
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: 4 }}>
                  {selectedTable.name.toUpperCase()} · TOTAL DUE
                </div>
                <div style={{ fontSize: 28, fontWeight: '800' }}>
                  {formatCurrency(upiOrderToSettle.total ?? 0, currency)}
                </div>
              </div>

              {/* QR Code */}
              <div style={{
                background: 'var(--color-bg)',
                padding: '12px',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-sm)',
                border: '1px solid var(--color-separator)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: 220,
                height: 220
              }}>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="UPI QR Code" style={{ width: 196, height: 196, display: 'block' }} />
                ) : (
                  <div style={{ color: 'var(--color-label-tertiary)', fontSize: 11 }}>Generating QR Code...</div>
                )}
              </div>

              {/* Merchant details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 'bold' }}>
                  Scan to Pay with Swiggy/Zomato/GPay/PhonePe
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                  Merchant VPA: <strong style={{ color: 'var(--color-accent)' }}>{restaurant?.upiConfig?.vpa || 'demo@upi'}</strong>
                </div>
                {restaurant?.upiConfig?.name && (
                  <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                    Name: <strong>{restaurant.upiConfig.name}</strong>
                  </div>
                )}
              </div>

              {/* Cashier input for reference ID */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', borderTop: '1px solid var(--color-separator)', paddingTop: '12px' }}>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 0 }}>UPI Transaction ID / Ref (Optional)</label>
                <input
                  className="form-input"
                  placeholder="e.g. Last 4 or 6 digits of UPI Ref No."
                  value={upiRef}
                  onChange={e => setUpiRef(e.target.value)}
                  style={{ height: 32, fontSize: 11 }}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-separator)', padding: '12px' }}>
              <button className="btn btn-secondary" onClick={clearUpiSettle}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={async () => {
                  setSettlingUpi(true);
                  try {
                    const additionalFields = upiRef ? { upiRef } : {};
                    await settleOrder(restaurant.id, upiOrderToSettle.id, 'upi', upiOrderToSettle.total, additionalFields);
                    await freeTable(restaurant.id, selected);
                    clearUpiSettle();
                    setSelected(null);
                    toast.success('Bill settled via UPI! Table is now free.', { icon: '💳' });
                  } catch (err) {
                    toast.error('Failed to settle: ' + err.message);
                  } finally {
                    setSettlingUpi(false);
                  }
                }}
                disabled={settlingUpi}
                style={{ minWidth: 120 }}
              >
                {settlingUpi ? 'Settle...' : 'Confirm Settle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
