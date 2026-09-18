import { useEffect, useState, useMemo, useRef } from 'react';
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
import { ZoomIn, ZoomOut, Maximize2, LayoutGrid, Search, Clock, Zap, Sparkles } from 'lucide-react';

export default function TableMap() {
  const navigate = useNavigate();
  const restaurant = useAuthStore(s => s.restaurant);
  const tables = useTableStore(s => s.tables);
  const subscribe = useTableStore(s => s.subscribe);
  const freeTable = useTableStore(s => s.freeTable);
  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);
  const loadOrderToCart = useOrderStore(s => s.loadOrderToCart);
  const settleOrder = useOrderStore(s => s.settleOrder);
  const clearCart = useOrderStore(s => s.clearCart);
  const setTable = useOrderStore(s => s.setTable);
  const setOrderType = useOrderStore(s => s.setOrderType);
  const [selected, setSelected] = useState(null);
  const [tableOrders, setTableOrders] = useState({});
  const [reservations, setReservations] = useState([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'free' | 'occupied' | 'reserved'
  const [searchQuery, setSearchQuery] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];

  const [activeFloor, setActiveFloor] = useState('Ground Floor');
  const allFloors = useMemo(() => {
    return Array.from(new Set(['Ground Floor', ...tables.map(t => t.floor || 'Ground Floor')]));
  }, [tables]);

  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef(null);

  const floorTables = useMemo(() => {
    return tables.filter(t => (t.floor || 'Ground Floor') === activeFloor);
  }, [tables, activeFloor]);

  // Dynamically resolve and space out any overlapping tables (e.g. T4 and T5)
  const resolvedTables = useMemo(() => {
    const list = floorTables.map(t => ({
      ...t,
      renderX: t.x ?? 80,
      renderY: t.y ?? 80,
      renderW: t.w ?? 90,
      renderH: t.h ?? 90
    }));

    // Collision detection & gentle non-overlapping separation
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const a = list[i];
        const b = list[j];
        const overlapsX = (a.renderX < b.renderX + b.renderW) && (a.renderX + a.renderW > b.renderX);
        const overlapsY = (a.renderY < b.renderY + b.renderH) && (a.renderY + a.renderH > b.renderY);

        if (overlapsX && overlapsY) {
          if (a.renderX <= b.renderX) {
            b.renderX = a.renderX + a.renderW + 45;
          } else {
            a.renderX = b.renderX + b.renderW + 45;
          }
        }
      }
    }
    return list;
  }, [floorTables]);

  // Realtime metric calculations for active floor
  const floorTableMetrics = useMemo(() => {
    let free = 0;
    let occupied = 0;
    let reserved = 0;
    let liveRevenue = 0;

    floorTables.forEach(t => {
      const order = tableOrders[t.id];
      const isOccupied = (order && order.status !== 'billed' && order.status !== 'cancelled') || t.status === 'occupied';
      const isReserved = !isOccupied && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');
      if (isOccupied) {
        occupied++;
        if (order?.total) liveRevenue += order.total;
      } else if (isReserved) {
        reserved++;
      } else {
        free++;
      }
    });

    return { free, occupied, reserved, liveRevenue };
  }, [floorTables, tableOrders, reservations]);

  // Auto-align tables into clean non-overlapping grid (fixes collisions like T4 on T5)
  const handleAutoAlign = async () => {
    if (!floorTables.length || !restaurant?.id) return;

    const sorted = [...floorTables].sort((a, b) => {
      return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
    });

    const MARGIN_X = 60;
    const MARGIN_Y = 50;
    const COL_WIDTH = 190;
    const ROW_HEIGHT = 160;
    const COLS = 4;

    toast.loading('Auto-aligning tables into clean grid...', { id: 'auto-align' });
    try {
      const updateTable = useTableStore.getState().updateTable;
      await Promise.all(sorted.map((t, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const newX = MARGIN_X + col * COL_WIDTH;
        const newY = MARGIN_Y + row * ROW_HEIGHT;
        const standardW = (t.capacity || 4) > 6 ? 110 : 90;
        const standardH = (t.capacity || 4) > 6 ? 110 : 90;
        return updateTable(restaurant.id, t.id, {
          x: newX,
          y: newY,
          w: standardW,
          h: standardH
        });
      }));
      toast.success('Tables aligned into clean non-overlapping grid!', { id: 'auto-align', icon: '📐' });
    } catch (err) {
      toast.error('Failed to align tables: ' + err.message, { id: 'auto-align' });
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (!wrapperRef.current) return;
      const width = wrapperRef.current.clientWidth;
      if (window.innerWidth <= 1024) {
        const fitZoom = Math.min((width - 24) / 1000, 1);
        setZoom(fitZoom);
      } else {
        setZoom(1);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    }, err => {
      console.warn("TableMap active orders listener error:", err);
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
    }, err => {
      console.warn("TableMap reservations listener error:", err);
    });
  }, [restaurant?.id, todayStr]);

  const selectedTable = tables.find(t => t.id === selected);
  const currency = restaurant?.currency ?? 'INR';

  // Generate UPI QR Code URL dynamically
  useEffect(() => {
    if (!upiOrderToSettle) return;
    const vpa = restaurant?.upiConfig?.vpa || 'demo@upi';
    const name = restaurant?.upiConfig?.name || 'DineOS Demo';
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
    if (!selectedOrder || isSettling) return;
    setIsSettling(true);
    try {
      await settleOrder(restaurant.id, selectedOrder.id, method, selectedOrder.total);
      await freeTable(restaurant.id, selected);
      setSelected(null);
      toast.success(`Bill settled via ${method.toUpperCase()}! Table is now free.`, { icon: '💳' });
    } catch (err) {
      toast.error('Failed to settle: ' + err.message);
    } finally {
      setIsSettling(false);
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
  const renderChairs = (table, isOccupied) => {
    const chairs = [];
    const capacity = table.capacity || 4;
    const w = table.w || 90;
    const h = table.h || 90;
    const shape = table.shape || 'rect';

    if (shape === 'round') {
      const radius = Math.min(w, h) / 2;
      const dist = radius + 6;
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

      const addChairsForEdge = (count, edge) => {
        const isHorizontal = edge === 'top' || edge === 'bottom';
        const span = isHorizontal ? w : h;
        const step = span / (count + 1);
        for (let i = 0; i < count; i++) {
          const offset = (i + 1) * step;
          let style = {};
          if (edge === 'top') {
            style = { left: offset - 10, top: -11, width: 20, height: 8, borderRadius: '4px 4px 1px 1px' };
          } else if (edge === 'bottom') {
            style = { left: offset - 10, top: h + 3, width: 20, height: 8, borderRadius: '1px 1px 4px 4px' };
          } else if (edge === 'left') {
            style = { left: -11, top: offset - 10, width: 8, height: 20, borderRadius: '4px 1px 1px 4px' };
          } else if (edge === 'right') {
            style = { left: w + 3, top: offset - 10, width: 8, height: 20, borderRadius: '1px 4px 4px 1px' };
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
    <div className="table-map-layout">
      {/* Main map */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Interactive Filter Pills & Search Bar */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '999px', fontWeight: 700 }}
            >
              All Tables ({floorTables.length})
            </button>
            
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'free' ? 'all' : 'free')}
              className="btn btn-sm"
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                borderRadius: '999px',
                background: statusFilter === 'free' ? '#10b981' : 'rgba(16, 185, 129, 0.1)',
                color: statusFilter === 'free' ? '#fff' : '#059669',
                border: '1px solid ' + (statusFilter === 'free' ? '#10b981' : 'rgba(16, 185, 129, 0.3)'),
                fontWeight: 700
              }}
            >
              🟢 Available ({floorTableMetrics.free})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'occupied' ? 'all' : 'occupied')}
              className="btn btn-sm"
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                borderRadius: '999px',
                background: statusFilter === 'occupied' ? '#ef4444' : 'rgba(239, 68, 68, 0.1)',
                color: statusFilter === 'occupied' ? '#fff' : '#dc2626',
                border: '1px solid ' + (statusFilter === 'occupied' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)'),
                fontWeight: 700
              }}
            >
              🔴 Seated ({floorTableMetrics.occupied})
              {floorTableMetrics.liveRevenue > 0 && (
                <span style={{ marginLeft: '4px', opacity: 0.9 }}>· {formatCurrency(floorTableMetrics.liveRevenue, currency)}</span>
              )}
            </button>

            {floorTableMetrics.reserved > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'reserved' ? 'all' : 'reserved')}
                className="btn btn-sm"
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  borderRadius: '999px',
                  background: statusFilter === 'reserved' ? '#f59e0b' : 'rgba(245, 158, 11, 0.1)',
                  color: statusFilter === 'reserved' ? '#fff' : '#d97706',
                  border: '1px solid ' + (statusFilter === 'reserved' ? '#f59e0b' : 'rgba(245, 158, 11, 0.3)'),
                  fontWeight: 700
                }}
              >
                ⭐ Reserved ({floorTableMetrics.reserved})
              </button>
            )}
          </div>

          {/* Quick Table Search */}
          <div style={{ position: 'relative', width: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-secondary)' }} />
            <input
              type="text"
              placeholder="Find table (e.g. T3)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input"
              style={{
                paddingLeft: 30,
                height: 32,
                fontSize: '12px',
                borderRadius: '999px',
                background: 'var(--color-bg-secondary)'
              }}
            />
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
                  setSelected(null);
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

        <div className="table-canvas-wrapper" ref={wrapperRef}>
          {/* Zoom Controls & Auto-Align */}
          <div className="canvas-zoom-controls">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.1) * 10) / 10))}
              disabled={zoom <= 0.25}
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="zoom-val">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom(z => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))}
              disabled={zoom >= 2.0}
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              className="zoom-btn fit-btn"
              onClick={() => {
                if (wrapperRef.current) {
                  const width = wrapperRef.current.clientWidth;
                  const fitZoom = Math.min((width - 24) / 1000, 1);
                  setZoom(fitZoom);
                }
              }}
              title="Fit Screen"
            >
              <Maximize2 size={12} /> Fit
            </button>
            <button
              type="button"
              className="zoom-btn align-btn"
              onClick={handleAutoAlign}
              title="Auto-align tables into clean non-overlapping grid"
              style={{
                borderLeft: '1px solid var(--color-separator)',
                padding: '0 10px',
                width: 'auto',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--color-accent)'
              }}
            >
              <LayoutGrid size={13} />
              <span>Auto-Align</span>
            </button>
          </div>

          <div className="table-canvas-scroll-area">
            <div
              className="table-canvas-scroll-container"
              style={{
                width: `${1000 * zoom}px`,
                height: `${650 * zoom}px`,
              }}
            >
              <div
                className="table-canvas"
                style={{
                  transform: `scale(${zoom})`,
                }}
              >
                {resolvedTables.map(t => {
                  const order = tableOrders[t.id];
                  const hasActiveOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
                  const effectiveStatus = hasActiveOrder ? 'occupied' : (t.status || 'free');
                  const cfg = statusConfig[effectiveStatus] ?? statusConfig.free;
                  const isReserved = !hasActiveOrder && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');

                  // Filter check
                  if (statusFilter === 'free' && effectiveStatus !== 'free') return null;
                  if (statusFilter === 'occupied' && effectiveStatus !== 'occupied') return null;
                  if (statusFilter === 'reserved' && !isReserved) return null;

                  // Search query check
                  const isMatch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(t.capacity).includes(searchQuery);

                  // Dining elapsed time
                  let elapsedMins = 0;
                  if (hasActiveOrder && order.createdAt) {
                    const orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                    elapsedMins = Math.max(0, Math.floor((Date.now() - orderDate.getTime()) / 60000));
                  }

                  return (
                    <button
                      key={t.id}
                      id={`map-table-${t.id}`}
                      onClick={() => {
                        if (effectiveStatus === 'free') {
                          clearCart();
                          setTable(t.id, t.name);
                          setOrderType('dine-in');
                          toast.success(`Started new order for ${t.name}`);
                          navigate('/pos');
                        } else {
                          setSelected(selected === t.id ? null : t.id);
                        }
                      }}
                      className={`table-item ${t.shape === 'round' ? 'round' : 'rect'} status-${selected === t.id ? 'selected' : effectiveStatus}`}
                      style={{
                        position: 'absolute',
                        left: t.renderX,
                        top: t.renderY,
                        width: t.renderW,
                        height: t.renderH,
                        opacity: isMatch ? 1 : 0.25,
                        filter: isMatch ? 'none' : 'grayscale(80%)',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                    >
                      {renderChairs(t, effectiveStatus === 'occupied')}
                      
                      {/* Table Name */}
                      <span className="table-label">
                        {t.name}
                      </span>
                      
                      {/* Capacity & Live Elapsed Timer */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <span className="table-capacity">
                          👥 {t.capacity}p
                        </span>
                        {hasActiveOrder && elapsedMins > 0 && (
                          <span 
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '999px',
                              background: elapsedMins >= 60 ? 'rgba(239, 68, 68, 0.15)' : elapsedMins >= 40 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                              color: elapsedMins >= 60 ? '#dc2626' : elapsedMins >= 40 ? '#d97706' : '#059669',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                            title={`Seated for ${elapsedMins} minutes`}
                          >
                            ⏱️ {elapsedMins}m
                          </span>
                        )}
                      </div>

                      {/* Live Order Amount Badge */}
                      {hasActiveOrder && (
                        <span style={{ 
                          fontSize: '10px', 
                          fontWeight: 800, 
                          color: '#ffffff',
                          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                          padding: '2px 7px',
                          borderRadius: '999px',
                          marginTop: '4px',
                          boxShadow: '0 2px 6px rgba(220, 38, 38, 0.35)',
                          zIndex: 3,
                          letterSpacing: '-0.2px',
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {formatCurrency(order.total ?? 0, currency)}
                        </span>
                      )}

                      {isReserved && effectiveStatus === 'free' && (
                        <span style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          color: '#fff',
                          borderRadius: '50%',
                          width: 22,
                          height: 22,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          boxShadow: '0 2px 6px rgba(217, 119, 6, 0.35)',
                          fontWeight: 'bold',
                          border: '2px solid #ffffff',
                          zIndex: 4
                        }} title="Reserved Today">
                          ⭐
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
        </div>
      </div>

      {/* Table detail panel */}
      {selected && selectedTable && (
        <>
          <div className="table-map-overlay-mobile" onClick={() => setSelected(null)} />
          <div className="card table-map-detail-panel" style={{ width:300, flexShrink:0, display:'flex', flexDirection:'column', animation:'slideInRight var(--duration-normal) var(--ease-spring)' }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight:'var(--weight-semibold)', fontSize: '13px' }}>Current Order</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-teal)', fontWeight: 700 }}>
                      👤 {selectedOrder.assignedWaiterName || selectedOrder.staffName || 'Waiter'}
                    </span>
                  </div>
                  <span style={{ fontSize:'10px', color:'var(--color-label-tertiary)', fontFamily: 'monospace', marginTop: '2px' }}>
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

                {/* Payment Status Badge */}
                {(() => {
                  const isPaid = selectedOrder.paymentMethod && selectedOrder.paymentMethod !== 'unpaid';
                  const methodLabel = isPaid
                    ? selectedOrder.paymentMethod.toUpperCase()
                    : null;
                  const methodEmoji = { CASH: '💵', CARD: '💳', UPI: '📱' };
                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '12px',
                      fontWeight: 'var(--weight-bold)',
                      letterSpacing: '0.02em',
                      ...(isPaid
                        ? { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }
                        : { background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' })
                    }}>
                      <span style={{ fontSize: '15px' }}>{isPaid ? '✅' : '⏳'}</span>
                      <span>
                        {isPaid
                          ? `Paid via ${methodEmoji[methodLabel] ?? ''} ${methodLabel}`
                          : 'Awaiting Payment'}
                      </span>
                    </div>
                  );
                })()}

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
                                height: 'auto',
                                opacity: isSettling ? 0.6 : 1,
                                cursor: isSettling ? 'not-allowed' : 'pointer'
                              }}
                              disabled={isSettling}
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
      </>
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
