import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
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
import { ZoomIn, ZoomOut, Maximize2, LayoutGrid, Grid, Map, Search, X, Plus, Printer, ArrowRightLeft, GitMerge, DoorOpen, CheckCircle2, Utensils, Clock, TrendingUp, Users, Banknote, CreditCard, QrCode } from 'lucide-react';

/* ─── Elapsed time badge helper ─────────────────────────────── */
function elapsedColor(mins) {
  if (mins >= 90) return { bg: 'rgba(239,68,68,0.15)', color: '#dc2626' };
  if (mins >= 60) return { bg: 'rgba(245,158,11,0.15)', color: '#d97706' };
  if (mins >= 30) return { bg: 'rgba(59,130,246,0.12)', color: '#2563eb' };
  return { bg: 'rgba(16,185,129,0.12)', color: '#059669' };
}

function formatElapsed(mins) {
  if (!mins || mins <= 0) return 'Just seated';
  if (mins < 60) return `${mins}m seated`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m seated` : `${hrs}h seated`;
  const days = Math.floor(hrs / 24);
  return `${days}d seated`;
}

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

  // Modals
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];

  // View mode: 'grid' (clean, organized Petpooja-style table cards) or 'map' (2D layout)
  const [viewMode, setViewMode] = useState('grid');

  // Grid density: 'compact' (fits 30+ tables on screen with zero scroll) vs 'comfortable' (larger cards with inline buttons)
  const [gridDensity, setGridDensity] = useState(() => {
    return localStorage.getItem('dineos_table_density') || 'compact';
  });

  const handleDensityChange = (density) => {
    setGridDensity(density);
    localStorage.setItem('dineos_table_density', density);
  };

  const [activeFloor, setActiveFloor] = useState('Ground Floor');
  const allFloors = useMemo(() => {
    return Array.from(new Set(['Ground Floor', ...tables.map(t => t.floor || 'Ground Floor')]));
  }, [tables]);

  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);
  const canvasRef = useRef(null);

  // Live ticker for elapsed times
  const [nowTime, setNowTime] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTime(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const floorTables = useMemo(() => {
    return tables.filter(t => (t.floor || 'Ground Floor') === activeFloor);
  }, [tables, activeFloor]);

  const sortedFloorTables = useMemo(() => {
    return [...floorTables].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })
    );
  }, [floorTables]);

  const resolvedTables = useMemo(() => {
    const list = floorTables.map(t => ({
      ...t,
      renderX: t.x ?? 80,
      renderY: t.y ?? 80,
      renderW: t.w ?? 90,
      renderH: t.h ?? 90
    }));
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const a = list[i]; const b = list[j];
        const ox = (a.renderX < b.renderX + b.renderW) && (a.renderX + a.renderW > b.renderX);
        const oy = (a.renderY < b.renderY + b.renderH) && (a.renderY + a.renderH > b.renderY);
        if (ox && oy) {
          if (a.renderX <= b.renderX) b.renderX = a.renderX + a.renderW + 45;
          else a.renderX = b.renderX + b.renderW + 45;
        }
      }
    }
    return list;
  }, [floorTables]);

  const floorMetrics = useMemo(() => {
    let free = 0, occupied = 0, reserved = 0, liveRevenue = 0;
    floorTables.forEach(t => {
      const order = tableOrders[t.id];
      const isOccupied = (order && order.status !== 'billed' && order.status !== 'cancelled') || t.status === 'occupied';
      const isReserved = !isOccupied && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');
      if (isOccupied) { occupied++; if (order?.total) liveRevenue += order.total; }
      else if (isReserved) reserved++;
      else free++;
    });
    return { free, occupied, reserved, liveRevenue };
  }, [floorTables, tableOrders, reservations]);

  const handleAutoAlign = async () => {
    if (!floorTables.length || !restaurant?.id) return;
    const sorted = [...floorTables].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    const COLS = 4, COL_W = 190, ROW_H = 160, MX = 60, MY = 50;
    toast.loading('Auto-aligning...', { id: 'aa' });
    try {
      const updateTable = useTableStore.getState().updateTable;
      await Promise.all(sorted.map((t, i) => updateTable(restaurant.id, t.id, {
        x: MX + (i % COLS) * COL_W,
        y: MY + Math.floor(i / COLS) * ROW_H,
        w: (t.capacity || 4) > 6 ? 110 : 90,
        h: (t.capacity || 4) > 6 ? 110 : 90,
      })));
      toast.success('Tables aligned!', { id: 'aa', icon: '📐' });
    } catch (e) { toast.error('Failed: ' + e.message, { id: 'aa' }); }
  };

  // Resize zoom
  useEffect(() => {
    const handleResize = () => {
      if (!wrapperRef.current) return;
      const width = wrapperRef.current.clientWidth;
      if (window.innerWidth <= 1024) setZoom(Math.min((width - 24) / 1000, 1));
      else setZoom(1);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // UPI modal state
  const [upiOrderToSettle, setUpiOrderToSettle] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [settlingUpi, setSettlingUpi] = useState(false);
  const clearUpiSettle = () => { setUpiOrderToSettle(null); setQrDataUrl(''); setUpiRef(''); };

  // Subscriptions
  useEffect(() => { if (!restaurant?.id) return; return subscribe(restaurant.id); }, [restaurant?.id, subscribe]);

  useEffect(() => {
    if (!restaurant?.id) return;
    return onSnapshot(
      query(collection(db, 'restaurants', restaurant.id, 'orders'),
        where('status', 'in', ['pending', 'preparing', 'ready', 'served']),
        where('type', '==', 'dine-in')),
      snap => {
        const map = {};
        snap.docs.forEach(d => { const data = d.data(); if (data.tableId) map[data.tableId] = { id: d.id, ...data }; });
        setTableOrders(map);
      }, err => console.warn('TableMap orders err:', err));
  }, [restaurant?.id]);

  useEffect(() => {
    if (!restaurant?.id) return;
    return onSnapshot(
      query(collection(db, 'restaurants', restaurant.id, 'reservations'),
        where('date', '==', todayStr), where('status', '==', 'confirmed')),
      snap => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('TableMap reservations err:', err));
  }, [restaurant?.id, todayStr]);

  // Generate UPI QR
  const selectedTable = tables.find(t => t.id === selected);
  const currency = restaurant?.currency ?? 'INR';
  const selectedOrder = selected ? tableOrders[selected] : null;

  useEffect(() => {
    if (!upiOrderToSettle) return;
    const vpa = restaurant?.upiConfig?.vpa || 'demo@upi';
    const name = restaurant?.upiConfig?.name || 'DineOS';
    const note = (selectedTable ? `Table_${selectedTable.name}` : 'TableOrder');
    const url = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${(upiOrderToSettle.total ?? 0).toFixed(2)}&cu=${currency}&tn=${note}`;
    QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then(u => setQrDataUrl(u))
      .catch(() => setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`));
  }, [upiOrderToSettle, restaurant, currency, selectedTable]);

  // Escape key to close popover
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Click outside popover to close
  useEffect(() => {
    if (!selected) return;
    const handler = e => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        // Check if it's a table button click (handled by table click handler)
        if (e.target.closest('.table-item')) return;
        setSelected(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selected]);

  const handleSettle = async (method) => {
    if (!selectedOrder || isSettling) return;
    setIsSettling(true);
    try {
      await settleOrder(restaurant.id, selectedOrder.id, method, selectedOrder.total);
      await freeTable(restaurant.id, selected);
      setSelected(null);
      toast.success(`Settled via ${method.toUpperCase()} ✓ Table freed`, { icon: '💳' });
    } catch (err) { toast.error('Settle failed: ' + err.message); }
    finally { setIsSettling(false); }
  };

  const handlePrintBill = () => {
    if (!selectedOrder) return;
    printReceipt({ restaurant, order: selectedOrder, items: selectedOrder.items, taxInfo: selectedOrder.taxInfo, staffName: selectedOrder.customerName || 'Waiter' });
    toast.success('Bill sent to printer!', { icon: '🖨️' });
  };

  const handleAddItems = () => {
    if (!selectedOrder) return;
    loadOrderToCart(selectedOrder);
    toast.success(`Loaded ${selectedTable.name} order to cart`);
    navigate('/pos');
  };

  const handleTableClick = useCallback((t, e, effectiveStatus) => {
    if (effectiveStatus === 'free') {
      // Direct one-click: open POS for this table
      clearCart();
      setTable(t.id, t.name);
      setOrderType('dine-in');
      toast.success(`New order started for ${t.name}`);
      navigate('/pos');
      return;
    }
    // Occupied / reserved: toggle modal
    setSelected(prev => (prev === t.id ? null : t.id));
  }, [clearCart, setTable, setOrderType, navigate]);

  /* ─── Chairs renderer (clean, non-distracting) ────────────── */
  const renderChairs = (table, isOccupied) => {
    const chairs = [];
    const capacity = table.capacity || 4;
    const w = table.w || 90;
    const h = table.h || 90;
    const shape = table.shape || 'rect';

    if (shape === 'round') {
      const radius = Math.min(w, h) / 2;
      const dist = radius + 3;
      for (let i = 0; i < capacity; i++) {
        const angle = (i * 2 * Math.PI) / capacity - Math.PI / 2;
        chairs.push(
          <div key={i} className="table-chair chair-round"
            style={{ left: radius + dist * Math.cos(angle) - 4, top: radius + dist * Math.sin(angle) - 4, width: 8, height: 8, borderRadius: '50%', background: isOccupied ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.2)', border: 'none', boxShadow: 'none' }} />
        );
      }
    } else {
      let topC, botC, leftC, rightC;
      if (capacity <= 3) {
        topC = 1;
        botC = capacity >= 2 ? 1 : 0;
        leftC = capacity >= 3 ? 1 : 0;
        rightC = 0;
      } else {
        topC = Math.ceil(capacity / 4);
        botC = Math.floor(capacity / 4) + (capacity % 4 >= 2 ? 1 : 0);
        leftC = Math.floor(capacity / 4) + (capacity % 4 >= 3 ? 1 : 0);
        rightC = Math.floor(capacity / 4);
      }
      const addEdge = (count, edge) => {
        const span = (edge === 'top' || edge === 'bottom') ? w : h;
        const step = span / (count + 1);
        for (let i = 0; i < count; i++) {
          const off = (i + 1) * step;
          let style = { background: isOccupied ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.2)', border: 'none', boxShadow: 'none' };
          if (edge === 'top') style = { ...style, left: off - 6, top: -5, width: 12, height: 4, borderRadius: '2px 2px 0 0' };
          else if (edge === 'bottom') style = { ...style, left: off - 6, top: h + 1, width: 12, height: 4, borderRadius: '0 0 2px 2px' };
          else if (edge === 'left') style = { ...style, left: -5, top: off - 6, width: 4, height: 12, borderRadius: '2px 0 0 2px' };
          else style = { ...style, left: w + 1, top: off - 6, width: 4, height: 12, borderRadius: '0 2px 2px 0' };
          chairs.push(<div key={`${edge}-${i}`} className="table-chair" style={style} />);
        }
      };
      addEdge(topC, 'top'); addEdge(botC, 'bottom'); addEdge(leftC, 'left'); addEdge(rightC, 'right');
    }
    return chairs;
  };

  /* ─── Derived: order status for popover ─────────────────────── */
  const selOrder = selected ? tableOrders[selected] : null;
  const selElapsedMins = selOrder?.createdAt
    ? Math.max(0, Math.floor((nowTime - (selOrder.createdAt.toDate ? selOrder.createdAt.toDate() : new Date(selOrder.createdAt)).getTime()) / 60000))
    : 0;

  return (
    <div className="tm-root">
      {/* ═══ HEADER STATS BAR ═══ */}
      <div className="tm-stats-bar">
        <div className="tm-stat">
          <span className="tm-stat-dot tm-stat-dot--free" />
          <span className="tm-stat-label">Available</span>
          <span className="tm-stat-val">{floorMetrics.free}</span>
        </div>
        <div className="tm-stat-divider" />
        <div className="tm-stat">
          <span className="tm-stat-dot tm-stat-dot--occupied" />
          <span className="tm-stat-label">Seated</span>
          <span className="tm-stat-val">{floorMetrics.occupied}</span>
        </div>
        {floorMetrics.reserved > 0 && <>
          <div className="tm-stat-divider" />
          <div className="tm-stat">
            <span className="tm-stat-dot tm-stat-dot--reserved" />
            <span className="tm-stat-label">Reserved</span>
            <span className="tm-stat-val">{floorMetrics.reserved}</span>
          </div>
        </>}
        {floorMetrics.liveRevenue > 0 && <>
          <div className="tm-stat-divider" />
          <div className="tm-stat">
            <TrendingUp size={13} style={{ color: '#10b981' }} />
            <span className="tm-stat-label">Live Floor</span>
            <span className="tm-stat-val tm-stat-val--revenue">{formatCurrency(floorMetrics.liveRevenue, currency)}</span>
          </div>
        </>}

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div className="tm-search">
          <Search size={13} className="tm-search-icon" />
          <input
            type="text"
            placeholder="Find table…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="tm-search-input"
          />
          {searchQuery && <button className="tm-search-clear" onClick={() => setSearchQuery('')}><X size={12} /></button>}
        </div>
      </div>

      {/* ═══ FILTER PILLS + FLOOR TABS + VIEW TOGGLE ═══ */}
      <div className="tm-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="tm-filter-pills">
          {[
            { key: 'all', label: `All (${floorTables.length})` },
            { key: 'free', label: `🟢 Free`, count: floorMetrics.free },
            { key: 'occupied', label: `🔴 Seated`, count: floorMetrics.occupied },
            ...(floorMetrics.reserved > 0 ? [{ key: 'reserved', label: `⭐ Reserved`, count: floorMetrics.reserved }] : []),
          ].map(p => (
            <button
              key={p.key}
              type="button"
              className={`tm-pill ${statusFilter === p.key ? 'tm-pill--active tm-pill--' + p.key : ''}`}
              onClick={() => setStatusFilter(statusFilter === p.key && p.key !== 'all' ? 'all' : p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="tm-floor-tabs">
          {allFloors.map(floor => (
            <button
              key={floor}
              type="button"
              className={`tm-floor-tab ${activeFloor === floor ? 'tm-floor-tab--active' : ''}`}
              onClick={() => { setActiveFloor(floor); setSelected(null); }}
            >
              {floor}
              <span className="tm-floor-badge">
                {tables.filter(t => (t.floor || 'Ground Floor') === floor).length}
              </span>
            </button>
          ))}
        </div>

        {/* Density + View Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {viewMode === 'grid' && (
            <div style={{
              display: 'inline-flex',
              padding: 3,
              background: 'var(--color-bg-secondary)',
              borderRadius: 10,
              border: '1px solid var(--color-separator)'
            }}>
              <button
                type="button"
                className={`btn btn-xs ${gridDensity === 'compact' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 8, height: 28, fontSize: 11, fontWeight: 700, gap: 5, padding: '0 10px' }}
                onClick={() => handleDensityChange('compact')}
                title="High-density zero-scroll grid (ideal for 20+ tables)"
              >
                <Grid size={13} /> Compact (20+)
              </button>
              <button
                type="button"
                className={`btn btn-xs ${gridDensity === 'comfortable' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 8, height: 28, fontSize: 11, fontWeight: 700, gap: 5, padding: '0 10px' }}
                onClick={() => handleDensityChange('comfortable')}
                title="Detailed cards with inline action buttons"
              >
                <LayoutGrid size={13} /> Detailed
              </button>
            </div>
          )}

          <div style={{
            display: 'inline-flex',
            padding: 3,
            background: 'var(--color-bg-secondary)',
            borderRadius: 10,
            border: '1px solid var(--color-separator)'
          }}>
            <button
              type="button"
              className={`btn btn-xs ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 8, height: 28, fontSize: 12, fontWeight: 700, gap: 5, padding: '0 12px' }}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid size={13} /> Quick Grid
            </button>
            <button
              type="button"
              className={`btn btn-xs ${viewMode === 'map' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 8, height: 28, fontSize: 12, fontWeight: 700, gap: 5, padding: '0 12px' }}
              onClick={() => setViewMode('map')}
            >
              <Map size={13} /> Floor Map
            </button>
          </div>
        </div>
      </div>

      {/* ═══ VIEW MODE: QUICK GRID (PETPOOJA / TOAST STYLE) ═══ */}
      {viewMode === 'grid' ? (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: gridDensity === 'compact' ? '12px 16px 30px' : '16px 20px 40px',
          display: 'grid',
          gridTemplateColumns: gridDensity === 'compact'
            ? 'repeat(auto-fill, minmax(130px, 1fr))'
            : 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: gridDensity === 'compact' ? 10 : 14,
          alignContent: 'start',
          background: 'var(--color-bg)',
          borderRadius: 20,
          border: '1.5px solid var(--color-separator-opaque)'
        }}>
          {sortedFloorTables
            .filter(t => {
              const order = tableOrders[t.id];
              const hasOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
              const effectiveStatus = hasOrder ? 'occupied' : (t.status || 'free');
              const isReserved = !hasOrder && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');

              if (statusFilter === 'free' && effectiveStatus !== 'free') return false;
              if (statusFilter === 'occupied' && effectiveStatus !== 'occupied') return false;
              if (statusFilter === 'reserved' && !isReserved) return false;

              if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchName = t.name.toLowerCase().includes(q);
                const matchCap = String(t.capacity).includes(q);
                const matchWaiter = order?.assignedWaiterName?.toLowerCase().includes(q) || order?.staffName?.toLowerCase().includes(q);
                return matchName || matchCap || matchWaiter;
              }
              return true;
            })
            .map(t => {
              const order = tableOrders[t.id];
              const hasOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
              const effectiveStatus = hasOrder ? 'occupied' : (t.status || 'free');
              const isReserved = !hasOrder && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');
              const resForTable = reservations.find(r => r.tableId === t.id);

              let elapsedMins = 0;
              if (hasOrder && order.createdAt) {
                const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                elapsedMins = Math.max(0, Math.floor((nowTime - d.getTime()) / 60000));
              }

              /* ─── COMPACT TILE MODE (Petpooja zero-scroll style for 20+ tables) ─── */
              if (gridDensity === 'compact') {
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      if (effectiveStatus === 'free') {
                        clearCart();
                        setTable(t.id, t.name);
                        setOrderType('dine-in');
                        toast.success(`Order started for ${t.name}`);
                        navigate('/pos');
                      } else {
                        setSelected(t.id);
                      }
                    }}
                    style={{
                      background: effectiveStatus === 'occupied'
                        ? 'rgba(239, 68, 68, 0.05)'
                        : 'var(--color-bg-elevated)',
                      border: effectiveStatus === 'occupied'
                        ? '2px solid rgba(239, 68, 68, 0.7)'
                        : isReserved
                        ? '2px solid rgba(245, 158, 11, 0.7)'
                        : '1.5px solid var(--color-separator)',
                      borderRadius: '14px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '92px',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                      boxShadow: selected === t.id
                        ? '0 0 0 2px var(--color-accent), 0 8px 20px rgba(0,0,0,0.15)'
                        : effectiveStatus === 'occupied'
                        ? '0 3px 10px rgba(239,68,68,0.12)'
                        : '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Top Row: Name & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-label)', letterSpacing: '-0.3px' }}>
                          {t.name}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginLeft: 5, fontWeight: 600 }}>
                          👥{t.capacity}
                        </span>
                      </div>
                      {effectiveStatus === 'occupied' ? (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />
                          {elapsedMins > 0 ? formatElapsed(elapsedMins).replace(' seated', '') : 'BUSY'}
                        </span>
                      ) : isReserved ? (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.3)'
                        }}>
                          RES
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.25)'
                        }}>
                          FREE
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Bill total or Tap to Order */}
                    <div style={{ marginTop: 4 }}>
                      {effectiveStatus === 'occupied' && order ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>
                            {formatCurrency(order.total ?? 0, currency)}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)', fontWeight: 600 }}>
                            {(order.items ?? []).length} items
                          </span>
                        </div>
                      ) : isReserved ? (
                        <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {resForTable?.name || 'Reserved'}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: '#10b981', fontWeight: 800 }}>⚡</span>
                          <span>Start Order</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              /* ─── DETAILED / COMFORTABLE CARD MODE ─── */
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    if (effectiveStatus === 'free') {
                      clearCart();
                      setTable(t.id, t.name);
                      setOrderType('dine-in');
                      toast.success(`Order started for ${t.name}`);
                      navigate('/pos');
                    } else {
                      setSelected(t.id);
                    }
                  }}
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: effectiveStatus === 'occupied'
                      ? '1.5px solid rgba(239, 68, 68, 0.45)'
                      : isReserved
                      ? '1.5px solid rgba(245, 158, 11, 0.45)'
                      : '1.5px solid var(--color-separator)',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '175px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: selected === t.id
                      ? '0 0 0 2px var(--color-accent), 0 8px 24px rgba(0,0,0,0.12)'
                      : effectiveStatus === 'occupied'
                      ? '0 4px 14px rgba(239,68,68,0.08)'
                      : '0 2px 6px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* Top Bar: Table Name + Status Badge */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 21, fontWeight: 900, color: 'var(--color-label)', letterSpacing: '-0.3px' }}>
                        {t.name}
                      </span>
                      {effectiveStatus === 'occupied' ? (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                          OCCUPIED
                        </span>
                      ) : isReserved ? (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          ⭐ RESERVED
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                          VACANT
                        </span>
                      )}
                    </div>

                    {/* Capacity & Elapsed Time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11, color: 'var(--color-label-secondary)' }}>
                      <span>👥 {t.capacity} Guests</span>
                      {hasOrder && elapsedMins > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: elapsedMins > 60 ? '#f87171' : 'var(--color-label-tertiary)', fontWeight: 600 }}>
                            ⏱️ {formatElapsed(elapsedMins)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Middle Info */}
                  <div style={{ margin: '10px 0 6px' }}>
                    {effectiveStatus === 'occupied' && order ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                          {formatCurrency(order.total ?? 0, currency)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-label-secondary)' }}>
                          <span>👤 {order.assignedWaiterName || order.staffName || 'Walter'}</span>
                          <span>{(order.items ?? []).length} {(order.items ?? []).length === 1 ? 'item' : 'items'}</span>
                        </div>
                      </div>
                    ) : isReserved ? (
                      <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                        <div style={{ fontWeight: 700, color: '#f59e0b' }}>{resForTable?.name || 'Guest'}</div>
                        <div>{resForTable?.time ? `At ${resForTable.time}` : 'Reserved Today'}</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-label-tertiary)', fontSize: 12 }}>
                        <span style={{ fontSize: 18 }}>🍽️</span>
                        <span>Available for seating</span>
                      </div>
                    )}
                  </div>

                  {/* Footer Quick Action Buttons */}
                  <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 10, display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {effectiveStatus === 'occupied' && order ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          style={{ flex: 1, height: 30, fontSize: 11, fontWeight: 700, gap: 4 }}
                          onClick={() => {
                            loadOrderToCart(order);
                            navigate('/pos');
                          }}
                          title="Add items to this table"
                        >
                          <Plus size={12} /> Add
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          style={{ height: 30, fontSize: 11, fontWeight: 600, padding: '0 8px' }}
                          onClick={() => {
                            printReceipt({ restaurant, order, items: order.items, taxInfo: order.taxInfo, staffName: order.customerName || 'Waiter' });
                            toast.success('Bill printed!');
                          }}
                          title="Print customer bill"
                        >
                          <Printer size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ height: 30, fontSize: 11, fontWeight: 700, padding: '0 10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                          onClick={() => setSelected(t.id)}
                          title="Settle bill payment"
                        >
                          Settle
                        </button>
                      </>
                    ) : isReserved ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        style={{ width: '100%', height: 30, fontSize: 11, fontWeight: 700, background: '#f59e0b', border: 'none' }}
                        onClick={() => setSelected(t.id)}
                      >
                        🪑 View / Seat
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        style={{ width: '100%', height: 32, fontSize: 12, fontWeight: 700, gap: 5 }}
                        onClick={() => {
                          clearCart();
                          setTable(t.id, t.name);
                          setOrderType('dine-in');
                          toast.success(`Order started for ${t.name}`);
                          navigate('/pos');
                        }}
                      >
                        ⚡ Start Order
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          {sortedFloorTables.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--color-label-tertiary)' }}>
              No tables found on this floor.
            </div>
          )}
        </div>
      ) : (
        /* ═══ VIEW MODE: 2D FLOOR MAP CANVAS ═══ */
        <div className="tm-canvas-wrapper" ref={wrapperRef}>
          {/* Zoom Controls */}
          <div className="canvas-zoom-controls">
            <button type="button" className="zoom-btn" onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.1) * 10) / 10))} disabled={zoom <= 0.25} title="Zoom Out"><ZoomOut size={16} /></button>
            <span className="zoom-val">{Math.round(zoom * 100)}%</span>
            <button type="button" className="zoom-btn" onClick={() => setZoom(z => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))} disabled={zoom >= 2.0} title="Zoom In"><ZoomIn size={16} /></button>
            <button type="button" className="zoom-btn fit-btn" onClick={() => { if (wrapperRef.current) setZoom(Math.min((wrapperRef.current.clientWidth - 24) / 1000, 1)); }} title="Fit Screen"><Maximize2 size={12} /> Fit</button>
            <button type="button" className="zoom-btn align-btn" onClick={handleAutoAlign} title="Auto-align grid" style={{ borderLeft: '1px solid var(--color-separator)', padding: '0 10px', width: 'auto', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>
              <LayoutGrid size={13} /><span>Auto-Align</span>
            </button>
          </div>

          {/* Legend overlay */}
          <div className="tm-canvas-legend">
            <span className="tm-legend-item"><span className="tm-legend-dot" style={{ background: '#22c55e' }} />Free → click to start order</span>
            <span className="tm-legend-item"><span className="tm-legend-dot" style={{ background: '#ef4444' }} />Seated → click for actions</span>
          </div>

          <div className="table-canvas-scroll-area">
            <div className="table-canvas-scroll-container" style={{ width: `${1000 * zoom}px`, height: `${650 * zoom}px` }}>
              <div className="table-canvas" ref={canvasRef} style={{ transform: `scale(${zoom})` }}>
                {resolvedTables.map(t => {
                  const order = tableOrders[t.id];
                  const hasOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
                  const effectiveStatus = hasOrder ? 'occupied' : (t.status || 'free');
                  const isReserved = !hasOrder && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');
                  const isSelected = selected === t.id;

                  if (statusFilter === 'free' && effectiveStatus !== 'free') return null;
                  if (statusFilter === 'occupied' && effectiveStatus !== 'occupied') return null;
                  if (statusFilter === 'reserved' && !isReserved) return null;

                  const isMatch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(t.capacity).includes(searchQuery);

                  let elapsedMins = 0;
                  if (hasOrder && order.createdAt) {
                    const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                    elapsedMins = Math.max(0, Math.floor((nowTime - d.getTime()) / 60000));
                  }
                  const ec = elapsedColor(elapsedMins);

                  return (
                    <button
                      key={t.id}
                      id={`map-table-${t.id}`}
                      onClick={e => handleTableClick(t, e, effectiveStatus)}
                      className={`table-item ${t.shape === 'round' ? 'round' : 'rect'} status-${isSelected ? 'selected' : effectiveStatus}`}
                      style={{
                        position: 'absolute',
                        left: t.renderX, top: t.renderY,
                        width: t.renderW, height: t.renderH,
                        opacity: isMatch ? 1 : 0.2,
                        filter: isMatch ? 'none' : 'grayscale(80%)',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      title={effectiveStatus === 'free' ? `Click to start order at ${t.name}` : `Click to manage ${t.name}`}
                    >
                      {renderChairs(t, effectiveStatus === 'occupied')}

                      <span className="table-label">{t.name}</span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <span className="table-capacity">👥 {t.capacity}p</span>
                        {hasOrder && elapsedMins > 0 && (
                          <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '999px', background: ec.bg, color: ec.color, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            ⏱️ {elapsedMins < 60 ? `${elapsedMins}m` : elapsedMins < 1440 ? `${Math.floor(elapsedMins / 60)}h` : `${Math.floor(elapsedMins / 1440)}d`}
                          </span>
                        )}
                      </div>

                      {hasOrder && (
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#ef4444,#dc2626)', padding: '2px 7px', borderRadius: '999px', marginTop: '4px', boxShadow: '0 2px 6px rgba(220,38,38,0.35)', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(order.total ?? 0, currency)}
                        </span>
                      )}

                      {isReserved && effectiveStatus === 'free' && (
                        <span style={{ position: 'absolute', top: -6, right: -6, background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', boxShadow: '0 2px 6px rgba(217,119,6,.35)', fontWeight: 'bold', border: '2px solid #fff', zIndex: 4 }} title="Reserved Today">
                          ⭐
                        </span>
                      )}

                      {/* Quick action hint on hover for free tables */}
                      {effectiveStatus === 'free' && (
                        <span className="tm-quick-hint">⚡ Start</span>
                      )}
                    </button>
                  );
                })}

                {tables.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-label-tertiary)', gap: 'var(--space-3)' }}>
                    <div style={{ fontSize: 40 }}>🗺️</div>
                    <div>No tables — set up your floor plan in Admin → Floor Plan Editor</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

        {/* ═══ TABLE DETAILS MODAL / DRAWER ═══ — opens seamlessly when clicking any table */}
        {selected && selectedTable && (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              backdropFilter: 'blur(5px)',
            }}
            onClick={() => setSelected(null)}
          >
            <div
              ref={popoverRef}
              className="animate-scale-in"
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '430px',
                maxHeight: '90vh',
                zIndex: 1001,
                overflowY: 'auto',
                boxShadow: '0 24px 70px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.12)',
                borderRadius: '24px',
                pointerEvents: 'all',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-separator-opaque, rgba(255, 255, 255, 0.12))',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* ─ Clean Header ─ */}
              <div style={{
                padding: '18px 20px 14px',
                borderBottom: '1px solid var(--color-separator)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 21, fontWeight: 800, margin: 0, color: 'var(--color-label)', letterSpacing: '-0.4px' }}>
                      Table {selectedTable.name}
                    </h3>
                    {selOrder ? (
                      <span style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        fontWeight: 700,
                        borderRadius: 999,
                        background: 'rgba(239, 68, 68, 0.14)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                        Occupied
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        fontWeight: 700,
                        borderRadius: 999,
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                        Available
                      </span>
                    )}
                  </div>

                  {/* Sub-meta tags */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-label-secondary)',
                      background: 'var(--color-bg-secondary)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--color-separator)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <Users size={12} /> {selectedTable.capacity} Guests
                    </span>

                    {selOrder && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: selElapsedMins > 60 ? '#f87171' : 'var(--color-label-secondary)',
                        background: 'var(--color-bg-secondary)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--color-separator)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <Clock size={12} /> {formatElapsed(selElapsedMins)}
                      </span>
                    )}

                    {selOrder && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--color-label-secondary)',
                        background: 'var(--color-bg-secondary)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--color-separator)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        👤 {selOrder.assignedWaiterName || selOrder.staffName || 'Walter'}
                      </span>
                    )}

                    {selOrder && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--color-label-secondary)',
                        background: 'var(--color-bg-secondary)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--color-separator)'
                      }}>
                        #{selOrder.id.slice(-6).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  className="btn btn-secondary btn-icon btn-sm"
                  onClick={() => setSelected(null)}
                  style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>

              {selOrder ? (
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* High-Frequency 1-Tap Actions: Add Items (POS) & Print Bill */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{
                        height: 44,
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 700,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                      }}
                      onClick={handleAddItems}
                      title="Open order in POS to add more items"
                    >
                      <Plus size={17} /> Add Items
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{
                        height: 44,
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 600,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        border: '1px solid var(--color-separator-opaque)'
                      }}
                      onClick={handlePrintBill}
                      title="Print customer receipt bill"
                    >
                      <Printer size={16} /> Print Bill
                    </button>
                  </div>

                  {/* Order Items Breakdown Box */}
                  <div style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    border: '1px solid var(--color-separator)'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                      color: 'var(--color-label-tertiary)',
                      paddingBottom: 2
                    }}>
                      <span>Order Items ({(selOrder.items ?? []).length})</span>
                      <span>Amount</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '200px', overflowY: 'auto' }}>
                      {(selOrder.items ?? []).map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 800,
                              background: 'var(--color-bg-elevated)',
                              border: '1px solid var(--color-separator)',
                              padding: '2px 7px',
                              borderRadius: 5,
                              color: 'var(--color-label)',
                              marginTop: 1,
                              flexShrink: 0
                            }}>
                              {item.qty}×
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: 'var(--color-label)', fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>
                                {item.name}
                              </span>
                              {(item.variantMatrixSelection || item.selectedModifiers?.length > 0 || item.notes) && (
                                <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                                  {[
                                    item.variantMatrixSelection ? Object.values(item.variantMatrixSelection).join(' · ') : null,
                                    item.selectedModifiers?.map(m => m.name).join(', '),
                                    item.notes
                                  ].filter(Boolean).join(' | ')}
                                </span>
                              )}
                            </div>
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8, fontSize: 13 }}>
                            {formatCurrency(item.price * item.qty, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Total Due Banner */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 12,
                      marginTop: 4,
                      borderTop: '1px dashed var(--color-separator)'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label-secondary)' }}>Total Due</span>
                        <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)' }}>All taxes & charges incl.</span>
                      </div>
                      <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                        {formatCurrency(selOrder.total ?? 0, currency)}
                      </span>
                    </div>
                  </div>

                  {/* Kitchen Status Tracker */}
                  {selOrder.status !== 'served' && (
                    <div style={{
                      background: 'var(--color-bg-secondary)',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      border: '1px solid var(--color-separator)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}>
                      <div className="tm-status-progress" style={{ padding: '0', borderBottom: 'none' }}>
                        {['pending', 'preparing', 'ready', 'served'].map((s, i) => {
                          const idx = ['pending', 'preparing', 'ready', 'served'].indexOf(selOrder.status);
                          return (
                            <div key={s} className={`tm-step ${i <= idx ? 'tm-step--done' : ''} ${i === idx ? 'tm-step--current' : ''}`}>
                              <div className="tm-step-dot" />
                              <span className="tm-step-label">{s}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Advance kitchen status button */}
                      {selOrder.status === 'pending' || selOrder.status === 'preparing' ? (
                        <button className="btn btn-secondary btn-sm" style={{ height: 32, width: '100%', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
                          onClick={async () => { await updateOrderStatus(restaurant.id, selOrder.id, 'ready'); toast.success('Order marked ready!'); }}>
                          <CheckCircle2 size={14} color="#10b981" /> Advance to Ready
                        </button>
                      ) : selOrder.status === 'ready' ? (
                        <button className="btn btn-sm" style={{ height: 32, width: '100%', background: '#10b981', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
                          onClick={async () => { await updateOrderStatus(restaurant.id, selOrder.id, 'served'); toast.success('Served to table! ✓'); }}>
                          <Utensils size={14} /> Mark as Served
                        </button>
                      ) : null}
                    </div>
                  )}

                  {/* Settle Bill 1-Touch Payment Tiles */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-label-tertiary)' }}>
                      Settle Bill
                    </div>
                    {selOrder.paymentMethod === 'unpaid' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            height: 64,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1.5px solid rgba(16, 185, 129, 0.35)',
                            borderRadius: 'var(--radius-md)',
                            color: '#10b981',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          disabled={isSettling}
                          onClick={() => handleSettle('cash')}
                          title="Settle full bill with Cash"
                        >
                          <Banknote size={20} color="#10b981" />
                          <span style={{ fontSize: 12, fontWeight: 800 }}>Cash</span>
                          <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 600 }}>1-Tap Free</span>
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            height: 64,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            background: 'rgba(59, 130, 246, 0.12)',
                            border: '1.5px solid rgba(59, 130, 246, 0.35)',
                            borderRadius: 'var(--radius-md)',
                            color: '#3b82f6',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          disabled={isSettling}
                          onClick={() => handleSettle('card')}
                          title="Settle full bill with Credit/Debit Card"
                        >
                          <CreditCard size={20} color="#3b82f6" />
                          <span style={{ fontSize: 12, fontWeight: 800 }}>Card</span>
                          <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 600 }}>Swipe / POS</span>
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            height: 64,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            background: 'rgba(139, 92, 246, 0.12)',
                            border: '1.5px solid rgba(139, 92, 246, 0.35)',
                            borderRadius: 'var(--radius-md)',
                            color: '#a855f7',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          disabled={isSettling}
                          onClick={() => setUpiOrderToSettle(selOrder)}
                          title="Show UPI QR Code for instant mobile payment"
                        >
                          <QrCode size={20} color="#a855f7" />
                          <span style={{ fontSize: 12, fontWeight: 800 }}>UPI QR</span>
                          <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 600 }}>Scan & Pay</span>
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        color: '#10b981',
                        fontWeight: 700,
                        fontSize: 13
                      }}>
                        <span>✓ Settled via {selOrder.paymentMethod?.toUpperCase()}</span>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ height: 30, fontSize: 12, fontWeight: 700 }}
                          onClick={async () => {
                            await updateOrderStatus(restaurant.id, selOrder.id, 'billed');
                            await freeTable(restaurant.id, selectedTable.id);
                            setSelected(null);
                            toast.success('Table freed!');
                          }}
                        >
                          <DoorOpen size={13} /> Free Table
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Secondary Table Actions: Move, Merge, Free */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid var(--color-separator)' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1, height: 34, fontSize: 12, border: '1px solid var(--color-separator)', color: 'var(--color-label-secondary)' }}
                      onClick={() => setShowTransfer(true)}
                    >
                      <ArrowRightLeft size={13} /> Move Table
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1, height: 34, fontSize: 12, border: '1px solid var(--color-separator)', color: 'var(--color-label-secondary)' }}
                      onClick={() => setShowMerge(true)}
                    >
                      <GitMerge size={13} /> Merge Tables
                    </button>
                  </div>
                </div>
              ) : (
                /* ─ FREE TABLE POPOVER ─ */
                (() => {
                  const resForTable = reservations.find(r => r.tableId === selectedTable.id);
                  if (resForTable) {
                    return (
                      <div className="tm-reservation-card">
                        <div className="tm-res-header">📅 Reserved at {resForTable.time}</div>
                        <div className="tm-res-name">{resForTable.name}</div>
                        <div className="tm-res-detail">{resForTable.phone} · {resForTable.partySize} guests</div>
                        {resForTable.notes && <div className="tm-res-notes">{resForTable.notes}</div>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button className="btn btn-primary" style={{ flex: 1, height: 36, fontSize: 13, background: '#f59e0b', border: 'none' }}
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', resForTable.id), { status: 'seated' });
                                await updateDoc(doc(db, 'restaurants', restaurant.id, 'tables', selectedTable.id), { status: 'occupied' });
                                toast.success(`Seated ${resForTable.name} at ${selectedTable.name}!`);
                                setSelected(null);
                              } catch (e) { toast.error('Failed: ' + e.message); }
                            }}>
                            🪑 Seat Guest
                          </button>
                          <button className="btn btn-primary" style={{ flex: 1, height: 36, fontSize: 13 }}
                            onClick={() => { clearCart(); setTable(selectedTable.id, selectedTable.name); setOrderType('dine-in'); toast.success(`Order started for ${selectedTable.name}`); navigate('/pos'); }}>
                            ⚡ Start Order
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="tm-free-cta">
                      <div className="tm-free-icon">🍽️</div>
                      <div className="tm-free-label">Table Available</div>
                      <div className="tm-free-hint">Tap to start a new dine-in order</div>
                      <button className="btn btn-primary" style={{ width: '100%', height: 42, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}
                        onClick={() => { clearCart(); setTable(selectedTable.id, selectedTable.name); setOrderType('dine-in'); toast.success(`Order started for ${selectedTable.name}`); navigate('/pos'); }}>
                        ⚡ Start Order for {selectedTable.name}
                      </button>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

      {/* ═══ MOVE TABLE MODAL ═══ */}
      {showTransfer && selectedTable && selOrder && (
        <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🔀 Move Table</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowTransfer(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginBottom: 4 }}>Move order from <strong>{selectedTable.name}</strong> to:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {tables.filter(t => t.id !== selectedTable.id && t.status === 'free').map(t => (
                  <button key={t.id} type="button" className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}
                    onClick={async () => {
                      const res = await useOrderStore.getState().transferTable(restaurant.id, selectedTable.id, t.id, selOrder.id, t.name);
                      if (res.ok) { toast.success(`Moved to ${t.name}!`); setSelected(null); setShowTransfer(false); }
                      else toast.error('Move failed: ' + res.error);
                    }}>
                    <span style={{ fontWeight: 700 }}>🪑 {t.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>{t.capacity} seats</span>
                  </button>
                ))}
                {tables.filter(t => t.id !== selectedTable.id && t.status === 'free').length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-label-tertiary)' }}>No vacant tables available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MERGE BILLS MODAL ═══ */}
      {showMerge && selectedTable && selOrder && (
        <div className="modal-overlay" onClick={() => setShowMerge(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🔗 Merge Bills</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowMerge(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginBottom: 4 }}>Merge <strong>{selectedTable.name}</strong> into:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {tables.filter(t => t.id !== selectedTable.id && t.status === 'occupied' && tableOrders[t.id]).map(t => (
                  <button key={t.id} type="button" className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}
                    onClick={async () => {
                      const primaryOrder = tableOrders[t.id];
                      if (!primaryOrder) return;
                      const res = await useOrderStore.getState().mergeTables(restaurant.id, t.id, selectedTable.id, primaryOrder.id, selOrder.id);
                      if (res.ok) { toast.success(`Merged into ${t.name}!`); setSelected(null); setShowMerge(false); }
                      else toast.error('Merge failed: ' + res.error);
                    }}>
                    <span style={{ fontWeight: 700 }}>🪑 {t.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>{formatCurrency(tableOrders[t.id]?.total ?? 0, currency)}</span>
                  </button>
                ))}
                {tables.filter(t => t.id !== selectedTable.id && t.status === 'occupied' && tableOrders[t.id]).length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-label-tertiary)' }}>No other occupied tables</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ UPI SETTLE MODAL ═══ */}
      {upiOrderToSettle && selectedTable && (
        <div className="modal-overlay" onClick={clearUpiSettle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div className="modal animate-slide-up" style={{ maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="modal-title">📱 Collect UPI Payment</h3>
              <button className="btn btn-secondary btn-icon btn-sm" onClick={clearUpiSettle}><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', padding: 20 }}>
              <div style={{ background: 'linear-gradient(135deg,var(--color-brand-lavender) 0%,var(--color-brand-mint) 100%)', borderRadius: 'var(--radius-lg)', padding: 16, width: '100%' }}>
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: 4 }}>{selectedTable.name.toUpperCase()} · TOTAL DUE</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{formatCurrency(upiOrderToSettle.total ?? 0, currency)}</div>
              </div>
              <div style={{ background: 'var(--color-bg)', padding: 12, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-separator)', width: 220, height: 220, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {qrDataUrl ? <img src={qrDataUrl} alt="UPI QR" style={{ width: 196, height: 196, display: 'block' }} /> : <div style={{ color: 'var(--color-label-tertiary)', fontSize: 11 }}>Generating QR…</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 'bold' }}>Scan to Pay with GPay / PhonePe / UPI</div>
                <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>VPA: <strong style={{ color: 'var(--color-accent)' }}>{restaurant?.upiConfig?.vpa || 'demo@upi'}</strong></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', borderTop: '1px solid var(--color-separator)', paddingTop: 12 }}>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 0 }}>UPI Transaction ID / Ref (Optional)</label>
                <input className="form-input" placeholder="Last 4–6 digits of UPI Ref No." value={upiRef} onChange={e => setUpiRef(e.target.value)} style={{ height: 32, fontSize: 11 }} />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-separator)', padding: 12 }}>
              <button className="btn btn-secondary" onClick={clearUpiSettle}>Cancel</button>
              <button className="btn btn-success" disabled={settlingUpi} style={{ minWidth: 120 }}
                onClick={async () => {
                  setSettlingUpi(true);
                  try {
                    await settleOrder(restaurant.id, upiOrderToSettle.id, 'upi', upiOrderToSettle.total, upiRef ? { upiRef } : {});
                    await freeTable(restaurant.id, selected);
                    clearUpiSettle(); setSelected(null);
                    toast.success('Bill settled via UPI! Table freed.', { icon: '💳' });
                  } catch (err) { toast.error('Settle failed: ' + err.message); }
                  finally { setSettlingUpi(false); }
                }}>
                {settlingUpi ? 'Settling…' : 'Confirm Settled'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
